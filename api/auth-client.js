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
        localStorage.getItem('KGB_AUTH_TOKEN') ||
        localStorage.getItem('KGB_TOKEN') ||
        localStorage.getItem('token') ||
        localStorage.getItem('jwt') ||
        ''
      );
    } catch (e) { return ''; }
  }

  function setToken(token) {
    if (!token) return;
    try {
      localStorage.setItem('KGB_AUTH_TOKEN', token);
      localStorage.setItem('KGB_TOKEN', token);
    } catch (e) {}
  }

  function clearToken() {
    try { ['KGB_AUTH_TOKEN','KGB_TOKEN','token','jwt'].forEach(k => localStorage.removeItem(k)); } catch(e){}
  }

  async function api(path, opts = {}) {
    if (typeof window.apiFetch !== 'function') throw new Error('apiFetch_missing');

    const raw = await window.apiFetch(path, opts);

    let status = 200;
    let payload = raw;

    // Se veio Response do fetch, parsear JSON
    if (raw && typeof raw.status === 'number' && typeof raw.json === 'function') {
      status = raw.status;
      try {
        payload = await raw.json();
      } catch (e) {
        payload = {};
      }
    }

    // Se status de erro, levantar exception com msg útil
    if (status >= 400) {
      const msg =
        payload?.error ||
        payload?.message ||
        payload?.detail ||
        (status === 401 ? 'Credenciais inválidas' : `Erro HTTP ${status}`);

      const err = new Error(msg);
      err.status = status;
      err.payload = payload;
      throw err;
    }

    return unwrap(payload);
  }

  async function login(email, senha) {
    const data = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
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
