// api/routes.js - compat/shim (same-origin)
export async function apiRequest(path, opts = {}) {
  if (typeof window === 'undefined' || typeof window.apiFetch !== 'function') {
    throw new Error('window.apiFetch não disponível — apiRequest requer o provedor apiFetch.');
  }
  const method = (opts.method || 'GET').toUpperCase();
  let body = opts.body ?? undefined;
  if (method === 'GET' || method === 'HEAD') body = undefined;

  const callOpts = { method, credentials: opts.credentials || 'include', headers: opts.headers || {} };
  if (body !== undefined) {
    if (body instanceof FormData) callOpts.body = body;
    else if (typeof body === 'string') callOpts.body = body;
    else { callOpts.headers['Content-Type'] = 'application/json'; callOpts.body = JSON.stringify(body); }
  }

  const res = await window.apiFetch(path, callOpts);
  return res;
}
