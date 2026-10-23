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
export function proposalSVG({name,calculation:c,dates,issuedOn}){
 if(dates.length!==c.count)throw new Error('Confira os vencimentos antes de gerar a imagem.');
 const names=wrap(name||'Proposta personalizada',43),nameExtra=(names.length-1)*37;
 const start=700+nameExtra,rowHeight=62,tableBottom=start+68+c.count*rowHeight,totalY=tableBottom+32,height=totalY+386;
 const gold='#e6c276',muted='#b8b8a9';
 const table=c.amounts.map((amount,i)=>{const y=start+68+i*rowHeight;return `<rect x="70" y="${y-38}" width="940" height="${rowHeight}" fill="${i%2===0?'#1e211c':'#171a16'}"/>${text(101,y+2,`${String(i+1).padStart(2,'0')} / ${String(c.count).padStart(2,'0')}`,25,muted)}${text(420,y+2,dateLabel(dates[i]),27)}${text(978,y+2,money(amount),29,'#f8edcf','text-anchor="end" font-weight="700"')}<path d="M94 ${y+24}H986" stroke="#34372c"/>`;}).join('');
 const feeRule=c.count>1?`${c.count-1} parcela(s) adicional(is) x ${money(c.fee)} = ${money(c.extras)} de acréscimos.`:'Parcela única: sem acréscimo de parcelamento.';
 const title=`Simulação JK CRED para ${name||'cliente'}: ${money(c.principal)}, total ${money(c.total)}, ${c.count} parcela(s).`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" role="img" aria-labelledby="proposal-title" font-family="Arial, Helvetica, sans-serif">
 <title id="proposal-title">${esc(title)}</title><defs>
 <linearGradient id="art-bg" x1="0" x2="1" y2="1"><stop stop-color="#181d17"/><stop offset=".52" stop-color="#0c0f0c"/><stop offset="1" stop-color="#242418"/></linearGradient>
 <linearGradient id="art-gold"><stop stop-color="#9c6a23"/><stop offset=".26" stop-color="#f9df9e"/><stop offset=".55" stop-color="#c7963f"/><stop offset=".85" stop-color="#f4d892"/><stop offset="1" stop-color="#aa762a"/></linearGradient>
 <linearGradient id="art-total" x1="0" x2="1" y2=".7"><stop stop-color="#f5d999"/><stop offset=".5" stop-color="#ddb66a"/><stop offset="1" stop-color="#b98d42"/></linearGradient>
 <radialGradient id="art-glow"><stop stop-color="#cda14e" stop-opacity=".18"/><stop offset="1" stop-color="#cda14e" stop-opacity="0"/></radialGradient>
 </defs><rect width="1080" height="${height}" fill="url(#art-bg)"/><ellipse cx="1030" cy="210" rx="500" ry="550" fill="url(#art-glow)"/>
 <path d="M1000 0L1080 0V380L760 700H686L1080 280V120L890 320H864Z" fill="#c4a25e" opacity=".06"/>
 <path d="M48 25H1032Q1055 25 1055 48V${height-48}Q1055 ${height-25} 1032 ${height-25}H48Q25 ${height-25} 25 ${height-48}V48Q25 25 48 25Z" fill="none" stroke="url(#art-gold)" stroke-width="2"/>
 <path d="M70 206H1010" stroke="#50452b"/>
 ${logoData?`<image href="${logoData}" x="76" y="60" width="243" height="133"/>`:text(76,150,'JK CRED',58,gold,'font-weight="700"')}
 ${text(1008,99,'PROPOSTA PERSONALIZADA',18,gold,'text-anchor="end" letter-spacing="3"')}${text(1008,137,dateLabel(issuedOn),23,muted,'text-anchor="end"')}
 ${text(76,278,'SIMULAÇÃO',64,'url(#art-gold)','font-weight="800" letter-spacing="1"')}${text(78,329,'DE CRÉDITO',37,'#f7f3e8','font-weight="600" letter-spacing="6"')}
 ${text(78,377,'Seu crédito, nosso compromisso.',23,muted)}
 <rect x="70" y="409" width="940" height="${102+nameExtra}" rx="15" fill="#20251c" stroke="#4b4e36"/>
 ${text(96,442,'PREPARADO PARA',15,gold,'letter-spacing="3"')}${names.map((line,i)=>text(96,482+i*37,line,31,'#fff6df','font-weight="600"')).join('')}
 <rect x="70" y="${536+nameExtra}" width="940" height="126" rx="15" fill="#151a14" stroke="#5b5031"/>
 ${text(99,574+nameExtra,'VALOR SOLICITADO',16,muted,'letter-spacing="2"')}${text(96,630+nameExtra,money(c.principal),57,'#f6e3af','font-weight="700"')}
 ${text(979,578+nameExtra,`${c.count}x`,44,gold,'text-anchor="end" font-weight="700"')}${text(979,619+nameExtra,c.count===1?'PAGAMENTO ÚNICO':'PAGAMENTO PARCELADO',14,muted,'text-anchor="end" letter-spacing="1"')}
 <rect x="70" y="${start-8}" width="940" height="55" rx="8" fill="#343324"/>
 ${text(100,start+26,'PARCELA',17,gold,'letter-spacing="2"')}${text(420,start+26,'VENCIMENTO',17,gold,'letter-spacing="2"')}${text(978,start+26,'VALOR',17,gold,'text-anchor="end" letter-spacing="2"')}
 ${table}
 <rect x="70" y="${totalY}" width="940" height="115" rx="15" fill="url(#art-total)"/>
 ${text(99,totalY+39,'TOTAL A PAGAR',17,'#302511','letter-spacing="2" font-weight="700"')}${text(977,totalY+79,money(c.total),60,'#1b1b12','text-anchor="end" font-weight="800"')}
 ${text(78,totalY+158,`Juros: ${(c.rate/100).toLocaleString('pt-BR')}% sobre o valor solicitado (${money(c.interest)}).`,23)}
 ${text(78,totalY+195,feeRule,22,muted)}
 ${text(78,totalY+229,c.count>1?'A primeira parcela não gera acréscimo. O adicional integra o total parcelado.':'O valor total inclui os juros informados acima.',20,muted)}
 ${text(78,totalY+265,`Encargo total: ${c.effective.toLocaleString('pt-BR',{maximumFractionDigits:2})}% sobre o valor solicitado.`,21,gold)}
 <path d="M76 ${totalY+294}H1004" stroke="#49432d"/>
 ${text(78,totalY+326,'SIMULAÇÃO SUJEITA À CONFIRMAÇÃO DAS CONDIÇÕES.',17,muted,'letter-spacing="1"')}
 ${text(78,totalY+354,'Confira os valores e vencimentos com a equipe JK CRED antes de confirmar.',16,muted)}
 </svg>`;
}
export function proposalFilename(name,date){const slug=String(name||'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65);return `jk-cred-simulacao-${slug||'cliente'}-${date}.jpeg`;}
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
