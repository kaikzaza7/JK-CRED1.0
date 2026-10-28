// One deterministic simulation shared by the authoritative server and both viewers.
export const TABLE={width:900,height:450,radius:10,pocketRadius:25};
export const POCKETS=[[0,0],[450,0],[900,0],[0,450],[450,450],[900,450]];
export const DT=1/180;
export const MAX_STEPS=1800;
const STOP=3,DRAG=205,RESTITUTION=.97,RAIL=.85;
export function initialBalls(){
 const balls=[{id:0,x:216,y:225,potted:false}];let id=1;
 for(let row=0;row<5;row++)for(let col=0;col<=row;col++)balls.push({id:id++,x:612+row*Math.sqrt(3)*10.2,y:225+(2*col-row)*10.2,potted:false});
 return balls;
}
export const newMatch=(starter=1)=>({balls:initialBalls(),scores:[0,0],turn:starter,status:'playing',winner:null});
export function validBalls(balls){
 return Array.isArray(balls)&&balls.length===16&&new Set(balls.map(b=>b.id)).size===16&&balls.every(b=>Number.isInteger(b.id)&&b.id>=0&&b.id<=15&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&b.x>=0&&b.x<=900&&b.y>=0&&b.y<=450&&typeof b.potted==='boolean');
}
function restoreCue(balls){
 const cue=balls.find(b=>b.id===0);const free=(x,y)=>balls.every(b=>b.id===0||b.potted||Math.hypot(x-b.x,y-b.y)>22);
 const candidates=[[216,225]];for(let x=60;x<860;x+=25)for(let y=40;y<420;y+=25)candidates.push([x,y]);
 const [x,y]=candidates.find(([x,y])=>free(x,y))||[216,225];Object.assign(cue,{x,y,vx:0,vy:0,potted:false});
}
export function simulateShot(input,angle,power,{capture=false}={}){
 if(!validBalls(input)||input.find(b=>b.id===0)?.potted||!Number.isFinite(angle)||!Number.isFinite(power)||power<.05||power>1)throw new Error('Tacada inválida.');
 const balls=input.map(b=>({...b,vx:0,vy:0}));const cue=balls.find(b=>b.id===0);const speed=160+1050*power;
 cue.vx=Math.cos(angle)*speed;cue.vy=Math.sin(angle)*speed;const pocketed=[],frames=[];let step=0;
 const frame=()=>({t:Math.round(step*DT*1000),balls:balls.map(({id,x,y,potted})=>({id,x,y,potted}))});
 if(capture)frames.push(frame());
 for(step=1;step<=MAX_STEPS;step++){
  for(const b of balls){
   if(b.potted)continue;b.x+=b.vx*DT;b.y+=b.vy*DT;
   if(POCKETS.some(([x,y])=>Math.hypot(b.x-x,b.y-y)<TABLE.pocketRadius)){
    b.potted=true;b.vx=0;b.vy=0;pocketed.push(b.id);continue;
   }
   if(b.x<10){b.x=10;b.vx=Math.abs(b.vx)*RAIL;}if(b.x>890){b.x=890;b.vx=-Math.abs(b.vx)*RAIL;}
   if(b.y<10){b.y=10;b.vy=Math.abs(b.vy)*RAIL;}if(b.y>440){b.y=440;b.vy=-Math.abs(b.vy)*RAIL;}
  }
  // Resolve overlaps twice, so the rack settles without adding artificial energy.
  for(let pass=0;pass<2;pass++)for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
   const a=balls[i],b=balls[j];if(a.potted||b.potted)continue;
   const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=20)continue;
   const nx=d>1e-8?dx/d:1,ny=d>1e-8?dy/d:0,overlap=(20-d)/2+.00001;
   a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
   const relative=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
   if(relative>0){const impulse=relative*(1+RESTITUTION)/2;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;}
  }
  let moving=false;
  for(const b of balls){
   if(b.potted)continue;
   b.x=Math.min(890,Math.max(10,b.x));b.y=Math.min(440,Math.max(10,b.y));
   const speed=Math.hypot(b.vx,b.vy),next=Math.max(0,speed-DRAG*DT);
   if(next<STOP){b.vx=0;b.vy=0;}else{b.vx*=next/speed;b.vy*=next/speed;moving=true;}
  }
  if(capture&&step%3===0)frames.push(frame());
  if(!moving)break;
 }
 step=Math.min(step,MAX_STEPS);const duration=Math.max(300,Math.ceil(step*DT*1000));
 if(capture&&(frames.at(-1)?.t!==Math.round(step*DT*1000)))frames.push(frame());
 const scratch=pocketed.includes(0);if(scratch)restoreCue(balls);
 return {balls:balls.map(({id,x,y,potted})=>({id,x:+x.toFixed(6),y:+y.toFixed(6),potted})),pocketed:pocketed.filter(id=>id!==0),scratch,duration,frames};
}
export function playShot(match,player,angle,power,options){
 if(!match||match.status!=='playing'||![1,2].includes(player)||match.turn!==player)throw new Error('Aguarde a sua vez.');
 const result=simulateShot(match.balls,angle,power,options),scores=[...match.scores];scores[player-1]+=result.pocketed.length;
 const finished=result.balls.every(b=>b.id===0||b.potted);
 const state={balls:result.balls,scores,turn:result.pocketed.length&&!result.scratch?player:3-player,status:finished?'finished':'playing',winner:finished?(scores[0]===scores[1]?0:scores[0]>scores[1]?1:2):null};
 return {...result,state};
}
