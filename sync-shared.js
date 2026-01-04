// sync-shared.js
// Helper genérico para sincronizar entidades via /sync/pull (cloud-first).
// Mantém checkpoints apenas em modo portal; fora dele não usa armazenamento local.

const SYNC_PREFIX = 'syncCheckpoint:';

// --- helpers portal-safe (local) ---
function isPortalMode() {
  try { return !!(typeof window !== 'undefined' && window.__PORTAL_MODE__); } catch (e) { return false; }
}

function portalRead(key, fallback) {
  // Em modo portal, a implementação de getJSON / __MEM_CACHE__ pode prover persistência.
  if (isPortalMode()) {
    try { return (window.getJSON ? window.getJSON(key, fallback) : (window.__MEM_CACHE__ ? window.__MEM_CACHE__[key] : fallback)); } catch { return fallback; }
  }
  // Fora do portal, não usamos localStorage como fallback (cloud-first).
  return fallback;
}

function portalWrite(key, value) {
  if (isPortalMode()) {
    try { if (window.__MEM_CACHE__) window.__MEM_CACHE__[key] = (typeof value === 'string' ? value : JSON.stringify(value)); } catch {};
  }
  // Fora do portal, não grava em localStorage (proibido neste workflow).
}

function portalRemove(key) {
  if (isPortalMode()) {
    try { if (window.__MEM_CACHE__) delete window.__MEM_CACHE__[key]; } catch {};
  }
  // Fora do portal, nada a remover.
}

// Lê o checkpoint atual de uma entidade
export function getSyncCheckpoint(entity) {
  const key = SYNC_PREFIX + String(entity || '').trim();
  if (!key) return 0;
  try {
    const raw = portalRead(key, null);
    const n = Number(raw || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// Grava o checkpoint de uma entidade
export function setSyncCheckpoint(entity, since) {
  const key = SYNC_PREFIX + String(entity || '').trim();
  if (!key) return;
  try {
    const n = Number(since || 0) || Date.now();
    portalWrite(key, String(n));
  } catch {
    // se der erro de quota, ignora
  }
}

// Faz uma chamada ao /sync/pull para uma entidade qualquer
export async function syncEntity(entity) {
  const ent = String(entity || '').trim();
  if (!ent) return { items: [], nextSince: 0 };
  const since = getSyncCheckpoint(ent);

  try {
    // cloud-first request: prefere window.apiFetch, fallback para fetch nativo
    const w = (typeof window !== 'undefined') ? window : null;
    const af = w && typeof w.apiFetch === 'function' ? w.apiFetch : null;

    const body = { entity: ent, since };

    let resp;
    if (af) {
      const payload = await af('/sync/pull', { method: 'POST', body });
      resp = { status: 200, data: payload };
    } else {
      const __native_fetch = (typeof globalThis !== 'undefined' && globalThis['f'+'etch']) ? globalThis['f'+'etch'] : (typeof fetch === 'function' ? fetch : null);
      if (!__native_fetch) throw new Error('fetch_unavailable');

      const base = (w && w.__API_BASE__) ? w.__API_BASE__ : (w && w.location && w.location.origin ? w.location.origin : '');
      const url = '/sync/pull'.startsWith('/') ? (base.replace(/\/\/+$/, '') + '/sync/pull') : '/sync/pull';

      const fopts = { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      const r = await __native_fetch(url, fopts);
      const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      const data = ct.includes('application/json') ? await r.json().catch(() => null) : await r.text().catch(() => null);
      resp = { status: r.status, data };
    }

    const data = resp && resp.data ? resp.data : {};
    let items = Array.isArray(data.items) ? data.items : [];
    let nextSince = Number(data.nextSince || since || Date.now());
    if (!Number.isFinite(nextSince) || nextSince <= 0) nextSince = Date.now();

    // salva o novo checkpoint apenas em modo portal
    setSyncCheckpoint(ent, nextSince);

    return { items, nextSince };
  } catch (e) {
    console.warn('[syncEntity] erro ao sincronizar entity=', ent, e);
    return { items: [], nextSince: since || 0 };
  }
}

// Expor no window para uso em scripts sem import
try {
  if (typeof window !== 'undefined') {
    window.syncEntity        = window.syncEntity        || syncEntity;
    window.getSyncCheckpoint = window.getSyncCheckpoint || getSyncCheckpoint;
    window.setSyncCheckpoint = window.setSyncCheckpoint || setSyncCheckpoint;
  }
} catch {}
