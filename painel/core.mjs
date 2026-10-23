export const money = cents => (Number(cents || 0) / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const digits = value => String(value || '').replace(/\D/g,'');
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function dateLabel(date) { if(!date) return '—'; const [y,m,d]=date.slice(0,10).split('-'); return `${d}/${m}/${y}`; }
export function dateAdd(date, days) { const d = new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+Number(days)); return d.toISOString().slice(0,10); }
export function daysBetween(a,b) { return Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/86400000); }
export function decimalInt(value) {
 const s=String(value??'').trim().replace(',','.');
 if(!/^\d+(\.\d{0,2})?$/.test(s)) throw new Error('Use um número positivo com até duas casas decimais.');
 const [a,b='']=s.split('.'); const n=Number(a)*100+Number(b.padEnd(2,'0'));
 if(!Number.isSafeInteger(n)) throw new Error('Valor muito alto.'); return n;
}
export function calculate(principal, rate, fee, count) {
 if(![principal,rate,fee,count].every(Number.isSafeInteger)||principal<1||principal>10000000000||rate<0||rate>100000||fee<0||fee>100000000||count<1||count>120) throw new Error('Confira o valor, a taxa e a quantidade de parcelas.');
 const interest=Number((BigInt(principal)*BigInt(rate)+5000n)/10000n), extras=fee*(count-1),total=principal+interest+extras,base=Math.floor(total/count);
 if(base<1) throw new Error('Valor insuficiente para a quantidade de parcelas.');
 return {principal,rate,fee,count,interest,extras,total,effective:((total-principal)/principal*100),amounts:Array.from({length:count},(_,i)=>i===count-1?total-base*(count-1):base)};
}
export function scheduleDates(first,count,interval) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(first)||!Number.isInteger(count)||count<1||count>120) throw new Error('Confira o primeiro vencimento e a quantidade de parcelas.');
 if(interval==='monthly') {
  const [y,m,d]=first.split('-').map(Number);
  return Array.from({length:count},(_,i)=>{const last=new Date(Date.UTC(y,m+i,0)).getUTCDate();return new Date(Date.UTC(y,m-1+i,Math.min(d,last),12)).toISOString().slice(0,10);});
 }
 const days=Number(interval); if(!Number.isInteger(days)||days<1||days>365) throw new Error('O intervalo deve ser de 1 a 365 dias.');
 return Array.from({length:count},(_,i)=>dateAdd(first,i*days));
}
export function validCPF(value) {
 const cpf=digits(value); if(cpf.length!==11||/^(\d)\1{10}$/.test(cpf)) return false;
 for(let n=9;n<11;n++){let s=0;for(let i=0;i<n;i++)s+=Number(cpf[i])*(n+1-i);let c=(s*10)%11;if(c===10)c=0;if(c!==Number(cpf[n]))return false;}return true;
}
export const cpfFormat = value => digits(value).slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
export function normalizePhone(value) {
 let p=digits(value); if(p.length===10||p.length===11)p='55'+p;
 if(!/^55[1-9]\d\d{8,9}$/.test(p))throw new Error('Informe o telefone com +55, DDD e número.');return '+'+p;
}
export function phoneFormat(value) {
 let p=digits(value);if(p.startsWith('55'))p=p.slice(2);p=p.slice(0,11);const rest=p.slice(2);
 return '+55'+(p.length?' '+p.slice(0,2):'')+(rest?' '+(rest.length>4?rest.slice(0,-4)+'-'+rest.slice(-4):rest):'');
}
export function whatsApp(phone,text) { return 'https://wa.me/'+digits(normalizePhone(phone))+'?text='+encodeURIComponent(text); }
export const DEFAULT_TEMPLATE = `*JK CRED | ADESÃO CONFIRMADA*

Olá, {nome}!

Registramos sua adesão. Confira o resumo das condições combinadas:

*DADOS DO CONTRATO*
Contrato: {contrato}
Data da liberação: {data}
Valor liberado: *{valor}*

*JUROS E PARCELAMENTO*
Juros sobre o valor liberado: {taxa}% ({juros})
Acréscimo por parcela adicional: {acrescimo}
Acréscimos de parcelamento: {extras} no total
A primeira parcela não gera acréscimo. Os adicionais integram o total e são distribuídos nas parcelas abaixo.
Encargo total sobre o valor liberado: {efetiva}%

*PARCELAS E VENCIMENTOS*
{parcelas}

*TOTAL A PAGAR: {total}*

Confira os dados e guarde esta confirmação para acompanhar seus pagamentos. Se precisar esclarecer qualquer informação, fale com nossa equipe.

*JK CRED*
Seu crédito, nosso compromisso.`;
export const SIMULATION_TEMPLATE = `*JK CRED | SIMULAÇÃO PERSONALIZADA*

Olá, {nome}!

Preparamos esta simulação para você avaliar com tranquilidade. Confira os valores e as datas de pagamento:

*VALOR SOLICITADO: {valor}*

*COMPOSIÇÃO DO VALOR TOTAL*
Juros: {taxa}% sobre o valor solicitado ({juros})
Acréscimo por parcela adicional: {acrescimo}
Acréscimos de parcelamento: {extras} no total

A primeira parcela não gera acréscimo. Os adicionais integram o valor total, dividido nas parcelas abaixo.

*PARCELAS E VENCIMENTOS*
{parcelas}

*TOTAL A PAGAR: {total}*
Encargo total: {efetiva}% sobre o valor solicitado, incluindo juros e acréscimos.

Simulação sujeita à confirmação. Os valores e vencimentos serão confirmados com você antes da adesão.

Se estiver de acordo com os valores e vencimentos, responda a esta mensagem para conversarmos sobre os próximos passos.

*JK CRED*
Seu crédito, nosso compromisso.`;
export function messageFor(client,loan,installments,template=DEFAULT_TEMPLATE,simulation=false) {
 const params={nome:client.name||'Cliente',contrato:loan.protocol||'Simulação',valor:money(loan.principal_cents),data:dateLabel(loan.released_on),taxa:(loan.rate_bps/100).toLocaleString('pt-BR'),juros:money(loan.interest_cents),acrescimo:money(loan.fee_cents),extras:money(loan.fee_cents*(loan.count-1)),efetiva:((loan.total_cents-loan.principal_cents)/loan.principal_cents*100).toLocaleString('pt-BR',{maximumFractionDigits:2}),parcelas:installments.map((s,i)=>`${i+1}/${installments.length} - Vencimento: ${dateLabel(s.due_on)} - Valor: ${money(s.amount_cents)}`).join('\n'),total:money(loan.total_cents)};
 const source=simulation?SIMULATION_TEMPLATE:(template||DEFAULT_TEMPLATE);
 return source.replace(/\{(\w+)\}/g,(match,key)=>params[key]??match);
}
export function enrich(clients,loans,installments,receipts) {
 const cp=new Map(clients.map(x=>[x.id,x]));const paid=new Map();for(const r of receipts)if(!r.voided_at)paid.set(r.installment_id,(paid.get(r.installment_id)||0)+Number(r.amount_cents));
 const lp=new Map(loans.map(l=>[l.id,{...l,client:cp.get(l.client_id),installments:[],paid:0,balance:0}]));
 const items=installments.map(s=>{const loan=lp.get(s.loan_id),p=paid.get(s.id)||0;const item={...s,paid:p,balance:Math.max(0,Number(s.amount_cents)-p),loan,client:loan?.client};item.status=loan?.status==='cancelled'?'cancelled':item.balance===0?'paid':s.due_on<today()?'overdue':s.due_on===today()?'today':p>0?'partial':'pending';if(loan){loan.installments.push(item);loan.paid+=p;loan.balance+=item.balance;}return item;});
 return {clients,loans:[...lp.values()].map(l=>({...l,installments:l.installments.sort((a,b)=>a.number-b.number)})),items,receipts};
}
export function csv(rows) { return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n'); }
