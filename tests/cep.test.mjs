import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupCEP} from '../painel/server/cep.mjs';
import {formatCEP} from '../painel/cep.mjs';
const data={cep:'01001-000',logradouro:'Praça da Sé',bairro:'Sé',localidade:'São Paulo',uf:'SP',complemento:'lado ímpar',ddd:'11'};
const response=value=>({ok:true,status:200,json:async()=>value});
test('CEP lookup normalizes the public address and only sends the CEP to the fixed service',async()=>{
 let call;const result=await lookupCEP('01001-000',async(url,options)=>{call={url,options};return response(data);});
 assert.deepEqual(result,{status:200,data:{cep:'01001000',street:'Praça da Sé',district:'Sé',city:'São Paulo',state:'SP'}});
 assert.equal(call.url,'https://viacep.com.br/ws/01001000/json/');assert.equal(call.options.method,'GET');assert.deepEqual(call.options.headers,{Accept:'application/json'});assert.equal(call.options.redirect,'error');assert.ok(call.options.signal);assert.ok(!('body' in call.options));assert.ok(!('complement' in result.data));assert.ok(!('phone' in result.data));
});
test('malformed CEPs never invoke a remote service',async()=>{
 for(const value of ['',null,undefined,{},'0100100','010010000','01001A00','https://example.invalid/01001000']){let called=false;assert.equal((await lookupCEP(value,async()=>{called=true;})).status,400);assert.equal(called,false);}
 assert.equal(formatCEP('01001000'),'01001-000');assert.equal(formatCEP('49010-000'),'49010-000');
});
test('nonexistent CEPs and service failures allow manual entry with a clear result',async()=>{
 for(const erro of [true,'true'])assert.equal((await lookupCEP('99999999',async()=>response({erro}))).status,404);
 assert.equal((await lookupCEP('99999999',async()=>({ok:false,status:404}))).status,404);
 for(const fetcher of [async()=>{throw new Error('timeout');},async()=>({ok:false,status:500}),async()=>response({}),async()=>response({...data,cep:'49010000'}),async()=>response({...data,uf:'XX'})]){const result=await lookupCEP('01001000',fetcher);assert.equal(result.status,503);assert.match(result.error,/manualmente/);}
});
test('general city CEPs can fill city/state without inventing a street or neighborhood',async()=>{
 const result=await lookupCEP('01001000',async()=>response({...data,logradouro:'',bairro:''}));assert.equal(result.status,200);assert.equal(result.data.street,'');assert.equal(result.data.district,'');assert.equal(result.data.city,'São Paulo');
});
