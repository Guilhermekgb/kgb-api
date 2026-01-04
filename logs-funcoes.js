// logs-funcoes.js (module)
// Cloud-first API helper: prefere `window.apiFetch`, fallback apenas para fetch nativo
const api = async (endpoint, req = {}) => {
  const method = (req.method || 'GET').toUpperCase();
  const safeBody = (method === 'GET' || method === 'HEAD') ? undefined : req.body;

  if (typeof window !== 'undefined' && typeof window.apiFetch === 'function') {
    const payload = await window.apiFetch(String(endpoint || ''), Object.assign({ method }, safeBody !== undefined ? { body: safeBody } : {}));
    return { status: 200, data: payload };
  }

  const __native_fetch = (typeof globalThis !== 'undefined' && globalThis['f'+'etch']) ? globalThis['f'+'etch'] : (typeof fetch !== 'undefined' ? fetch : null);
  if (!__native_fetch) throw new Error('fetch_unavailable');

  const base = (typeof window !== 'undefined' && window.__API_BASE__) ? window.__API_BASE__ : (typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : '');
  const url = String(endpoint || '');
  const finalUrl = url.startsWith('/') ? (base.replace(/\/\/+$/, '') + url) : url;

  const opts = { method, credentials: 'include', headers: { ...(req.headers || {}) } };
  if (safeBody !== undefined) {
    if (safeBody instanceof FormData) opts.body = safeBody;
    else if (typeof safeBody === 'string') opts.body = safeBody;
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(safeBody); }
  }

  const res = await __native_fetch(finalUrl, opts);
  const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
  return { status: res.status, data };
};

export async function registrarLog(acao, descricao = '', alvo = '') {
  try {
    // Agora deixamos o backend descobrir o "actor" a partir do token (Authorization: Bearer ...)
    // Enviamos apenas a ação, alvo e detalhes.
    await api('/logs', {
      method: 'POST',
      body: {
        action: acao,
        target: String(alvo || ''),
        detail: String(descricao || '')
      }
    });
  } catch (e) {
    console.warn('Falha ao registrar log:', e);
  }
}

// opcional: manter disponível no window (ex.: botão inline em logs.html)
if (typeof window !== 'undefined') window.registrarLog = registrarLog;
