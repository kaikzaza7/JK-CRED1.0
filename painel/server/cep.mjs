const UFS=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
export async function lookupCEP(value,fetcher=globalThis.fetch){
 if(typeof value!=='string'||!/^\d{5}-?\d{3}$/.test(value.trim()))return {status:400,error:'Informe um CEP com 8 dígitos.'};
 const cep=value.replace(/\D/g,'');
 try{
  // Only the CEP leaves the server. No customer information or gateway
  // credentials are forwarded to this fixed, public lookup endpoint.
  const response=await fetcher(`https://viacep.com.br/ws/${cep}/json/`,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(6000)});
  if(response.status===404)return {status:404,error:'CEP não encontrado. Confira o número ou preencha o endereço manualmente.'};
  if(!response.ok)throw new Error('CEP provider unavailable');
  const data=await response.json();
  if(data?.erro===true||data?.erro==='true')return {status:404,error:'CEP não encontrado. Confira o número ou preencha o endereço manualmente.'};
  const address={cep,street:clean(data?.logradouro,200),district:clean(data?.bairro,100),city:clean(data?.localidade,100),state:clean(data?.uf,2).toUpperCase()};
  if(String(data?.cep||'').replace(/\D/g,'')!==cep||!address.city||!UFS.has(address.state))throw new Error('Invalid CEP provider response');
  return {status:200,data:address};
 }catch{return {status:503,error:'Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente ou tentar novamente.'};}
}
