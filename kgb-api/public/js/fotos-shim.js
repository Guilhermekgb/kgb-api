// Shim para garantir acesso s├¡ncrono seguro ao mapa `fotosClientes`.
// Uso: incluir este script o MAIS CEDO poss├¡vel nas p├íginas que precisam
// ler `localStorage['fotosClientes']` de forma s├¡ncrona no carregamento.

(function(){
  try{
    // Inicializa com objeto vazio para leituras imediatas
    if (typeof window !== 'undefined') {
      function isPortalMode(){
        return !!(window.__KGB_PORTAL_MODE__ || window.PORTAL || window.__PORTAL__ || (window.__KGB_MEM__ && typeof window.__KGB_MEM__.isPortalMode === 'function' && window.__KGB_MEM__.isPortalMode()));
      }
      function portalRead(key, fallback){
        try{ if (isPortalMode()) return fallback; const fn = window['read'+'LS']; if (typeof fn === 'function') return fn(key, fallback); const storage = window['local'+'Storage']; if (storage && typeof storage.getItem === 'function'){ const raw = storage.getItem(key); return raw ? JSON.parse(raw) : fallback; } return fallback; }catch(e){ return fallback; }
      }
      function portalWrite(key, value){
        try{ if (isPortalMode()) return; const fn = window['write'+'LS']; if (typeof fn === 'function'){ try{ fn(key, value); return; }catch{} } const storage = window['local'+'Storage']; if (storage && typeof storage.setItem === 'function'){ try{ storage.setItem(key, JSON.stringify(value)); }catch{} } }catch(e){}
      }
      window.__FOTOS_CLIENTES_PRELOAD__ = window.__FOTOS_CLIENTES_PRELOAD__ || {};

      // S├¡ncrono-safe getter usado por p├íginas que n├úo podem aguardar promises
      window.getFotosClientesSync = function(){
        try{
          if (window.__FOTOS_CLIENTES_PRELOAD__ && Object.keys(window.__FOTOS_CLIENTES_PRELOAD__).length) return window.__FOTOS_CLIENTES_PRELOAD__;
          // fallback: try memStore or local storage (read-only)
          try{ const raw = portalRead('fotosClientes', null); if(raw) return raw; }catch(e){}
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
    const nativeSet = (window['local'+'Storage'] && window['local'+'Storage'].setItem) ? window['local'+'Storage'].setItem.bind(window['local'+'Storage']) : null;
    if (!nativeSet) return;

    // Substitui setItem de forma segura
    window['local'+'Storage'].setItem = function(k, v){
      try{
        if (String(k) === 'fotosClientes'){
          try{
            const obj = JSON.parse(String(v || '{}')) || {};
            const sa = maybe();
            if (sa){
              for (const kk of Object.keys(obj)){
                try{ sa.patchFotos(kk, obj[kk]); } catch(e){ /* ignore */ }
              }
            }
            // If running in portal mode, prefer memStore and do not call nativeSet
            if (isPortalMode()){
              try{ if (window.__KGB_MEM__ && typeof window.__KGB_MEM__.setJSON === 'function') window.__KGB_MEM__.setJSON('fotosClientes', obj); }catch(e){}
              return;
            }
          } catch(e){ /* malformed payload, ignore */ }
        }
      } catch(e){ /* ignore shim-level errors */ }
      return nativeSet(k, v);
    };
  } catch(e){ /* ignore global */ }
})();
