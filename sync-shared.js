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
    // cloud-first: exigir window.apiFetch; se ausente, lançar api_unavailable
    const w = (typeof window !== 'undefined') ? window : null;
    if (!w || typeof w.apiFetch !== 'function') throw new Error('api_unavailable');

    const body = { entity: ent, since };
    const path = '/sync/pull';
    const finalPath = (w.__API_BASE__ && String(path).startsWith('/')) ? (String(w.__API_BASE__).replace(/\/\/+$/, '') + path) : path;

    // Chama window.apiFetch e assume que ele retorna o payload (JSON já parseado) ou lança em caso de erro
    const payload = await w.apiFetch(finalPath, { method: 'POST', body });
    const resp = { status: 200, data: payload };

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
