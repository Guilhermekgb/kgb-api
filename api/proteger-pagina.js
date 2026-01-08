(function () {
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

  // API pública: guard({ permissao })
  window.guard = async function guard(opts = {}) {
    console.log('[GUARD] start', location.pathname);
    console.log('[GUARD] token?', !!localStorage.getItem('KGB_AUTH_TOKEN'));
    // token must exist
    const token = (function(){ try { return localStorage.getItem('KGB_AUTH_TOKEN') || window.KGB_AUTH_TOKEN || null; } catch(e){ return window.KGB_AUTH_TOKEN || null; } })();
    if (!token) {
      clearToken();
      goLogin();
      throw new Error('no-token');
    }

    try {
      // prefer centralized apiFetch
      let resp;
      if (typeof window.apiFetch === 'function') {
        resp = await window.apiFetch('/auth/me');
      } else {
        // fallback to fetch using known base if available
        const base = (window.API_BASE || window.__KGB_API_BASE__ || window.__API_BASE__ || '').toString().replace(/\/+$/,'');
        const url = (base ? (base + '/auth/me') : '/auth/me');
        resp = await fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, credentials: 'include' });
      }

      if (!resp || !resp.ok) {
        clearToken();
        goLogin();
        throw new Error('unauthorized');
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
      throw e;
    }
  };
})();
