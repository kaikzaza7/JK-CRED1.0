import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../painel/api/gateway.mjs';
const response=()=>({code:200,status(code){this.code=code;return this;},setHeader(){},json(value){this.value=value;return this;}});
test('private gateway forwards protected society and cash operations without exposing its server token',async()=>{
 const names=['JK_GATEWAY_TOKEN','JK_SUPABASE_URL','JK_SUPABASE_KEY'],before=names.map(name=>process.env[name]),priorFetch=globalThis.fetch;const calls=[];
 try{
  process.env.JK_GATEWAY_TOKEN='test-only-token';process.env.JK_SUPABASE_URL='https://database.example.invalid';process.env.JK_SUPABASE_KEY='test-only-key';
  globalThis.fetch=async(url,args)=>{calls.push({url,args});return {ok:true,json:async()=> 'test-result'};};
  for(const action of ['jk_cash_snapshot','jk_cash_record','jk_cash_reverse','jk_society_configure','jk_society_adjust_split','jk_society_record_payout','jk_society_reverse_payout']){
   const res=response(),args={p_partner_id:1,p_amount_cents:1000};await handler({method:'POST',headers:{host:'app.example','content-type':'application/json',origin:'https://app.example'},body:{action,args}},res);
   assert.equal(res.code,200);assert.deepEqual(res.value,{data:'test-result'});const forwarded=JSON.parse(calls.at(-1).args.body);assert.equal(forwarded.p_action,action);assert.deepEqual(forwarded.p_args,args);assert.equal(forwarded.p_token,'test-only-token');assert.ok(!JSON.stringify(res.value).includes('test-only-token'));
  }
  globalThis.fetch=async(url,args)=>{calls.push({url,args});return {ok:true,status:200,json:async()=>({cep:'01001-000',logradouro:'Praça da Sé',bairro:'Sé',localidade:'São Paulo',uf:'SP'})};};
  const cepResponse=response();await handler({method:'POST',headers:{host:'app.example','content-type':'application/json',origin:'https://app.example'},body:{action:'lookup_cep',args:{cep:'01001000',name:'Not forwarded',phone:'Not forwarded'}}},cepResponse);
  assert.equal(cepResponse.code,200);assert.equal(cepResponse.value.data.street,'Praça da Sé');assert.equal(calls.at(-1).url,'https://viacep.com.br/ws/01001000/json/');assert.deepEqual(calls.at(-1).args.headers,{Accept:'application/json'});assert.equal(calls.at(-1).args.body,undefined);assert.ok(!JSON.stringify(cepResponse.value).includes('test-only-token'));
  const invalidCep=response(),beforeInvalid=calls.length;await handler({method:'POST',headers:{host:'app.example','content-type':'application/json',origin:'https://app.example'},body:{action:'lookup_cep',args:{cep:'123'}}},invalidCep);assert.equal(invalidCep.code,400);assert.equal(calls.length,beforeInvalid);
  const count=calls.length,res=response();await handler({method:'POST',headers:{host:'app.example','content-type':'application/json',origin:'https://other.example'},body:{action:'jk_society_record_payout',args:{}}},res);assert.equal(res.code,403);assert.equal(calls.length,count);
  const externalCep=response();await handler({method:'POST',headers:{host:'app.example','content-type':'application/json',origin:'https://other.example'},body:{action:'lookup_cep',args:{cep:'01001000'}}},externalCep);assert.equal(externalCep.code,403);assert.equal(calls.length,count);
 }finally{globalThis.fetch=priorFetch;names.forEach((name,index)=>{if(before[index]===undefined)delete process.env[name];else process.env[name]=before[index];});}
});
