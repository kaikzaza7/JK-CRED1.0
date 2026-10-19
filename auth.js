/* JK CRED — auth.js: cadastro, login, recuperação e sessão (Supabase). Carregado depois do app. */
(() => {
const C = window.JK_CONFIG || {};
const TERMS = 'rascunho-1'; // troque pela versão real quando os documentos oficiais existirem
const $ = (s, r = document) => r.querySelector(s);
const d = v => String(v || '').replace(/\D/g, '');
const S = { user: null, profile: null, admin: false, msg: null };

if (!window.supabase || !C.SUPABASE_URL) {
  document.getElementById('app').textContent = 'Configuração do Supabase ausente (config.js).';
  return;
}
// Sessão só em sessionStorage (some ao fechar a aba). Nenhum dado pessoal é guardado no navegador.
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

Object.assign(P, {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 004.2 4.2"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
});

/* ---------- máscaras e validações ---------- */
const mask = {
  cpf: v => d(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
  tel: v => { v = d(v).slice(0, 11); return v.length > 10 ? v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : v.length > 6 ? v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3') : v.length > 2 ? v.replace(/(\d{2})(\d+)/, '($1) $2') : v; },
  cep: v => d(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'),
  brl: v => { const n = d(v).slice(0, 11); return n ? (Number(n) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; },
};
const okCpf = c => {
  c = d(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); if ((s * 10) % 11 % 10 !== +c[n]) return false; }
  return true;
};
const okTel = t => /^[1-9][1-9](9\d{8}|[2-9]\d{7})$/.test(d(t));
const okMail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const okPass = p => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/* ---------- componentes ---------- */
const UF = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const BRANDS = [['visa', 'Visa'], ['mastercard', 'Mastercard'], ['elo', 'Elo'], ['amex', 'American Express'], ['hipercard', 'Hipercard'], ['diners', 'Diners Club'], ['outra', 'Outra'], ['nao_informado', 'Não informado']];
const F = ({ id, label, ico, type = 'text', ph = '', msg = '', req = true, mode, ac }) =>
  `<div class="field" data-field="${id}"><label for="${id}">${label}${req ? ' <span class="rq" aria-hidden="true">*</span>' : ''}</label>
  <div class="wrap">${ico ? icon(ico) : ''}<input id="${id}" name="${id}" type="${type}" placeholder="${ph}"${type === 'password' ? ' class="pw"' : ''}${mode ? ` inputmode="${mode}"` : ''}${ac ? ` autocomplete="${ac}"` : ''}${req ? ' required' : ''}${ico ? '' : ' style="padding-left:1rem"'}>
  ${type === 'password' ? `<button type="button" class="eye" data-eye="${id}" aria-label="Mostrar ou ocultar senha">${icon('eye')}</button>` : ''}</div><div class="msg" role="alert">${msg}</div></div>`;
const Sel = ({ id, label, opts, msg }) =>
  `<div class="field" data-field="${id}"><label for="${id}">${label} <span class="rq" aria-hidden="true">*</span></label><select id="${id}" name="${id}" required><option value="">Selecione</option>${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select><div class="msg" role="alert">${msg}</div></div>`;
const Shell = (title, sub, body, wide) =>
  `<div class="auth"><aside class="side">${Logo()}<div><h2>${title}</h2><p>${sub}</p></div><small style="color:#8FA6D4">Ambiente de testes</small></aside>
  <main class="form"><div class="box${wide ? ' wide' : ''}">${body}</div></main></div>`;
const submit = t => `<button class="btn btn-primary btn-block" type="submit">${t}</button>`;
const NOTICE = '<div class="notice" id="notice" role="status"></div>';

const views = {
  login: () => Shell('Seu crédito, sempre à vista.', 'Entre para acompanhar parcelas, vencimentos e solicitações.', `
    <a class="back" href="#/">${icon('back')} Voltar ao início</a>
    <h1>Entrar na sua conta</h1><p class="muted" style="margin-bottom:1.6rem">Use o telefone cadastrado e sua senha.</p>${NOTICE}
    <form id="f-login" novalidate>
      ${F({ id: 'tel', label: 'Telefone com DDD', ico: 'phone', type: 'tel', mode: 'tel', ac: 'username', ph: '(79) 99999-9999', msg: 'Informe um telefone válido com DDD.' })}
      ${F({ id: 'senha', label: 'Senha', ico: 'lock', type: 'password', ac: 'current-password', ph: 'Sua senha', msg: 'Digite sua senha.' })}
      ${submit('Entrar')}
    </form>
    <p class="alt"><a href="#/cliente/recuperar">Esqueci minha senha</a></p>
    <p class="alt">Ainda não tem conta? <a href="#/cliente/cadastro">Criar conta</a></p>`),
  admin: () => Shell('Gestão completa da carteira de crédito.', 'Acesso restrito à equipe da JK CRED.', `
    <a class="back" href="#/">${icon('back')} Voltar ao início</a>
    <h1>Acesso administrativo</h1><p class="muted" style="margin-bottom:1.6rem">Use as credenciais da equipe.</p>${NOTICE}
    <form id="f-admin" novalidate>
      ${F({ id: 'email', label: 'E-mail', ico: 'mail', type: 'email', ac: 'username', ph: 'equipe@exemplo.com', msg: 'Informe um e-mail válido.' })}
      ${F({ id: 'senha', label: 'Senha', ico: 'lock', type: 'password', ac: 'current-password', ph: 'Sua senha', msg: 'Digite sua senha.' })}
      ${submit('Entrar')}
    </form>`),
  recuperar: () => Shell('Recupere seu acesso.', 'Enviaremos um link para o e-mail cadastrado.', `
    <a class="back" href="#/cliente/login">${icon('back')} Voltar ao login</a>
    <h1>Esqueci minha senha</h1><p class="muted" style="margin-bottom:1.6rem">Informe o telefone da sua conta.</p>${NOTICE}
    <form id="f-recuperar" novalidate>
      ${F({ id: 'tel', label: 'Telefone com DDD', ico: 'phone', type: 'tel', mode: 'tel', ph: '(79) 99999-9999', msg: 'Informe um telefone válido com DDD.' })}
      ${submit('Enviar link')}
    </form>`),
  redefinir: () => Shell('Crie uma nova senha.', 'Escolha uma senha que só você conheça.', `
    <h1>Nova senha</h1><p class="muted" style="margin-bottom:1.6rem">Use 8 ou mais caracteres, com letras e números.</p>${NOTICE}
    <form id="f-redefinir" novalidate>
      ${F({ id: 'senha', label: 'Nova senha', ico: 'lock', type: 'password', ac: 'new-password', msg: 'Use 8+ caracteres com letras e números.' })}
      ${F({ id: 'senha2', label: 'Confirmar nova senha', ico: 'lock', type: 'password', ac: 'new-password', msg: 'As senhas não conferem.' })}
      ${submit('Salvar nova senha')}
    </form>`),
  cadastro: () => Shell('Crie sua conta na JK CRED', 'Leva poucos minutos. Nunca pedimos número do cartão, CVV ou senhas bancárias.', `
    <a class="back" href="#/cliente/login">${icon('back')} Já tenho conta</a>
    <h1>Criar conta</h1><p class="muted" style="margin-bottom:1rem">Campos com <span class="rq">*</span> são obrigatórios.</p>${NOTICE}
    <form id="f-cadastro" novalidate>
      <h2 class="sect first">Seus dados</h2>
      ${F({ id: 'nome', label: 'Nome completo', ico: 'users', ac: 'name', ph: 'Maria da Silva', msg: 'Informe nome e sobrenome.' })}
      <div class="row2">
        ${F({ id: 'cpf', label: 'CPF', ico: 'doc', mode: 'numeric', ph: '000.000.000-00', msg: 'CPF inválido.' })}
        ${F({ id: 'tel', label: 'Telefone com DDD', ico: 'phone', type: 'tel', mode: 'tel', ac: 'tel-national', ph: '(79) 99999-9999', msg: 'Informe um telefone válido com DDD.' })}
      </div>
      ${F({ id: 'email', label: 'E-mail', ico: 'mail', type: 'email', ac: 'email', ph: 'voce@exemplo.com', msg: 'Informe um e-mail válido.' })}
      <div class="row2">
        ${F({ id: 'senha', label: 'Senha', ico: 'lock', type: 'password', ac: 'new-password', ph: 'Mínimo 8 caracteres', msg: 'Use 8+ caracteres com letras e números.' })}
        ${F({ id: 'senha2', label: 'Confirmar senha', ico: 'lock', type: 'password', ac: 'new-password', ph: 'Repita a senha', msg: 'As senhas não conferem.' })}
      </div>
      <h2 class="sect">Endereço</h2>
      ${F({ id: 'cep', label: 'CEP', ico: 'pin', mode: 'numeric', ac: 'postal-code', ph: '00000-000', msg: 'Informe um CEP válido.' })}
      <div class="hint" id="cep-hint">Digite o CEP para preencher o endereço automaticamente.</div>
      ${F({ id: 'rua', label: 'Rua', ico: 'pin', ac: 'address-line1', msg: 'Informe a rua.' })}
      <div class="row2">${F({ id: 'numero', label: 'Número', msg: 'Informe o número.' })}${F({ id: 'comp', label: 'Complemento', req: false })}</div>
      ${F({ id: 'bairro', label: 'Bairro', msg: 'Informe o bairro.' })}
      <div class="row2">${F({ id: 'cidade', label: 'Cidade', msg: 'Informe a cidade.' })}${Sel({ id: 'uf', label: 'Estado', opts: UF.map(u => [u, u]), msg: 'Selecione o estado.' })}</div>
      <h2 class="sect">Cartão de crédito</h2>
      <div class="row2">${F({ id: 'limite', label: 'Limite aproximado (R$)', mode: 'numeric', ph: '0,00', msg: 'Informe o limite aproximado.' })}${Sel({ id: 'bandeira', label: 'Bandeira', opts: BRANDS, msg: 'Selecione a bandeira.' })}</div>
      <div class="field" data-field="aceite"><label class="chk"><input type="checkbox" id="aceite" name="aceite"><span>Li e aceito os Termos de uso e a Política de privacidade (documentos em elaboração).</span></label><div class="msg" role="alert">Aceite para continuar.</div></div>
      ${submit('Criar conta')}
    </form>
    <p class="alt">Já tem conta? <a href="#/cliente/login">Entrar</a></p>`, true),
};

/* ---------- utilitários de formulário ---------- */
const fe = (f, id, bad, text) => { const el = f.querySelector(`[data-field="${id}"]`); el.classList.toggle('err', !!bad); if (bad && text) el.querySelector('.msg').textContent = text; return !!bad; };
const note = (t, k = 'err') => { const n = $('#notice'); if (!n) return; n.className = 'notice show ' + k; n.textContent = t; n.scrollIntoView({ block: 'nearest' }); };
const busy = (b, on, label) => { b.dataset.l = b.dataset.l || b.textContent; b.disabled = on; b.innerHTML = on ? `<span class="spin"></span>${label}` : b.dataset.l; };
const errMsg = async e => { try { const j = await e.context.json(); if (j.error) return j.error; } catch { /* sem corpo */ } return 'Não foi possível conectar. Verifique sua internet e tente novamente.'; };

/* ---------- sessão ---------- */
async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null; S.profile = null; S.admin = false;
  if (!S.user) return;
  const [{ data: p }, { data: a }] = await Promise.all([
    sb.from('profiles').select('full_name,status').eq('id', S.user.id).maybeSingle(),
    sb.rpc('is_admin'),
  ]);
  S.profile = p || null; S.admin = a === true;
  if (p && p.status !== 'ativo') { await sb.auth.signOut(); S.user = null; S.profile = null; S.msg = { t: 'Esta conta não está ativa. Fale com a JK CRED.', k: 'err' }; }
}
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { S.user = null; S.profile = null; S.admin = false; if (JKAuth.ready) render(); } });

/* ---------- ações ---------- */
async function onLogin(e) {
  e.preventDefault(); const f = e.target, b = $('button[type=submit]', f);
  if ([fe(f, 'tel', !okTel(f.tel.value)), fe(f, 'senha', !f.senha.value)].some(Boolean)) return;
  busy(b, true, 'Entrando…');
  const { data, error } = await sb.functions.invoke('acesso-cliente', { body: { action: 'login', phone: d(f.tel.value), password: f.senha.value } });
  if (error || !data?.session) { busy(b, false); return note(await errMsg(error)); }
  await sb.auth.setSession(data.session); await loadSession();
  if (!S.profile) { await sb.auth.signOut(); busy(b, false); return note('Telefone ou senha incorretos.'); }
  location.hash = '#/cliente';
}
async function onAdmin(e) {
  e.preventDefault(); const f = e.target, b = $('button[type=submit]', f);
  if ([fe(f, 'email', !okMail(f.email.value.trim())), fe(f, 'senha', !f.senha.value)].some(Boolean)) return;
  busy(b, true, 'Entrando…');
  const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value });
  if (!error) await loadSession();
  if (error || !S.admin) { if (!error) await sb.auth.signOut(); busy(b, false); return note('E-mail ou senha incorretos.'); }
  location.hash = '#/admin';
}
async function onRecover(e) {
  e.preventDefault(); const f = e.target, b = $('button[type=submit]', f);
  if (fe(f, 'tel', !okTel(f.tel.value))) return;
  busy(b, true, 'Enviando…');
  const { data, error } = await sb.functions.invoke('acesso-cliente', { body: { action: 'recuperar', phone: d(f.tel.value) } });
  busy(b, false);
  if (error) return note(await errMsg(error));
  note(data?.message || 'Se houver uma conta com esse telefone, enviamos um link para o e-mail cadastrado.', 'ok');
}
async function onReset(e) {
  e.preventDefault(); const f = e.target, b = $('button[type=submit]', f);
  if ([fe(f, 'senha', !okPass(f.senha.value)), fe(f, 'senha2', f.senha.value !== f.senha2.value)].some(Boolean)) return;
  busy(b, true, 'Salvando…');
  const { error } = await sb.auth.updateUser({ password: f.senha.value });
  if (error) { busy(b, false); return note('Não foi possível alterar a senha. Peça um novo link e tente de novo.'); }
  await sb.auth.signOut(); S.msg = { t: 'Senha alterada. Entre com a nova senha.', k: 'ok' }; location.hash = '#/cliente/login';
}
async function onSignup(e) {
  e.preventDefault(); const f = e.target, b = $('button[type=submit]', f);
  const limite = Number(d(f.limite.value)) / 100;
  const bad = [
    fe(f, 'nome', f.nome.value.trim().split(/\s+/).length < 2 || f.nome.value.trim().length < 5),
    fe(f, 'cpf', !okCpf(f.cpf.value)), fe(f, 'tel', !okTel(f.tel.value)), fe(f, 'email', !okMail(f.email.value.trim())),
    fe(f, 'senha', !okPass(f.senha.value)), fe(f, 'senha2', f.senha.value !== f.senha2.value),
    fe(f, 'cep', d(f.cep.value).length !== 8), fe(f, 'rua', !f.rua.value.trim()), fe(f, 'numero', !f.numero.value.trim()),
    fe(f, 'bairro', !f.bairro.value.trim()), fe(f, 'cidade', !f.cidade.value.trim()), fe(f, 'uf', !f.uf.value),
    fe(f, 'limite', !d(f.limite.value)), fe(f, 'bandeira', !f.bandeira.value), fe(f, 'aceite', !f.aceite.checked),
  ].some(Boolean);
  if (bad) return note('Revise os campos destacados.');
  busy(b, true, 'Criando conta…');
  const email = f.email.value.trim().toLowerCase();
  const { data, error } = await sb.auth.signUp({ email, password: f.senha.value, options: { data: {
    signup_type: 'cliente', full_name: f.nome.value.trim(), cpf: d(f.cpf.value), phone: d(f.tel.value), cep: d(f.cep.value),
    street: f.rua.value.trim(), number: f.numero.value.trim(), complement: f.comp.value.trim(), district: f.bairro.value.trim(),
    city: f.cidade.value.trim(), state: f.uf.value, card_limit: limite, card_brand: f.bandeira.value,
    terms_version: TERMS, privacy_version: TERMS } } });
  busy(b, false);
  if (error) return note(error.status === 429 ? 'Muitas solicitações. Aguarde alguns minutos e tente de novo.' : 'Não foi possível concluir o cadastro. Confira os dados. Se você já tem conta, entre ou recupere a senha.');
  if (data.session) { await loadSession(); location.hash = '#/cliente'; return; }
  f.hidden = true;
  note(`Cadastro recebido! Enviamos um link de confirmação para ${email}. Confirme o e-mail para poder entrar.`, 'ok');
}
async function cepLookup() {
  const c = d($('#cep').value), h = $('#cep-hint'); if (c.length !== 8) return;
  h.textContent = 'Buscando endereço…';
  try {
    const j = await (await fetch(`https://viacep.com.br/ws/${c}/json/`)).json(); if (j.erro) throw 0;
    [['rua', j.logradouro], ['bairro', j.bairro], ['cidade', j.localidade], ['uf', j.uf]].forEach(([id, v]) => { if (v) $('#' + id).value = v; });
    h.textContent = 'Endereço preenchido. Confira e corrija se precisar.'; $('#numero').focus();
  } catch { h.textContent = 'CEP não encontrado. Preencha o endereço manualmente.'; }
}

/* ---------- integração com o app ---------- */
const PUBLIC = ['#/cliente/login', '#/cliente/cadastro', '#/cliente/recuperar'];
function redirectFor(h) {
  const p = h.split('?')[0];
  if (p.startsWith('#/cliente') && !PUBLIC.includes(p) && !(S.user && S.profile)) return '#/cliente/login';
  if (p.startsWith('#/admin') && p !== '#/admin/login' && !(S.user && S.admin)) return '#/admin/login';
  if (p === '#/redefinir-senha' && !S.user) return '#/cliente/recuperar';
  if (PUBLIC.slice(0, 2).includes(p) && S.user && S.profile) return '#/cliente';
  if (p === '#/admin/login' && S.user && S.admin) return '#/admin';
  return null;
}
function bind(path) {
  document.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => {
    const i = $('#' + b.dataset.eye), show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.innerHTML = icon(show ? 'eyeoff' : 'eye');
  });
  [['#cpf', 'cpf'], ['#tel', 'tel'], ['#cep', 'cep'], ['#limite', 'brl']].forEach(([s, m]) => { const i = $(s); if (i) i.addEventListener('input', () => { i.value = mask[m](i.value); }); });
  const on = (id, fn) => { const f = document.getElementById(id); if (f) f.onsubmit = fn; };
  on('f-login', onLogin); on('f-admin', onAdmin); on('f-recuperar', onRecover); on('f-redefinir', onReset); on('f-cadastro', onSignup);
  const cep = $('#cep'); if (cep) cep.addEventListener('input', cepLookup);
  if (S.msg && $('#notice')) { note(S.msg.t, S.msg.k); S.msg = null; }
  if (path === '#/cliente' && S.profile) { const h = $('.page h1'); if (h) h.textContent = 'Olá, ' + S.profile.full_name.split(' ')[0]; }
}
window.JKAuth = { ready: false, redirectFor, bind, async logout() { await sb.auth.signOut(); S.user = null; S.profile = null; S.admin = false; location.hash = '#/'; } };
Object.assign(routes, { '#/cliente/login': views.login, '#/admin/login': views.admin, '#/cliente/cadastro': views.cadastro, '#/cliente/recuperar': views.recuperar, '#/redefinir-senha': views.redefinir });

(async function init() {
  // Links dos e-mails do Supabase chegam com os tokens (ou um erro) no fragmento da URL.
  if (/access_token=|error_description=/.test(location.hash)) {
    const p = new URLSearchParams(location.hash.slice(1));
    let target = '#/cliente/login';
    if (p.get('access_token')) {
      const { error } = await sb.auth.setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') });
      if (!error) target = p.get('type') === 'recovery' ? '#/redefinir-senha' : '#/cliente';
    }
    if (target === '#/cliente/login') S.msg = { t: 'Link inválido ou expirado. Peça um novo.', k: 'err' };
    history.replaceState(null, '', location.pathname + location.search + target);
  }
  await loadSession();
  JKAuth.ready = true; render();
})();
})();
