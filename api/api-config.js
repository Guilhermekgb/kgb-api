// api/api-config.js
(() => {
  const RENDER_API = "https://kgb-api.onrender.com";

  // Detecta Netlify (domínio padrão) e também seu domínio custom
  const host = (location.hostname || "").toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local");

  const isNetlify =
    host.endsWith(".netlify.app") ||
    host === "kgbprobuffet.netlify.app";

  // Preferência de override só em LOCAL (pra não “quebrar” produção sem querer)
  let localOverride = null;
  try {
    localOverride =
      localStorage.getItem("KGB_API_BASE_OVERRIDE") ||
      sessionStorage.getItem("KGB_API_BASE_OVERRIDE");
  } catch (_) {}

  // Regra final:
  // - Em Netlify: SEMPRE Render
  // - Em Local: override se existir, senão Render (você já vinha usando Render no localhost)
  // - Outros hosts: mantém Render por segurança (pode ajustar depois se quiser)
  const resolved =
    isNetlify ? RENDER_API : (isLocal ? (localOverride || RENDER_API) : RENDER_API);

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
