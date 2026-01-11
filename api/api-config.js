// api/api-config.js
(() => {
  const RENDER_API = "https://kgb-api-v2.onrender.com";
  const LOCAL_API = "http://127.0.0.1:3333";

  // Detecta Netlify (domínio padrão) e também seu domínio custom
  const host = (location.hostname || "").toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local");

  const isNetlify =
    host.endsWith(".netlify.app") ||
    host === "kgbprobuffet.netlify.app";

  // Preferência de override: respeitar localStorage 'API_BASE' when present (useful for Live Server)
  let storageOverride = null;
  try {
    storageOverride = localStorage.getItem('API_BASE') || sessionStorage.getItem('API_BASE');
  } catch (_) { storageOverride = null; }

  // Regra final: se estivermos em localhost, apontar por padrão para RENDER_API
  // mas respeitar override salvo em localStorage('API_BASE'). Em produção/netlify,
  // usar RENDER_API.
  let resolved = RENDER_API;
  if (isLocal) {
    resolved = storageOverride || RENDER_API;
    // persiste o override para manter comportamento estável durante o desenvolvimento
    try { if (!storageOverride) localStorage.setItem('API_BASE', resolved); } catch (e) {}
  } else {
    resolved = RENDER_API;
  }

  // Fonte única (nossa) — sempre editável
  window.__KGB_API_BASE__ = resolved;

  // Compatibilidade com legado: tenta setar __API_BASE__ também.
  // Se estiver read-only, não falha: só loga.
  try {
    // Se não existe, define com writable/configurable
    if (!Object.prototype.hasOwnProperty.call(window, "__API_BASE__")) {
      Object.defineProperty(window, "__API_BASE__", {
        value: resolved,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      // Se existe e dá pra setar, seta
      window.__API_BASE__ = resolved;
    }
  } catch (err) {
    console.warn("[KGB] __API_BASE__ é read-only; usando __KGB_API_BASE__ =", resolved, err);
  }

  console.log("[KGB] api-config loaded:", {
    host,
    isNetlify,
    isLocal,
    __KGB_API_BASE__: window.__KGB_API_BASE__,
    __API_BASE__: (() => {
      try { return window.__API_BASE__; } catch (_) { return "(unreadable)"; }
    })(),
  });
})();
