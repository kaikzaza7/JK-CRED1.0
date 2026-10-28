import {TABLE,POCKETS,SHOT_PHYSICS,validBalls} from './engine.mjs';
const EPS=1e-6,R=TABLE.radius;
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const add=(p,d,t)=>({x:p.x+d.x*t,y:p.y+d.y*t});
function circleHit(origin,direction,center,radius){
 const delta={x:origin.x-center.x,y:origin.y-center.y},b=dot(delta,direction),c=dot(delta,delta)-radius*radius;
 if(c<=EPS)return b<0?0:null;
 const discriminant=b*b-c;if(discriminant<0)return null;
 const distance=-b-Math.sqrt(discriminant);return distance>=-EPS?Math.max(0,distance):null;
}
function firstEvent(origin,direction,balls,ignore){
 let event={kind:'end',distance:Infinity};
 for(const [axis,low,high] of [['x',R,TABLE.width-R],['y',R,TABLE.height-R]]){
  if(Math.abs(direction[axis])<EPS)continue;
  const distance=((direction[axis]>0?high:low)-origin[axis])/direction[axis];
  if(distance>=-EPS&&distance<event.distance)event={kind:'rail',distance:Math.max(0,distance),axis};
 }
 for(const [x,y] of POCKETS){const distance=circleHit(origin,direction,{x,y},TABLE.pocketRadius);if(distance!==null&&distance<=event.distance)event={kind:'pocket',distance};}
 for(const b of balls){if(b.potted||ignore.has(b.id))continue;const distance=circleHit(origin,direction,b,R*2);if(distance!==null&&distance<event.distance-EPS)event={kind:'ball',distance,ball:b};}
 return event;
}
function trace(origin,direction,speed,balls,ignore,{maxLength=2000,bounces=2}={}){
 const segments=[];let p={...origin},d={...direction},remaining=maxLength,velocity=speed;
 for(let bounce=0;bounce<=bounces;bounce++){
  const event=firstEvent(p,d,balls,ignore),stopping=Math.max(0,(velocity*velocity-SHOT_PHYSICS.stop**2)/(2*SHOT_PHYSICS.drag));
  const distance=Math.max(0,Math.min(event.distance,remaining,stopping));
  if(distance<EPS&&event.kind!=='ball')break;
  const end=add(p,d,distance),reached=event.distance<=distance+EPS;
  segments.push({from:{...p},to:end,kind:reached?event.kind:'end'});
  velocity=Math.sqrt(Math.max(0,velocity*velocity-2*SHOT_PHYSICS.drag*distance));remaining-=distance;
  if(!reached||event.kind!=='rail')return {segments,event:reached?event:null,point:end,direction:d,speed:velocity};
  if(event.axis==='x')d.x=-d.x;else d.y=-d.y;
  velocity*=SHOT_PHYSICS.rail;p=add(end,d,.001);remaining-=.001;
 }
 return {segments,event:null,point:segments.at(-1)?.to||p,direction:d,speed:velocity};
}
/** First contact, cue deflection and target-ball direction; no later collision chain. */
export function predictAim(balls,angle,power){
 const empty={incoming:[],cueAfter:[],objectAfter:[],contact:null};
 if(!validBalls(balls)||!Number.isFinite(angle)||!Number.isFinite(power)||power<.05||power>1)return empty;
 const cue=balls.find(b=>b.id===0);if(cue.potted)return empty;
 const incoming=trace(cue,{x:Math.cos(angle),y:Math.sin(angle)},SHOT_PHYSICS.baseSpeed+SHOT_PHYSICS.powerSpeed*power,balls,new Set([0]));
 const result={...empty,incoming:incoming.segments};
 if(incoming.event?.kind!=='ball')return result;
 const target=incoming.event.ball,point=incoming.point,length=Math.hypot(target.x-point.x,target.y-point.y);
 if(length<EPS)return result;
 const normal={x:(target.x-point.x)/length,y:(target.y-point.y)/length},projection=Math.max(0,dot(incoming.direction,normal));
 const transfer=projection*(1+SHOT_PHYSICS.restitution)/2;
 const cueVector={x:incoming.direction.x-normal.x*transfer,y:incoming.direction.y-normal.y*transfer},cueFactor=Math.hypot(cueVector.x,cueVector.y);
 result.contact={point,ballId:target.id,target:{x:target.x,y:target.y},normal};
 const projected=balls.map(b=>b.id===0?{...b,x:point.x,y:point.y}:b);
 if(cueFactor>.025)result.cueAfter=trace(point,{x:cueVector.x/cueFactor,y:cueVector.y/cueFactor},incoming.speed*cueFactor,projected,new Set([0,target.id]),{maxLength:200,bounces:1}).segments;
 result.objectAfter=trace(target,normal,incoming.speed*transfer,projected,new Set([0,target.id]),{maxLength:260,bounces:1}).segments;
 return result;
}
export function interpolateAngle(current,target,amount){
 const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));return current+delta*Math.max(0,Math.min(1,amount));
}
