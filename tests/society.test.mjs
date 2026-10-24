import test from 'node:test';
import assert from 'node:assert/strict';
import {enrich} from '../painel/core.mjs';
import {SOCIETY_PARTNERS,splitSocietyAmount,societyLedger} from '../painel/society.mjs';
const fixture=()=>{
 const receipts=[{id:'r1',installment_id:'i1',amount_cents:3333,paid_on:'2026-10-20',created_at:'2026-10-20T12:00:00Z'},{id:'r2',installment_id:'i1',amount_cents:6000,paid_on:'2026-10-21',created_at:'2026-10-21T12:00:00Z'}];
 const model=enrich([{id:'c1',name:'Cliente de teste'}],[{id:'l1',client_id:'c1',status:'active',count:3,protocol:'JK-TESTE'}],[{id:'i1',loan_id:'l1',number:1,due_on:'2026-10-21',amount_cents:9333}],receipts);
 const splits=[{id:'s1',receipt_id:'r1',base_cents:3333,share1_bps:5000,partner1_cents:1667,partner2_cents:1666,version:1},{id:'s2',receipt_id:'r2',base_cents:6000,share1_bps:6000,partner1_cents:3600,partner2_cents:2400,version:1}];
 return {model,splits,partners:SOCIETY_PARTNERS.map(partner=>({...partner,share_bps:partner.id===1?7500:2500})),settings:{version:3},payouts:[{id:'p1',partner_id:1,amount_cents:1000,paid_on:'2026-10-22',created_at:'2026-10-22T12:00:00Z'}]};
};
test('society allocation conserves cents, including half cents and zero/100 percent shares',()=>{
 assert.deepEqual(splitSocietyAmount(1,5000),[1,0]);assert.deepEqual(splitSocietyAmount(9333,6000),[5600,3733]);
 for(const amount of [0,1,3,99,3333,10000,9999999999,Number.MAX_SAFE_INTEGER])for(const rate of [0,1,3333,5000,6000,9999,10000]){const [first,second]=splitSocietyAmount(amount,rate);assert.equal(first+second,amount);assert.ok(first>=0&&second>=0);}
 for(const [amount,rate] of [[-1,5000],[1.5,5000],[100,10001],[100,-1],[100,3.5],[NaN,5000]])assert.throws(()=>splitSocietyAmount(amount,rate));
});
test('partner totals use each stored receipt split rather than recomputing at the current rule',()=>{
 const data=societyLedger(fixture());assert.equal(data.received,9333);assert.equal(data.distributed,9333);assert.equal(data.paid,1000);assert.equal(data.balance,8333);
 assert.equal(data.profiles[0].name,'Juan Kelvin');assert.equal(data.profiles[1].name,'Kaik Andrade');
 assert.equal(data.profiles[0].earned,5267);assert.equal(data.profiles[0].balance,4267);assert.equal(data.profiles[1].earned,4066);
 assert.equal(data.clients.length,1);assert.equal(data.clients[0].first,5267);assert.equal(data.clients[0].second,4066);assert.equal(data.clients[0].count,2);
});
test('reversed receipts debit rights without deleting payout history or hiding compensation balances',()=>{
 const source=fixture();source.model.receipts[1].voided_at='2026-10-22T14:00:00Z';source.payouts[0].amount_cents=2000;
 const data=societyLedger(source);assert.equal(data.rows.length,2);assert.equal(data.rows.find(row=>row.receipt.id==='r2').status,'reversed');assert.equal(data.paid,2000);assert.equal(data.profiles[0].balance,-333);assert.equal(data.profiles[0].available,0);assert.equal(data.profiles[1].earned,1666);
 source.payouts[0].voided_at='2026-10-22T15:00:00Z';const reversed=societyLedger(source);assert.equal(reversed.profiles[0].balance,1667);assert.equal(reversed.payouts.length,1);assert.equal(reversed.paid,0);
});
test('an adjusted base reserves the remaining amount, and missing splits never invent partner credits',()=>{
 const source=fixture();source.splits[0]={...source.splits[0],base_cents:2000,partner1_cents:1000,partner2_cents:1000,adjustment_reason:'Separação de parte do valor'};source.splits.pop();
 const data=societyLedger(source);assert.equal(data.distributed,2000);assert.equal(data.retained,1333);assert.equal(data.pending,6000);assert.equal(data.profiles[0].earned,1000);assert.equal(data.clients[0].base,2000);assert.equal(data.clients[0].pending,6000);assert.equal(data.rows.find(row=>row.receipt.id==='r1').status,'adjusted');assert.equal(data.rows.find(row=>row.receipt.id==='r2').status,'pending');
});
test('an empty society retains both partner profiles without fabricating balances',()=>{
 const data=societyLedger({});assert.deepEqual(data.profiles.map(partner=>[partner.name,partner.earned,partner.paid,partner.available]),[['Juan Kelvin',0,0,0],['Kaik Andrade',0,0,0]]);assert.equal(data.balance,0);
});
