/* Legacy copy from scripts/export-browser-storage.js */
(function exportBrowserStorage(){
  try {
    // Phase1: usar memStore em modo portal quando disponível
    function isPortalMode(){ return !!(window.__KGB_PORTAL_MODE__ || window.PORTAL || window.__PORTAL__ || (window.__KGB_MEM__ && window.__KGB_MEM__.isPortalMode && window.__KGB_MEM__.isPortalMode())); }
    function memGet(key){ try{ if (window.__KGB_MEM__ && window.__KGB_MEM__.getJSON) return window.__KGB_MEM__.getJSON(key, undefined); }catch(e){} return undefined; }
    function memKeys(){ try{ return Object.keys(window.__MEM_CACHE__ || {}); }catch(e){ return []; } }

    const obj = { localStorage: {}, sessionStorage: {}, meta: {} };

    // Captura localStorage (em portal, prefere memStore)
    if (isPortalMode()){
      const keys = memKeys();
      for (const key of keys){
        try{
          const v = memGet(key);
          obj.localStorage[key] = v === undefined ? null : v;
        }catch(e){ obj.localStorage[key] = null; }
      }
    } else {
      for (let i = 0; i < ((typeof window !== 'undefined' && window['local'+'Storage']) ? window['local'+'Storage'].length : 0); i++) {
        const key = (typeof window !== 'undefined' && window['local'+'Storage'] && window['local'+'Storage'].key) ? window['local'+'Storage'].key(i) : null;
        try { const raw = (typeof window !== 'undefined' && window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem(key) : null; obj.localStorage[key] = raw ? JSON.parse(raw) : raw; }
        catch (e) { try{ const raw2 = (typeof window !== 'undefined' && window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem(key) : null; obj.localStorage[key] = raw2; }catch(e2){ obj.localStorage[key] = null; } }
      }
    }

    // Captura sessionStorage (se houver memStore específico, usa; caso contrário, acessa sessionStorage)
    if (isPortalMode() && window.__MEM_SESSION__){
      try{ for (const key of Object.keys(window.__MEM_SESSION__||{})){ obj.sessionStorage[key] = window.__MEM_SESSION__[key]; } }catch(e){}
    } else {
      for (let i = 0; i < ((typeof window !== 'undefined' && window['session'+'Storage']) ? window['session'+'Storage'].length : 0); i++) {
        const key = (typeof window !== 'undefined' && window['session'+'Storage'] && window['session'+'Storage'].key) ? window['session'+'Storage'].key(i) : null;
        try { const raw = (typeof window !== 'undefined' && window['session'+'Storage'] && window['session'+'Storage'].getItem) ? window['session'+'Storage'].getItem(key) : null; obj.sessionStorage[key] = raw ? JSON.parse(raw) : raw; }
        catch (e) { try{ const raw2 = (typeof window !== 'undefined' && window['session'+'Storage'] && window['session'+'Storage'].getItem) ? window['session'+'Storage'].getItem(key) : null; obj.sessionStorage[key] = raw2; }catch(e2){ obj.sessionStorage[key] = null; } }
      }
    }

    obj.meta.url = window.location.href;
    obj.meta.datetime = new Date().toISOString();

    const json = JSON.stringify(obj, null, 2);

    // Cria download
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = 'browser-storage-backup-' + (new Date()).toISOString().replace(/[:.]/g,'-') + '.json';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    console.info('Exportado storage para arquivo:', filename);

    async function tryUpload(url, token) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['x-backup-token'] = token;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        // Em portal, use window.apiFetch quando disponível (cloud-only). Fora do portal, fallback para fetch.
        let res;
        if (isPortalMode() && typeof window.apiFetch === 'function'){
          res = await window.apiFetch(url, { method: 'POST', headers, body: json, signal: controller.signal });
        } else {
          res = await fetch(url, { method: 'POST', headers, body: json, signal: controller.signal });
        }
        clearTimeout(timeout);
        if (!res.ok) {
          console.warn('[export-browser-storage] servidor respondeu com status', res.status);
          try { const txt = await res.text(); console.debug(txt); } catch(e){}
          return false;
        }
        console.info('[export-browser-storage] backup enviado com sucesso para', url);
        return true;
      } catch (err) {
        if (err.name === 'AbortError') console.warn('[export-browser-storage] timeout no upload');
        else console.error('[export-browser-storage] erro ao enviar backup:', err);
        return false;
      }
    }

    return obj;
  }
  catch(err) {
    console.error('Erro ao exportar storage:', err);
    return null;
  }
})();
