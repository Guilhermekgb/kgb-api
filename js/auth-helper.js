// Helper para normalizar API base e compatibilidade com Live Server
(function () {
  function getApiBase() {
    try {
      const origin = window.location.origin || '';
      const host = window.location.hostname || '';
      const port = window.location.port || '';
      const hostWithPort = host + (port ? ':' + port : '');
      const isLiveServer = origin.includes(':5500') || hostWithPort === '127.0.0.1:5500';

      // Preferências explícitas já expostas na página
      if (window.__API_BASE__) {
        return String(window.__API_BASE__).replace('127.0.0.1', 'localhost');
      }

      // Se outro provider registrar __getApiBase, respeitamos
      if (typeof window.__getApiBase === 'function' && window.__getApiBase() !== getApiBase) {
        return window.__getApiBase();
      }

      if (isLiveServer) return 'http://localhost:3333';

      // Fallbacks razoáveis para desenvolvimento local
      if (host === '127.0.0.1' || host === 'localhost' || host === '') return 'http://localhost:3333';

      return window.API_BASE || 'http://localhost:3333';
    } catch (err) {
      return 'http://localhost:3333';
    }
  }

  window.__getApiBase = getApiBase;
})();
