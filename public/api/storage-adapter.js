// Public storage adapter for pages
// Minimal methods used by the shim and frontend: getFotos, patchFotos, preload
(function(){
  const BASE = null;
  window.storageAdapter = window.storageAdapter || {};

  window.storageAdapter.getFotos = async function(){
    try{
      if (typeof window?.apiFetch !== 'function') return null;
      const res = await window['apiFetch']('/fotos-clientes');
      if(!res || !res.ok) return null;
      const j = await res.json();
      return j && (j.data || j);
    }catch(e){
      console.warn('storageAdapter.getFotos failed', e);
      return null;
    }
  };

  window.storageAdapter.patchFotos = async function(key, value){
    try{
      if (typeof window?.apiFetch !== 'function') {
        console.warn('storageAdapter.patchFotos noop (no apiFetch)');
        return;
      }
      await window['apiFetch']('/fotos-clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
    }catch(e){
      console.warn('storageAdapter.patchFotos failed', e);
    }
  };

  // Preload will fetch the full fotos map from the server and write it
  // into an in-memory preload only if a preload value is not present.
  // This avoids overwriting any unsynced changes while preventing
  // flash-of-empty-state on pages that read storage immediately.
  window.storageAdapter.preload = async function(){
    try{
      // NOTE: avoid writing `fotosClientes` into any persistent browser storage.
      // Fetch map to warm any in-memory caches used by the adapter.
      const map = await window.storageAdapter.getFotos();
      if(map && typeof map === 'object'){
        try{ window.__FOTOS_CLIENTES_PRELOAD__ = map; }catch(e){}
      }
    }catch(e){
      console.warn('storageAdapter.preload failed', e);
    }
  };

})();
// Pequeno adapter para centralizar acessos a dados armazenados localmente
// e oferecer pontos de extensão para adapters remotos (ex: firebaseClientes).
// Uso recomendado:
//   const lista = await storageAdapter.getJSON('clientes', []);
//   storageAdapter.setJSON('clientes', lista);

(function(global){
  'use strict';

  const memStore = { cache: {} };

  function safeJSONParse(txt, fallback=null){
    try{ return JSON.parse(txt); } catch(e){ return fallback; }
  }

  function isLocalKey(k){
    // keys that are clearly local-only (heuristic)
    return k && (k.startsWith('kgb_') || k.indexOf('local_') === 0);
  }

  async function getJSON(key, fallback=null){
    // 1) Se houver um adapter específico (ex: window.firebaseClientes), use-o
    try{
      if(key === 'clientes' && global.firebaseClientes && typeof global.firebaseClientes.list === 'function'){
        try{
          const res = await global.firebaseClientes.list();
          if(res && Array.isArray(res) && res.length) return res;
          if(res && typeof res === 'object' && Object.keys(res).length) return res;
        }catch(e){
          console.warn('[storage-adapter] firebaseClientes.list() falhou, fallback para storage local (in-memory)', e);
        }
      }
    }catch(e){ /* ignore */ }

    // 1.b) Se for fotosClientes, tentar endpoint central
    try{
      if(key === 'fotosClientes' && typeof window !== 'undefined' && typeof window?.apiFetch === 'function'){
        const r = await window['apiFetch']('/fotos-clientes', { method: 'GET', headers: { 'Content-Type': 'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') } });
        if (r && r.ok){
          const j = await r.json();
          if(j && j.ok && j.data) return j.data;
        }
      }
    }catch(e){ console.warn('[storage-adapter] apiFetch /fotos-clientes failed', e); }

    // 2) Tentar ler do preload shim ou cache em memória.
    // Evitamos leituras síncronas de armazenamento persistente aqui para prevenir
    // flash-of-empty-state e leituras de blobs grandes em runtime.
    try{
      if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__FOTOS_CLIENTES_PRELOAD__){
        return window.__FOTOS_CLIENTES_PRELOAD__;
      }
      if(typeof memStore.cache !== 'undefined' && memStore.cache[key] !== undefined){
        const parsed = safeJSONParse(memStore.cache[key], null);
        if(parsed !== null) return parsed;
      }
    }catch(e){
      console.warn('[storage-adapter] Erro lendo cache/preload key=', key, e);
    }
    // If we reach here and key is fotosClientes and apiFetch exists, attempt to PUT value to server
    try{
      if(key === 'fotosClientes' && typeof window?.apiFetch === 'function' && typeof value !== 'undefined'){
        try{
          await window['apiFetch']('/fotos-clientes', { method: 'PUT', headers: { 'Content-Type':'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') }, body: JSON.stringify(value) });
        }catch(e){ console.warn('[storage-adapter] failed to PUT /fotos-clientes', e); }
      }
    }catch(e){}
    // always persist in memory as fallback
    setJSONLocal(key, value);
  }

  // Partial update helper for keys that support PATCH (ex: fotosClientes)
  async function patchJSON(key, patch){
    try{
      if(key === 'fotosClientes' && typeof window !== 'undefined' && typeof window?.apiFetch === 'function'){
        try{
          await window['apiFetch']('/fotos-clientes', { method: 'PATCH', headers: { 'Content-Type':'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') }, body: JSON.stringify(patch) });
          // update in-memory cache too (best-effort): merge into existing cached value
          try{
            let raw = null;
            if(typeof window !== 'undefined' && window.__FOTOS_CLIENTES_PRELOAD__){
              raw = JSON.stringify(window.__FOTOS_CLIENTES_PRELOAD__);
            } else if(typeof memStore !== 'undefined' && memStore.cache['fotosClientes'] !== undefined){
              raw = memStore.cache['fotosClientes'];
            }
            const obj = raw ? JSON.parse(raw) : {};
            if(patch && typeof patch === 'object'){
              if(patch.key && Object.prototype.hasOwnProperty.call(patch, 'value')){
                obj[patch.key] = patch.value;
              } else {
                Object.keys(patch).forEach(k => { obj[k] = patch[k]; });
              }
              memStore.cache['fotosClientes'] = JSON.stringify(obj);
            }
          }catch(e){}
          return;
        }catch(e){ console.warn('[storage-adapter] failed to PATCH /fotos-clientes', e); }
      }
    }catch(e){}
    // fallback: do a full get/merge/put
    try{
      const existing = await getJSON(key, {});
      const merged = Object.assign({}, existing || {}, (patch && typeof patch === 'object') ? (
        (patch.key && Object.prototype.hasOwnProperty.call(patch, 'value')) ? { [patch.key]: patch.value } : patch
      ) : {});
      await setJSON(key, merged);
    }catch(e){ /* ignore */ }
  }

  function setJSONLocal(key, value){
    try{
      const txt = JSON.stringify(value);
      // Do NOT persist fotosClientes to persistent browser storage. Keep it only in memory.
      if (key === 'fotosClientes') {
        memStore.cache[key] = txt;
        return;
      }
      memStore.cache[key] = txt;
    }catch(e){ console.warn('[storage-adapter] setJSONLocal failed', e); }
  }
          try{
            const raw = cache['fotosClientes'] || null;
            const obj = raw ? JSON.parse(raw) : {};
            if(patch && typeof patch === 'object'){
              if(patch.key && Object.prototype.hasOwnProperty.call(patch, 'value')){
                obj[patch.key] = patch.value;
              } else {
                Object.keys(patch).forEach(k => { obj[k] = patch[k]; });
              }
              cache['fotosClientes'] = JSON.stringify(obj);
              // Do NOT write fotosClientes to persistent browser storage; keep only in-memory cache.
            }
          }catch(e){}
  function getRaw(key){
    try{
      if(typeof memStore !== 'undefined' && memStore.cache && memStore.cache[key] !== undefined) return memStore.cache[key];
      if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__FOTOS_CLIENTES_PRELOAD__) return JSON.stringify(window.__FOTOS_CLIENTES_PRELOAD__);
      return null;
    }catch(e){ return null; }
  }

  function setRaw(key, value){
    try{ memStore.cache[key] = value; }catch(e){ /* ignore */ }
  }

  // Expor API mínima
  // Conveniência: helper específico para fotosClientes (patch por chave)
  async function patchFotos(key, value){
    try{
      // If value is a data URL, try presigned upload (S3) then fallback to server-side POC
      if(typeof value === 'string' && value.indexOf('data:') === 0 && typeof window !== 'undefined' && window.__API_BASE__){
        const m = String(value).match(/^data:([^;]+);base64,(.*)$/);
        if(m){
          const contentType = m[1];
          const b64 = m[2];
          try{
            // Prefer server-side upload via apiFetch; skip direct presign PUT to avoid raw fetch to external URLs.
            if(typeof window?.apiFetch === 'function'){
              const up = await window['apiFetch']('/fotos-clientes/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') },
                body: JSON.stringify({ key, data: value })
              });
              if(up && up.ok){
                const uj = await up.json();
                if(uj && uj.ok && uj.url){
                  await patchJSON('fotosClientes', { key, value: uj.url });
                  return;
                }
              }
            }
          }catch(e){ console.warn('[storage-adapter] upload via apiFetch failed', e); }
        }
      }

      // Default: just patch the map with provided value
      await patchJSON('fotosClientes', (Object.prototype.hasOwnProperty.call({ key, value }, 'key') ? { key, value } : { [key]: value }));
    }catch(e){ /* ignore */ }
  }

  // Expor API mínima (single object, evita declarações duplicadas)
  const storageAdapter = {
    getJSON,
    setJSON,
    patchJSON,
    getRaw,
    setRaw,
    preload,
    isLocalKey,
    patchFotos
  };

  // Torna disponível como `window.storageAdapter`
  try{ global.storageAdapter = storageAdapter; }catch(e){ /* ignore */ }

  // Também exporta para módulos UMD-ish
  if(typeof module !== 'undefined' && module.exports){ module.exports = storageAdapter; }

})(typeof window !== 'undefined' ? window : this);
