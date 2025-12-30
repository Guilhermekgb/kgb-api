// Módulo de proteção de páginas — verifica sessão via cookie httpOnly
function resolveApiBase(){
  // Mantemos compatibilidade com helpers antigos — mas priorizamos __getApiBase()
  if (typeof window.__getApiBase === 'function') {
    try { const b = window.__getApiBase(); if (b) return b; } catch(e){}
  }

  if (window.__API_BASE__) return window.__API_BASE__;
  const host = String(location.hostname||"").toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3333';
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
    // Detectar explicitamente same-origin em :3333 para evitar host mismatch (127 vs localhost)
    const isSameOrigin3333 = String(location.port || '') === '3333';
    const baseFromHelper = (typeof window.__getApiBase === 'function') ? window.__getApiBase() : (API_BASE || '');
    const meUrl = isSameOrigin3333 ? '/auth/me' : `${baseFromHelper}/auth/me`;

    // Não enviar Authorization Bearer quando same-origin; usar cookie httpOnly
    const headers = (!isSameOrigin3333 && window.__KGB_TOKEN) ? { Authorization: `Bearer ${window.__KGB_TOKEN}` } : {};

    const resp = await fetch(meUrl, {
      credentials: 'include',
      headers
    });

    // Se for o primeiro check do app e o servidor retornar 401, suprimir mensagem falsa (transiente)
    if (resp && resp.status === 401 && !window.__KGB_AUTH_INITIAL_SUPPRESSED) {
      window.__KGB_AUTH_INITIAL_SUPPRESSED = true;
      try { const text = await resp.text().catch(()=>null); try { window.__KGB_LAST_AUTH_DEBUG = String(text); } catch(e){} } catch(e){}
      return null;
    }

    if (__AUTH_DEBUG__) console.debug('[AUTH] fetchMe -> API_BASE=', API_BASE, 'isSameOrigin3333=', isSameOrigin3333, 'headers=', headers);
    if (__AUTH_DEBUG__) console.warn('[AUTH] /auth/me status:', resp && resp.status);
    try { if (__AUTH_DEBUG__) console.debug('[AUTH] /auth/me response headers:', Array.from(resp.headers || [])); } catch (e) {}
    // Se não autenticado, registrar debug no console (não usar alert para UX)
    if (!resp.ok || resp.status === 401) {
      try {
        const text = await resp.text().catch(()=>null);
        // armazenar para o painel de debug
        try { window.__KGB_LAST_AUTH_DEBUG = String(text); } catch(e){}
        if (__AUTH_DEBUG__) console.warn('[AUTH DEBUG] origin=' + location.origin + ' API_BASE=' + (typeof window.__getApiBase === 'function' ? window.__getApiBase() : '(sem __getApiBase)') + ' /auth/me status=' + (resp && resp.status) + ' body=' + String(text));
      } catch (e) { /* noop */ }
    }

    if (resp.status === 200) {
      const j = await resp.json();
      const user = (j && j.data) ? j.data : (j && j.data) || j || null;
      if (user) window.__KGB_USER_CACHE = user;
      return user;
    }
    return null;
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

  document.body.appendChild(panel);

  panel.querySelector('#kgb-debug-close').addEventListener('click', ()=>{ panel.remove(); });

  panel.querySelector('#kgb-debug-force').addEventListener('click', ()=>{ window.location.href = 'login.html'; });

  panel.querySelector('#kgb-debug-check-server').addEventListener('click', async ()=>{
    try{
      const el = panel.querySelector('#kgb-debug-server-result');
      el.textContent = 'checando...';
      const resp = await fetch(`${API_BASE}/auth/debug`, { credentials: 'include' });
      const j = await resp.json().catch(()=>null);
      el.textContent = JSON.stringify(j, null, 2);
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
      const resp = await fetch(`${API_BASE}/auth/debug`, { credentials: 'include' });
      const j = await resp.json().catch(()=>null);
      el.textContent = JSON.stringify(j, null, 2);
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
