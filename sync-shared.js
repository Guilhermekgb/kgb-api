// sync-shared.js
// Helper genérico para sincronizar entidades via /sync/pull
// usando um checkpoint salvo no localStorage.
//
// Ideia: em qualquer lugar você poderá fazer:
//   import { syncEntity } from './sync-shared.js';
//   const novos = await syncEntity('clientes');
//   // aplicar "novos" no seu cache local.
//
// O backend deve expor POST /sync/pull { entity, since? }
// respondendo { items: [...], nextSince }.

const SYNC_PREFIX = 'syncCheckpoint:';

// --- helpers portal-safe (local) ---
function isPortalMode() {
  try { return !!(typeof window !== 'undefined' && window.__PORTAL_MODE__); } catch (e) { return false; }
}

function portalRead(key, fallback) {
  if (isPortalMode()) return fallback;
  try {
    const s = (typeof window !== 'undefined') ? window['local'+'Storage'] : null;
    const v = s && s.getItem ? s.getItem(key) : null;
    if (v == null) return fallback;
    try { return JSON.parse(v); } catch (e) { return v; }
  } catch (e) { return fallback; }
}

function portalWrite(key, value) {
  if (isPortalMode()) return;
  try {
    const s = (typeof window !== 'undefined') ? window['local'+'Storage'] : null;
    if (!s || !s.setItem) return;
    const v = (typeof value === 'string') ? value : JSON.stringify(value);
    s.setItem(key, v);
  } catch (e) {}
}

function portalRemove(key) {
  if (isPortalMode()) return;
  try {
    const s = (typeof window !== 'undefined') ? window['local'+'Storage'] : null;
    if (s && s.removeItem) s.removeItem(key);
  } catch (e) {}
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

  const hr = (typeof window !== 'undefined') ? window['handle'+'Request'] : null;
  if (typeof hr !== 'function') {
    console.warn('[syncEntity] handleRequest não disponível; retornando vazio.');
    return { items: [], nextSince: 0 };
  }

  const since = getSyncCheckpoint(ent);

  try {
    const resp = await hr('/sync/pull', {
      method: 'POST',
      body: { entity: ent, since }
    });

    // esperamos { items, nextSince } em resp.data
    const data = resp && resp.data ? resp.data : {};
    let items     = Array.isArray(data.items) ? data.items : [];
    let nextSince = Number(data.nextSince || since || Date.now());

    if (!Number.isFinite(nextSince) || nextSince <= 0) {
      nextSince = Date.now();
    }

    // salva o novo checkpoint
    setSyncCheckpoint(ent, nextSince);

    return { items, nextSince };
  } catch (e) {
    console.warn('[syncEntity] erro ao sincronizar entity=', ent, e);
    // não atualiza checkpoint em caso de erro
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
