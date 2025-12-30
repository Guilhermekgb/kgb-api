// Helper para padronizar API_BASE e facilitar chamadas que precisam de credentials
export function getApiBase() {
  try {
    const hostname = String(location.hostname || '').toLowerCase();
    const port = String(location.port || '');
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isLocal && port === '5500') return 'http://localhost:3333';

    if (window.__API_BASE__) return window.__API_BASE__;
    if (window.API_BASE) return window.API_BASE;

    try {
      const ls = localStorage.getItem('API_BASE') || '';
      if (ls.includes('127.0.0.1:3333')) return 'http://localhost:3333';
      if (ls) return ls;
    } catch (e) { /* ignore */ }

    // padrão seguro para dev local
    return 'http://localhost:3333';
  } catch (e) {
    return 'http://localhost:3333';
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
