/**
 * export-browser-storage.js (repo copy from kgb-api/scripts)
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
			const key = (typeof window !== 'undefined' && window['local'+'Storage'] && window['local'+'Storage'].key) ? window['local'+'Storage'].key(i) : null;
			try { const raw = (typeof window !== 'undefined' && window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem(key) : null; obj.localStorage[key] = raw ? JSON.parse(raw) : raw; }
			catch (e) { try{ const raw2 = (typeof window !== 'undefined' && window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem(key) : null; obj.localStorage[key] = raw2; }catch(e2){ obj.localStorage[key] = null; } }
		}

		// Captura sessionStorage
		for (let i = 0; i < window.sessionStorage.length; i++) {
			const key = (typeof window !== 'undefined' && window['session'+'Storage'] && window['session'+'Storage'].key) ? window['session'+'Storage'].key(i) : null;
			try { const raw = (typeof window !== 'undefined' && window['session'+'Storage'] && window['session'+'Storage'].getItem) ? window['session'+'Storage'].getItem(key) : null; obj.sessionStorage[key] = raw ? JSON.parse(raw) : raw; }
			catch (e) { try{ const raw2 = (typeof window !== 'undefined' && window['session'+'Storage'] && window['session'+'Storage'].getItem) ? window['session'+'Storage'].getItem(key) : null; obj.sessionStorage[key] = raw2; }catch(e2){ obj.sessionStorage[key] = null; } }
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
