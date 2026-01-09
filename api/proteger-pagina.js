(function () {
  function clearToken() {
    try { localStorage.removeItem('KGB_AUTH_TOKEN'); } catch(e){}
    try { localStorage.removeItem('KGB_TOKEN'); } catch(e){}
    try { sessionStorage.removeItem('KGB_AUTH_TOKEN'); } catch(e){}
    try { delete window.KGB_AUTH_TOKEN; } catch(e){}
    try { delete window.KGB_TOKEN; } catch(e){}
  }

  function redirectToLogin(reason) {
    try {
      const returnUrl =
        new URLSearchParams(location.search).get('returnUrl') ||
        (location.pathname.split('/').pop() || '') + location.search + location.hash ||
        'dashboard.html';

      const url = './login.html?returnUrl=' + encodeURIComponent(returnUrl);

      const dbg = (function(){
        try { return window.AUTH_DEBUG === '1' || localStorage.getItem('AUTH_DEBUG') === '1' || location.search.indexOf('debug=1') !== -1; } catch(e){ return false; }
      })();

      if (dbg) {
        console.warn('[GUARD] redirectToLogin DEBUG - reason:', reason);
        console.warn('[GUARD] redirect url:', url);
        alert("[GUARD DEBUG] Vou redirecionar para login.\n\nMotivo: " + reason + "\n\nDestino: " + url);
        // atraso maior para capturar Network/Console
        setTimeout(() => { location.href = url; }, 10000);
        return;
      }

      location.href = url;
    } catch (e) {
      try { location.href = './login.html'; } catch (err) { /* ignore */ }
    }
  }

  // Backwards-compatible alias used in older code
  function goLogin() { redirectToLogin('legacy'); }

  function getStoredToken() {
    const keys = ["KGB_TOKEN", "token", "jwt", "KGB_AUTH_TOKEN"];
    try {
      for (const k of keys) {
        const v = localStorage.getItem(k);
        if (v && typeof v === 'string' && v.trim()) return v.trim();
      }
    } catch(e) {}

    try {
      for (const k of keys) {
        const v = sessionStorage.getItem(k);
        if (v && typeof v === 'string' && v.trim()) return v.trim();
      }
    } catch(e) {}

    try {
      const v = (window.KGB_TOKEN || window.token || window.jwt || window.KGB_AUTH_TOKEN);
      if (v && typeof v === 'string' && v.trim()) return v.trim();
    } catch(e) {}

    return '';
  }

  // API pública: guard({ permissao })
  window.guard = async function guard(opts = {}) {
    const DBG = (function(){
      try { return window.AUTH_DEBUG === '1' || localStorage.getItem('AUTH_DEBUG') === '1' || location.search.indexOf('debug=1') !== -1; } catch(e){ return false; }
    })();
    const guardLog = (...a) => { if (DBG) console.log('[GUARD]', ...a); };
    const guardWarn = (...a) => { if (DBG) console.warn('[GUARD]', ...a); };
    guardLog('start', location.pathname);

    // Normalize required permission from multiple possible keys (pt/en)
    const required = (opts && (opts.permissao || opts.permission || opts.requiredPermission || opts.pagePermission))
      || document.querySelector('meta[name="page-permission"]')?.content?.trim()
      || '';

    // token must exist only if a permission is required
    const token = getStoredToken();

    // debug snapshot of storages (do not print token)
    const dbg = (new URLSearchParams(location.search).get('debug') === '1') || (localStorage.getItem('AUTH_DEBUG') === '1');
    if (dbg) {
      const snap = {};
      for (const k of ["KGB_TOKEN","token","jwt","KGB_AUTH_TOKEN"]) {
        try { snap['ls.'+k] = !!localStorage.getItem(k); } catch(e){ snap['ls.'+k] = 'err'; }
        try { snap['ss.'+k] = !!sessionStorage.getItem(k); } catch(e){ snap['ss.'+k] = 'err'; }
      }
      console.log('[GUARD] token present?', !!token, 'required=', required, 'storage snapshot:', snap);
    } else {
      guardLog('token present?', !!token, 'required=', required);
    }

    if (!token) {
      if (!required) {
        guardLog('no token but no required permission -> allowing access');
        return true;
      }
      guardWarn('no token found -> redirect to login');
      // do not clear stored token here; just redirect so developer can inspect storage
      redirectToLogin('no-token');
      throw new Error('no-token');
    }

    try {
      // prefer centralized apiFetch (resolves __API_BASE__); never call relative /auth/me
      guardLog('__API_BASE__ =', window.__API_BASE__ || window.API_BASE || window.__KGB_API_BASE__ || window.KGB_API_BASE);
      let resp = null;
        if (typeof window.apiFetch === 'function') {
        try { resp = await window.apiFetch('/auth/me'); } catch (e) { guardWarn('/auth/me via apiFetch failed', e && e.message); resp = null; }
      } else {
        const base = (window.__API_BASE__ || window.API_BASE || window.__KGB_API_BASE__ || window.KGB_API_BASE || null);
        if (!base) {
          guardWarn('No API base configured (window.__API_BASE__ missing) — avoiding relative /auth/me call');
          clearToken(); redirectToLogin('no-api-base'); throw new Error('no-api-base');
        }
        const url = String(base).replace(/\/+$/,'') + '/auth/me';
        try { resp = await fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, credentials: 'include' }); } catch (e) { guardWarn('/auth/me fetch failed', e && e.message); resp = null; }
      }

      if (!resp) { guardWarn('/auth/me no response (network?)'); throw new Error('no-response'); }

      let status = null; let j = {};
      if (resp && typeof resp.status === 'number') {
        status = resp.status;
        try { j = (typeof resp.json === 'function') ? await resp.json().catch(() => ({})) : resp; } catch (e) { j = {}; }
      } else if (resp && typeof resp === 'object') {
        j = resp;
        status = (resp && resp.ok === false) ? (resp.status || 500) : 200;
      } else { j = {}; status = 500; }

      if (status === 401) { guardWarn('token invalid (401) -> clearing token and redirect to login'); clearToken(); redirectToLogin('unauthorized'); throw new Error('unauthorized'); }
      if (status === 403) { guardWarn('user has no permission (403) -> not redirecting to login'); try { alert('Sem permissão para acessar esta página.'); } catch (e){} location.href = './dashboard.html'; return false; }

      window.__KGB_USER__ = j?.data || j || null;

      // === RBAC: ADMINISTRADOR TEM ACESSO TOTAL ===
      try {
        const user = window.__KGB_USER__;
        if (user && typeof user.perfil === 'string') {
          const perfil = String(user.perfil || '').toLowerCase().trim();
          if (perfil === 'administrador' || perfil === 'admin') {
            guardLog('[RBAC] Administrador detectado - acesso total liberado');
            return true;
          }
        }
      } catch (e) { /* ignore */ }

      // permissões (simples) — use a variável `required` normalizada
      if (required && required !== '*' && window.__KGB_USER__) {
        const perms = window.__KGB_USER__.permissoes || [];
        const isAdmin = (window.__KGB_USER__.perfil || '').toLowerCase().includes('admin');
        if (!isAdmin && !perms.includes('*') && !perms.includes(required)) {
          guardWarn('permission check failed for', required, 'user.permissoes=', perms);
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
