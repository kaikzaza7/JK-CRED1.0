import {money,dateLabel,cpfFormat,phoneFormat,digits,daysBetween,escapeHTML as esc} from './core.mjs';
let logoData='';
export async function loadProposalLogo(){
 if(logoData)return;
 const response=await fetch(new URL('./assets/logo.svg',import.meta.url));
 if(!response.ok)throw new Error('Não foi possível carregar a logo da proposta.');
 const source=await response.text();
 logoData=source.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/)?.[0]||'';
}
const GOLD='#d7b66f',MUTED='#b8b9b2',WHITE='#f3f2ec',LINE='#5d543d';
function textWidth(value,size){return [...String(value)].reduce((total,char)=>total+(/[ilI.,:;'!|]/.test(char)?.29:/[mwMW@%]/.test(char)?.95:/[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(char)?.73:/[0-9]/.test(char)?.58:/\s/.test(char)?.3:.58),0)*size;}
function wrap(value,width,size=23){
 const words=String(value||'—').trim().split(/\s+/),lines=[];let line='';
 for(const word of words){
  if(line&&textWidth(line+' '+word,size)>width){lines.push(line);line='';}
  if(textWidth(word,size)>width){let part='';for(const char of word){if(part&&textWidth(part+char,size)>width){lines.push(part);part='';}part+=char;}line=part;}
  else line+=(line?' ':'')+word;
 }
 if(line)lines.push(line);return lines.length?lines:['—'];
}
function text(x,y,value,size=23,fill=WHITE,extra=''){return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;}
function fitText(x,y,value,width,size=23,fill=WHITE,extra=''){const actual=Math.min(size,size*width/Math.max(1,textWidth(value,size)));return text(x,y,value,Math.floor(actual*10)/10,fill,extra);}
function section(number,label,y){return `<rect x="64" y="${y}" width="32" height="30" rx="3" fill="none" stroke="${LINE}"/>${text(80,y+20,number,13,GOLD,'text-anchor="middle" font-weight="700"')}${text(112,y+21,label,18,GOLD,'font-weight="700" letter-spacing="1"')}<path d="M64 ${y-18}H1016" stroke="${LINE}" stroke-width=".8"/>`;}
function fieldHeight(value,width,size=23){return Math.max(54,wrap(value,width-32,size).length*29+25);}
function field(x,y,width,height,label,value,size=23){
 const lines=wrap(value,width-32,size);
 return text(x,y+15,label,13,MUTED,'letter-spacing=".8"')+`<rect x="${x}" y="${y+27}" width="${width}" height="${height}" rx="4" fill="#111310" stroke="${LINE}" stroke-width=".8"/>`+lines.map((line,i)=>text(x+16,y+62+i*29,line,size,WHITE,'font-weight="500"')).join('');
}
function periodicity(dates){
 if(dates.length===1)return 'PAGAMENTO ÚNICO';
 const gaps=dates.slice(1).map((date,i)=>daysBetween(dates[i],date));
 return gaps.every(gap=>gap===gaps[0])?`A cada ${gaps[0]} dias`:'Datas personalizadas';
}
export function adhesionProposal(loan){
 const rows=[...loan.installments].sort((a,b)=>a.number-b.number),principal=Number(loan.principal_cents),total=Number(loan.total_cents),fee=Number(loan.fee_cents),count=Number(loan.count);
 return {kind:'adhesion',name:loan.client?.name,client:loan.client||{},protocol:loan.protocol,issuedOn:loan.released_on,dates:rows.map(row=>row.due_on),calculation:{principal,total,fee,count,rate:Number(loan.rate_bps),interest:Number(loan.interest_cents),extras:fee*(count-1),effective:(total-principal)/principal*100,amounts:rows.map(row=>Number(row.amount_cents))}};
}
export function proposalSVG({name,client={},calculation:c,dates,issuedOn,kind='simulation',protocol=''}){
 if(dates.length!==c.count||c.amounts.length!==c.count)throw new Error('Confira os vencimentos antes de gerar a imagem.');
 const adhesion=kind==='adhesion',clientName=name||client.name||(adhesion?'Confirmação de adesão':'Proposta personalizada');
 const cpf=digits(client.cpf).length===11?cpfFormat(client.cpf):'—',phone=digits(client.phone).length>=10?phoneFormat(client.phone):'—';
 const place=[client.city?`${client.city}${client.state?' / '+client.state:''}`:'',client.district].filter(Boolean).join(' • ')||'—';
 const principalLabel=adhesion?'VALOR LIBERADO':'VALOR SOLICITADO',principalBasis=adhesion?'valor liberado':'valor solicitado';
 const clientY=409,nameY=455,nameHeight=Math.max(fieldHeight(clientName,650),54),contactY=nameY+27+nameHeight+20,contactHeight=Math.max(fieldHeight(phone,400,22),fieldHeight(place,528,22));
 const operationY=contactY+27+contactHeight+48,operationFieldsY=operationY+46,operationHeight=fieldHeight(periodicity(dates),364,21);
 const scheduleY=operationFieldsY+27+operationHeight+48,tableY=scheduleY+49,rowsY=tableY+47,rowHeight=56,tableBottom=rowsY+c.count*rowHeight;
 const totalY=tableBottom+18,conditionsY=totalY+118,summaryY=conditionsY+46,notesY=summaryY+161;
 const notes=[
  adhesion?'Adesão concluída com os valores e vencimentos apresentados neste documento. Guarde esta confirmação para acompanhar seus pagamentos.':'Simulação para avaliação. Os valores e vencimentos serão confirmados com você antes da adesão.',
  c.count>1?'A primeira parcela não gera acréscimo. Os adicionais integram o total e são distribuídos nas parcelas.':'Parcela única: sem acréscimo de parcelamento. O total inclui os juros informados.',
 ];
 const noteLines=notes.flatMap(note=>wrap(note,916,18)),notesHeight=noteLines.length*27+29,footerY=notesY+46+notesHeight+37,height=footerY+151;
 const title=`${adhesion?'Adesão concluída':'Simulação de crédito'} JK CRED para ${clientName}: ${money(c.principal)}, total ${money(c.total)}, ${c.count} parcela(s).`;
 const summaries=[
  {label:'JUROS',value:`${(c.rate/100).toLocaleString('pt-BR')}%`,caption:money(c.interest)},
  {label:'POR PARCELA ADICIONAL',value:money(c.fee),caption:c.count>1?'Após a primeira parcela':'Não se aplica à parcela única'},
  {label:'ACRÉSCIMOS TOTAIS',value:money(c.extras),caption:`${c.count-1} × ${money(c.fee)}`},
  {label:'ENCARGO TOTAL',value:`${c.effective.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`,caption:`Sobre o ${principalBasis}`},
 ];
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" role="img" aria-label="${esc(title)}" font-family="Arial, Helvetica, sans-serif">
 <title>${esc(title)}</title><defs>
 <linearGradient id="document-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8e703c"/><stop offset=".48" stop-color="#ddc084"/><stop offset="1" stop-color="#ad8847"/></linearGradient>
 <linearGradient id="document-edge" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#54472e"/><stop offset=".5" stop-color="#b89b61"/><stop offset="1" stop-color="#54472e"/></linearGradient>
 </defs>
 <rect width="1080" height="${height}" fill="#0b0d0b"/>
 <rect x="30" y="30" width="1020" height="${height-60}" rx="3" fill="none" stroke="#3b372b" stroke-width="1"/>
 <path d="M0 111 111 0h36L0 147ZM1080 ${height-111} ${1080-111} ${height}h-36L1080 ${height-147}Z" fill="url(#document-gold)"/>
 <path d="M0 158 158 0M1080 ${height-158} ${1080-158} ${height}" stroke="#78623b" stroke-width="1"/>
 ${logoData?`<image href="${logoData}" x="64" y="47" width="266" height="150"/>`:text(64,139,'JK CRED',45,GOLD,'font-weight="700"')}
 ${text(64,210,'SEU CRÉDITO, NOSSO COMPROMISSO',11,GOLD,'letter-spacing="1.1"')}
 <path d="M612 66V218" stroke="${LINE}"/>
 ${text(644,85,adhesion?'CONFIRMAÇÃO DE ADESÃO':'PROPOSTA DE EMPRÉSTIMO',15,GOLD,'font-weight="600" letter-spacing="1"')}
 ${text(644,121,adhesion?'CONTRATO':'DOCUMENTO',12,MUTED,'letter-spacing="1"')}
 ${fitText(644,149,adhesion?(protocol||'Prévia da adesão'):'Simulação personalizada',372,20,WHITE,'font-weight="500"')}
 ${text(644,186,adhesion?'DATA DA LIBERAÇÃO':'DATA DA SIMULAÇÃO',12,MUTED,'letter-spacing="1"')}
 ${text(644,215,dateLabel(issuedOn),22,WHITE,'font-weight="500"')}
 ${text(64,293,adhesion?'ADESÃO':'SIMULAÇÃO',53,GOLD,'font-weight="700" letter-spacing="1"')}
 ${text(64,337,adhesion?'CONCLUÍDA':'DE CRÉDITO',35,WHITE,'font-weight="700" letter-spacing="2"')}
 ${text(64,373,adhesion?'Resumo dos valores e vencimentos do seu contrato.':'Condições propostas para sua avaliação.',18,MUTED)}
 ${section('01','DADOS DO CLIENTE',clientY)}
 ${field(64,nameY,650,nameHeight,'NOME COMPLETO',clientName)}
 ${field(738,nameY,278,nameHeight,'CPF',cpf,22)}
 ${field(64,contactY,400,contactHeight,'TELEFONE',phone,22)}
 ${field(488,contactY,528,contactHeight,'CIDADE / BAIRRO',place,22)}
 ${section('02',adhesion?'DADOS DA ADESÃO':'DADOS DA SIMULAÇÃO',operationY)}
 ${field(64,operationFieldsY,340,operationHeight,principalLabel,money(c.principal),28)}
 ${field(428,operationFieldsY,200,operationHeight,'PARCELAS',`${c.count}x`,28)}
 ${field(652,operationFieldsY,364,operationHeight,'PERIODICIDADE',periodicity(dates),21)}
 ${section('03','PARCELAS E VENCIMENTOS',scheduleY)}
 <rect x="64" y="${tableY}" width="952" height="47" rx="3" fill="url(#document-gold)"/>
 ${text(164,tableY+30,'PARCELA',15,'#17160f','text-anchor="middle" font-weight="700" letter-spacing=".7"')}
 ${text(540,tableY+30,'VENCIMENTO',15,'#17160f','text-anchor="middle" font-weight="700" letter-spacing=".7"')}
 ${text(990,tableY+30,'VALOR',15,'#17160f','text-anchor="end" font-weight="700" letter-spacing=".7"')}
 ${c.amounts.map((amount,i)=>{const y=rowsY+i*rowHeight;return `<rect x="64" y="${y}" width="952" height="${rowHeight}" fill="${i%2?'#10120f':'#0c0e0c'}"/>${text(164,y+36,`${String(i+1).padStart(2,'0')} / ${String(c.count).padStart(2,'0')}`,23,WHITE,'text-anchor="middle"')}${text(540,y+36,dateLabel(dates[i]),24,WHITE,'text-anchor="middle"')}${fitText(990,y+36,money(amount),280,25,WHITE,'text-anchor="end" font-weight="600"')}<path d="M64 ${y+rowHeight}H1016" stroke="#36372e" stroke-width=".7"/>`;}).join('')}
 <path d="M296 ${tableY+47}V${tableBottom}M752 ${tableY+47}V${tableBottom}" stroke="#494737" stroke-width=".7"/>
 <rect x="64" y="${tableY}" width="952" height="${tableBottom-tableY}" rx="3" fill="none" stroke="${LINE}" stroke-width=".8"/>
 <rect x="64" y="${totalY}" width="952" height="76" rx="4" fill="#1b1c15" stroke="#887243" stroke-width="1"/>
 ${text(87,totalY+45,'TOTAL A PAGAR',18,GOLD,'font-weight="700" letter-spacing="1"')}
 ${fitText(991,totalY+51,money(c.total),570,36,WHITE,'text-anchor="end" font-weight="700"')}
 ${section('04','COMPOSIÇÃO DO VALOR',conditionsY)}
 ${summaries.map(({label,value,caption},index)=>{const x=64+index*244;return text(x,summaryY+15,label,12,MUTED,'letter-spacing=".4"')+`<rect x="${x}" y="${summaryY+27}" width="220" height="107" rx="4" fill="#111310" stroke="${LINE}" stroke-width=".8"/>`+fitText(x+15,summaryY+66,value,190,27,GOLD,'font-weight="600"')+fitText(x+15,summaryY+104,caption,190,14,MUTED);}).join('')}
 ${section('05','CONDIÇÕES E OBSERVAÇÕES',notesY)}
 <rect x="64" y="${notesY+46}" width="952" height="${notesHeight}" rx="4" fill="#111310" stroke="${LINE}" stroke-width=".8"/>
 ${noteLines.map((line,i)=>text(82,notesY+76+i*27,line,18,MUTED)).join('')}
 <path d="M64 ${footerY}H1016" stroke="url(#document-edge)" stroke-width="1"/>
 ${text(64,footerY+37,'JK CRED',19,GOLD,'font-weight="700" letter-spacing="1.5"')}
 ${text(64,footerY+63,'Seu crédito, nosso compromisso.',15,MUTED)}
 ${text(1016,footerY+33,adhesion?'CONFIRMAÇÃO DE ADESÃO':'PROPOSTA DE EMPRÉSTIMO',12,GOLD,'text-anchor="end" letter-spacing=".8"')}
 ${text(1016,footerY+60,dateLabel(issuedOn),15,MUTED,'text-anchor="end"')}
 ${fitText(540,footerY+94,adhesion?'ADESÃO CONCLUÍDA. GUARDE ESTA CONFIRMAÇÃO.':'SIMULAÇÃO SUJEITA À CONFIRMAÇÃO DAS CONDIÇÕES.',920,12,MUTED,'text-anchor="middle" letter-spacing=".4"')}
 </svg>`;
}
export function proposalFilename(name,date,kind='simulation'){const slug=String(name||'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65);return `jk-cred-${kind==='adhesion'?'adesao':'simulacao'}-${slug||'cliente'}-${date}.jpeg`;}
export async function proposalJPEG(svg,filename){
 const image=new Image();
 // A data URL with only embedded assets keeps the canvas export same-origin.
 image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 await image.decode();
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const context=canvas.getContext('2d');if(!context)throw new Error('Seu navegador não conseguiu preparar a imagem.');
 context.fillStyle='#10140f';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
 canvas.width=canvas.height=1;
 if(!blob||blob.type!=='image/jpeg')throw new Error('Não foi possível gerar o JPEG. Tente novamente.');
 return new File([blob],filename,{type:'image/jpeg',lastModified:Date.now()});
}
export function downloadProposal(file){const url=URL.createObjectURL(file),anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
