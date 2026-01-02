// Phase 1 (memStore + sync + api wrappers)
// Adicionado por migração: memStore em `window.__MEM_CACHE__`, sync via
// BroadcastChannel (com fallback), `getJSON`/`setJSON` e `isPortalMode()`.
// Em modo portal, evita `localStorage` e usa cache em memória.

// Shim para garantir acesso s├¡ncrono seguro ao mapa `fotosClientes`.

(function(){
  try{
    if (typeof window === 'undefined') return;
    window.__MEM_CACHE__ = window.__MEM_CACHE__ || {};
    const _CH = 'kgb-ui-sync';
    function sendSync(type, key, value){
      try{
        if (typeof BroadcastChannel !== 'undefined'){
          const bc = new BroadcastChannel(_CH); bc.postMessage({type,key,value}); bc.close();
        } else {
          window.dispatchEvent(new CustomEvent(_CH, {detail:{type,key,value}}));
        }
      }catch(e){}
    }
    function onSync(cb){
      try{
        if (typeof BroadcastChannel !== 'undefined'){
          const bc = new BroadcastChannel(_CH); bc.onmessage = e => cb(e.data);
        } else {
          window.addEventListener(_CH, e => cb(e.detail));
        }
      }catch(e){}
    }
    function isPortalMode(){
      return !!(window.__KGB_PORTAL_MODE__ || window.PORTAL || window.__PORTAL__);
    }
    // API wrappers (Phase 2)
    function apiGet(u){ if(typeof window['apiFetch'] === 'function') return window['apiFetch'](u, { method: 'GET' }); return Promise.reject(new Error('no apiFetch')); }
    function apiPost(u,b){ if(typeof window['apiFetch'] === 'function') return window['apiFetch'](u, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type':'application/json' } }); return Promise.reject(new Error('no apiFetch')); }
    function apiPut(u,b){ if(typeof window['apiFetch'] === 'function') return window['apiFetch'](u, { method: 'PUT', body: JSON.stringify(b), headers: { 'content-type':'application/json' } }); return Promise.reject(new Error('no apiFetch')); }
    function getJSON(key, fallback){
      try{
        if (isPortalMode()){
          const v = window.__MEM_CACHE__[key];
          return v === undefined ? fallback : v;
        }
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }catch(e){ return fallback; }
    }
    function setJSON(key, value){
      try{
        if (isPortalMode()){
          window.__MEM_CACHE__[key] = value;
          sendSync('set', key, value);
          return;
        }
        localStorage.setItem(key, JSON.stringify(value));
      }catch(e){}
    }
    window.__KGB_MEM__ = window.__KGB_MEM__ || {getJSON, setJSON, onSync, sendSync, isPortalMode};
  }catch(e){}
})();
// Uso: incluir este script o MAIS CEDO poss├¡vel nas p├íginas que precisam
// ler `localStorage['fotosClientes']` de forma s├¡ncrona no carregamento.

(function(){
  try{
    // Inicializa com objeto vazio para leituras imediatas
    if (typeof window !== 'undefined') {
      window.__FOTOS_CLIENTES_PRELOAD__ = window.__FOTOS_CLIENTES_PRELOAD__ || {};

      // Síncrono-safe getter usado por páginas que não podem aguardar promises
      window.getFotosClientesSync = function(){
        try{
          if (window.__FOTOS_CLIENTES_PRELOAD__ && Object.keys(window.__FOTOS_CLIENTES_PRELOAD__).length) return window.__FOTOS_CLIENTES_PRELOAD__;
          // fallback: usar memStore em portal ou localStorage fora do portal
          try{
            if (window.__KGB_MEM__ && window.__KGB_MEM__.isPortalMode()){
              const v = window.__KGB_MEM__.getJSON('fotosClientes', null);
              if (v) return v;
            } else {
              const raw = localStorage.getItem('fotosClientes'); if(raw) return JSON.parse(raw);
            }
          }catch(e){}
          return window.__FOTOS_CLIENTES_PRELOAD__ || {};
        }catch(e){ return {}; }
      };

      // Attempt to warm the preload asynchronously (best-effort)
      try{
        // Phase 2: if running in portal mode, try to fetch canonical fotos from server
        if (isPortalMode() && typeof apiGet === 'function'){
          apiGet('/fotosClientes').then(r=>{
            try{
              if (r && r.ok && r.data){
                window.__FOTOS_CLIENTES_PRELOAD__ = r.data || {};
                if (window.__KGB_MEM__ && typeof window.__KGB_MEM__.setJSON === 'function') window.__KGB_MEM__.setJSON('fotosClientes', window.__FOTOS_CLIENTES_PRELOAD__);
              }
            }catch(e){}
          }).catch(()=>{});
        }
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
              // enviar patch por chave (não bloqueante)
              for (const kk of Object.keys(obj)){
                try{ sa.patchFotos(kk, obj[kk]); } catch(e){ /* ignore */ }
              }
            }
            // Phase 2: persist full fotosClientes object to server when in portal mode
            try{
              if (window.__KGB_MEM__ && window.__KGB_MEM__.isPortalMode && window.__KGB_MEM__.isPortalMode()){
                // update memStore first
                try{ window.__KGB_MEM__.setJSON('fotosClientes', obj); }catch(e){}
                // fire-and-forget send to backend via apiFetch
                if (typeof apiPost === 'function'){
                  apiPost('/fotosClientes', obj).then(res=>{
                    try{
                      if (res && res.ok && res.data){
                        // reconcile memStore with server canonical
                        if (window.__KGB_MEM__ && typeof window.__KGB_MEM__.setJSON === 'function') window.__KGB_MEM__.setJSON('fotosClientes', res.data);
                      }
                    }catch(e){}
                  }).catch(()=>{});
                }
                return;
              }
            }catch(e){}
          } catch(e){ /* malformed payload, ignore */ }
        }
      } catch(e){ /* ignore shim-level errors */ }
      try{
        if (window.__KGB_MEM__ && window.__KGB_MEM__.isPortalMode()){
          if (String(k) === 'fotosClientes'){
            try{ window.__KGB_MEM__.setJSON('fotosClientes', JSON.parse(String(v || '{}'))); }catch(e){}
            return;
          }
          return;
        }
      }catch(e){}
      return nativeSet(k, v);
    };
  } catch(e){ /* ignore global */ }
})();
