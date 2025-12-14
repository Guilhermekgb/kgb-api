// Public storage adapter for pages
// Minimal methods used by the shim and frontend: getFotos, patchFotos, preload
(function(){
  const BASE = window.API_BASE || '';
  window.storageAdapter = window.storageAdapter || {};

  window.storageAdapter.getFotos = async function(){
    try{
      const res = await fetch(BASE + '/fotos-clientes');
      if(!res.ok) return null;
      const j = await res.json();
      return j && (j.data || j);
    }catch(e){
      console.warn('storageAdapter.getFotos failed', e);
      return null;
    }
  };

  window.storageAdapter.patchFotos = async function(key, value){
    try{
      await fetch(BASE + '/fotos-clientes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
    }catch(e){
      console.warn('storageAdapter.patchFotos failed', e);
    }
  };

  // Preload will fetch the full fotos map from the server and write it
  // into localStorage only if localStorage does not already have a value.
  // This avoids overwriting any local unsynced changes while preventing
  // flash-of-empty-state on pages that read localStorage immediately.
  window.storageAdapter.preload = async function(){
    try{
      if(typeof localStorage === 'undefined') return;
      if(localStorage.getItem('fotosClientes')) return; // already present
      const map = await window.storageAdapter.getFotos();
      if(map && typeof map === 'object'){
        try{ localStorage.setItem('fotosClientes', JSON.stringify(map)); }
        catch(e){ console.warn('storageAdapter.preload: localStorage write failed', e); }
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
          console.warn('[storage-adapter] firebaseClientes.list() falhou, fallback para localStorage', e);
        }
      }
    }catch(e){ /* ignore */ }

    // 1.b) Se for fotosClientes, tentar endpoint central
    try{
      if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__API_BASE__){
        const url = `${window.__API_BASE__.replace(/\/$/, '')}/fotos-clientes`;
        const r = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') } });
        if (r && r.ok){
          const j = await r.json();
          if(j && j.ok && j.data) return j.data;
        }
      }
    }catch(e){ console.warn('[storage-adapter] fetch /fotos-clientes failed', e); }

    // 2) Tentar ler do localStorage
    try{
      const raw = localStorage.getItem(key);
      const parsed = safeJSONParse(raw, null);
      if(parsed !== null) return parsed;
    }catch(e){
      console.warn('[storage-adapter] Erro lendo localStorage key=', key, e);
    }

    // 3) fallback
    return fallback;
  }

  // Async setter
  async function setJSON(key, value){
    try{
      // if there is a specific adapter to persist remotely, call it
      if(key === 'clientes' && global.firebaseClientes && typeof global.firebaseClientes.upsert === 'function'){
        try{ await global.firebaseClientes.upsert(value); }catch(e){ console.warn('[storage-adapter] firebaseClientes.upsert failed', e); }
      }
      // persist fotosClientes to backend endpoint if available
      if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__API_BASE__){
        try{
          const url = `${window.__API_BASE__.replace(/\/$/, '')}/fotos-clientes`;
          await fetch(url, { method: 'PUT', headers: { 'Content-Type':'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') }, body: JSON.stringify(value) });
        }catch(e){ console.warn('[storage-adapter] failed to PUT /fotos-clientes', e); }
      }
    }catch(e){}
    // always persist locally as fallback
    setJSONLocal(key, value);
  }

  // Partial update helper for keys that support PATCH (ex: fotosClientes)
  async function patchJSON(key, patch){
    try{
      if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__API_BASE__){
        try{
          const url = `${window.__API_BASE__.replace(/\/$/, '')}/fotos-clientes`;
          await fetch(url, { method: 'PATCH', headers: { 'Content-Type':'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') }, body: JSON.stringify(patch) });
          // update local cache too (best-effort): merge into existing cached value
          try{
            const raw = cache['fotosClientes'] || localStorage.getItem('fotosClientes');
            const obj = raw ? JSON.parse(raw) : {};
            if(patch && typeof patch === 'object'){
              if(patch.key && Object.prototype.hasOwnProperty.call(patch, 'value')){
                obj[patch.key] = patch.value;
              } else {
                Object.keys(patch).forEach(k => { obj[k] = patch[k]; });
              }
              cache['fotosClientes'] = JSON.stringify(obj);
              try{ localStorage.setItem('fotosClientes', JSON.stringify(obj)); }catch(e){}
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
    try{ const txt = JSON.stringify(value); localStorage.setItem(key, txt); cache[key] = txt; }catch(e){ console.warn('[storage-adapter] setJSONLocal failed', e); }
  }

  // Simple in-memory cache + preload to allow sync `getRaw` to return remote data
  const cache = Object.create(null);
  async function preload(key){
    try{
      // try remote getJSON first
      const remote = await getJSON(key, null);
      if(remote !== null && remote !== undefined){ cache[key] = JSON.stringify(remote); return; }
    }catch(e){}
    try{ const raw = localStorage.getItem(key); if(raw != null) cache[key] = raw; }catch(e){}
  }

  // override getRaw to consult cache first
  function getRaw(key){
    try{ if(cache && cache[key] !== undefined) return cache[key]; return localStorage.getItem(key); }catch(e){ return null; }
  }

  function setRaw(key, value){
    try{ localStorage.setItem(key, value); cache[key] = value; }catch(e){ /* ignore */ }
  }

  // Expor API mínima
  const storageAdapter = {
    getJSON,
    setJSON,
    patchJSON,
    getRaw,
    setRaw,
    preload,
    isLocalKey
  };
  
  // Conveniência: helper específico para fotosClientes (patch por chave)
  async function patchFotos(key, value){
    try{
      await patchJSON('fotosClientes', (Object.prototype.hasOwnProperty.call({ key, value }, 'key') ? { key, value } : { [key]: value }));
    }catch(e){ /* ignore */ }
  }
  
  // Expor API mínima
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
