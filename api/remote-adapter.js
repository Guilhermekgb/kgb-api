// ===== Bootstrap de API_BASE (auto-descoberta) =====
(function bootstrapApiBase(){
  // 1) se já existir, não faz nada
  if (typeof window !== 'undefined' && window.__API_BASE__) return;

  // 2) tenta <meta name="api-base" content="...">
  try {
    const meta = document.querySelector('meta[name="api-base"]');
    if (meta && meta.content) {
      window.__API_BASE__ = meta.content.trim().replace(/\/+$/, '');
      return;
    }
  } catch {}

  // 3) tenta localStorage (útil pra homolog sem mexer nos HTMLs)
  try {
    const ls = localStorage.getItem('API_BASE');
    if (ls) {
      window.__API_BASE__ = String(ls).trim().replace(/\/+$/, '');
      return;
    }
  } catch {}

  // 4) deixa indefinido mesmo (o adapter continuará “mudo” no dev)
})();

// api/remote-adapter.js
// Adapta chamadas do front para o backend real usando window.__API_BASE__.
// Suporta uso com callback (respond) OU retornando uma Promise.

import { getAuthHeaders } from './api-config.js';

/* Utils ------------------------------------------------------- */
export function apiBase() {
  return (typeof window !== 'undefined' && window.__API_BASE__)
    ? String(window.__API_BASE__)
    : '';
}

export function apiUrl(endpoint, qs = null) {
  const base = apiBase().replace(/\/$/, '');
  const path = String(endpoint || '').replace(/^\//, '');
  const url  = `${base}/${path}`;
  if (!qs || typeof qs !== 'object' || !Object.keys(qs).length) return url;

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (v === undefined || v === null) continue;
    sp.append(k, String(v));
  }
  const q = sp.toString();
  return q ? `${url}?${q}` : url;
}

/* Headers (usa getAuthHeaders se houver; se não, fallback) ---- */
function buildAuthHeadersFallback() {
  const token =
    (typeof localStorage   !== 'undefined' && localStorage.getItem('token')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token')) ||
    null;
  const base = { 'Content-Type': 'application/json' };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

function resolveHeaders(extra = {}) {
  let baseHeaders = {};
  try {
    if (typeof getAuthHeaders === 'function') baseHeaders = getAuthHeaders() || {};
  } catch {}
  if (!baseHeaders || typeof baseHeaders !== 'object') {
    baseHeaders = buildAuthHeadersFallback();
  }
  return { ...baseHeaders, ...(extra || {}) };
}

/* Handler principal ------------------------------------------- */
export function handleRequest(endpoint, req = {}, respond) {
  const method = String(req?.method || 'GET').toUpperCase();
  const body   = req?.body ?? null;
  const extraHeaders = req?.headers || {};

  const noBasePayload = {
    status: 0,
    error: 'API_BASE não definida. Defina window.__API_BASE__ para usar o backend real.'
  };

  if (!apiBase()) {
    if (typeof respond === 'function') { respond(noBasePayload); return; }
    return Promise.resolve(noBasePayload);
  }

  // GET → querystring; outros → body JSON
  const url = method === 'GET' ? apiUrl(endpoint, body) : apiUrl(endpoint);
  const headers = resolveHeaders(extraHeaders);

  const p = fetch(url, {
    method,
    headers,
    body: method === 'GET' ? null : JSON.stringify(body || {})
  })
  .then(async (r) => {
    const ct = (r.headers.get('content-type') || '').toLowerCase();

    if (ct.includes('application/json')) {
      const json = await r.json().catch(() => ({}));
      const looksLikePayload = (
        json && (Object.prototype.hasOwnProperty.call(json, 'status') ||
                 Object.prototype.hasOwnProperty.call(json, 'data')   ||
                 Object.prototype.hasOwnProperty.call(json, 'error'))
      );

      const payload = looksLikePayload
        ? json
        : { status: r.status, data: json, error: !r.ok ? (json?.error || r.statusText) : null };

      return payload;
    }

    const text = await r.text().catch(() => null);
    return { status: r.status, data: text || null, error: !r.ok ? r.statusText : null };
  })
  .catch((err) => ({ status: 0, error: String(err) }));

  if (typeof respond === 'function') {
    p.then(payload => respond(payload));
    return; // modo callback
  }

  return p; // modo Promise/await
}

// Disponibiliza global p/ scripts não-módulo (ex.: funil-leads.js)
if (typeof window !== 'undefined' && !window.handleRequest) {
  window.handleRequest = handleRequest;
}

