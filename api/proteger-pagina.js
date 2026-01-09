(function () {
  function clearToken() {
    try { localStorage.removeItem('KGB_AUTH_TOKEN'); } catch(e){}
    try { localStorage.removeItem('KGB_TOKEN'); } catch(e){}
    try { sessionStorage.removeItem('KGB_AUTH_TOKEN'); } catch(e){}
    try { delete window.KGB_AUTH_TOKEN; } catch(e){}
    try { delete window.KGB_TOKEN; } catch(e){}
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
    const DBG = (function(){
      try { return window.AUTH_DEBUG === '1' || localStorage.getItem('AUTH_DEBUG') === '1' || location.search.indexOf('debug=1') !== -1; } catch(e){ return false; }
    })();
    const guardLog = (...a) => { if (DBG) console.log('[GUARD]', ...a); };
    const guardWarn = (...a) => { if (DBG) console.warn('[GUARD]', ...a); };
    guardLog('start', location.pathname);
    guardLog('token?', !!localStorage.getItem('KGB_AUTH_TOKEN'));
    // token must exist
      const token = (function(){
        try {
          return localStorage.getItem('KGB_TOKEN') || localStorage.getItem('KGB_AUTH_TOKEN') || window.KGB_AUTH_TOKEN || window.KGB_TOKEN || null;
        } catch(e) { return window.KGB_AUTH_TOKEN || window.KGB_TOKEN || null; }
      })();
      guardLog('token present?', !!token);
    if (!token) {
        guardWarn('no token found -> redirect to login');
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

      if (!resp) {
        guardWarn('/auth/me no response (network?)');
        throw new Error('no-response');
      }

      const status = resp.status || (resp.ok ? 200 : 500);
      if (status === 401) {
        guardWarn('token invalid (401) -> clearing token and redirect to login');
        clearToken();
        goLogin();
        throw new Error('unauthorized');
      }
      if (status === 403) {
        guardWarn('user has no permission (403) -> not redirecting to login');
        try { alert('Sem permissão para acessar esta página.'); } catch (e){}
        location.href = './dashboard.html';
        return false;
      }

      let j;
      try {
        j = (typeof resp.json === 'function') ? await resp.json().catch(() => ({})) : resp;
      } catch (e) { j = {}; }
      window.__KGB_USER__ = j?.data || j || null;

      // permissões (simples)
      const perm = opts.permissao;
      if (perm && perm !== '*' && window.__KGB_USER__) {
        const perms = window.__KGB_USER__.permissoes || [];
        const isAdmin = (window.__KGB_USER__.perfil || '').toLowerCase().includes('admin');
        if (!isAdmin && !perms.includes('*') && !perms.includes(perm)) {
          guardWarn('permission check failed for', perm, 'user.permissoes=', perms);
          try { alert('Sem permissão para acessar esta página.'); } catch (e){}
          location.href = './dashboard.html';
          return false;
        }
      }

      return true;
    } catch (e) {
      // Distinguish network errors vs auth errors already handled above
      guardWarn('error during guard:', e && e.message);
      // If token-related errors have already redirected, just rethrow
      throw e;
    }
  };
})();
