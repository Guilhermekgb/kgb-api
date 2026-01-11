/*
  proteger-pagina.js
  guard() síncrono que bloqueia execução de scripts da página até a validação.
  - usa XMLHttpRequest síncrono para /auth/me
  - considera '*' em permissoes como acesso total e retorna imediatamente sem checar meta
  - redireciona 401 -> login.html, 403 -> acesso-negado.html
  - não faz fallback silencioso
*/
(function(){
  function clearToken(){ try{ localStorage.removeItem('KGB_AUTH_TOKEN'); localStorage.removeItem('KGB_TOKEN'); sessionStorage.removeItem('KGB_AUTH_TOKEN'); delete window.KGB_AUTH_TOKEN; delete window.KGB_TOKEN; }catch(e){}
  }
  function redirectToLogin(reason){
    try{
      const returnUrl = new URLSearchParams(location.search).get('returnUrl') || (location.pathname.split('/').pop()||'') + location.search + location.hash || 'dashboard.html';
      const url = './login.html?returnUrl=' + encodeURIComponent(returnUrl);
      try{ location.href = url; }catch(e){ location.href = './login.html'; }
    }catch(e){ try{ location.href = './login.html'; }catch(_){} }
  }
  function getStoredToken(){
    try{ const keys = ['KGB_TOKEN','token','jwt','KGB_AUTH_TOKEN']; for(const k of keys){ try{ const v = localStorage.getItem(k); if(v && typeof v==='string' && v.trim()) return v.trim(); }catch(e){} } }catch(e){}
    try{ const keys=['KGB_TOKEN','token','jwt','KGB_AUTH_TOKEN']; for(const k of keys){ try{ const v = sessionStorage.getItem(k); if(v && typeof v==='string' && v.trim()) return v.trim(); }catch(e){} } }catch(e){}
    try{ const v = (window.KGB_TOKEN || window.token || window.jwt || window.KGB_AUTH_TOKEN); if(v && typeof v==='string' && v.trim()) return v.trim(); }catch(e){}
    return '';
  }
  function getApiBaseNow(){ try{ return (window.__API_BASE__ || window.API_BASE || '').toString().trim(); }catch(e){ return ''; } }

  // Synchronous guard (blocks page flow). opts.permissao optional.
  window.guard = function guard(opts){
    try{
      const required = (opts && (opts.permissao || opts.permission || opts.pagePermission)) || (document.querySelector('meta[name="page-permission"]')?.content?.trim()) || '';
      const token = getStoredToken();

      if(!token){
        if(!required) return true;
        redirectToLogin('no-token');
        throw new Error('no-token');
      }

      // Build URL for /auth/me: prefer configured API base, fallback to relative
      const base = getApiBaseNow();
      const url = (base ? String(base).replace(/\/+$/,'') : '') + '/auth/me';

      const xhr = new XMLHttpRequest();
      try{
        xhr.open('GET', url, false); // synchronous
        if (token) try{ xhr.setRequestHeader('Authorization','Bearer ' + token); }catch(e){}
        xhr.send(null);
      }catch(e){
        // network error: redirect to login to be safe
        redirectToLogin('network-error');
        throw e;
      }

      const status = xhr.status || 0;
      let payload = {};
      try{ payload = xhr.responseText ? JSON.parse(xhr.responseText) : {}; }catch(e){ payload = {}; }

      if(status === 401){ clearToken(); redirectToLogin('unauthorized'); throw new Error('unauthorized'); }
      if(status === 403){ location.href = './acesso-negado.html'; return; }

      const userObj = (payload && payload.data) ? payload.data : payload;
      window.__KGB_USER__ = userObj || null;

      // If user has global '*' permission, allow immediately without checking meta
      try{
        const perms = (window.__KGB_USER__ && window.__KGB_USER__.permissoes) ? window.__KGB_USER__.permissoes : [];
        if (Array.isArray(perms) && perms.includes('*')) return true;
      }catch(e){}

      // Admin profile shortcut
      try{
        const perfil = (window.__KGB_USER__ && window.__KGB_USER__.perfil) ? String(window.__KGB_USER__.perfil).toLowerCase() : '';
        if(perfil === 'administrador' || perfil === 'admin') return true;
      }catch(e){}

      // Enforce required permission if present
      if(required){
        const perms = (window.__KGB_USER__ && window.__KGB_USER__.permissoes) ? window.__KGB_USER__.permissoes : [];
        if(!Array.isArray(perms) || !perms.includes(required)){
          location.href = './acesso-negado.html';
          return;
        }
      }

      return true;
    }catch(e){ throw e; }
  };
})();
*** End Patch
