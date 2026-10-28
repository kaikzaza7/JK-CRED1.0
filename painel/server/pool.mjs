import {newMatch,playShot} from '../pool/engine.mjs';
export const POOL_ACTIONS=new Set(['snapshot','enter','leave','reset','shoot']);
export async function poolRPC(action,args={}){
 const {JK_SUPABASE_URL:url,JK_SUPABASE_KEY:key,JK_GATEWAY_TOKEN:token}=process.env;
 if(!url||!key||!token)throw new Error('A mesa está indisponível neste ambiente.');
 const response=await fetch(url+'/rest/v1/rpc/jk_pool_gateway',{method:'POST',headers:{'Content-Type':'application/json',apikey:key},body:JSON.stringify({p_token:token,p_action:action,p_args:args}),signal:AbortSignal.timeout(12000)});
 const data=await response.json();if(!response.ok){const error=new Error(data.message||'Não foi possível atualizar a mesa.');error.code=data.code;throw error;}return data;
}
export function validatePoolRequest(body){
 if(!body||!POOL_ACTIONS.has(body.action)||!body.args||typeof body.args!=='object'||Array.isArray(body.args))throw new Error('Operação inválida.');
 const a=body.args;
 if(a.player_token!==undefined&&!/^[a-f0-9]{64}$/.test(a.player_token))throw new Error('Identificação do jogador inválida.');
 if(body.action!=='snapshot'&&!a.player_token)throw new Error('Entre na mesa para jogar.');
 if(body.action==='enter'&&![1,2].includes(a.partner_id))throw new Error('Escolha Juan Kelvin ou Kaik Andrade.');
 if(body.action==='shoot'&&(!Number.isSafeInteger(a.version)||a.version<1||!Number.isFinite(a.angle)||Math.abs(a.angle)>Math.PI*2||!Number.isFinite(a.power)||a.power<.05||a.power>1||!/^[-a-f0-9]{36}$/.test(a.move_id||'')))throw new Error('Confira a direção e a força da tacada.');
}
export async function performPoolAction(body,rpc=poolRPC){
 validatePoolRequest(body);const a=body.args;
 const credentials={player_token:a.player_token};
 if(body.action==='snapshot')return rpc('snapshot',credentials);
 if(body.action==='enter')return rpc('enter',{...credentials,partner_id:a.partner_id,initial:newMatch()});
 if(body.action==='leave')return rpc('leave',credentials);
 if(body.action==='reset')return rpc('reset',{...credentials,initial:newMatch()});
 const room=await rpc('snapshot',credentials);
 if(room.shot?.move_id===a.move_id&&room.shot?.player===room.viewer_id)return room;
 if(!room.viewer_id)throw new Error('Entre na mesa para jogar.');
 if(room.version!==a.version)throw new Error('A mesa foi atualizada. Confira a sua vez e tente novamente.');
 if(room.players.filter(p=>p.online).length<2)throw new Error('Aguarde o outro sócio entrar na mesa.');
 if(Date.parse(room.busy_until)>Date.parse(room.server_now))throw new Error('Aguarde as bolas pararem.');
 const result=playShot(room.game,room.viewer_id,a.angle,a.power);
 return rpc('commit',{...credentials,version:room.version,result:result.state,shot:{move_id:a.move_id,player:room.viewer_id,from:room.game.balls,angle:a.angle,power:a.power,duration:result.duration,pocketed:result.pocketed,scratch:result.scratch}});
}
