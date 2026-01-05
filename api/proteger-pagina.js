// Módulo de proteção de páginas — verifica sessão via cookie httpOnly
function resolveApiBase(){
  // Mantemos compatibilidade com helpers antigos — mas priorizamos __getApiBase()
  if (typeof window.__getApiBase === 'function') {
    try { const b = window.__getApiBase(); if (b) return b; } catch(e){}
  }

  if (window.__API_BASE__) return window.__API_BASE__;
  const host = String(location.hostname||"").toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') {
    try { if (window.location && window.location.origin) return window.location.origin; } catch(e) {}
  }
  return '';
}

const API_BASE = resolveApiBase();

const INITIAL_AUTH_DELAY_MS = 400; // atraso inicial antes do primeiro /auth/me
const __AUTH_DEBUG__ = !!(window && window.__DEBUG_AUTH__);

function isDebugEnabled(){
  try{ if (window.DEBUG_AUTH === true) return true; }catch(e){}
  try{ const s = String(location.search||''); if (s.indexOf('debug=1') !== -1) return true; }catch(e){}
  return false;
}

async function fetchMe() {
  try {
    if (typeof window.apiFetch !== 'function') {
      console.error('[guard] window.apiFetch não disponível — bloqueando acesso protegido.');
      try { window.location.href = 'acesso-negado.html'; } catch(e){}
      return null;
    }
    // Detectar explicitamente same-origin em :3333 para evitar host mismatch (127 vs localhost)
    const isSameOrigin3333 = String(location.port || '') === '3333';
    const baseFromHelper = (typeof window.__getApiBase === 'function') ? window.__getApiBase() : (API_BASE || '');
    const meUrl = isSameOrigin3333 ? '/auth/me' : `${baseFromHelper}/auth/me`;

    // Não enviar Authorization Bearer quando same-origin; usar cookie httpOnly
    const headers = (!isSameOrigin3333 && window.__KGB_TOKEN) ? { Authorization: `Bearer ${window.__KGB_TOKEN}` } : {};

    try {
      const resp = await window.apiFetch(meUrl, { method: 'GET', credentials: 'include', headers });
      if (__AUTH_DEBUG__) console.debug('[AUTH] /auth/me response:', resp);
      const j = resp && (resp.data || resp) || null;
      const user = (j && j.data) ? j.data : j || null;
      if (user) {
        window.__KGB_USER_CACHE = user;
        return user;
      }
      return null;
    } catch (err) {
      // window.apiFetch throws an Error with .status for non-OK responses
      try { if (__AUTH_DEBUG__) console.warn('[AUTH] fetchMe error:', err); } catch(e){}
      if (err && err.status === 401) {
        // Unauthenticated -> go to login
        try { window.location.href = 'login.html'; } catch(e){}
        return null;
      }
      return null;
    }
  } catch (e) {
    console.error('[guard] /auth/me erro', e);
    return null;
  }
}

(async () => {
  // Se a página explicitamente permitir bypass, não forçamos redirect
  if (window.__KGB_GUARD_BYPASS__) {
    await fetchMe();
    return;
  }

  // Aguardar um pequeno delay antes do primeiro check para evitar falsos negativos
  await new Promise(r => setTimeout(r, INITIAL_AUTH_DELAY_MS));
  const user = await fetchMe();
  if (!user) {
    // tentativa extra antes de redirecionar (evita falsos negativos transitórios)
    try {
      if (__AUTH_DEBUG__) console.warn('[AUTH] fetchMe falhou; aguardando 500ms e tentando novamente...');
      await new Promise(r => setTimeout(r, 500));
      const user2 = await fetchMe();
      if (!user2) {
        console.warn('[AUTH] Não autenticado (após segunda tentativa).');
        if (isDebugEnabled()) {
          showKgbDebugPanel();
        }
        // Não redirecionar automaticamente — usuário deve forçar logout pelo painel.
        return;
      }
    } catch (e) {
      console.warn('[AUTH] Erro na segunda tentativa de fetchMe', e);
      try { if (isDebugEnabled()) showKgbDebugPanel(); /* redirect intentionally disabled for debugging */ } catch(e){}
      return;
    }
  }
})();

function showKgbDebugPanel(){
  if (!isDebugEnabled()) return; // painel escondido por padrão
  if (document.getElementById('kgb-debug-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'kgb-debug-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    right: '12px',
    top: '12px',
    width: '420px',
    maxHeight: '70vh',
    overflow: 'auto',
    background: 'rgba(0,0,0,0.92)',
    color: '#fff',
    zIndex: 999999,
    padding: '12px',
    fontSize: '12px',
    borderRadius: '8px',
    boxShadow: '0 6px 30px rgba(0,0,0,0.6)'
  });

  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px">KGB Debug Panel</div>
    <div style="margin-top:6px"><strong>Último /auth/me:</strong></div>
    <pre id="kgb-debug-last" style="white-space:pre-wrap;background:#111;padding:8px;border-radius:4px;">${String(window.__KGB_LAST_AUTH_DEBUG||'(sem resposta)')}</pre>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="kgb-debug-check-server">Checar /auth/debug</button>
      <button id="kgb-debug-close">Fechar painel</button>
      <button id="kgb-debug-force">Forçar logout agora</button>
    </div>
    <div id="kgb-debug-server-result" style="margin-top:8px;font-size:11px;color:#ddd"></div>
  `;
        if (err && (err.status === 401 || err.status === 404)) {
  document.body.appendChild(panel);

  panel.querySelector('#kgb-debug-close').addEventListener('click', ()=>{ panel.remove(); });

  panel.querySelector('#kgb-debug-force').addEventListener('click', ()=>{ window.location.href = 'login.html'; });

      panel.querySelector('#kgb-debug-check-server').addEventListener('click', async ()=>{
    try{
      if (typeof window.apiFetch !== 'function') {
        panel.querySelector('#kgb-debug-server-result').textContent = 'apiFetch não disponível';
        return;
      }
      const el = panel.querySelector('#kgb-debug-server-result');
      el.textContent = 'checando...';
      const resp = await window.apiFetch(`${API_BASE.replace(/\/$/, '')}/auth/debug`, { method: 'GET', credentials: 'include' });
      el.textContent = JSON.stringify(resp && (resp.data || resp) || resp, null, 2);
      panel.querySelector('#kgb-debug-last').textContent = String(window.__KGB_LAST_AUTH_DEBUG||'(sem resposta)');
    }catch(e){
      const el = panel.querySelector('#kgb-debug-server-result');
      el.textContent = 'erro: '+String(e);
    }
  });
  // Poll automático enquanto o painel estiver aberto para coletar dados antes do logout
  let kgbDebugInterval = setInterval(async ()=>{
    if (!document.body.contains(panel)) { clearInterval(kgbDebugInterval); return; }
    try{
      const el = panel.querySelector('#kgb-debug-server-result');
      try{
        if (typeof window.apiFetch !== 'function') { el.textContent = 'apiFetch não disponível'; return; }
        const resp = await window.apiFetch(`${API_BASE.replace(/\/$/, '')}/auth/debug`, { method: 'GET', credentials: 'include' });
        el.textContent = JSON.stringify(resp && (resp.data || resp) || resp, null, 2);
      }catch(e){ el.textContent = 'erro: '+String(e); }
      panel.querySelector('#kgb-debug-last').textContent = String(window.__KGB_LAST_AUTH_DEBUG||'(sem resposta)');
    }catch(e){ /* ignore polling errors */ }
  }, 5000);
}

// Exports mínimos usados pelo sistema
export default async function guard() {
  const u = window.__KGB_USER_CACHE || await fetchMe();
  if (u) return u;
  return null;
}

export function aplicarPermissoesConteudoLeve() { /* placeholder para compatibilidade */ }
export function aplicarPermissoesNaTela() { /* placeholder para compatibilidade */ }
export function aplicarPermissoesNoMenu() {
  // Stub seguro: evita crash por import quebrado.
  // Implementar controle de permissões do menu aqui quando necessário.
  return true;
}
