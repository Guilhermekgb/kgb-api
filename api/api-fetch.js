window.apiFetch = async function apiFetch(path, options = {}) {
  const base = (window.__API_BASE__ || '').replace(/\/+$/, '');
  const url = path.startsWith('http')
    ? path
    : base + (path.startsWith('/') ? path : `/${path}`);

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('KGB_AUTH_TOKEN') ||
    localStorage.getItem('kgb_token') ||
    sessionStorage.getItem('token') ||
    sessionStorage.getItem('authToken') ||
    sessionStorage.getItem('KGB_AUTH_TOKEN') ||
    sessionStorage.getItem('kgb_token');

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });

  const raw = await res.text();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  let data = null;
  if (isJson && raw) {
    try { data = JSON.parse(raw); } catch { data = null; }
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message))
      ? (data.error || data.message)
      : (raw || `HTTP ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    err.url = url;
    err.body = raw;
    throw err;
  }

  return isJson ? (data ?? { ok: true }) : (raw || { ok: true });
};
