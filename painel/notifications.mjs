import {escapeHTML as h} from './core.mjs';
const labels={due:'Vencimentos e atrasos',payments:'Pagamentos e estornos de clientes',loans:'Novos empréstimos',cash:'Aportes, retiradas e ajustes de caixa',society:'Repasses e estornos dos sócios'};
let deviceId;try{deviceId=localStorage.getItem('jk-push-device');if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('jk-push-device',deviceId);}}catch{}
async function request(action,args={}){
 const response=await fetch('/api/notifications',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args:{device_id:deviceId,...args}})});
 let data;try{data=await response.json();}catch{throw new Error('Sua sessão privada expirou. Atualize a página.');}
 if(!response.ok||data.error)throw new Error(data.error||'Falha ao atualizar notificações.');return data;
}
export function notificationSettings(){return `<section class="card notification-settings" id="notification-settings"><div class="card-head"><div><h2>Notificações no celular</h2><p>Alertas da JK CRED com o nome completo do cliente ou sócio</p></div></div><div class="card-body"><p id="push-status" role="status">Conferindo este aparelho…</p><p class="note">No iPhone (iOS 16.4 ou superior), adicione o painel à Tela de Início e abra pelo ícone. No Android, use um navegador compatível. A autorização é individual em cada aparelho.</p><label>Nome deste aparelho<input id="push-device-name" maxlength="80" placeholder="Ex.: Celular de Kaik Andrade"></label><div id="push-categories" class="push-categories"></div><div class="actions push-actions"><button type="button" class="btn primary" data-push="activate">Ativar neste aparelho</button><button type="button" class="btn ghost" data-push="test">Enviar teste</button><button type="button" class="btn ghost" data-push="save">Salvar alertas</button><button type="button" class="btn ghost" data-push="disable">Desativar neste aparelho</button><button type="button" class="btn ghost" data-push="refresh">Atualizar histórico</button></div><p class="note">Lembretes automáticos pela manhã, no horário de Brasília. Atrasos são lembrados com 1, 3 e 7 dias. Movimentações geram alertas após o registro; a entrega depende da conexão e das permissões do celular. Nome e valor podem aparecer na tela bloqueada.</p><p id="push-feedback" role="alert"></p><h3>Histórico de alertas</h3><p class="note">Eventos do painel. O envio só ocorre para aparelhos ativados; o histórico não confirma leitura.</p><div id="push-history"></div></div></section>`;}
function supported(){return isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function status(message){const n=document.getElementById('push-status');if(n)n.textContent=message;}
export async function refreshNotifications(){
 const root=document.getElementById('notification-settings');if(!root)return;
 try{
 const [device,history]=await Promise.all([request('status'),request('history')]);if(!root.isConnected)return;
 const data=device.data,permission=supported()?Notification.permission:'unsupported';
 status(!supported()?'Este navegador não oferece notificações. No iPhone, abra pela Tela de Início.':permission==='denied'?'Notificações bloqueadas. Libere nas configurações do navegador ou do aparelho.':data?.active&&permission==='granted'?'Notificações ativadas neste aparelho.':'Notificações ainda não ativadas neste aparelho.');
 root.querySelector('#push-device-name').value=data?.name||'';
 root.querySelector('#push-categories').innerHTML=Object.entries(labels).map(([key,label])=>`<label><input type="checkbox" data-push-category="${key}" ${data?.categories?.[key]!==false?'checked':''}>${label}</label>`).join('');
 root.querySelector('#push-history').innerHTML=history.data.length?history.data.map(e=>`<a class="push-history-row" href="${h(e.url)}"><strong>${h(e.title)}</strong><span>${h(e.body)}</span><small>${h(new Date(e.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))}</small></a>`).join(''):'<p class="note">Os próximos alertas aparecerão aqui.</p>';
 }catch(error){status(error.message);}
}
function decodeKey(value){const data=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(data,c=>c.charCodeAt(0));}
export async function initializeNotifications(){
 if('serviceWorker' in navigator&&isSecureContext){try{await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});}catch{/* Private Vercel session may need renewal. Settings reports failures on activation. */}}
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-push]');if(!button)return;
 const feedback=document.getElementById('push-feedback');button.disabled=true;feedback.textContent='';
 try{
 const action=button.dataset.push;
 if(action==='activate'){
 if(!supported())throw new Error('Abra o painel por um navegador compatível. No iPhone, use Adicionar à Tela de Início.');
 if(!deviceId)throw new Error('Ative o armazenamento do navegador para identificar este aparelho.');
 const name=document.getElementById('push-device-name').value.trim();if(!name)throw new Error('Informe o nome deste aparelho.');
 // Permission is requested directly from the user's click (required on iOS).
 const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('A permissão para notificações não foi concedida.');
 const {data}=await request('key');if(!data.configured)throw new Error('O envio de notificações ainda não está configurado.');
 const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
 await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Não foi possível ativar o serviço. Atualize a sessão privada e tente novamente.')),12000))]);
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(data.publicKey)});
 await request('subscribe',{name,subscription:subscription.toJSON()});
 const categories=Object.fromEntries([...document.querySelectorAll('[data-push-category]')].map(n=>[n.dataset.pushCategory,n.checked]));
 await request('preferences',{categories});await request('test');feedback.textContent='Ativado. Uma notificação de teste foi enviada ao serviço do seu aparelho.';
 }else if(action==='disable'){
 await request('unsubscribe');if(supported()){const registration=await navigator.serviceWorker.getRegistration('/');await (await registration?.pushManager.getSubscription())?.unsubscribe();}feedback.textContent='Notificações desativadas neste aparelho.';
 }else if(action==='save'){
 await request('preferences',{categories:Object.fromEntries([...document.querySelectorAll('[data-push-category]')].map(n=>[n.dataset.pushCategory,n.checked]))});feedback.textContent='Preferências salvas para este aparelho.';
 }else if(action==='test'){
 const result=await request('test');if(result.result?.failed)throw new Error('O serviço do aparelho recusou o teste. Ative novamente as notificações.');feedback.textContent='Teste enviado. Confira as notificações do celular.';
 }
 await refreshNotifications();
 }catch(error){feedback.textContent=error.message;}finally{button.disabled=false;}
});
