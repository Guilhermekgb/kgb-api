// api/routes.js - compat/shim (same-origin)
export async function handleRequest(path, opts = {}) {
	const method = (opts.method || 'GET').toUpperCase();
	const body = opts.body ?? null;

	// usa apiFetch se existir
	if (typeof window !== 'undefined' && window.apiFetch) {
		const data = await window.apiFetch(path, { method, body });
		return { status: 200, data };
	}

	const base =
		(window.__API_BASE__ || '') ||
		(typeof window.__getApiBase === 'function' ? window.__getApiBase() : '') ||
		(window.location?.origin || '');

	const url = String(path).startsWith('http') ? path : (base + path);
	const r = await fetch(url, {
		method,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	const txt = await r.text();
	let data;
	try { data = JSON.parse(txt); } catch { data = txt; }
	return { status: r.status, data };
}
