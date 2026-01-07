// Stub api/remote-adapter — compatibilidade mínima
window.remoteAdapter = window.remoteAdapter || {};
window.remoteAdapter.enabled = false;
window.remoteAdapter.fetch = async function(){ throw new Error('remote-adapter disabled'); };
console.warn('[remote-adapter] stub carregado (disabled)');
