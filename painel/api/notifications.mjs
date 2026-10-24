import {browserActions,validateSubscription,pushRPC,pushConfigured,dispatchPush} from '../server/push.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
 const origin=req.headers.origin;
 if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==req.headers.host))return res.status(403).json({error:'Origem não permitida.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'Envie JSON.'});
 try{
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
 if(!body||!browserActions.has(body.action)||JSON.stringify(body).length>12000)return res.status(400).json({error:'Operação inválida.'});
 if(body.action==='key')return res.status(200).json({data:{publicKey:process.env.JK_VAPID_PUBLIC_KEY||null,configured:pushConfigured()}});
 const args=body.args||{};
 if(body.action==='subscribe')args.subscription=validateSubscription(args.subscription);
 const data=await pushRPC(body.action,args);
 if(body.action==='test'){
  const result=await dispatchPush();return res.status(200).json({data,result});
 }
 return res.status(200).json({data});
 }catch(error){console.error('JK notification operation failed',{name:error.name});return res.status(400).json({error:error.message||'Não foi possível atualizar as notificações.'});}
}
