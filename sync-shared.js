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

// Lê o checkpoint atual de uma entidade
export function getSyncCheckpoint(entity) {
  const key = SYNC_PREFIX + String(entity || '').trim();
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(key);
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
    localStorage.setItem(key, String(n));
  } catch {
    // se der erro de quota, ignora
  }
}

// Faz uma chamada ao /sync/pull para uma entidade qualquer
export async function syncEntity(entity) {
  const ent = String(entity || '').trim();
  if (!ent) return { items: [], nextSince: 0 };

  if (typeof window === 'undefined' || typeof window.handleRequest !== 'function') {
    console.warn('[syncEntity] handleRequest não disponível; retornando vazio.');
    return { items: [], nextSince: 0 };
  }

  const since = getSyncCheckpoint(ent);

  try {
    const resp = await window.handleRequest('/sync/pull', {
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
