// Shim para garantir acesso s├¡ncrono seguro ao mapa `fotosClientes`.
// Uso: incluir este script o MAIS CEDO poss├¡vel nas p├íginas que precisam
// ler `localStorage['fotosClientes']` de forma s├¡ncrona no carregamento.

(function(){
  try{
    // Inicializa com objeto vazio para leituras imediatas
    if (typeof window !== 'undefined') {
      window.__FOTOS_CLIENTES_PRELOAD__ = window.__FOTOS_CLIENTES_PRELOAD__ || {};

      // S├¡ncrono-safe getter usado por p├íginas que n├úo podem aguardar promises
      window.getFotosClientesSync = function(){
        try{
          if (window.__FOTOS_CLIENTES_PRELOAD__ && Object.keys(window.__FOTOS_CLIENTES_PRELOAD__).length) return window.__FOTOS_CLIENTES_PRELOAD__;
          // fallback: try localStorage (read-only)
          try{ const raw = localStorage.getItem('fotosClientes'); if(raw) return JSON.parse(raw); }catch(e){}
          return window.__FOTOS_CLIENTES_PRELOAD__ || {};
        }catch(e){ return {}; }
      };

      // Attempt to warm the preload asynchronously (best-effort)
      try{
        if (window.storageAdapter && typeof window.storageAdapter.preload === 'function'){
          // preload will set window.__FOTOS_CLIENTES_PRELOAD__ when available
          window.storageAdapter.preload('fotosClientes').catch(()=>{});
        }
      }catch(e){}
    }
  }catch(e){ /* safe no-op */ }
})();
/*
  fotos-shim.js
  Shim leve para espelhar altera├º├Áes em `localStorage.fotosClientes`
  para `window.storageAdapter.patchFotos` (quando dispon├¡vel).
  - N├úo bloqueante: erros s├úo silenciados.
  - Inserir este script nas p├íginas p├║blicas para migra├º├úo incremental.
*/
(function(){
  try{
    if (typeof window === 'undefined') return;
    // Tentar preload para evitar flash-of-empty-state quando poss├¡vel
    try{ if (window.storageAdapter && typeof window.storageAdapter.preload === 'function'){ window.storageAdapter.preload().catch(()=>{}); } }catch(e){}
    // espera que a aplica├º├úo carregue window.storageAdapter (se existir)
    const maybe = () => (window.storageAdapter && typeof window.storageAdapter.patchFotos === 'function') ? window.storageAdapter : null;
    const nativeSet = window.localStorage && window.localStorage.setItem ? window.localStorage.setItem.bind(window.localStorage) : null;
    if (!nativeSet) return;

    // Substitui setItem de forma segura
    window.localStorage.setItem = function(k, v){
      try{
        if (String(k) === 'fotosClientes'){
          try{
            const obj = JSON.parse(String(v || '{}')) || {};
            const sa = maybe();
            if (sa){
              // enviar patch por chave (n├úo bloqueante)
              for (const kk of Object.keys(obj)){
                try{ sa.patchFotos(kk, obj[kk]); } catch(e){ /* ignore */ }
              }
            }
          } catch(e){ /* malformed payload, ignore */ }
        }
      } catch(e){ /* ignore shim-level errors */ }
      return nativeSet(k, v);
    };
  } catch(e){ /* ignore global */ }
})();
