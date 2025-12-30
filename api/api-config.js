// Arquivo de configuração simples para testes locais
// Define a base da API que o frontend lê em runtime
(function(){
  try {
    // If user has manually saved an API_BASE (via set-api.html), respect it.
    // Otherwise do not force an API base here — runtime code should fall back to same-origin.
    var saved = null;
    try { saved = localStorage.getItem('API_BASE'); } catch (e) { saved = null; }
    if (saved) {
      try {
        Object.defineProperty(window, '__API_BASE__', { value: saved, writable: false, configurable: false, enumerable: true });
      } catch (e) {
        window.__API_BASE__ = saved;
      }
      console.log('[KGB] api-config loaded, __API_BASE__ =', window.__API_BASE__);
    } else {
      // No saved API_BASE — leave runtime to use window.location.origin when needed.
      console.log('[KGB] api-config loaded, no saved API_BASE; using same-origin at runtime');
    }
  } catch(e) {
    console.error('[KGB] erro ao carregar api-config.js', e);
  }
})();
