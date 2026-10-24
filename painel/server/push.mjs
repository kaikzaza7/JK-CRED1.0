import webpush from 'web-push';
export const browserActions=new Set(['status','subscribe','unsubscribe','preferences','history','test','key']);
export function validateSubscription(value){
 if(!value||typeof value!=='object')throw new Error('Assinatura inválida.');
 const url=new URL(value.endpoint);
 const allowed=url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.services.mozilla.com')||url.hostname.endsWith('.push.apple.com')||url.hostname.endsWith('.notify.windows.com');
 if(url.protocol!=='https:'||!allowed||url.port||url.username||url.password||value.endpoint.length>3000)throw new Error('Provedor de notificações não permitido.');
 if(!/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth||''))throw new Error('Chaves de notificação inválidas.');
 return {endpoint:value.endpoint,expirationTime:null,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export async function pushRPC(action,args={}){
 const {JK_SUPABASE_URL:url,JK_SUPABASE_KEY:key,JK_GATEWAY_TOKEN:token}=process.env;
 if(!url||!key||!token)throw new Error('Conexão privada indisponível.');
 const response=await fetch(url+'/rest/v1/rpc/jk_push_gateway',{method:'POST',headers:{'Content-Type':'application/json',apikey:key},body:JSON.stringify({p_token:token,p_action:action,p_args:args}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw new Error(data.message||'Falha ao atualizar notificações.');return data;
}
export function pushConfigured(){return !!(process.env.JK_VAPID_PUBLIC_KEY&&process.env.JK_VAPID_PRIVATE_KEY);}
export async function dispatchPush({prepare=false}={}){
 if(!pushConfigured())throw new Error('Envio de notificações ainda não configurado.');
 webpush.setVapidDetails('https://jk-cred-admin.vercel.app',process.env.JK_VAPID_PUBLIC_KEY,process.env.JK_VAPID_PRIVATE_KEY);
 if(prepare)await pushRPC('prepare');
 const rows=await pushRPC('claim');let sent=0,failed=0;
 for(let offset=0;offset<rows.length;offset+=8){
 await Promise.all(rows.slice(offset,offset+8).map(async row=>{
 let ok=false,gone=false,error;
 try{validateSubscription(row.subscription);await webpush.sendNotification(row.subscription,JSON.stringify(row.payload),{TTL:3600,urgency:'normal',timeout:7000});ok=true;sent++;}
 catch(e){gone=e.statusCode===404||e.statusCode===410;error=String(e.statusCode||e.name||'send_failed');failed++;}
 await pushRPC('ack',{event_id:row.event_id,device_id:row.device_id,lease:row.lease,ok,gone,error});
 }));}
 return {sent,failed,claimed:rows.length};
}
