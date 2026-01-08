(function () {
  function getBase() {
    return (window.API_BASE || window.__KGB_API_BASE__ || window.__API_BASE__ || 'https://kgb-api.onrender.com')
      .toString()
      .replace(/\/+$, '');
  }

  function getToken() {
    try {
      return localStorage.getItem('KGB_AUTH_TOKEN') || window.KGB_AUTH_TOKEN || null;
    } catch (e) {
      return window.KGB_AUTH_TOKEN || null;
    }
  }

  function clearToken() {
    try { localStorage.removeItem('KGB_AUTH_TOKEN'); } catch(e){}
    try { sessionStorage.removeItem('KGB_AUTH_TOKEN'); } catch(e){}
    try { delete window.KGB_AUTH_TOKEN; } catch(e){}
  }

  function goLogin() {
    try {
      const here = location.pathname.split('/').pop() || 'dashboard.html';
      const q = encodeURIComponent(here + location.search + location.hash);
      location.href = './login.html?returnUrl=' + q;
    } catch (e) {
      location.href = './login.html';
    }
  }

  async function callMe() {
    const token = getToken();
    const url = getBase() + '/auth/me';

    const resp = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      credentials: 'include'
    });

    return resp;
  }

  // API pública: guard({ permissao })
  window.guard = async function guard(opts = {}) {
    try {
      const resp = await callMe();
      if (!resp.ok) {
        clearToken();
        goLogin();
        return false;
      }

      const j = await resp.json().catch(() => ({}));
      window.__KGB_USER__ = j?.data || null;

      // permissões (simples)
      const perm = opts.permissao;
      if (perm && perm !== '*' && window.__KGB_USER__) {
        const perms = window.__KGB_USER__.permissoes || [];
        const isAdmin = (window.__KGB_USER__.perfil || '').toLowerCase().includes('admin');
        if (!isAdmin && !perms.includes('*') && !perms.includes(perm)) {
          location.href = './acesso-negado.html';
          return false;
        }
      }

      return true;
    } catch (e) {
      clearToken();
      goLogin();
      return false;
    }
  };
})();
