// api/routes.js - compat/shim (same-origin)
export async function handleRequest(path, opts = {}) {
	const method = (opts.method || 'GET').toUpperCase();
	let body = opts.body ?? undefined;

	// evita enviar body em GET/HEAD
	if (method === 'GET' || method === 'HEAD') body = undefined;

	// usa apiFetch se existir
	if (typeof window !== 'undefined' && window.apiFetch) {
		const callOpts = { method };
		if (body !== undefined) callOpts.body = body;
		const data = await window.apiFetch(path, callOpts);
		return { status: 200, data };
	}

	const base =
		(window.__API_BASE__ || '') ||
		(typeof window.__getApiBase === 'function' ? window.__getApiBase() : '') ||
		(window.location?.origin || '');

	const url = String(path).startsWith('http') ? path : (base + path);
	const fetchOpts = { method, credentials: 'include' };
	if (body !== undefined) {
		fetchOpts.headers = { 'Content-Type': 'application/json' };
		fetchOpts.body = JSON.stringify(body);
	}
	const r = await fetch(url, fetchOpts);
	const txt = await r.text();
	let data;
	try { data = JSON.parse(txt); } catch { data = txt; }
	return { status: r.status, data };
}
