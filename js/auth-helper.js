// Helper para normalizar API base e compatibilidade com Live Server
(function () {
  function getApiBase() {
    try {
      // If running on local API port 3333, always use same-origin to avoid
      // stale saved API_BASE pointing to external hosts (Render) causing 500/401.
      try {
        const orig = (window.location && window.location.origin) ? String(window.location.origin) : '';
        const port = (window.location && window.location.port) ? String(window.location.port) : '';
        const hostWithPort = (window.location && window.location.hostname ? window.location.hostname : '') + (port ? ':' + port : '');
        if (port === '3333' || orig.indexOf('localhost:3333') !== -1 || orig.indexOf('127.0.0.1:3333') !== -1 || hostWithPort === 'localhost:3333' || hostWithPort === '127.0.0.1:3333') {
          return (window.location && window.location.origin) || '';
        }
      } catch (e) { /* ignore and continue */ }
      const origin = window.location.origin || '';
      const host = window.location.hostname || '';
      const port = window.location.port || '';
      const hostWithPort = host + (port ? ':' + port : '');
      const isLiveServer = origin.includes(':5500') || hostWithPort === '127.0.0.1:5500';

      // Prefer explicit runtime config or saved value
      if (window.__API_BASE__) return window.__API_BASE__;
      if (window.API_BASE) return window.API_BASE;
      if (typeof window.__getApiBase === 'function' && window.__getApiBase() !== getApiBase) {
        return window.__getApiBase();
      }
      try { const ls = localStorage.getItem('API_BASE') || ''; if (ls) return ls; } catch(e) {}
      if (window.location && window.location.origin) return window.location.origin;
      return '';
    } catch (err) {
      try { return (window.location && window.location.origin) || ''; } catch(e) { return ''; }
    }
  }

  window.__getApiBase = getApiBase;
})();
