(function () {
  async function apiFetch(path, options = {}) {
    const opts = { ...options };

    // garante cookie httpOnly em todas as chamadas
    opts.credentials = 'include';

    // se o body for objeto, converte pra JSON
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(opts.body);
    }

    function buildUrl(p) {
      if (!p) return (window.__API_BASE__ || '');
      if (/^https?:\/\//i.test(p)) return p;
      const base = (window.__API_BASE__ || '').replace(/\/$/, '');
      const pp = String(p).startsWith('/') ? p : '/' + String(p);
      return base + pp;
    }

    // ensure headers object
    opts.headers = Object.assign({}, opts.headers || {});

    // include Authorization if token is present (use unified helper)
    try {
      const token = (typeof window.getAuthToken === 'function') ? (window.getAuthToken() || '') : (window.__KGB_TOKEN || '');
      if (token && !opts.headers['Authorization'] && !opts.headers['authorization']) {
        opts.headers['Authorization'] = 'Bearer ' + String(token);
      }
    } catch (e) {}

    const res = await fetch(buildUrl(path), opts);

    // tenta ler json; se falhar, retorna texto
    const ct = res.headers.get('content-type') || '';
    const payload = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);

    if (!res.ok) {
      const err = new Error('apiFetch failed');
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  window.apiFetch = window.apiFetch || apiFetch;
})();
