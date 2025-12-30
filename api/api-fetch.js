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

    const res = await fetch(path, opts);

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
