import {timingSafeEqual} from 'node:crypto';
import {dispatchPush} from '../server/push.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 const secret=process.env.CRON_SECRET,provided=req.headers.authorization||'';
 const expected=Buffer.from(`Bearer ${secret||''}`),actual=Buffer.from(provided);
 if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'Não autorizado.'});
 if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
 try{return res.status(200).json(await dispatchPush({prepare:true}));}
 catch(error){console.error('JK scheduled push failed',{name:error.name});return res.status(503).json({error:'Falha no processamento de alertas.'});}
}
