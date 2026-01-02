// sistema-buffet/api/firebase-clientes.js
function getCfg(){
  const cfg = window.__FIREBASE_CONFIG__;
  if (!cfg || !cfg.projectId || !cfg.apiKey) {
    throw new Error("Firebase config ausente. Verifique api/firebase-config.js");
  }
  return cfg;
}

function baseDocUrl(){
  const { projectId } = getCfg();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function withKey(url){
  const { apiKey } = getCfg();
  const u = new URL(url);
  u.searchParams.set("key", apiKey);
  return u.toString();
}

function tenantId(){
  // Sem multi-empresa por enquanto:
  return "default";
}

// --- vamos salvar o cliente dentro de:
// tenants/{tenantId}/clientes/{id}
function colPath(){
  return `tenants/${tenantId()}/clientes`;
}

function wrapDoc(obj){
  // Guarda tudo em "json" (string) -> mais simples e não quebra tipos.
  const now = new Date().toISOString();
  return {
    fields: {
      json: { stringValue: JSON.stringify(obj || {}) },
      updatedAt: { stringValue: obj?.updatedAt || now },
      createdAt: { stringValue: obj?.createdAt || now },
    }
  };
}

function unwrapDoc(doc){
  const f = doc?.fields || {};
  const json = f.json?.stringValue || "{}";
  let obj = {};
  try { obj = JSON.parse(json); } catch {}
  // id do firestore:
  const name = doc?.name || "";
  const id = name.split("/").pop();
  return { id, ...obj };
}

async function fsGetCollection(){
  // Migrado: usar endpoint backend `/clientes` via apiFetch
  const j = await window.apiFetch('/clientes', { method: 'GET', headers: { ...authHeaders() } });
  return (j && j.data) ? j.data : [];
}

async function fsCreate(obj){
  // Criar via backend
  const j = await window.apiFetch('/clientes', { method: 'POST', body: obj, headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  return j && j.data ? j.data : j;
}
async function fsUpsert(obj){
  // Upsert via backend: PUT /clientes/:id ou POST
  const id = obj?.id;
  if (id) {
    const j = await window.apiFetch('/clientes/' + encodeURIComponent(id), { method: 'PUT', body: obj, headers: { 'Content-Type': 'application/json', ...authHeaders() } });
    return j && j.data ? j.data : j;
  }
  return await fsCreate(obj);
}

async function fsGetOne(id){
  const j = await window.apiFetch('/clientes/' + encodeURIComponent(id), { method: 'GET', headers: { ...authHeaders() } });
  return j && j.data ? j.data : null;
}

async function fsDelete(id){
  await window.apiFetch('/clientes/' + encodeURIComponent(id), { method: 'DELETE', headers: { ...authHeaders() } });
  return { ok: true };
}

export const firebaseClientes = {
  list: fsGetCollection,
  get: fsGetOne,
  create: fsCreate,
  upsert: fsUpsert,
  remove: fsDelete,
};

window.firebaseClientes = firebaseClientes;

// --- Adapter: tenta Firestore, depois API backend, por fim fallback em memória ---
function getApiBase() {
  // Prefer explicit runtime config only. NÃO usar armazenamento local como fonte de verdade.
  // Em dev (localhost or file:), assume backend em http://localhost:3333 para facilitar testes locais.
  const explicit = window.__API_BASE__ || '';
  if (explicit) return explicit;
  try {
    const host = (window.location && window.location.hostname) ? window.location.hostname : '';
    const protocol = (window.location && window.location.protocol) ? window.location.protocol : '';
    if (host === 'localhost' || host === '127.0.0.1' || protocol === 'file:') {
      return 'http://localhost:3333';
    }
  } catch (e) {
    // noop
  }
  return '';
}
function authHeaders() {
  // Não usar armazenamento local/armazenamento de sessão aqui; preferir cookie-based auth (kgb_token) ou vazio.
  try {
    const cookie = (document && document.cookie) ? document.cookie : '';
    const m = cookie.match(/(?:^|; )kgb_token=([^;]+)/);
    if (m) return { Authorization: 'Bearer ' + decodeURIComponent(m[1]) };
  } catch (e) {}
  return {};
}

async function tryApiList() {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const url = (base.replace(/\/$/, '')) + '/clientes';
  const j = await window.apiFetch(url, { method: 'GET', headers: { ...authHeaders() } });
  if (!j) throw new Error('API list failed');
  return j.data || [];
}

async function tryApiGet(id) {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const url = (base.replace(/\/$/, '')) + '/clientes/' + encodeURIComponent(id);
  const j = await window.apiFetch(url, { method: 'GET', headers: { ...authHeaders() } });
  if (!j) throw new Error('notfound');
  return j.data;
}

async function tryApiCreate(obj) {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const url = (base.replace(/\/$/, '')) + '/clientes';
  const j = await window.apiFetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: obj });
  if (!j) throw new Error('API create failed');
  return j.data;
}

async function tryApiUpsert(obj) {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const id = obj?.id;
  if (id) {
    const url = (base.replace(/\/$/, '')) + '/clientes/' + encodeURIComponent(id);
    const j = await window.apiFetch(url, { method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: obj });
    if (!j) throw new Error('API put failed');
    return j.data;
  }
  return tryApiCreate(obj);
}

async function tryApiDelete(id) {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const url = (base.replace(/\/$/, '')) + '/clientes/' + encodeURIComponent(id);
  const j = await window.apiFetch(url, { method: 'DELETE', headers: { ...authHeaders() } });
  if (!j) throw new Error('API delete failed');
  return { ok: true };
}

// Fallback in-memory helpers (não usar armazenamento local/armazenamento de sessão como fonte de verdade)
function lsList() { try { globalThis.__MEM_DB__ = globalThis.__MEM_DB__ || {}; return globalThis.__MEM_DB__.clientes || []; } catch { return []; } }
function lsSaveList(arr) { try { globalThis.__MEM_DB__ = globalThis.__MEM_DB__ || {}; globalThis.__MEM_DB__.clientes = arr || []; } catch {} }

// Wrap original exports to attempt multi-backend
const original = window.firebaseClientes;
window.firebaseClientes = {
  list: async function(){
    try { return await original.list(); } catch (e) {
      try { return await tryApiList(); } catch (e2) { return lsList(); }
    }
  },
  get: async function(id){
    try { return await original.get(id); } catch (e) {
      try { return await tryApiGet(id); } catch (e2) { return (lsList().find(c=>String(c.id)===String(id)) || null); }
    }
  },
  create: async function(obj){
    try { return await original.create(obj); } catch (e) {
      try { return await tryApiCreate(obj); } catch (e2) {
        const arr = lsList(); const id = String(Date.now()); const novo = { id, ...obj }; arr.push(novo); lsSaveList(arr); return novo;
      }
    }
  },
  upsert: async function(obj){
    try { return await original.upsert(obj); } catch (e) {
      try { return await tryApiUpsert(obj); } catch (e2) {
        const arr = lsList(); const id = String(obj?.id || Date.now());
        const idx = arr.findIndex(c=>String(c.id)===String(id));
        const now = new Date().toISOString();
        const novo = { id, ...obj, updatedAt: now, createdAt: arr[idx]?.createdAt || now };
        if (idx === -1) arr.push(novo); else arr[idx] = novo;
        lsSaveList(arr);
        return novo;
      }
    }
  },
  remove: async function(id){
    try { return await original.remove(id); } catch (e) {
      try { return await tryApiDelete(id); } catch (e2) {
        const arr = lsList(); const restante = arr.filter(c=>String(c.id)!==String(id)); lsSaveList(restante); return { ok: true };
      }
    }
  }
};
