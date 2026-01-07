// api-config.js (cloud-first / netlify-safe)
(() => {
  const host = window.location.hostname || "";
  const isNetlify = host.endsWith(".netlify.app") || host.includes("netlify");

  const API = isNetlify
    ? "https://kgb-api.onrender.com"
    : window.location.origin;

  // Se alguém travou __API_BASE__ como read-only, a gente recria como writable
  try { delete window.__API_BASE__; } catch (e) {}

  try {
    Object.defineProperty(window, "__API_BASE__", {
      value: API,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    // fallback se o browser não deixar defineProperty
    window.__API_BASE__ = API;
  }

  // opcional: compat
  window.API_BASE = API;

  console.log("[KGB] api-config loaded, __API_BASE__ =", window.__API_BASE__);
})();
