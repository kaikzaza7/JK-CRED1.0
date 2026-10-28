import {escapeHTML as h} from '../core.mjs';
import {initialBalls,simulateShot,POCKETS,TABLE} from './engine.mjs';
import {predictAim,interpolateAngle} from './aim.mjs';
const WIDTH=984,HEIGHT=534,PAD=42;
const COLORS=['#f7f4e8','#f5c530','#337ad8','#d84145','#8a54ba','#ed8335','#2b9c69','#9d3640','#181e25','#f5c530','#337ad8','#d84145','#8a54ba','#ed8335','#2b9c69','#9d3640'];
const nameFor=(room,id)=>room?.players.find(p=>p.id===id)?.name||(['','Juan Kelvin','Kaik Andrade'][id]);
let playerToken;try{playerToken=localStorage.getItem('jk-pool-player');if(!/^[a-f0-9]{64}$/.test(playerToken||'')){playerToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('jk-pool-player',playerToken);}}catch{}
function ball(ctx,b){
 if(b.potted)return;const x=b.x+PAD,y=b.y+PAD,r=10;
 ctx.save();ctx.shadowColor='#001a13aa';ctx.shadowBlur=4;ctx.shadowOffsetY=3;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=b.id>8?'#f1eee4':COLORS[b.id];ctx.fill();ctx.shadowColor='transparent';
 if(b.id>8){ctx.save();ctx.beginPath();ctx.arc(x,y,r-.5,0,Math.PI*2);ctx.clip();ctx.fillStyle=COLORS[b.id];ctx.fillRect(x-r,y-6,r*2,12);ctx.restore();}
 const shine=ctx.createRadialGradient(x-3,y-4,0,x,y,r);shine.addColorStop(0,'#ffffff65');shine.addColorStop(.65,'#ffffff00');shine.addColorStop(1,'#00000035');ctx.fillStyle=shine;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 if(b.id){ctx.beginPath();ctx.arc(x,y,4.9,0,Math.PI*2);ctx.fillStyle='#fffcf3';ctx.fill();ctx.fillStyle='#18201c';ctx.font='bold 7px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(b.id),x,y+.4);}ctx.restore();
}
function drawAimGuide(ctx,balls,angle,power){
 const preview=predictAim(balls,angle,power);
 ctx.save();ctx.beginPath();ctx.rect(PAD,PAD,900,450);ctx.clip();ctx.translate(PAD,PAD);ctx.lineCap='round';ctx.lineJoin='round';
 function path(segments,color,dash,arrow){
  if(!segments.length)return;ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.setLineDash(dash);
  ctx.beginPath();for(const segment of segments){ctx.moveTo(segment.from.x,segment.from.y);ctx.lineTo(segment.to.x,segment.to.y);}ctx.stroke();ctx.setLineDash([]);
  if(arrow){const last=segments.at(-1),dx=last.to.x-last.from.x,dy=last.to.y-last.from.y,d=Math.hypot(dx,dy);if(d>14){const a=Math.atan2(dy,dx);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(last.to.x,last.to.y);ctx.lineTo(last.to.x-9*Math.cos(a-.45),last.to.y-9*Math.sin(a-.45));ctx.lineTo(last.to.x-9*Math.cos(a+.45),last.to.y-9*Math.sin(a+.45));ctx.closePath();ctx.fill();}}
 }
 path(preview.incoming,'#fff7df',[8,6],false);
 path(preview.cueAfter,'#72e2ec',[5,5],true);
 path(preview.objectAfter,'#ffd15e',[],true);
 if(preview.contact){const c=preview.contact;ctx.fillStyle='#fff7df1a';ctx.strokeStyle='#fff9e8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(c.point.x,c.point.y,TABLE.radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#ffd15e';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(c.target.x,c.target.y,TABLE.radius+3,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
function drawTable(ctx,balls,angle,power,aiming){
 ctx.clearRect(0,0,WIDTH,HEIGHT);
 const wood=ctx.createLinearGradient(0,0,0,HEIGHT);wood.addColorStop(0,'#3a3123');wood.addColorStop(.5,'#201e19');wood.addColorStop(1,'#131a16');
 ctx.fillStyle=wood;ctx.beginPath();ctx.roundRect(2,2,WIDTH-4,HEIGHT-4,27);ctx.fill();ctx.strokeStyle='#a18449';ctx.lineWidth=2;ctx.stroke();
 ctx.fillStyle='#102d22';ctx.beginPath();ctx.roundRect(23,23,WIDTH-46,HEIGHT-46,15);ctx.fill();
 const felt=ctx.createLinearGradient(PAD,PAD,WIDTH-PAD,HEIGHT-PAD);felt.addColorStop(0,'#15694e');felt.addColorStop(.5,'#0e5b42');felt.addColorStop(1,'#0b4b37');ctx.fillStyle=felt;ctx.fillRect(PAD,PAD,900,450);
 ctx.strokeStyle='#38916b66';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(267,PAD+8);ctx.lineTo(267,HEIGHT-PAD-8);ctx.stroke();ctx.beginPath();ctx.arc(267,PAD+225,70,Math.PI/2,Math.PI*1.5);ctx.stroke();
 ctx.fillStyle='#bb9b62';for(const x of [150,300,600,750])for(const y of [PAD/2,HEIGHT-PAD/2]){ctx.beginPath();ctx.moveTo(x+PAD,y-3);ctx.lineTo(x+PAD+3,y);ctx.lineTo(x+PAD,y+3);ctx.lineTo(x+PAD-3,y);ctx.fill();}
 for(const [x,y] of POCKETS){ctx.fillStyle='#8a6b39';ctx.beginPath();ctx.arc(x+PAD,y+PAD,28,0,Math.PI*2);ctx.fill();ctx.fillStyle='#080e0a';ctx.beginPath();ctx.arc(x+PAD,y+PAD,24.5,0,Math.PI*2);ctx.fill();}
 if(aiming){
  const cue=balls.find(b=>b.id===0);if(cue&&!cue.potted){const x=cue.x+PAD,y=cue.y+PAD,dx=Math.cos(angle),dy=Math.sin(angle);
   drawAimGuide(ctx,balls,angle,power);
   const gap=18+power*24;ctx.lineCap='round';ctx.lineWidth=6;ctx.strokeStyle='#cfac72';ctx.beginPath();ctx.moveTo(x-dx*(gap+8),y-dy*(gap+8));ctx.lineTo(x-dx*(gap+155),y-dy*(gap+155));ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='#f5e6c2';ctx.beginPath();ctx.moveTo(x-dx*gap,y-dy*gap);ctx.lineTo(x-dx*(gap+55),y-dy*(gap+55));ctx.stroke();ctx.strokeStyle='#91bdcb';ctx.beginPath();ctx.moveTo(x-dx*gap,y-dy*gap);ctx.lineTo(x-dx*(gap+3),y-dy*(gap+3));ctx.stroke();
  }
 }
 for(const b of balls)ball(ctx,b);
}
export function createPoolPanel({head}){
 let root=null,room=null,epoch=0,pollTimer=0,raf=0,controller=null,reading=false,sending=false,angle=0,power=.65,offset=0,lastSync=0,lastError='',animation=null,lastSeatsHTML='',aimSource='',aimSeq=0,pendingAim=null,lastAimBase=0,lastPoll=0,viewAngle=0,viewPower=.65,viewTurn=0,lastFrame=0;
 function render(){return head('Sinuca entre sócios.','Uma mesa, duas pessoas. Quem encaçapar mais bolas vence.','','JK CRED / HORA DA PAUSA')+`<section id="pool-panel" class="pool-panel"><div class="pool-scoreboard" id="pool-seats"></div><div class="pool-status-bar"><span class="pool-live" id="pool-connection">Conectando à mesa</span><strong id="pool-status" role="status" aria-live="polite">Preparando a partida…</strong><span id="pool-round">Partida 1</span></div><div class="pool-table-wrap" id="pool-table-wrap"><canvas id="pool-canvas" width="984" height="534" tabindex="0" role="img" aria-label="Mesa de sinuca. Toque ou clique na mesa para mirar. Use as setas para ajustar a mira e espaço para tacar."></canvas><div class="pool-expanded-controls"><strong id="pool-expanded-status"></strong><label>Força<input id="pool-power-expanded" type="range" min="5" max="100" value="65" aria-label="Força da tacada na mesa ampliada"></label><button class="btn primary" type="button" data-pool="shoot-expanded" disabled>Dar tacada</button></div><button class="btn sm ghost pool-expand" type="button" data-pool="expand" aria-label="Ampliar mesa">Ampliar mesa</button></div><div class="pool-aim-legend" aria-label="Cores da previsão de trajetória"><span class="aim-white">Branca até o contato</span><span class="aim-cyan">Branca após o contato</span><span class="aim-gold">Bola atingida</span><small id="pool-aim-status" aria-live="polite">Mira compartilhada entre os jogadores</small></div><div class="pool-controls"><label>Direção <span><input id="pool-angle" type="range" min="-180" max="180" step="1" value="0" aria-label="Direção do taco"><output id="pool-angle-value">0°</output></span></label><label>Força <span><input id="pool-power" type="range" min="5" max="100" step="1" value="65" aria-label="Força da tacada"><output id="pool-power-value">65%</output></span></label><button type="button" class="btn primary pool-shoot" data-pool="shoot" disabled>Dar tacada <span aria-hidden="true">↗</span></button></div><div class="pool-footer"><p id="pool-hint">Cada sócio entra no próprio perfil. A partida começa quando os dois estiverem na mesa.</p><div class="actions"><button class="btn sm ghost" type="button" data-pool="reset" disabled>Nova partida</button><button class="btn sm ghost" type="button" data-pool="leave" hidden>Sair da mesa</button></div></div><p id="pool-error" class="pool-error" role="alert"></p><details class="pool-rules"><summary>Como jogar</summary><p>Clique ou toque na mesa para mirar. Ajuste a força e toque em <strong>Dar tacada</strong>. Cada bola numerada vale 1 ponto, inclusive a preta. Encaçapou? Continue. Errou ou encaçapou a branca? A vez passa; a branca volta à mesa. Quando as 15 bolas acabarem, vence o maior placar. Uma nova partida precisa da confirmação dos dois.</p><p>No teclado: setas para a direção e força; espaço para tacar com a mesa selecionada. A mira branca prevê o caminho até a colisão; a ciano mostra a saída da branca e a dourada a da bola atingida. A previsão considera força e tabelas e termina na próxima colisão. O taco do jogador da vez aparece nas duas telas. Use <strong>Ampliar mesa</strong> e vire o celular para uma visão maior.</p></details></section>`;}
 const now=()=>Date.now()+offset;
 const moving=()=>!!(room?.shot&&now()<Date.parse(room.busy_until));
 const fresh=()=>Date.now()-lastSync<8000&&!lastError;
 const canShoot=()=>!!(root&&room?.viewer_id&&room.game?.status==='playing'&&room.game.turn===room.viewer_id&&room.players.every(p=>p.online)&&!moving()&&!sending&&fresh());
 function text(selector,value){const node=root?.querySelector(selector);if(node&&node.textContent!==String(value))node.textContent=value;}
 function notice(value){lastError=value;if(root)text('#pool-error',value);}
 async function request(action,args={}){
  const t0=Date.now();const response=await fetch('/api/pool',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args:{...args,...(playerToken?{player_token:playerToken}:{})}}),signal:controller.signal});
  let data;try{data=await response.json();}catch{throw new Error('Sua sessão privada expirou. Atualize a página para entrar novamente.');}
  if(!response.ok||data.error)throw new Error(data.error||'Não foi possível conectar à mesa.');
  return {room:data.data,offset:Date.parse(data.data.server_now)-(t0+Date.now())/2};
 }
 function accept(result){
  if(!root||result.room.version<(room?.version||0))return;const firstSnapshot=!room;
  if(room&&result.room.version===room.version&&(result.room.aim_revision||0)<(room.aim_revision||0)){result.room.aim=room.aim;result.room.aim_revision=room.aim_revision;}
  room=result.room;offset=result.offset;lastSync=Date.now();notice('');
  if(firstSnapshot&&room.aim?.player===room.viewer_id&&room.aim?.version===room.version){angle=room.aim.angle;power=room.aim.power;setInputs();}
  if(room.viewer_id&&room.game?.turn===room.viewer_id&&!moving()&&room.game?.status==='playing'&&lastAimBase!==room.version)queueAim();
  if(room.shot&&room.shot.move_id!==animation?.id){
   animation=null;
   if(moving()){const simulated=simulateShot(room.shot.from,room.shot.angle,room.shot.power,{capture:true});animation={id:room.shot.move_id,frames:simulated.frames,start:Date.parse(room.shot.started_at)};}
  }
  update();
 }
 async function poll(){
  if(!root||reading||sending)return;
  const interval=room?.viewer_id&&room?.players.every(p=>p.online)?(moving()?450:220):room?.players.every(p=>p.online)?300:1100;
  if(Date.now()-lastPoll<interval)return;lastPoll=Date.now();const generation=epoch;reading=true;
  const outgoing=canShoot()&&pendingAim?.version===room.version?{...pendingAim}:null;
  try{const data=await request(outgoing?'aim':'snapshot',outgoing||{});if(epoch===generation){if(outgoing&&pendingAim?.seq===outgoing.seq)pendingAim=null;accept(data);}}catch(error){if(epoch===generation&&error.name!=='AbortError'){if(outgoing){if(pendingAim?.seq===outgoing.seq)pendingAim=null;lastAimBase=0;}notice(error.message);}}finally{if(epoch===generation)reading=false;}
 }
 function update(){
  if(!root)return;const mine=room?.viewer_id,busy=moving(),players=room?.players||[{id:1,name:'Juan Kelvin'},{id:2,name:'Kaik Andrade'}];
  let scores=room?.game?.scores||[0,0];
  if(busy&&room.shot){scores=[...scores];const shooter=room.shot.player-1;scores[shooter]-=room.shot.pocketed.length;const frame=currentFrame();scores[shooter]+=room.shot.pocketed.filter(id=>frame?.some(b=>b.id===id&&b.potted)).length;}
  const html=players.map(p=>`<article class="pool-player ${mine===p.id?'pool-you':''} ${room?.game?.turn===p.id&&players.every(p=>p.online)&&room?.game?.status==='playing'?'pool-turn':''}"><span class="pool-player-avatar">${p.id===1?'JK':'KA'}</span><div><strong>${h(p.name)}${mine===p.id?'<small>VOCÊ</small>':''}</strong><span>${p.online?'Na mesa':p.occupied?'Desconectado':'Aguardando jogador'}</span></div><b class="pool-score" aria-label="${h(p.name)}: ${scores[p.id-1]} pontos">${scores[p.id-1]}<small>pontos</small></b>${!mine?`<button type="button" class="btn sm ${p.online?'ghost':'primary'}" data-pool="enter" data-partner="${p.id}" ${p.online||sending||!room?'disabled':''}>${p.online?'Ocupado':'Entrar'}</button>`:''}</article>`).join('');
  const seats=root.querySelector('#pool-seats');if(lastSeatsHTML!==html){seats.innerHTML=html;lastSeatsHTML=html;}
  text('#pool-round','Partida '+(room?.round||1));text('#pool-connection',fresh()&&room?'Mesa conectada':'Reconectando…');
  let status=room?.players.every(p=>p.online)?'Mesa ocupada. Você está assistindo.':'Entre no seu perfil para jogar.';
  if(lastError)status='A mesa está reconectando. Aguarde para jogar.';
  else if(busy)status=nameFor(room,room.shot.player)+' deu a tacada…';
  else if(room?.game?.status==='finished')status=room.game.winner?nameFor(room,room.game.winner)+' venceu!':'A partida terminou empatada.';
  else if(room&&players.some(p=>!p.online))status=mine?'Aguardando '+nameFor(room,3-mine)+' entrar na mesa.':'Escolham os perfis para começar.';
  else if(mine)status=room?.game?.turn===mine?'Sua vez, '+nameFor(room,mine)+'.':'Vez de '+nameFor(room,room?.game?.turn)+'.';
  text('#pool-status',status);text('#pool-expanded-status',status);
  text('#pool-aim-status',!moving()&&room?.game?.status==='playing'?(mine===room.game.turn?'Sua mira aparece para o adversário':'Acompanhando a mira de '+nameFor(room,room.game.turn)):'Previsão aproximada até as próximas colisões');
  for(const shoot of root.querySelectorAll('[data-pool=shoot],[data-pool=shoot-expanded]')){shoot.disabled=!canShoot();shoot.textContent=sending?'Enviando…':busy?'Bolas em movimento…':'Dar tacada ↗';}
  root.querySelector('[data-pool=leave]').hidden=!mine;root.querySelector('[data-pool=leave]').disabled=sending;
  const votes=room?.reset_votes||[],reset=root.querySelector('[data-pool=reset]');reset.disabled=!mine||sending||busy||votes.includes(mine)||!fresh();reset.textContent=votes.includes(mine)?'Aguardando confirmação…':votes.length?'Aceitar nova partida':'Nova partida';
  text('#pool-hint',votes.length?nameFor(room,votes[0])+' pediu uma nova partida. O outro sócio precisa aceitar.':mine?'Toque ou clique na mesa para mirar; ajuste a força e dê a tacada.':room?.players.every(p=>p.online)?'Os dois sócios já estão na mesa. Você pode acompanhar a partida.':'Cada sócio entra no próprio perfil. A partida começa com os dois na mesa.');
  root.querySelector('#pool-angle').disabled=!canShoot();root.querySelector('#pool-power').disabled=!canShoot();root.querySelector('#pool-power-expanded').disabled=!canShoot();
 }
 function currentFrame(){
  if(!animation||!moving())return room?.game?.balls||initialBalls();
  const elapsed=now()-animation.start,frames=animation.frames;
  const index=Math.min(frames.length-1,Math.max(0,Math.floor(elapsed/(1000/60))));return frames[index].balls;
 }
 function paint(){
  if(!root)return;
  const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');const ratio=Math.min(window.devicePixelRatio||1,2);
  if(canvas.width!==WIDTH*ratio){canvas.width=WIDTH*ratio;canvas.height=HEIGHT*ratio;}
  const timestamp=performance.now(),delta=Math.min(100,Math.max(0,timestamp-lastFrame));lastFrame=timestamp;
  const turn=room?.game?.turn,own=turn===room?.viewer_id;
  const aim=room?.aim&&room.aim.version===room.version&&room.aim.player===turn?room.aim:null;
  const targetAngle=own?angle:aim?.angle??0,targetPower=own?power:aim?.power??.65;
  if(own&&viewTurn!==turn)setInputs();
  if(own||viewTurn!==turn){viewAngle=targetAngle;viewPower=targetPower;viewTurn=turn;}else{const blend=1-Math.exp(-delta/70);viewAngle=interpolateAngle(viewAngle,targetAngle,blend);viewPower+=(targetPower-viewPower)*blend;}
  const showAim=!!(room?.game?.status==='playing'&&room.players.every(p=>p.online)&&!moving()&&fresh());
  if(!own)setInputs(viewAngle,viewPower);
  canvas.dataset.aimPlayer=showAim?String(turn):'';canvas.dataset.aimAngle=showAim?String(viewAngle):'';canvas.dataset.aimPower=showAim?String(viewPower):'';
  ctx.setTransform(ratio,0,0,ratio,0,0);drawTable(ctx,currentFrame(),viewAngle,viewPower,showAim);update();raf=requestAnimationFrame(paint);
 }
 function aim(event){if(!canShoot())return;const canvas=root.querySelector('canvas'),rect=canvas.getBoundingClientRect(),cue=room.game.balls.find(b=>b.id===0);const x=(event.clientX-rect.left)/rect.width*WIDTH-PAD,y=(event.clientY-rect.top)/rect.height*HEIGHT-PAD;angle=Math.atan2(y-cue.y,x-cue.x);setInputs();queueAim();}
 function queueAim(){if(!root||!room?.viewer_id||room.game?.turn!==room.viewer_id)return;lastAimBase=room.version;pendingAim={version:room.version,angle,power,source_id:aimSource,seq:++aimSeq};}
 function setInputs(direction=angle,strength=power){if(!root)return;root.querySelector('#pool-angle').value=Math.round(direction*180/Math.PI);text('#pool-angle-value',Math.round(direction*180/Math.PI)+'°');root.querySelector('#pool-power').value=Math.round(strength*100);root.querySelector('#pool-power-expanded').value=Math.round(strength*100);text('#pool-power-value',Math.round(strength*100)+'%');}
 async function action(event){
  const button=event.target.closest('[data-pool]');if(!button||sending)return;
  const generation=epoch,kind=button.dataset.pool==='shoot-expanded'?'shoot':button.dataset.pool;
  if(kind==='expand'){const wrap=root.querySelector('#pool-table-wrap');wrap.classList.toggle('pool-expanded');button.textContent=wrap.classList.contains('pool-expanded')?'Fechar ampliação':'Ampliar mesa';return;}
  if(kind==='shoot'&&!canShoot())return;
  if(!playerToken){notice('Permita o armazenamento do navegador para identificar seu lugar na mesa.');return;}
  sending=true;button.disabled=true;notice('');update();
  try{
   let args={};if(kind==='enter')args.partner_id=Number(button.dataset.partner);
   if(kind==='shoot'){args={version:room.version,angle,power,move_id:crypto.randomUUID()};}
   const result=await request(kind,args);if(generation===epoch)accept(result);
  }catch(error){if(generation===epoch&&error.name!=='AbortError')notice(error.message);}finally{if(generation===epoch){sending=false;update();}}
 }
 function onInput(event){if(!canShoot())return;if(event.target.id==='pool-angle')angle=Number(event.target.value)*Math.PI/180;if(['pool-power','pool-power-expanded'].includes(event.target.id))power=Number(event.target.value)/100;setInputs();queueAim();}
 function onKey(event){if(event.key==='Escape'){root?.querySelector('#pool-table-wrap').classList.remove('pool-expanded');const b=root?.querySelector('[data-pool=expand]');if(b)b.textContent='Ampliar mesa';return;}if(event.target.id!=='pool-canvas'||!canShoot())return;const increment=event.shiftKey?5:1;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(event.key))event.preventDefault();if(event.key==='ArrowLeft')angle-=increment*Math.PI/180;if(event.key==='ArrowRight')angle+=increment*Math.PI/180;if(event.key==='ArrowUp')power=Math.min(1,power+.05);if(event.key==='ArrowDown')power=Math.max(.05,power-.05);if(event.key===' ')root.querySelector('[data-pool=shoot]').click();angle=Math.atan2(Math.sin(angle),Math.cos(angle));setInputs();queueAim();}
 function mount(){
  root=document.getElementById('pool-panel');if(!root)return;controller=new AbortController();room=null;lastSync=0;animation=null;lastSeatsHTML='';lastError='';reading=false;sending=false;aimSource=crypto.randomUUID();aimSeq=0;pendingAim=null;lastAimBase=0;lastPoll=0;viewTurn=0;lastFrame=performance.now();
  root.addEventListener('click',action);root.addEventListener('input',onInput);root.addEventListener('keydown',onKey);
  const canvas=root.querySelector('canvas');canvas.addEventListener('pointerdown',event=>{aim(event);canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});});canvas.addEventListener('pointermove',event=>{if(canvas.hasPointerCapture(event.pointerId))aim(event);});
  setInputs();update();poll();pollTimer=setInterval(()=>{if(document.visibilityState==='visible')poll();},80);raf=requestAnimationFrame(paint);
 }
 function destroy(){epoch++;clearInterval(pollTimer);cancelAnimationFrame(raf);controller?.abort();root=null;room=null;animation=null;pendingAim=null;}
 return {render,mount,destroy};
}
