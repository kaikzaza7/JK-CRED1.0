import test from 'node:test';import assert from 'node:assert/strict';
import {calculate,scheduleDates,messageFor,whatsApp} from '../painel/core.mjs';
import {proposalSVG,proposalFilename,adhesionProposal} from '../painel/proposal.mjs';
const example=()=>({name:'Gabriel Santos Gonçalves Lima',issuedOn:'2026-10-23',calculation:calculate(20000,3000,1000,3),dates:scheduleDates('2026-11-10',3,'15')});
test('customer artwork contains the exact totals and all customized dates',()=>{const svg=proposalSVG(example());for(const value of ['Gabriel Santos','10/11/2026','25/11/2026','10/12/2026','93,34','280,00','30%','40%'])assert.ok(svg.includes(value));assert.match(svg,/width="1080"/);});
test('artwork escapes contact text and grows for long names and schedules',()=>{const data=example();data.name='<script>&"'.repeat(16);data.calculation=calculate(20000,3000,1000,120);data.dates=scheduleDates('2026-11-10',120,'7');const svg=proposalSVG(data);assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(svg.includes('120 / 120'));const height=Number(svg.match(/height="(\d+)"/)[1]);assert.ok(height>8000);assert.ok(height*1080<16000000);});
test('one installment is labeled as a single payment with no extra fee',()=>{const data=example();data.calculation=calculate(20000,3000,1000,1);data.dates=data.dates.slice(0,1);const svg=proposalSVG(data);assert.ok(svg.includes('PAGAMENTO ÚNICO'));assert.ok(svg.includes('sem acréscimo de parcelamento'));assert.ok(svg.includes('260,00'));});
test('WhatsApp simulation text round-trips with accents and has no broken emoji',()=>{const d=example(),c=d.calculation,loan={principal_cents:c.principal,rate_bps:c.rate,interest_cents:c.interest,fee_cents:c.fee,count:c.count,total_cents:c.total,released_on:d.issuedOn},rows=d.dates.map((due_on,i)=>({due_on,amount_cents:c.amounts[i]}));const message=messageFor({name:'João Gonçalves'},loan,rows,undefined,true);assert.ok(!/[\uFFFD\p{Extended_Pictographic}]/u.test(message));assert.ok(message.includes('*TOTAL A PAGAR:'));assert.equal(new URL(whatsApp('+55 79 99999-0001',message)).searchParams.get('text'),message);assert.ok(message.includes('não gera acréscimo'));});
test('JPEG filename contains no contact path characters',()=>{assert.equal(proposalFilename('João / ../ Gonçalves','2026-10-23'),'jk-cred-simulacao-joao-goncalves-2026-10-23.jpeg');});
test('adhesion JPEG uses the confirmation wording, release date and a distinct filename',()=>{
 const data={...example(),kind:'adhesion',issuedOn:'2026-10-01',protocol:'JK-20261001-AB12'},svg=proposalSVG(data);
 for(const value of ['ADESÃO','CONCLUÍDA','DATA DA LIBERAÇÃO','VALOR LIBERADO','01/10/2026','JK-20261001-AB12','Gabriel Santos','10/11/2026','25/11/2026','10/12/2026','93,34','280,00','30%','40%'])assert.ok(svg.includes(value),value);
 assert.ok(!svg.includes('SIMULAÇÃO'));
 assert.ok(!svg.includes('VALOR SOLICITADO'));
 assert.equal(proposalFilename(data.name,data.issuedOn,data.kind),'jk-cred-adesao-gabriel-santos-goncalves-lima-2026-10-01.jpeg');
 assert.ok(proposalSVG(example()).includes('SIMULAÇÃO DE'));
});
test('registered adhesion artwork keeps actual saved installment amounts and dates',()=>{
 const loan={client:{name:'Ana & João'},protocol:'JK-20261001-AB12',released_on:'2026-10-01',principal_cents:20000,rate_bps:3000,interest_cents:6000,fee_cents:1000,count:3,total_cents:28000,installments:[{number:3,due_on:'2026-12-12',amount_cents:10000},{number:1,due_on:'2026-10-29',amount_cents:9000},{number:2,due_on:'2026-11-19',amount_cents:9000}]};
 const data=adhesionProposal(loan),svg=proposalSVG(data);
 assert.deepEqual(data.dates,['2026-10-29','2026-11-19','2026-12-12']);
 assert.deepEqual(data.calculation.amounts,[9000,9000,10000]);
 assert.equal(data.calculation.total,28000);
 for(const value of ['90,00','100,00','280,00','29/10/2026','19/11/2026','12/12/2026','Ana &amp; João'])assert.ok(svg.includes(value),value);
 assert.equal(loan.installments[0].number,3);
});
