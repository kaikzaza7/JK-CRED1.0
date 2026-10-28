import test from 'node:test';import assert from 'node:assert/strict';
import {initialBalls,newMatch,simulateShot,playShot,validBalls} from '../painel/pool/engine.mjs';
import {performPoolAction,validatePoolRequest} from '../painel/server/pool.mjs';
import handler from '../painel/api/pool.mjs';
const lone=(id,x,y)=>initialBalls().map(b=>b.id===0?{...b,x:216,y:225}:b.id===id?{...b,x,y}:{...b,potted:true});
test('pool rack has 15 numbered balls and a white ball without overlaps',()=>{
 const b=initialBalls();assert.ok(validBalls(b));for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++)assert.ok(Math.hypot(b[i].x-b[j].x,b[i].y-b[j].y)>=20);
});
test('pool simulation is deterministic, resolves cushions, separates the rack and ends at rest',()=>{
 const a=simulateShot(initialBalls(),0,.9),b=simulateShot(initialBalls(),0,.9);assert.deepEqual(a,b);assert.ok(a.duration>=300&&a.duration<=10000);assert.ok(validBalls(a.balls));assert.ok(a.balls.some((b,i)=>b.x!==initialBalls()[i].x));
 for(let angle=-3;angle<=3;angle+=.3){const r=simulateShot(initialBalls(),angle,1);assert.ok(validBalls(r.balls));assert.equal(r.pocketed.length,new Set(r.pocketed).size);}
});
test('each object ball scores one, including ball 8; a pot keeps the turn and the last ball determines winner',()=>{
 const balls=lone(8,450,16);const m={...newMatch(),balls,scores:[6,8]};const r=playShot(m,1,Math.PI,.05);assert.deepEqual(r.state.scores,[7,8]);assert.equal(r.state.status,'finished');assert.equal(r.state.winner,2);assert.equal(r.state.turn,1);
 const two=lone(8,450,16);two[1]={id:1,x:600,y:300,potted:false};const r2=playShot({...newMatch(),balls:two,scores:[6,7]},1,Math.PI,.05);assert.equal(r2.state.turn,1);assert.equal(r2.state.status,'playing');
});
test('white ball never scores, passes the turn and respawns without overlapping another ball',()=>{
 const balls=lone(1,216,225);Object.assign(balls[0],{x:20,y:20});const result=playShot({...newMatch(),balls,scores:[7,7]},1,-Math.PI*3/4,.3);assert.equal(result.scratch,true);assert.equal(result.state.turn,2);assert.deepEqual(result.state.scores,[7,7]);const cue=result.balls[0];assert.equal(cue.potted,false);assert.ok(Math.hypot(cue.x-balls[1].x,cue.y-balls[1].y)>20);
});
test('a miss passes turn; malformed shots and out-of-turn plays cannot be simulated',()=>{
 assert.equal(playShot(newMatch(),1,Math.PI,.2).state.turn,2);assert.throws(()=>playShot(newMatch(),2,0,.5));for(const power of [0,2,NaN])assert.throws(()=>simulateShot(initialBalls(),0,power));assert.throws(()=>simulateShot(initialBalls(),Infinity,.5));
});
test('server ignores browser-provided scores, results and initial positions; only direction/force are accepted',async()=>{
 const calls=[],room={version:2,viewer_id:1,game:newMatch(),players:[{online:true},{online:true}],server_now:'2026-10-28T12:00:00Z',busy_until:'2026-10-28T11:59:00Z'};
 const args={player_token:'a'.repeat(64),version:2,angle:Math.PI,power:.2,move_id:'11111111-1111-4111-8111-111111111111',result:{scores:[15,0]},initial:{}};
 await performPoolAction({action:'shoot',args},async(action,args)=>{calls.push({action,args});return action==='snapshot'?room:{ok:true};});
 assert.equal(calls[1].action,'commit');assert.deepEqual(calls[1].args.result.scores,[0,0]);assert.equal(calls[1].args.result.turn,2);
 await performPoolAction({action:'enter',args:{player_token:'a'.repeat(64),partner_id:1,initial:{scores:[15,0]}}},async(action,args)=>{assert.deepEqual(args.initial.scores,[0,0]);});
});
test('server rejects spectator, stale version, missing opponent and unsettled balls',async()=>{
 const base={version:2,viewer_id:1,game:newMatch(),players:[{online:true},{online:true}],server_now:'2026-10-28T12:00:00Z',busy_until:'2026-10-28T11:59:00Z'};
 const request={action:'shoot',args:{player_token:'a'.repeat(64),version:2,angle:0,power:.5,move_id:'11111111-1111-4111-8111-111111111111'}};
 for(const change of [{viewer_id:null},{version:3},{players:[{online:true},{online:false}]},{busy_until:'2026-10-28T12:01:00Z'}])await assert.rejects(performPoolAction(request,async()=>({...base,...change})));
 assert.throws(()=>validatePoolRequest({action:'commit',args:{}}));assert.throws(()=>validatePoolRequest({action:'enter',args:{player_token:'a'.repeat(64),partner_id:3}}));
});
test('pool API preserves private same-origin boundary',async()=>{
 const res=()=>({code:0,setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
 let r=res();await handler({method:'GET',headers:{}},r);assert.equal(r.code,405);
 r=res();await handler({method:'POST',headers:{host:'jk.test',origin:'https://attacker.test','content-type':'application/json'},body:{action:'snapshot',args:{}}},r);assert.equal(r.code,403);
 r=res();await handler({method:'POST',headers:{host:'jk.test',origin:'https://jk.test','content-type':'application/json'},body:{action:'commit',args:{}}},r);assert.equal(r.code,400);
});
