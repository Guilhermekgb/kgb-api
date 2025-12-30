// Helper para padronizar API_BASE e facilitar chamadas que precisam de credentials
export function getApiBase() {
  try {
    const hostname = String(location.hostname || '').toLowerCase();
    const port = String(location.port || '');
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

      // If running on local API port 3333, always use same-origin and ignore saved API_BASE
      try {
        const orig = (window.location && window.location.origin) ? String(window.location.origin) : '';
        const port = (window.location && window.location.port) ? String(window.location.port) : '';
        const hostWithPort = (window.location && window.location.hostname ? window.location.hostname : '') + (port ? ':' + port : '');
        if (port === '3333' || orig.indexOf('localhost:3333') !== -1 || orig.indexOf('127.0.0.1:3333') !== -1 || hostWithPort === 'localhost:3333' || hostWithPort === '127.0.0.1:3333') {
          return (window.location && window.location.origin) || '';
        }
      } catch (e) { /* ignore and continue */ }

      // Prefer explicit runtime config or saved value
      if (window.__API_BASE__) return window.__API_BASE__;
      if (window.API_BASE) return window.API_BASE;
      try {
        const ls = localStorage.getItem('API_BASE') || '';
        if (ls) return ls;
      } catch (e) { /* ignore */ }

      // Fallback to same-origin when running in browser
      try { if (window.location && window.location.origin) return window.location.origin; } catch(e) {}
      return '';
  } catch (e) {
    try { return (window.location && window.location.origin) || ''; } catch(err) { return ''; }
  }
}

// Exponha como global por compatibilidade
try { window.__getApiBase = getApiBase; } catch (e) { /* noop */ }

export default getApiBase;
// Helper global para obter o usuário atual a partir da sessão (/auth/me)
// - Não usa localStorage/sessionStorage
// - Fornece API síncrona leve (retorna cache) e API assíncrona para garantir fetch

async function getUsuarioAtualAsync() {
  if (window.__KGB_USER_CACHE) return window.__KGB_USER_CACHE;
  if (typeof window.guard === 'function') {
    try {
      const u = await window.guard();
      if (u) {
        window.__KGB_USER_CACHE = u;
        return u;
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

// API principal exposta: função síncrona que retorna cache quando possível.
// Se não houver cache, dispara a versão assíncrona em background e retorna null.
function getUsuarioAtual() {
  if (window.__KGB_USER_CACHE) return window.__KGB_USER_CACHE;
  // Dispara carregamento assíncrono sem bloquear
  getUsuarioAtualAsync().catch(() => {});
  return null;
}

// Expondo globalmente
window.getUsuarioAtual = getUsuarioAtual;
window.getUsuarioAtualAsync = getUsuarioAtualAsync;

export { getUsuarioAtual, getUsuarioAtualAsync };
