// Arquivo de configuração simples para testes locais
// Define a base da API que o frontend lê em runtime
(function(){
  try {
    // For tests prefer the public Render deployment. Change here if you
    // want to override to localhost for local API testing.
    const forced = 'https://kgb-api-v2.onrender.com';
    try {
      // Define as propriedade não-writable para evitar sobrescritas acidentais
      Object.defineProperty(window, '__API_BASE__', { value: forced, writable: false, configurable: false, enumerable: true });
      try { localStorage.setItem('API_BASE', forced); } catch (e) {}
      console.log('[KGB] api-config loaded, forced __API_BASE__ =', window.__API_BASE__);
    } catch (e) {
      // Fallback: assign normally se defineProperty falhar
      try { localStorage.setItem('API_BASE', forced); } catch (e2) {}
      window.__API_BASE__ = forced;
      console.log('[KGB] api-config loaded (fallback assign), __API_BASE__ =', window.__API_BASE__);
    }
  } catch(e) {
    console.error('[KGB] erro ao carregar api-config.js', e);
  }
})();
