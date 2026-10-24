const actions=new Set(['load_table','jk_save_client','jk_create_adhesion','jk_record_payment','jk_reverse_payment','jk_change_loan','jk_save_preferences','jk_society_configure','jk_society_adjust_split','jk_society_record_payout','jk_society_reverse_payout']);
// Every deployment, alias and API route is protected by Vercel Authentication.
// Deployment Protection must stay enabled for ALL deployments, including production.
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
 // Reject cross-site requests; Vercel's session cookie is the only browser credential.
 const host=req.headers.host,origin=req.headers.origin;
 if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==host))return res.status(403).json({error:'Origem não permitida.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'Envie JSON.'});
 const token=process.env.JK_GATEWAY_TOKEN,url=process.env.JK_SUPABASE_URL,key=process.env.JK_SUPABASE_KEY;
 if(!token||!url||!key)return res.status(503).json({error:'Conexão privada indisponível neste ambiente.'});
 let body=req.body;
 try{if(typeof body==='string')body=JSON.parse(body);if(!body||!actions.has(body.action)||!body.args||typeof body.args!=='object'||Array.isArray(body.args))return res.status(400).json({error:'Operação inválida.'});
 if(JSON.stringify(body).length>150000)return res.status(413).json({error:'Solicitação muito grande.'});
 const upstream=await fetch(url+'/rest/v1/rpc/jk_gateway',{method:'POST',headers:{'Content-Type':'application/json',apikey:key},body:JSON.stringify({p_token:token,p_action:body.action,p_args:body.args}),signal:AbortSignal.timeout(25000)});
 const data=await upstream.json();
 if(!upstream.ok){const error=data.message||'Não foi possível concluir a operação.';console.error('JK gateway operation failed',{action:body.action,status:upstream.status,code:data.code});return res.status(upstream.status===403?403:400).json({error});}
 return res.status(200).json({data});
 }catch(error){console.error('JK gateway request failed',{name:error.name});return res.status(502).json({error:'A conexão com o banco falhou. Tente novamente.'});}
}
