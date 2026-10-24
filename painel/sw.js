// Deliberately no fetch handler or offline cache: financial data remains private.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const url=typeof data.url==='string'&&data.url.startsWith('/#/')?data.url:'/#/settings';
 await self.registration.showNotification(data.title||'JK CRED',{body:data.body||'Há uma atualização no painel administrativo.',icon:'/assets/pwa-192.png',badge:'/assets/push-badge.png',tag:data.tag||'jk-update',data:{url}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||'/#/settings',self.location.origin);
 if(target.origin!==self.location.origin)return;
 event.waitUntil((async()=>{
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of windows){if(new URL(client.url).origin===target.origin){await client.navigate(target.href);return client.focus();}}
 return self.clients.openWindow(target.href);
 })());
});
