import {performPoolAction} from '../server/pool.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
 try{
  const origin=req.headers.origin;
  if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==req.headers.host))return res.status(403).json({error:'Origem não permitida.'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'Envie JSON.'});
  if(typeof req.body==='string'&&req.body.length>4000)return res.status(413).json({error:'Solicitação muito grande.'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(JSON.stringify(body||{}).length>4000)return res.status(413).json({error:'Solicitação muito grande.'});
  return res.status(200).json({data:await performPoolAction(body)});
 }catch(error){
  if(error.name==='TimeoutError'||error.name==='TypeError')return res.status(503).json({error:'A conexão com a mesa falhou. Tentaremos reconectar.'});
  console.error('JK pool operation rejected',{code:error.code||error.name});
  return res.status(error.code==='42501'?403:400).json({error:error.message||'Não foi possível concluir a jogada.'});
 }
}
