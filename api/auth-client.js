// api/auth-client.js
(function () {
  function unwrap(payload) {
    if (payload && typeof payload === 'object' && 'data' in payload && 'status' in payload) return payload.data;
    if (payload && typeof payload === 'object' && 'ok' in payload && 'data' in payload) return payload.data;
    return payload;
  }

  const TOKEN_KEYS = ["token", "TOKEN", "kgb_token", "KGB_TOKEN", "auth_token"];

  function getToken() {
    try {
      if (typeof window !== 'undefined' && window.KGB_AUTH_TOKEN) return window.KGB_AUTH_TOKEN;
      for (const k of TOKEN_KEYS) {
        try {
          const v = localStorage.getItem(k);
          if (v && String(v).trim()) return v;
        } catch (e) {}
        try {
          const v2 = sessionStorage.getItem(k);
          if (v2 && String(v2).trim()) return v2;
        } catch (e) {}
      }
      return null;
    } catch (e) { return (typeof window !== 'undefined' && window.KGB_AUTH_TOKEN) || null; }
  }

  function setToken(token) {
    if (!token) return;
    const t = String(token);
    try { localStorage.setItem('token', t); } catch (e) {}
    try { window.KGB_AUTH_TOKEN = t; } catch (e) {}
  }

  function clearToken() {
    try { window.KGB_AUTH_TOKEN = null; } catch (e) {}
    for (const k of TOKEN_KEYS) {
      try { localStorage.removeItem(k); } catch (e) {}
      try { sessionStorage.removeItem(k); } catch (e) {}
    }
    try { localStorage.removeItem('token'); } catch (e) {}
  }

  async function api(path, opts = {}) {
    if (typeof window.apiFetch !== 'function') throw new Error('apiFetch_missing');

    // DEBUG: show api call from kgbAuth
    try { console.debug('[KGB kgbAuth.api]', path, (opts && opts.method) ? opts.method : 'GET'); } catch(e){}

    // Ensure headers and token forwarding (plain object headers)
    const headers = Object.assign({}, opts.headers || {});
    const token = getToken();
    if (token) {
      if (!headers.Authorization && !headers.authorization) headers.Authorization = 'Bearer ' + token;
      if (!headers['X-KGB-TOKEN']) headers['X-KGB-TOKEN'] = token;
    }

    // Delegate body serialization to window.apiFetch (it will stringify objects)
    const raw = await window.apiFetch(path, { ...opts, headers, body: opts.body });

    // Normalize response parsing: try JSON, fallback to text
    if (raw && typeof raw.status === 'number') {
      let data = null;
      try {
        data = await raw.json();
      } catch (e) {
        try { data = await raw.text(); } catch (e2) { data = null; }
      }
      const status = raw.status;
      let parsedRaw = null;
      try { parsedRaw = data && typeof data === 'object' ? data : null; } catch (e) { parsedRaw = null; }

      const ok = (parsedRaw && typeof parsedRaw.ok === 'boolean')
        ? parsedRaw.ok
        : (status >= 200 && status < 300);

      const result = { ok, status, data };

      if (status === 401) {
        try { clearToken(); } catch (e) {}
        try { const from = encodeURIComponent(window.location.pathname + window.location.search); window.location.href = `login.html?from=${from}`; } catch (e) {}
        throw new Error('Unauthorized');
      }

      if (status === 403) {
        try { const from = encodeURIComponent(window.location.pathname + window.location.search); window.location.href = `acesso-negado.html?from=${from}`; } catch (e) {}
        throw new Error('Forbidden');
      }

      return result;
    }

    // If window.apiFetch returned a plain object
    const status = (raw && raw.status) ? raw.status : 200;
    const data = raw && raw.data ? raw.data : raw;
    let parsedRaw = null;
    try { parsedRaw = data && typeof data === 'object' ? data : null; } catch (e) { parsedRaw = null; }

    const ok = (parsedRaw && typeof parsedRaw.ok === 'boolean')
      ? parsedRaw.ok
      : (status >= 200 && status < 300);

    const result = { ok, status, data };
    if (status === 401) {
      try { clearToken(); } catch (e) {}
      try { const from = encodeURIComponent(window.location.pathname + window.location.search); window.location.href = `login.html?from=${from}`; } catch (e) {}
      throw new Error('Unauthorized');
    }
    if (status === 403) {
      try { const from = encodeURIComponent(window.location.pathname + window.location.search); window.location.href = `acesso-negado.html?from=${from}`; } catch (e) {}
      throw new Error('Forbidden');
    }
    return result;
  }

  async function login(email, password) {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, senha: password }) });

    const ok = data?.ok;
    if (ok === false) throw new Error(data?.error || 'Credenciais inválidas');

    const token =
      data?.token ||
      data?.jwt ||
      data?.access_token ||
      data?.accessToken ||
      data?.data?.token ||
      data?.data?.jwt ||
      data?.data?.access_token ||
      data?.data?.accessToken;
    if (!token) throw new Error('login_no_token');

    setToken(token);
    return data;
  }

  async function me() {
    const t = getToken();
    if (!t) throw new Error('no_token');
    const data = await api('/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    return data;
  }

  async function listUsers() {
    const t = getToken();
    if (!t) throw new Error('no_token');
    const data = await api('/usuarios', { headers: { Authorization: 'Bearer ' + t } });
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.users)) return data.users;
    return [];
  }

  async function getUser(id) {
    const t = getToken();
    if (!t) throw new Error('no_token');
    const data = await api(`/usuarios/${encodeURIComponent(id)}`, { headers: { Authorization: 'Bearer ' + t } });
    return data;
  }

  async function createUser(payload) {
    const t = getToken();
    if (!t) throw new Error('no_token');
    const data = await api('/usuarios', { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: payload });
    return data;
  }

  async function updateUser(id, payload) {
    const t = getToken();
    if (!t) throw new Error('no_token');
    const data = await api(`/usuarios/${encodeURIComponent(id)}`, { method: 'PUT', headers: { Authorization: 'Bearer ' + t }, body: payload });
    return data;
  }

  async function changePassword(newPassword) {
    const t = getToken();
    if (!t) throw new Error('no_token');
    const data = await api('/auth/change-password', { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: { newPassword } });
    return data;
  }

  window.kgbAuth = { unwrap, api, login, me, listUsers, changePassword, getToken, setToken, clearToken };
})();
