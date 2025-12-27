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
  const url = withKey(`${baseDocUrl()}/${colPath()}`);
  const r = await fetch(url, { method: "GET" });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Falha ao listar no Firestore");
  const docs = data.documents || [];
  return docs.map(unwrapDoc);
}

async function fsCreate(obj){
  const id = obj?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const payload = wrapDoc({ ...obj, id, createdAt: obj?.createdAt || now, updatedAt: now });

  const url = withKey(`${baseDocUrl()}/${colPath()}?documentId=${encodeURIComponent(id)}`);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Falha ao criar no Firestore");
  return unwrapDoc(data);
}
async function fsUpsert(obj){
  const id = obj?.id || crypto.randomUUID();
  const now = new Date().toISOString();

  // PATCH no documento: cria se existir? (com updateMask e "currentDocument" evita bagunça)
  const payload = wrapDoc({ ...obj, id, createdAt: obj?.createdAt || now, updatedAt: now });

  const url = withKey(`${baseDocUrl()}/${colPath()}/${encodeURIComponent(id)}?updateMask.fieldPaths=json&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=createdAt`);
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Falha ao salvar no Firestore");
  return unwrapDoc(data);
}

async function fsGetOne(id){
  const url = withKey(`${baseDocUrl()}/${colPath()}/${encodeURIComponent(id)}`);
  const r = await fetch(url, { method: "GET" });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Falha ao obter cliente no Firestore");
  return unwrapDoc(data);
}

async function fsDelete(id){
  const url = withKey(`${baseDocUrl()}/${colPath()}/${encodeURIComponent(id)}`);
  const r = await fetch(url, { method: "DELETE" });
  if (!r.ok) {
    const data = await r.json().catch(()=> ({}));
    throw new Error(data?.error?.message || "Falha ao excluir no Firestore");
  }
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

// --- Adapter: tenta Firestore, depois API backend, por fim localStorage ---
function getApiBase() {
  // Prefer explicit runtime config, then localStorage. Em dev (localhost or file:),
  // assume backend em http://localhost:3333 para facilitar testes locais.
  const explicit = window.__API_BASE__ || (localStorage.getItem('API_BASE') || '');
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
  const t = localStorage.getItem('token') || sessionStorage.getItem('token');
  return t ? { Authorization: 'Bearer ' + t } : {};
}

async function tryApiList() {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const url = (base.replace(/\/$/, '')) + '/clientes';
  const r = await fetch(url, { method: 'GET', headers: { ...authHeaders() } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'API list failed');
  return j.data || [];
}

async function tryApiGet(id) {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const url = (base.replace(/\/$/, '')) + '/clientes/' + encodeURIComponent(id);
  const r = await fetch(url, { method: 'GET', headers: { ...authHeaders() } });
  if (r.status === 404) throw new Error('notfound');
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'API get failed');
  return j.data;
}

async function tryApiCreate(obj) {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const url = (base.replace(/\/$/, '')) + '/clientes';
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(obj) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'API create failed');
  return j.data;
}

async function tryApiUpsert(obj) {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const id = obj?.id;
  if (id) {
    const url = (base.replace(/\/$/, '')) + '/clientes/' + encodeURIComponent(id);
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(obj) });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || 'API put failed');
    return j.data;
  }
  return tryApiCreate(obj);
}

async function tryApiDelete(id) {
  const base = getApiBase();
  if (!base) throw new Error('API base ausente');
  const url = (base.replace(/\/$/, '')) + '/clientes/' + encodeURIComponent(id);
  const r = await fetch(url, { method: 'DELETE', headers: { ...authHeaders() } });
  if (!r.ok) {
    const j = await r.json().catch(()=> ({}));
    throw new Error(j?.error || 'API delete failed');
  }
  return { ok: true };
}

// Fallback localStorage helpers
function lsList() { try { return JSON.parse(localStorage.getItem('clientes')||'[]') || []; } catch { return []; } }
function lsSaveList(arr) { try { localStorage.setItem('clientes', JSON.stringify(arr||[])); } catch {} }

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

