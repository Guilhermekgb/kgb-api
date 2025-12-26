// Storage adapter (cópia pública) para uso pelas páginas estáticas.
// Mantém API mínima compatível com os helpers usados no frontend.
(function(global){
  'use strict';
  function safeJSONParse(txt, fallback=null){ try{ return JSON.parse(txt); }catch(e){ return fallback; } }
  const cache = Object.create(null);
  function getRaw(key){ try{ if(cache[key] !== undefined) return cache[key]; return localStorage.getItem(key); }catch(e){ return null; } }
  function setRaw(key, value){ try{ localStorage.setItem(key, value); cache[key] = value; }catch(e){} }
  async function getJSON(key, fallback=null){
    try{
      if(key === 'clientes' && global.firebaseClientes && typeof global.firebaseClientes.list === 'function'){
        try{ const res = await global.firebaseClientes.list(); if(res) return res; }catch(e){ /* ignore */ }
      }
    }catch(e){}

    // try backend fotos-clientes endpoint when requested
    try{
      if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__API_BASE__){
        try{
          const url = `${window.__API_BASE__.replace(/\/$/, '')}/fotos-clientes`;
          const r = await fetch(url, { method: 'GET', headers: { 'Content-Type':'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') } });
          if(r && r.ok){ const j = await r.json(); if(j && j.ok) return j.data; }
        }catch(e){ /* ignore */ }
      }
    }catch(e){}

    const raw = getRaw(key);
    return safeJSONParse(raw, fallback);
  }

  function setJSONLocal(key, value){ try{ setRaw(key, JSON.stringify(value)); }catch(e){} }

  async function setJSON(key, value){
    try{
      if(key === 'clientes' && global.firebaseClientes && typeof global.firebaseClientes.upsert === 'function'){
        try{ await global.firebaseClientes.upsert(value); }catch(e){}
      }
      if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__API_BASE__){
        try{
          const url = `${window.__API_BASE__.replace(/\/$/, '')}/fotos-clientes`;
          await fetch(url, { method: 'PUT', headers: { 'Content-Type':'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') }, body: JSON.stringify(value) });
        }catch(e){ /* ignore */ }
      }
    }catch(e){}
    setJSONLocal(key, value);
  }

  // Partial update helper for fotosClientes
  async function patchJSON(key, patch){
    try{
      if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__API_BASE__){
        try{
          const url = `${window.__API_BASE__.replace(/\/$/, '')}/fotos-clientes`;
          await fetch(url, { method: 'PATCH', headers: { 'Content-Type':'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') }, body: JSON.stringify(patch) });
          // local merge
            try{
              // Prefer preload shim then in-memory cache. Avoid synchronous localStorage reads here.
              let raw = null;
              if(typeof window !== 'undefined' && window.__FOTOS_CLIENTES_PRELOAD__){
                raw = JSON.stringify(window.__FOTOS_CLIENTES_PRELOAD__);
              } else if(typeof cache !== 'undefined' && cache['fotosClientes'] !== undefined){
                raw = cache['fotosClientes'];
              }
              const obj = raw ? JSON.parse(raw) : {};
              if(patch && typeof patch === 'object'){
                if(patch.key && Object.prototype.hasOwnProperty.call(patch, 'value')){
                  obj[patch.key] = patch.value;
                } else {
                  Object.keys(patch).forEach(k => { obj[k] = patch[k]; });
                }
                cache['fotosClientes'] = JSON.stringify(obj);
                // Do NOT persist fotosClientes to localStorage; keep it in-memory only.
              }
            }catch(e){}
            function getRaw(key){
              try{
                if(typeof cache !== 'undefined' && cache[key] !== undefined) return cache[key];
                if(key === 'fotosClientes' && typeof window !== 'undefined' && window.__FOTOS_CLIENTES_PRELOAD__) return JSON.stringify(window.__FOTOS_CLIENTES_PRELOAD__);
                return null;
              }catch(e){ return null; }
            }
          return;
        }catch(e){}
      }
    }catch(e){}
    // fallback to fetch/merge/put
    try{
      const existing = await getJSON(key, {});
      const merged = Object.assign({}, existing || {}, (patch && typeof patch === 'object') ? (
        (patch.key && Object.prototype.hasOwnProperty.call(patch, 'value')) ? { [patch.key]: patch.value } : patch
      ) : {});
      await setJSON(key, merged);
    }catch(e){}
  }

  async function preload(key){
    try{
      const remote = await getJSON(key, null);
      if(remote !== null && remote !== undefined){ cache[key] = JSON.stringify(remote); return; }
    }catch(e){}
    try{ const raw = localStorage.getItem(key); if(raw != null) cache[key] = raw; }catch(e){}
  }

  // Conveniência: helper específico para fotosClientes (patch por chave)
  async function patchFotos(key, value){
    try{
      // If value looks like a dataURL, upload it to the backend upload endpoint (POC)
      if(key === 'fotosClientes' && typeof value === 'string' && value.startsWith('data:') && typeof window !== 'undefined' && window.__API_BASE__){
        try{
          const url = `${window.__API_BASE__.replace(/\/$/, '')}/fotos-clientes/upload`;
          const body = { key, data: value };
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', 'x-tenant-id': (window.__TENANT_ID__||'default') }, body: JSON.stringify(body) });
          if(r && r.ok){ const j = await r.json(); if(j && j.ok && j.url){
            // replace value with returned URL and patch the map
            await patchJSON('fotosClientes', { key, value: j.url });
            return;
          }}
        }catch(e){ /* ignore upload errors and fallback to normal patch */ }
      }
      await patchJSON('fotosClientes', (Object.prototype.hasOwnProperty.call({ key, value }, 'key') ? { key, value } : { [key]: value }));
    }catch(e){ /* ignore */ }
  }

  const storageAdapter = { getRaw, setRaw, getJSON, setJSON, preload, patchJSON, patchFotos };
  try{ global.storageAdapter = storageAdapter; }catch(e){}
  if(typeof module !== 'undefined' && module.exports) module.exports = storageAdapter;
})(typeof window !== 'undefined' ? window : this);
