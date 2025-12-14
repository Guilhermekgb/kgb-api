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
    const obj = { localStorage: {}, sessionStorage: {}, meta: {} };

    // Captura localStorage
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      try { obj.localStorage[key] = JSON.parse(window.localStorage.getItem(key)); }
      catch (e) { obj.localStorage[key] = window.localStorage.getItem(key); }
    }

    // Captura sessionStorage
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      try { obj.sessionStorage[key] = JSON.parse(window.sessionStorage.getItem(key)); }
      catch (e) { obj.sessionStorage[key] = window.sessionStorage.getItem(key); }
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

        const res = await fetch(url, { method: 'POST', headers, body: json, signal: controller.signal });
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
