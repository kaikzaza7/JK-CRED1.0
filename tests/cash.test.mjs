import test from 'node:test';
import assert from 'node:assert/strict';
import {cashLedger,cashTrend,cashMonths} from '../painel/cash.mjs';
const entry=(sequence,kind,amount_cents,extra={})=>({id:'e'+sequence,sequence,kind,amount_cents,occurred_on:'2026-10-24',created_at:'2026-10-24T12:00:00Z',...extra});
test('cash conserves cents through contributions, loan principal, receipts and partner payouts',()=>{
 const entries=[entry(1,'opening',100000),entry(2,'loan_disbursement',-20000),entry(3,'customer_payment',9333),entry(4,'partner_payout',-1000),entry(5,'contribution',5000),entry(6,'withdrawal',-100)];
 const cash=cashLedger({account:{balance_cents:93233},entries});assert.equal(cash.balance,93233);assert.equal(cash.computedBalance,93233);assert.equal(cash.available,93233);assert.equal(cash.contributed,105000);assert.equal(cash.disbursed,20000);assert.equal(cash.received,9333);assert.equal(cash.payouts,1000);assert.equal(cash.withdrawn,100);assert.deepEqual(cash.rows.map(row=>row.balance_after),[100000,80000,89333,88333,93333,93233]);
});
test('cash reversals preserve both entries, restore totals and expose deficits',()=>{
 const entries=[entry(1,'contribution',10000),entry(2,'loan_disbursement',-9000),entry(3,'reversal',-10000,{reversal_of:'e1'})],data=cashLedger({entries});
 assert.equal(data.balance,-9000);assert.equal(data.available,0);assert.equal(data.contributed,0);assert.equal(data.rows.length,3);assert.equal(data.rows[0].is_reversed,true);assert.equal(data.rows[0].can_reverse,false);assert.equal(data.rows[1].can_reverse,false);assert.equal(data.rows[2].can_reverse,false);
 entries.push(entry(4,'reversal',9000,{reversal_of:'e2'}));assert.equal(cashLedger({entries}).disbursed,0);assert.equal(cashLedger({entries}).balance,0);
});
test('cash statement order and balances do not depend on fetch order or UUIDs',()=>{
 const source=[entry(3,'withdrawal',-1),entry(1,'opening',100),entry(2,'contribution',2)],data=cashLedger({entries:source});assert.deepEqual(data.rows.map(row=>row.balance_after),[100,102,101]);assert.equal(source[0].sequence,3);
});
test('cash chart starts at the true balance before the visible window',()=>{
 const entries=[entry(1,'opening',10000),entry(2,'loan_disbursement',-2000),entry(3,'customer_payment',1500),entry(4,'withdrawal',-1000)];
 assert.deepEqual(cashTrend(entries,2).map(point=>point.balance_after),[8000,9500,8500]);assert.deepEqual(cashTrend([entries[0]]).map(point=>point.balance_after),[0,10000]);assert.deepEqual(cashTrend([]),[]);assert.throws(()=>cashTrend([],0));
});
test('monthly cash chart separates physical entries and exits including reversals across years',()=>{
 const entries=[entry(1,'opening',10000,{occurred_on:'2025-12-31'}),entry(2,'withdrawal',-1000,{occurred_on:'2026-01-01'}),entry(3,'reversal',1000,{occurred_on:'2026-01-02',reversal_of:'e2'})],months=cashMonths(entries,'2026-01-15',2);
 assert.deepEqual(months.map(row=>[row.key,row.inflow,row.outflow]),[['2025-12',10000,0],['2026-01',1000,1000]]);
});
test('cash empty state contains no fabricated opening capital and rejects unsafe cents',()=>{
 assert.equal(cashLedger().balance,0);assert.equal(cashLedger().rows.length,0);assert.throws(()=>cashLedger({entries:[entry(1,'opening',1.2)]}));assert.throws(()=>cashLedger({entries:[entry(1,'opening',Number.MAX_SAFE_INTEGER),entry(2,'contribution',1)]}));
});
