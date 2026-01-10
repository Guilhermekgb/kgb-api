// api/auth-client.js
(function () {
  function unwrap(payload) {
    if (payload && typeof payload === 'object' && 'data' in payload && 'status' in payload) return payload.data;
    if (payload && typeof payload === 'object' && 'ok' in payload && 'data' in payload) return payload.data;
    return payload;
  }

  function getToken() {
    try {
      return (
        (typeof window !== 'undefined' && window.KGB_AUTH_TOKEN) ||
        (localStorage && localStorage.getItem ? localStorage.getItem('KGB_AUTH_TOKEN') : null) ||
        (localStorage && localStorage.getItem ? localStorage.getItem('KGB_TOKEN') : null) ||
        (sessionStorage && sessionStorage.getItem ? sessionStorage.getItem('KGB_AUTH_TOKEN') : null) ||
        (sessionStorage && sessionStorage.getItem ? sessionStorage.getItem('KGB_TOKEN') : null) ||
        null
      );
    } catch (e) { return (typeof window !== 'undefined' && window.KGB_AUTH_TOKEN) || null; }
  }

  function setToken(token) {
    if (!token) return;
    const t = String(token);
    try { localStorage.setItem('KGB_AUTH_TOKEN', t); } catch (e) {}
    try { localStorage.setItem('KGB_TOKEN', t); } catch (e) {}
    try { sessionStorage.setItem('KGB_AUTH_TOKEN', t); } catch (e) {}
    try { sessionStorage.setItem('KGB_TOKEN', t); } catch (e) {}
    try { window.KGB_AUTH_TOKEN = t; } catch (e) {}
  }

  function clearToken() {
    try { window.KGB_AUTH_TOKEN = null; } catch (e) {}
    try { localStorage.removeItem('KGB_AUTH_TOKEN'); localStorage.removeItem('KGB_TOKEN'); } catch(e){}
    try { sessionStorage.removeItem('KGB_AUTH_TOKEN'); sessionStorage.removeItem('KGB_TOKEN'); } catch(e){}
  }

  async function api(path, opts = {}) {
    if (typeof window.apiFetch !== 'function') throw new Error('apiFetch_missing');

    // Ensure headers and token forwarding
    const headers = new Headers(opts.headers || {});
    const token = getToken();
    if (token) {
      if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
      if (!headers.has('X-KGB-TOKEN')) headers.set('X-KGB-TOKEN', token);
    }

    // Serialize plain object bodies to JSON (skip FormData)
    let body = opts.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      try {
        body = JSON.stringify(body);
      } catch (e) {
        // fallback: leave as-is
      }
    }

    const raw = await window.apiFetch(path, { ...opts, headers, body });

    // Normalize response parsing: try JSON, fallback to text
    if (raw && typeof raw.status === 'number') {
      let data = null;
      try {
        data = await raw.json();
      } catch (e) {
        try { data = await raw.text(); } catch (e2) { data = null; }
      }
      return { status: raw.status, data, ok: raw.ok };
    }

    // If window.apiFetch returned a plain object
    const status = (raw && raw.status) ? raw.status : 200;
    const data = raw && raw.data ? raw.data : raw;
    const ok = raw && typeof raw.ok === 'boolean' ? raw.ok : true;
    return { status, data, ok };
  }

  async function login(email, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

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
    const data = await api('/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify(payload)
    });
    return data;
  }

  async function updateUser(id, payload) {
    const t = getToken();
    if (!t) throw new Error('no_token');
    const data = await api(`/usuarios/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify(payload)
    });
    return data;
  }

  async function changePassword(newPassword) {
    const t = getToken();
    if (!t) throw new Error('no_token');
    const data = await api('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ newPassword })
    });
    return data;
  }

  window.kgbAuth = { unwrap, api, login, me, listUsers, changePassword, getToken, setToken, clearToken };
})();
