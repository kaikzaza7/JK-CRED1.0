import {money,dateLabel,escapeHTML as esc} from './core.mjs';
let logoData='';
export async function loadProposalLogo(){
 if(logoData)return;
 const response=await fetch(new URL('./assets/logo.svg',import.meta.url));
 if(!response.ok)throw new Error('Não foi possível carregar a logo da proposta.');
 const source=await response.text();
 logoData=source.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/)?.[0]||'';
}
function wrap(text,max=46){const words=String(text).trim().split(/\s+/);const lines=[];let line='';for(const word of words){if(line&&(line+' '+word).length>max){lines.push(line);line='';}if(word.length>max){if(line){lines.push(line);line='';}for(let i=0;i<word.length;i+=max)lines.push(word.slice(i,i+max));}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines.length?lines:['Cliente'];}
function text(x,y,value,size=25,fill='#f5f1e5',extra=''){return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;}
function glint(x,y,size=22){return `<g transform="translate(${x} ${y})"><ellipse rx="${size*2.5}" ry="${size*.68}" fill="url(#flare)"/><ellipse rx="${size*.68}" ry="${size*2.5}" fill="url(#flare)"/><path d="M-${size} 0H${size}M0 -${size}V${size}" stroke="#fff3b0" stroke-width="1.4"/><circle r="2.3" fill="#fffbe0"/></g>`;}
function panel(x,y,width,height,radius=22){return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="url(#panel-black)" stroke="url(#metal-edge)" stroke-width="3"/><rect x="${x+1}" y="${y+1}" width="${width-2}" height="${height-2}" rx="${radius-1}" fill="none" stroke="#ffcc37" stroke-width="1.2" filter="url(#gold-bloom)" opacity=".85"/><path d="M${x+24} ${y+5}H${x+width-24}" stroke="#fff2af" opacity=".5"/>`;}
function artIcon(kind,x,y,scale=1){const paths={person:'<circle cx="24" cy="14" r="9"/><path d="M8 47v-9c0-17 32-17 32 0v9Z"/>',coins:'<ellipse cx="24" cy="10" rx="19" ry="7"/><path d="M5 10v9c0 9 38 9 38 0v-9M5 23v9c0 9 38 9 38 0v-9M5 36v6c0 9 38 9 38 0v-6" fill="none" stroke="url(#metal-icon)" stroke-width="5"/>',calendar:'<rect x="4" y="8" width="40" height="37" rx="5" fill="none" stroke="url(#metal-icon)" stroke-width="4"/><path d="M14 3v10M34 3v10M6 20h36M14 27h4m8 0h4m-16 9h4m8 0h4" fill="none" stroke="url(#metal-icon)" stroke-width="4"/>',plan:'<path d="M10 5h29v42H10Z" fill="none" stroke="url(#metal-icon)" stroke-width="4"/><path d="M18 5V2h13v8H18Z"/><path d="M17 21h15M17 30h15M17 39h11" fill="none" stroke="url(#metal-icon)" stroke-width="3"/>',wallet:'<path d="M5 12 37 5v10H5v31h39V15H5Z" fill="none" stroke="url(#metal-icon)" stroke-width="4"/><path d="M31 26h13v10H31Z"/><circle cx="35" cy="31" r="1.5" fill="#241400"/>',info:'<rect x="8" y="3" width="32" height="43" rx="4" fill="none" stroke="url(#metal-icon)" stroke-width="4"/><path d="M16 14h15M16 23h15M16 32h15" fill="none" stroke="url(#metal-icon)" stroke-width="3"/>'};return `<g transform="translate(${x} ${y}) scale(${scale})" fill="url(#metal-icon)">${paths[kind]||paths.coins}</g>`;}
export function adhesionProposal(loan){
 const rows=[...loan.installments].sort((a,b)=>a.number-b.number),principal=Number(loan.principal_cents),total=Number(loan.total_cents),fee=Number(loan.fee_cents),count=Number(loan.count);
 return {kind:'adhesion',name:loan.client?.name,protocol:loan.protocol,issuedOn:loan.released_on,dates:rows.map(row=>row.due_on),calculation:{principal,total,fee,count,rate:Number(loan.rate_bps),interest:Number(loan.interest_cents),extras:fee*(count-1),effective:(total-principal)/principal*100,amounts:rows.map(row=>Number(row.amount_cents))}};
}
export function proposalSVG({name,calculation:c,dates,issuedOn,kind='simulation',protocol=''}){
 if(dates.length!==c.count)throw new Error('Confira os vencimentos antes de gerar a imagem.');
 const adhesion=kind==='adhesion',names=wrap(name||(adhesion?'Confirmação de adesão':'Proposta personalizada'),43),contractLines=adhesion&&protocol?wrap(`CONTRATO: ${protocol}`,65):[],nameExtra=(names.length-1)*37+contractLines.length*27;
 const heading=adhesion?'ADESÃO':'SIMULAÇÃO DE',mainTitle=adhesion?'CONCLUÍDA':'EMPRÉSTIMO',principalLabel=adhesion?'VALOR LIBERADO':'VALOR SOLICITADO',principalBasis=adhesion?'valor liberado':'valor solicitado';
 const start=846+nameExtra,rowHeight=64,tableY=start+68,rowsY=tableY+60,tableBottom=rowsY+c.count*rowHeight,totalY=tableBottom+24,panelBottom=totalY+142,notesY=panelBottom+25,footerY=notesY+280,height=footerY+143;
 const gold='#ffe578',muted='#ddd4bf';
 const table=c.amounts.map((amount,i)=>{const y=rowsY+i*rowHeight,value=money(amount),size=Math.min(30,Math.floor(280/(value.length*.56)));return `<rect x="84" y="${y}" width="912" height="${rowHeight}" fill="${i%2===0?'#101010':'#19140d'}"/>${text(122,y+42,`${String(i+1).padStart(2,'0')} / ${String(c.count).padStart(2,'0')}`,27,'#fff6db')}${text(418,y+42,dateLabel(dates[i]),29,'#fff6db')}${text(968,y+42,value,size,'#fff0af','text-anchor="end" font-weight="700"')}<path d="M84 ${y+rowHeight}H996M350 ${y}V${y+rowHeight}M710 ${y}V${y+rowHeight}" stroke="#b47b21" stroke-opacity=".65"/>`;}).join('');
 const feeRule=c.count>1?`${c.count-1} parcela(s) adicional(is) x ${money(c.fee)} = ${money(c.extras)} de acréscimos.`:'Parcela única: sem acréscimo de parcelamento.';
 const title=`${adhesion?'Adesão concluída':'Simulação'} JK CRED para ${name||'cliente'}: ${money(c.principal)}, total ${money(c.total)}, ${c.count} parcela(s).`;
 const buildings=Array.from({length:10},(_,i)=>{const x=i<5?i*49:800+(i-5)*57;const top=12+(i*31)%90;return `<rect x="${x}" y="${top}" width="${22+i%3*8}" height="360" fill="#ffa81e" opacity="${.08+i%3*.035}"/>${Array.from({length:7},(_,j)=>`<rect x="${x+5}" y="${top+17+j*39}" width="${10+i%3*4}" height="${9+j%3*5}" fill="#ffd144" opacity="${.45+j%3*.16}"/>`).join('')}`;}).join('');
 const principal=money(c.principal),principalSize=Math.min(62,Math.floor(485/(principal.length*.56))),total=money(c.total),totalSize=Math.min(65,Math.floor(570/(total.length*.56)));
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" role="img" aria-label="${esc(title)}" font-family="Arial, Helvetica, sans-serif">
 <title>${esc(title)}</title><defs>
 <linearGradient id="art-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#080808"/><stop offset=".48" stop-color="#080705"/><stop offset="1" stop-color="#201305"/></linearGradient>
 <radialGradient id="amber-halo"><stop stop-color="#ffdf45" stop-opacity=".75"/><stop offset=".3" stop-color="#ffaf0e" stop-opacity=".32"/><stop offset="1" stop-color="#ef8900" stop-opacity="0"/></radialGradient>
 <linearGradient id="metal-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#794109"/><stop offset=".12" stop-color="#fff7c1"/><stop offset=".25" stop-color="#f8aa15"/><stop offset=".44" stop-color="#ffed84"/><stop offset=".59" stop-color="#b96a07"/><stop offset=".76" stop-color="#ffda45"/><stop offset=".9" stop-color="#fff6b2"/><stop offset="1" stop-color="#ae5a08"/></linearGradient>
 <linearGradient id="metal-title" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffbd5"/><stop offset=".34" stop-color="#ffe56c"/><stop offset=".49" stop-color="#ffc124"/><stop offset=".53" stop-color="#c17806"/><stop offset=".8" stop-color="#ffc62e"/><stop offset="1" stop-color="#ffe77c"/></linearGradient>
 <linearGradient id="metal-silver" x1="0" y1="0" x2="0" y2="1"><stop stop-color="white"/><stop offset=".4" stop-color="#f5f5ee"/><stop offset=".55" stop-color="#b1b3b1"/><stop offset="1" stop-color="#fcfcf3"/></linearGradient>
 <linearGradient id="metal-icon" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff9c5"/><stop offset=".48" stop-color="#ffdc4d"/><stop offset="1" stop-color="#d98c14"/></linearGradient>
 <linearGradient id="gold-band" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#ffef9f"/><stop offset=".32" stop-color="#ffd34b"/><stop offset=".62" stop-color="#e79a14"/><stop offset="1" stop-color="#ffe97e"/></linearGradient>
 <linearGradient id="panel-black" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#24211b"/><stop offset=".24" stop-color="#0a0a0a"/><stop offset=".72" stop-color="#0c0b09"/><stop offset="1" stop-color="#292013"/></linearGradient>
 <radialGradient id="flare"><stop stop-color="#fffbe2"/><stop offset=".12" stop-color="#fff1a0" stop-opacity=".94"/><stop offset=".38" stop-color="#ffbd14" stop-opacity=".6"/><stop offset="1" stop-color="#ffa000" stop-opacity="0"/></radialGradient>
 <pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#ffcf45" opacity=".1"/><circle cx="6" cy="6" r=".55" fill="#f7d58d" opacity=".08"/></pattern>
 <filter id="gold-bloom" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="4" result="light"/><feMerge><feMergeNode in="light"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
 <filter id="city-blur"><feGaussianBlur stdDeviation="4"/></filter>
 <filter id="title-shadow" x="-15%" y="-30%" width="130%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#000" flood-opacity="1"/></filter>
 </defs><rect width="1080" height="${height}" fill="url(#art-bg)"/><rect width="1080" height="${height}" fill="url(#grain)"/>
 <ellipse cx="540" cy="170" rx="615" ry="400" fill="url(#amber-halo)" opacity=".65"/><g filter="url(#city-blur)">${buildings}</g>
 <path d="M0 40 375 415 329 443 0 114Z" fill="url(#metal-edge)"/><path d="M0 53 358 411 344 423 0 80Z" fill="#070707"/><path d="M1080 0 693 387 729 424 1080 72Z" fill="url(#metal-edge)"/><path d="M1080 18 709 389 724 404 1080 46Z" fill="#080808"/>
 <path d="M0 370 124 490 93 514 0 422ZM1080 349 958 481 987 511 1080 410Z" fill="url(#metal-edge)"/>
 <path d="M0 ${height-263} 264 ${height}H188L0 ${height-187}ZM1080 ${height-263} 816 ${height}H892L1080 ${height-187}Z" fill="url(#metal-edge)"/>
 <path d="M0 ${height-231} 232 ${height}H212L0 ${height-210}ZM1080 ${height-231} 848 ${height}H868L1080 ${height-210}Z" fill="#090909"/>
 <rect x="27" y="25" width="1026" height="${height-50}" rx="28" fill="none" stroke="url(#metal-edge)" stroke-width="2.5"/>
 <circle cx="540" cy="171" r="151" fill="#080807" stroke="url(#metal-edge)" stroke-width="4"/><circle cx="540" cy="171" r="143" fill="url(#grain)" stroke="#8e5e13" stroke-width="1"/>
 <ellipse cx="540" cy="168" rx="169" ry="165" fill="url(#amber-halo)" opacity=".17"/>
 ${logoData?`<image href="${logoData}" x="390" y="64" width="300" height="169"/>`:text(540,177,'JK CRED',62,gold,'text-anchor="middle" font-weight="900"')}
 ${text(540,265,'SEU CRÉDITO, NOSSO COMPROMISSO',13,gold,'text-anchor="middle" letter-spacing=".5"')}
 ${panel(61,100,213,91,14)}${artIcon('calendar',78,119,.8)}${text(134,132,adhesion?'DATA DA LIBERAÇÃO':'DATA DA SIMULAÇÃO',11,gold,'font-weight="700"')}${text(134,165,dateLabel(issuedOn),21,'#fff8d8','font-weight="600"')}
 ${panel(807,100,212,91,14)}${text(913,137,adhesion?'ADESÃO REGISTRADA':'FEITO PARA VOCÊ',16,gold,'text-anchor="middle" font-weight="700"')}${text(913,168,adhesion?'CONFIRMAÇÃO DO CONTRATO':'PROPOSTA PERSONALIZADA',10,'#fff7da','text-anchor="middle" letter-spacing=".5"')}
 <path d="M79 336Q540 306 1001 336L1012 464Q540 505 68 464Z" fill="#080807" stroke="url(#metal-edge)" stroke-width="1.5"/>
 ${text(540,381,heading,49,'url(#metal-silver)','text-anchor="middle" font-weight="900" letter-spacing="1" filter="url(#title-shadow)"')}
 ${text(540,465,mainTitle,91,'#804302','text-anchor="middle" font-weight="900" letter-spacing="1" stroke="#301604" stroke-width="3"')}
 ${text(540,460,mainTitle,91,'url(#metal-title)','text-anchor="middle" font-weight="900" letter-spacing="1" stroke="#ffe78d" stroke-width=".7" paint-order="stroke" filter="url(#title-shadow)"')}
 ${text(540,499,adhesion?'VALORES E VENCIMENTOS DO SEU CONTRATO':'VALORES E VENCIMENTOS PARA VOCÊ ANALISAR',17,'#fff2c5','text-anchor="middle" font-weight="600" letter-spacing="2"')}
 ${panel(57,530,966,109+nameExtra)}${artIcon('person',80,565,.95)}<path d="M151 551V${617+nameExtra}" stroke="#c8942a"/>
 ${text(176,564,'NOME DO CLIENTE',17,gold,'font-weight="700" letter-spacing="1"')}${names.map((line,i)=>text(176,606+i*37,line,30,'#fff8e7','font-weight="700"')).join('')}${contractLines.map((line,i)=>text(176,606+(names.length-1)*37+(i+1)*27,line,19,gold,'font-weight="600"')).join('')}
 ${panel(57,661+nameExtra,568,151)}${artIcon('wallet',81,683+nameExtra,1)}${text(155,697+nameExtra,principalLabel,17,gold,'font-weight="700" letter-spacing=".6"')}${text(91,772+nameExtra,principal,principalSize,'#fff1ad','font-weight="800"')}
 ${panel(642,661+nameExtra,381,151)}${artIcon('coins',669,683+nameExtra,.88)}${text(735,697+nameExtra,'PARCELAS',17,gold,'font-weight="700" letter-spacing="1"')}${text(733,773+nameExtra,`${c.count}x`,62,'#ffe77b','font-weight="900"')}${text(993,771+nameExtra,c.count===1?'PAGAMENTO ÚNICO':'PARCELADO',12,muted,'text-anchor="end" letter-spacing=".3"')}
 ${panel(57,start,966,panelBottom-start)}${artIcon('plan',82,start+15,.85)}${text(146,start+47,'PLANO DE PAGAMENTO',30,'url(#metal-title)','font-weight="900"')}
 <path d="M84 ${tableY+15}Q84 ${tableY} 100 ${tableY}H980Q996 ${tableY} 996 ${tableY+15}V${tableY+60}H84Z" fill="url(#gold-band)" stroke="#ffe992" stroke-width="1.5"/>
 ${text(218,tableY+39,'PARCELA',21,'#261701','text-anchor="middle" font-weight="800"')}${text(530,tableY+39,'VENCIMENTO',21,'#261701','text-anchor="middle" font-weight="800"')}${text(852,tableY+39,'VALOR',21,'#261701','text-anchor="middle" font-weight="800"')}
 ${table}<rect x="84" y="${tableY}" width="912" height="${tableBottom-tableY}" rx="14" fill="none" stroke="#f1bb38" stroke-width="1.4"/>
 <rect x="83" y="${totalY}" width="914" height="116" rx="19" fill="url(#gold-band)" stroke="#fff4b7" stroke-width="2"/><rect x="386" y="${totalY+11}" width="599" height="94" rx="15" fill="url(#panel-black)" stroke="#fff0b0" stroke-width="1.6"/>
 ${text(108,totalY+52,'TOTAL',27,'#241501','font-weight="900"')}${text(108,totalY+88,'A PAGAR',27,'#241501','font-weight="900"')}${text(963,totalY+80,total,totalSize,'#ffe783','text-anchor="end" font-weight="900"')}
 ${panel(57,notesY,966,252)}${artIcon('info',82,notesY+18,.85)}${text(147,notesY+48,'RESUMO DAS CONDIÇÕES',22,gold,'font-weight="800" letter-spacing=".7"')}
 <path d="M83 ${notesY+68}H995" stroke="#a87820"/>
 ${text(84,notesY+108,`Juros: ${(c.rate/100).toLocaleString('pt-BR')}% sobre o ${principalBasis} (${money(c.interest)}).`,23,'#fff3d3')}
 ${text(84,notesY+147,feeRule,21,muted)}
 ${text(84,notesY+182,c.count>1?'A primeira parcela não gera acréscimo. O adicional integra o total parcelado.':'O valor total inclui os juros informados acima.',20,muted)}
 ${text(84,notesY+223,`Encargo total: ${c.effective.toLocaleString('pt-BR',{maximumFractionDigits:2})}% sobre o ${principalBasis}.`,22,'#ffe370','font-weight="600"')}
 <path d="M114 ${footerY+32}H344M736 ${footerY+32}H966" stroke="url(#metal-edge)" stroke-width="2"/>
 ${logoData?`<image href="${logoData}" x="438" y="${footerY-19}" width="204" height="115"/>`:text(540,footerY+40,'JK CRED',40,gold,'text-anchor="middle" font-weight="800"')}
 ${text(540,footerY+104,adhesion?'ADESÃO CONCLUÍDA. GUARDE ESTA CONFIRMAÇÃO.':'SIMULAÇÃO SUJEITA À CONFIRMAÇÃO DAS CONDIÇÕES.',15,'#f8e0a2','text-anchor="middle" letter-spacing="1"')}
 ${glint(545,25,25)}${glint(390,169,15)}${glint(690,173,15)}${glint(256,191,14)}${glint(826,100,17)}${glint(540,331,21)}${glint(72,544,20)}${glint(1019,623+nameExtra,20)}${glint(619,686+nameExtra,16)}${glint(647,800+nameExtra,18)}${glint(1030,start+105,20)}${glint(540,panelBottom,21)}${glint(65,notesY+215,17)}${glint(1019,notesY+9,15)}${glint(1005,height-25,16)}
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
