/**
 * export-browser-storage.js (repo copy)
 *
 * Snippet para rodar no console do navegador.
 * Cria um arquivo JSON com `localStorage` + `sessionStorage` e opcionalmente
 * envia o dump para o endpoint `/api/storage-backup` usando header
 * `x-backup-token` (se o servidor usar `BACKUP_UPLOAD_TOKEN`).
 */

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
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        try { obj.localStorage[key] = JSON.parse(window.localStorage.getItem(key)); }
        catch (e) { obj.localStorage[key] = window.localStorage.getItem(key); }
      }
    }

    // Captura sessionStorage (se houver memStore específico, usa; caso contrário, acessa sessionStorage)
    if (isPortalMode() && window.__MEM_SESSION__){
      try{ for (const key of Object.keys(window.__MEM_SESSION__||{})){ obj.sessionStorage[key] = window.__MEM_SESSION__[key]; } }catch(e){}
    } else {
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        try { obj.sessionStorage[key] = JSON.parse(window.sessionStorage.getItem(key)); }
        catch (e) { obj.sessionStorage[key] = window.sessionStorage.getItem(key); }
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

    // Para enviar automaticamente sem prompt, chame: tryUpload('/api/storage-backup', '<SEU_TOKEN>')
    // Para enviar com prompt interativo, descomente as linhas abaixo:
    // (async () => {
    //   const token = prompt('Backup token (ou deixe em branco para usar Authorization):');
    //   await tryUpload('/api/storage-backup', token && token.trim() ? token.trim() : null);
    // })();

    return obj; // retorna o objeto para inspeção no console
  }
  catch(err) {
    console.error('Erro ao exportar storage:', err);
    return null;
  }
})();
