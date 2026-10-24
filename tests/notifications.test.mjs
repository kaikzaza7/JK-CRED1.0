import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSubscription} from '../painel/server/push.mjs';
import handler from '../painel/api/notifications.mjs';
import cron from '../painel/api/notification-cron.mjs';
const keys={p256dh:'A'.repeat(87),auth:'B'.repeat(22)};
const response=()=>({headers:{},code:0,data:null,setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
test('push permits supported providers and rejects arbitrary endpoints, credentials and invalid keys',()=>{
 for(const endpoint of ['https://fcm.googleapis.com/fcm/send/example','https://web.push.apple.com/Qexample','https://updates.push.services.mozilla.com/wpush/v2/example'])assert.equal(validateSubscription({endpoint,keys}).endpoint,endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://127.0.0.1/x','https://fcm.googleapis.com.attacker.com/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])assert.throws(()=>validateSubscription({endpoint,keys}));
 assert.throws(()=>validateSubscription({endpoint:'https://fcm.googleapis.com/x',keys:{auth:'wrong',p256dh:'wrong'}}));
});
test('browser endpoint blocks cross-site access, cron internals and invalid subscriptions before database access',async()=>{
 let res=response();await handler({method:'POST',headers:{host:'jk.test',origin:'https://attacker.test','content-type':'application/json'},body:{action:'history'}},res);assert.equal(res.code,403);
 res=response();await handler({method:'POST',headers:{host:'jk.test',origin:'https://jk.test','content-type':'application/json'},body:{action:'claim'}},res);assert.equal(res.code,400);
 res=response();await handler({method:'POST',headers:{host:'jk.test',origin:'https://jk.test','content-type':'application/json'},body:{action:'subscribe',args:{subscription:{endpoint:'http://localhost',keys}}}},res);assert.equal(res.code,400);
});
test('scheduled delivery cannot run with absent or incorrect cron credentials',async()=>{
 delete process.env.CRON_SECRET;let res=response();await cron({method:'GET',headers:{}},res);assert.equal(res.code,401);
 process.env.CRON_SECRET='a-test-secret';res=response();await cron({method:'GET',headers:{authorization:'Bearer incorrect'}},res);assert.equal(res.code,401);delete process.env.CRON_SECRET;
});
