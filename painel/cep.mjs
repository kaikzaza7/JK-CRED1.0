import {digits,escapeHTML as h} from './core.mjs';
const ADDRESS_FIELDS=['street','district','city','state'];
export const formatCEP=value=>digits(value).slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');
export function createCepAutofill({lookup,onAddressChange=()=>{}}){
 const states=new Map(),cache=new Map();let fieldSequence=0;
 function field(value=''){const id='cep-status-'+(++fieldSequence);return `<label class="cep-field">CEP<div class="cep-input-row"><input name="cep" type="text" value="${h(formatCEP(value))}" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="49000-000" data-mask="cep" aria-label="CEP" aria-describedby="${id}"><button type="button" class="btn ghost cep-search" data-action="cep-lookup" aria-label="Buscar endereço pelo CEP">Buscar</button></div><small id="${id}" class="cep-status" data-cep-status role="status" aria-live="polite">Digite o CEP para preencher o endereço.</small></label>`;}
 function stateFor(group){let state=states.get(group);if(!state){state={code:'',sequence:0,timer:null,promise:null,pending:false,lastAttempt:'',revisions:{},auto:{}};states.set(group,state);}return state;}
 function status(group,text,kind='info'){const node=group.querySelector('[data-cep-status]');if(node){node.textContent=text;node.dataset.kind=kind;}group.setAttribute('aria-busy',kind==='loading'?'true':'false');const button=group.querySelector('[data-action=cep-lookup]');if(button)button.disabled=kind==='loading';}
 function stop(state){clearTimeout(state.timer);state.timer=null;state.sequence++;state.controller?.abort();state.controller=null;state.pending=false;state.promise=null;}
 function run(group,state,force=false){
  clearTimeout(state.timer);state.timer=null;
  const input=group.querySelector('[name=cep]'),code=digits(input?.value||'');
  if(code.length!==8){status(group,'Complete os 8 dígitos do CEP.');return Promise.resolve(null);}
  if(state.pending&&state.code===code&&!force)return state.promise;
  stop(state);state.code=code;state.lastAttempt=code;state.pending=true;state.controller=new AbortController();
  const controller=state.controller,sequence=state.sequence,snapshot={},revisions={...state.revisions};
  for(const name of ADDRESS_FIELDS)snapshot[name]=group.querySelector(`[name=${name}]`)?.value||'';
  status(group,'Buscando endereço…','loading');let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},8000);
  state.promise=(async()=>{
   try{
    const address=await (cache.get(code)||lookup(code,controller.signal));
    if(!group.isConnected||state.sequence!==sequence||digits(input.value)!==code)return null;
    if(!address||address.cep!==code)throw new Error('Não foi possível consultar o CEP. Preencha o endereço manualmente.');
    cache.set(code,address);if(cache.size>64)cache.delete(cache.keys().next().value);
    let preserved=false;
    for(const name of ADDRESS_FIELDS){
     const node=group.querySelector(`[name=${name}]`);if(!node)continue;
     if(node.value!==snapshot[name]||(state.revisions[name]||0)!==(revisions[name]||0)){preserved=true;continue;}
     const value=typeof address[name]==='string'?address[name]:'';
     // Missing street/neighborhood on a general city CEP must not erase a
     // manually entered address. Replace only an older automatic value.
     if(!value&&node.value&&node.value!==state.auto[name])continue;
     node.value=value;state.auto[name]=value;
    }
    const partial=!address.street||!address.district;
    status(group,preserved?'Consulta concluída. Mantivemos suas alterações manuais. Confira o endereço.':partial?'Cidade e UF preenchidos. Complete os dados do endereço e o número.':'Endereço preenchido. Informe o número e o complemento, se houver.','success');
    onAddressChange(group,address);return address;
   }catch(error){
    if(group.isConnected&&state.sequence===sequence&&digits(input.value)===code)status(group,timedOut?'A consulta demorou. Preencha o endereço manualmente ou clique em Buscar para tentar novamente.':error.message||'Não foi possível consultar o CEP. Preencha o endereço manualmente.','error');
    return null;
   }finally{clearTimeout(timeout);if(state.sequence===sequence){state.pending=false;state.promise=null;state.controller=null;group.setAttribute('aria-busy','false');const button=group.querySelector('[data-action=cep-lookup]');if(button)button.disabled=false;}}
  })();
  return state.promise;
 }
 function input(target){const group=target.closest('[data-address-fields]');if(!group)return false;const state=stateFor(group);
  if(ADDRESS_FIELDS.includes(target.name)){state.revisions[target.name]=(state.revisions[target.name]||0)+1;return false;}
  if(target.name!=='cep')return false;
  target.value=formatCEP(target.value);const code=digits(target.value);
  if(code===state.code&&(state.timer||state.pending||state.lastAttempt===code))return true;
  stop(state);state.code=code;state.lastAttempt='';
  if(code.length!==8){status(group,code?'Complete os 8 dígitos do CEP.':'Digite o CEP para preencher o endereço.');return true;}
  status(group,'Buscando endereço…','loading');state.timer=setTimeout(()=>run(group,state),300);return true;
 }
 async function search(button){const group=button.closest('[data-address-fields]');if(group)await run(group,stateFor(group),true);}
 async function complete(form){while(form.isConnected){const pending=[];for(const group of form.querySelectorAll('[data-address-fields]')){const state=states.get(group);if(state?.timer)pending.push(run(group,state));else if(state?.pending&&state.promise)pending.push(state.promise);}if(!pending.length)return;await Promise.all(pending);}}
 function cancel(){for(const state of states.values())stop(state);states.clear();}
 return {field,input,search,complete,cancel};
}
