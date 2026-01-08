// api-config.js — carregue este script antes dos demais scripts do frontend.
// Força API em produção / Netlify: detecta host e aponta para o backend no Render.
(function () {
	const host = (location.hostname || '').toLowerCase();

	// Se estiver no Netlify, usa a API do Render
	if (host.endsWith('netlify.app')) {
		window.__API_BASE__ = 'https://kgb-api-v2.onrender.com';
		console.log('[api-config] Netlify detectado -> __API_BASE__ =', window.__API_BASE__);
		return;
	}

	// Caso contrário, mantém o comportamento padrão (não sobrescreve)
	window.__API_BASE__ = window.__API_BASE__ || window.location.origin;
})();
