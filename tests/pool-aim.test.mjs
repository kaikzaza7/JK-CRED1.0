import test from 'node:test';import assert from 'node:assert/strict';
import {initialBalls} from '../painel/pool/engine.mjs';
import {predictAim,interpolateAngle} from '../painel/pool/aim.mjs';
import {validatePoolRequest,performPoolAction} from '../painel/server/pool.mjs';
const close=(a,b,tolerance=.001)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const scene=(cue,targets)=>initialBalls().map(b=>b.id===0?{...b,...cue}:targets[b.id]?{...b,...targets[b.id]}:{...b,potted:true});
test('straight aim stops at the real contact point, marks a ghost cue ball and predicts the object direction',()=>{
 const p=predictAim(scene({x:200,y:225},{1:{x:400,y:225}}),0,.65);
 assert.equal(p.contact.ballId,1);close(p.contact.point.x,380);close(p.contact.point.y,225);close(Math.hypot(p.contact.point.x-400,p.contact.point.y-225),20);
 assert.equal(p.cueAfter.length,0);assert.ok(p.objectAfter.at(-1).to.x>400);close(p.objectAfter.at(-1).to.y,225);
});
test('a cut shows different white-ball and object-ball paths consistent with their collision normal',()=>{
 const p=predictAim(scene({x:200,y:225},{1:{x:400,y:215}}),0,.65);
 close(p.contact.point.x,400-Math.sqrt(300));assert.ok(p.objectAfter.length);assert.ok(p.cueAfter.length);
 assert.ok(p.objectAfter[0].to.y<215);assert.ok(p.cueAfter[0].to.y>225);
 const object=p.objectAfter[0];close((object.to.y-object.from.y)/(object.to.x-object.from.x),p.contact.normal.y/p.contact.normal.x);
});
test('prediction respects the nearest ball, ignores pocketed/behind balls, and does not mutate the game',()=>{
 const balls=scene({x:200,y:225},{1:{x:400,y:225},2:{x:300,y:225},3:{x:100,y:225}}),before=structuredClone(balls);
 assert.equal(predictAim(balls,0,.7).contact.ballId,2);balls[2].potted=true;assert.equal(predictAim(balls,0,.7).contact.ballId,1);balls[2].potted=false;assert.deepEqual(balls,before);
});
test('bank-shot prediction reflects off a cushion before detecting the target',()=>{
 const p=predictAim(scene({x:100,y:100},{1:{x:760,y:340}}),Math.atan2(2,3),1);
 assert.equal(p.incoming[0].kind,'rail');assert.equal(p.contact.ballId,1);assert.ok(p.incoming.length>=2);assert.ok(p.incoming[1].to.y<p.incoming[1].from.y);
});
test('low force ends the guide before unreachable targets and pockets stop the white guide',()=>{
 const p=predictAim(scene({x:100,y:225},{1:{x:800,y:225}}),0,.05);assert.equal(p.contact,null);assert.ok(p.incoming.at(-1).to.x<300);
 const q=predictAim(scene({x:450,y:150},{}),-Math.PI/2,.65);assert.equal(q.incoming.at(-1).kind,'pocket');close(q.incoming.at(-1).to.y,25);assert.equal(q.contact,null);
});
test('second-collision guides stop at other balls rather than predicting through them',()=>{
 const p=predictAim(scene({x:200,y:225},{1:{x:400,y:225},2:{x:500,y:225}}),0,.65);
 assert.equal(p.objectAfter.at(-1).kind,'ball');close(p.objectAfter.at(-1).to.x,480);
});
test('invalid inputs yield no guide and remote interpolation takes the short path around ±180°',()=>{
 for(const [a,p] of [[NaN,.5],[0,0],[0,2]])assert.deepEqual(predictAim(initialBalls(),a,p).incoming,[]);
 const a=179*Math.PI/180,b=-179*Math.PI/180,m=interpolateAngle(a,b,.5);close(m,Math.PI);assert.ok(Math.abs(m-a)<.02);
});
test('aim requests accept only finite direction/force and forward no browser game result or player identity',async()=>{
 const args={player_token:'a'.repeat(64),version:7,angle:.7,power:.43,source_id:'11111111-1111-4111-8111-111111111111',seq:8,player:2,result:{scores:[15,0]}};
 await performPoolAction({action:'aim',args},async(action,data)=>{assert.equal(action,'aim');assert.deepEqual(data,{player_token:args.player_token,version:7,angle:.7,power:.43,source_id:args.source_id,seq:8});return {};});
 for(const change of [{angle:NaN},{angle:8},{power:0},{seq:-1},{seq:1.5},{source_id:'invalid'},{version:0}])assert.throws(()=>validatePoolRequest({action:'aim',args:{...args,...change}}));
});
