// Arquivo de configuração simples para testes locais
// Define a base da API que o frontend lê em runtime
(function(){
  try {
    // If user has manually saved an API_BASE (via set-api.html), respect it.
    // Otherwise do not force an API base here — runtime code should fall back to same-origin.
    // Não ler/gravar em localStorage neste arquivo de infra.
    // Se a aplicação já definiu `window.__API_BASE__`, apenas logamos; caso contrário deixamos o runtime decidir.
    if (typeof window !== 'undefined' && window.__API_BASE__) {
      try { Object.defineProperty(window, '__API_BASE__', { value: window.__API_BASE__, writable: false, configurable: false, enumerable: true }); } catch(e){ /* ignore */ }
      console.log('[KGB] api-config loaded, __API_BASE__ =', window.__API_BASE__);
    } else {
      console.log('[KGB] api-config loaded, no explicit __API_BASE__; using same-origin at runtime');
    }
  } catch(e) {
    console.error('[KGB] erro ao carregar api-config.js', e);
  }
})();
