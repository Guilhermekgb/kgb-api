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
    }catch(e){}
    // always persist locally as fallback
    setJSONLocal(key, value);
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
    getRaw,
    setRaw,
    preload,
    isLocalKey
  };

  // Torna disponível como `window.storageAdapter`
  try{ global.storageAdapter = storageAdapter; }catch(e){ /* ignore */ }

  // Também exporta para módulos UMD-ish
  if(typeof module !== 'undefined' && module.exports){ module.exports = storageAdapter; }

})(typeof window !== 'undefined' ? window : this);
