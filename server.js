// server.js — Backend mínimo para financeiro/assinaturas + backups da Área do Cliente
// deps base: npm i express better-sqlite3 dotenv cors
// extras usados aqui: npm i firebase-admin fast-csv

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const Database = require('better-sqlite3');
const fs       = require('fs');
const path     = require('path');
const csv      = require('fast-csv');

// ========================= Config (.env) =========================
const PORT           = Number(process.env.PORT || 3001);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'troque-isto-no-.env';
const DB_PATH        = process.env.SQLITE_FILE || './data.db';

// Aceita ALLOWED_ORIGINS ou ALLOWLIST_ORIGINS (fallback)
const ALLOWLIST = String(process.env.ALLOWED_ORIGINS || process.env.ALLOWLIST_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// ========================= Banco de Dados (SQLite) =========================
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Tabelas
db.exec(`
CREATE TABLE IF NOT EXISTS eventos (
  id TEXT PRIMARY KEY,
  valor_contrato_cents INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS parcelas (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  descricao TEXT,
  valor_cents INTEGER NOT NULL,
  vencimento_iso TEXT,
  status TEXT CHECK(status IN ('pendente','pago','atrasado')) DEFAULT 'pendente',
  comprovante_url TEXT,
  pago_em_iso TEXT,
  UNIQUE(id),
  FOREIGN KEY(event_id) REFERENCES eventos(id)
);
CREATE TABLE IF NOT EXISTS recebimentos (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  descricao TEXT,
  valor_cents INTEGER NOT NULL,
  pago_em_iso TEXT,
  comprovante_url TEXT,
  origem TEXT,
  UNIQUE(id),
  FOREIGN KEY(event_id) REFERENCES eventos(id)
);
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  tipo TEXT CHECK(tipo IN ('contrato','adendo')) NOT NULL,
  motivo TEXT,
  url TEXT,
  status_assinatura TEXT CHECK(status_assinatura IN ('assinado','pendente')) DEFAULT 'pendente',
  assinado_em_iso TEXT,
  UNIQUE(id),
  FOREIGN KEY(event_id) REFERENCES eventos(id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_iso TEXT NOT NULL,
  actor TEXT,
  entity TEXT,
  action TEXT,
  payload TEXT
);
`);
db.exec(`
CREATE INDEX IF NOT EXISTS idx_parcelas_event      ON parcelas(event_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_venc       ON parcelas(vencimento_iso);
CREATE INDEX IF NOT EXISTS idx_parcelas_pago       ON parcelas(pago_em_iso);
CREATE INDEX IF NOT EXISTS idx_receb_event         ON recebimentos(event_id);
CREATE INDEX IF NOT EXISTS idx_receb_pago          ON recebimentos(pago_em_iso);
`);

// ========================= Firebase Admin (Storage) =========================
const admin = require('firebase-admin');

// deixa o Firebase/Storage OPCIONAL até você preencher o .env
const hasFirebaseCreds =
  !!process.env.FIREBASE_PROJECT_ID &&
  !!process.env.FIREBASE_CLIENT_EMAIL &&
  !!process.env.FIREBASE_PRIVATE_KEY &&
  !!process.env.FIREBASE_STORAGE_BUCKET;

let bucket = null;
if (hasFirebaseCreds) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
  }
    bucket = admin.storage().bucket();
  console.log('[INFO] Firebase Storage conectado ao bucket:', process.env.FIREBASE_STORAGE_BUCKET);

} else {
  console.log('[INFO] Firebase/Storage desativado (variáveis ausentes no .env).');
}


// ========================= App / CORS =========================
const app = express();

app.use(cors({
  origin(origin, cb) {
    // Permite ferramentas locais (sem Origin) e as origens na allowlist
    if (!origin) return cb(null, true);
    if (ALLOWLIST.length === 0 || ALLOWLIST.includes(origin)) return cb(null, true);
    return cb(new Error('CORS bloqueado para ' + origin));
  },
  credentials: true
}));

// ========================= PATCH F.0 — bases, storage utils, journal =========================
const DATA_DIR = path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}


function loadJSON(file, fb) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch { return fb; }
}
function saveJSON(file, obj) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(obj, null, 2), 'utf8');
}

// Journal do sync (lista de mudanças em arquivo)
const JOURNAL_FILE = 'journal.json';
if (!fs.existsSync(path.join(DATA_DIR, JOURNAL_FILE))) saveJSON(JOURNAL_FILE, []);

// Auditoria (log em arquivo para endpoints /audit/log e .csv)
const AUDIT_FILE = 'audit.json';
if (!fs.existsSync(path.join(DATA_DIR, AUDIT_FILE))) saveJSON(AUDIT_FILE, []);

// Rev monotônico (last-write-wins)
function nextRev() {
  return Date.now();
}

// Auditoria helper (arquivo)
function writeAudit(entry) {
  const all = loadJSON(AUDIT_FILE, []);
  all.push({ ts: new Date().toISOString(), ...entry });
  saveJSON(AUDIT_FILE, all);
}

// AES-GCM helpers (cripto de campos sensíveis do journal)
const AES_KEY = crypto.createHash('sha256').update(String(process.env.AES_SECRET || 'kgb-default-secret')).digest(); // 32 bytes
function encryptJSON(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  const data = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc1 = cipher.update(data);
  const enc2 = cipher.final();
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc1, enc2]).toString('base64');
}
function decryptJSON(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.slice(0,12);
  const tag = buf.slice(12,28);
  const enc = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, iv);
  decipher.setAuthTag(tag);
  const dec1 = decipher.update(enc);
  const dec2 = decipher.final();
  return JSON.parse(Buffer.concat([dec1, dec2]).toString('utf8'));
}
const SENSITIVE_FIELDS = new Set(['observacoesSigilosas','tokens','documentos']);
function maybeEncryptPayload(payload){
  const out = { ...payload };
  for (const k of Object.keys(out)) {
    if (SENSITIVE_FIELDS.has(k)) {
      out[k] = { __enc: true, data: encryptJSON(out[k]) };
    }
  }
  return out;
}
function maybeDecryptPayload(payload){
  const out = { ...payload };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v && v.__enc && typeof v.data === 'string') {
      out[k] = decryptJSON(v.data);
    }
  }
  return out;
}

// ========================= PATCH F.1 — Auth (Firebase) + RBAC =========================
const ROLES = {
  audit    : (process.env.RBAC_AUDIT_ROLES     ||'').split(',').map(s=>s.trim()).filter(Boolean),
  finance  : (process.env.RBAC_FINANCE_ROLES   ||'').split(',').map(s=>s.trim()).filter(Boolean),
  admin    : (process.env.RBAC_ADMIN_ROLES     ||'').split(',').map(s=>s.trim()).filter(Boolean),
  contracts: (process.env.RBAC_CONTRACTS_ROLES ||'').split(',').map(s=>s.trim()).filter(Boolean),
  sync     : (process.env.RBAC_SYNC_ROLES      ||'').split(',').map(s=>s.trim()).filter(Boolean),
};

async function verifyFirebaseToken(req, res, next) {
  // Modo dev sem Auth
  if (String(process.env.DISABLE_AUTH||'0') === '1') {
    req.user = { uid:'dev', email:'dev@local', tenantId: (req.headers['x-tenant-id']||'default'), roles:['Administrador'] };
    return next();
  }

  // Sem credenciais Firebase = Auth indisponível
  if (!hasFirebaseCreds) {
    return res.status(500).json({ error: 'Auth indisponível: configure Firebase no .env ou ligue DISABLE_AUTH=1 para desenvolvimento.' });
  }

  const auth = req.headers.authorization||'';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const rolesHdr = (req.headers['x-roles']||'').split(',').map(s=>s.trim()).filter(Boolean);
    req.user = { uid: decoded.uid, email: decoded.email, tenantId, roles: rolesHdr.length ? rolesHdr : ['Administrador'] };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}


function ensureAllowed(area /* 'audit' | 'finance' | 'contracts' | 'sync' | 'admin' */) {
  return (req, res, next) => {
    const rolesOk = ROLES[area]||[];
    const userRoles = req.user?.roles||[];
    const allowed = userRoles.some(r => rolesOk.includes(r));
    if (!allowed) {
      writeAudit({ type:'denied', area, actor:req.user?.email, tenantId:req.user?.tenantId, path:req.path, method:req.method });
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// ========================= 1) WEBHOOKS (RAW) =========================
// Declarar ANTES do express.json global
const rawJson = express.raw({ type: 'application/json' });

// Verificação HMAC robusta (aceita "sha256=..." ou só o hex)
function verifySignature(rawBuffer, signature) {
  if (!signature || !WEBHOOK_SECRET) return false;
  const expectedHex = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBuffer).digest('hex');
  const providedHex = String(signature).startsWith('sha256=') ? String(signature).slice(7) : String(signature);

  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(providedHex, 'hex');
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

// Financeiro: baixa de parcela / recebimento (webhook)
app.post('/webhooks/financeiro', rawJson, (req, res) => {
  const sig = req.header('X-Signature');
  const raw = req.body; // Buffer

  if (!verifySignature(raw, sig)) return res.status(401).json({ error: 'invalid signature' });

  let payload;
  try { payload = JSON.parse(raw.toString('utf-8')); }
  catch { return res.status(400).json({ error: 'invalid json' }); }

  // payload: { type:'parcelapaga'|'recebimento', eventId, parcelaId?, descricao, valor, paidAt, comprovanteUrl, origem? }
  const evId = String(payload.eventId);
  db.prepare(`INSERT OR IGNORE INTO eventos(id) VALUES(?)`).run(evId);

  if (payload.type === 'parcelapaga' && payload.parcelaId) {
    db.prepare(`
      INSERT INTO parcelas(id, event_id, descricao, valor_cents, vencimento_iso, status, comprovante_url, pago_em_iso)
      VALUES(?, ?, ?, ?, NULL, 'pago', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status='pago',
        comprovante_url=excluded.comprovante_url,
        pago_em_iso=excluded.pago_em_iso,
        descricao=excluded.descricao,
        valor_cents=excluded.valor_cents
    `).run(
      String(payload.parcelaId),
      evId,
      payload.descricao || null,
      Math.round(Number(payload.valor || 0) * 100),
      payload.comprovanteUrl || null,
      payload.paidAt || null
    );
  } else {
    const recId = payload.recebimentoId || `rec_${Date.now()}`;
    db.prepare(`
      INSERT INTO recebimentos(id, event_id, descricao, valor_cents, pago_em_iso, comprovante_url, origem)
      VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        descricao=excluded.descricao,
        valor_cents=excluded.valor_cents,
        pago_em_iso=excluded.pago_em_iso,
        comprovante_url=excluded.comprovante_url,
        origem=excluded.origem
    `).run(
      String(recId), evId,
      payload.descricao || 'Recebimento',
      Math.round(Number(payload.valor || 0) * 100),
      payload.paidAt || null,
      payload.comprovanteUrl || null,
      payload.origem || 'webhook'
    );
  }

  db.prepare(`INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
              VALUES (?,?,?,?,?)`).run(
    new Date().toISOString(), 'webhook', 'financeiro', 'upsert', JSON.stringify(payload)
  );

  return res.json({ ok: true });
});

// Assinaturas (webhook)
app.post('/webhooks/assinaturas', rawJson, (req, res) => {
  const sig = req.header('X-Signature');
  const raw = req.body;

  if (!verifySignature(raw, sig)) return res.status(401).json({ error: 'invalid signature' });

  let payload;
  try { payload = JSON.parse(raw.toString('utf-8')); }
  catch { return res.status(400).json({ error: 'invalid json' }); }

  // payload: { eventId, docId, tipo:'contrato'|'adendo', motivo?, status:'assinado'|'pendente', documentUrl?, signedAt? }
  const evId = String(payload.eventId);
  db.prepare(`INSERT OR IGNORE INTO eventos(id) VALUES(?)`).run(evId);

  db.prepare(`
    INSERT INTO docs(id, event_id, tipo, motivo, url, status_assinatura, assinado_em_iso)
    VALUES(?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      motivo=excluded.motivo,
      url=excluded.url,
      status_assinatura=excluded.status_assinatura,
      assinado_em_iso=excluded.assinado_em_iso
  `).run(
    String(payload.docId),
    evId,
    payload.tipo,
    payload.motivo || null,
    payload.documentUrl || null,
    payload.status || 'pendente',
    payload.signedAt || null
  );

  db.prepare(`INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
              VALUES (?,?,?,?,?)`).run(
    new Date().toISOString(), 'webhook', 'assinaturas', 'upsert', JSON.stringify(payload)
  );

  return res.json({ ok: true });
});

// ========================= 2) JSON normal da API =========================
app.use(express.json({ limit: '50mb' }));

// === LISTAR CONTRATOS (JSON) ===
app.get('/contracts', verifyFirebaseToken, ensureAllowed('contracts'), (req, res) => {
  const tenantId = String(req.user?.tenantId || req.headers['x-tenant-id'] || 'default');
  const items = loadJSON('contracts.json', []).filter(c => String(c.tenantId||'default') === tenantId);
  res.json({ ok:true, items });
});

// ===== Área do Cliente (leitura)
app.get('/api/eventos/:id', (req, res) => {
  const id = String(req.params.id);

  const evRow = db.prepare(
    `SELECT id, valor_contrato_cents FROM eventos WHERE id = ?`
  ).get(id) || { id, valor_contrato_cents: 0 };

  const parcelas = db.prepare(`
    SELECT id, descricao, valor_cents, vencimento_iso, status, comprovante_url, pago_em_iso
    FROM parcelas WHERE event_id = ? ORDER BY date(vencimento_iso) ASC, id ASC
  `).all(id);

  const recebimentos = db.prepare(`
    SELECT id, descricao, valor_cents, pago_em_iso, comprovante_url, origem
    FROM recebimentos WHERE event_id = ? ORDER BY date(pago_em_iso) ASC, id ASC
  `).all(id);

  const docs = db.prepare(`
    SELECT id, tipo, motivo, url, status_assinatura, assinado_em_iso
    FROM docs WHERE event_id = ? ORDER BY date(assinado_em_iso) ASC, id ASC
  `).all(id);

  const contrato = docs.find(d => d.tipo === 'contrato') || null;
  const adendos  = docs.filter(d => d.tipo === 'adendo');

  res.json({
    id,
    financeiro: {
      valorContrato: (evRow.valor_contrato_cents || 0) / 100,
      parcelas: parcelas.map(p => ({
        id: p.id,
        descricao: p.descricao || null,
        valor: (p.valor_cents || 0) / 100,
        vencimentoISO: p.vencimento_iso || null,
        status: p.status,
        comprovanteUrl: p.comprovante_url || null,
        pagoEmISO: p.pago_em_iso || null
      })),
      recebimentos: recebimentos.map(r => ({
        id: r.id,
        descricao: r.descricao || 'Recebimento',
        valor: (r.valor_cents || 0) / 100,
        dataISO: r.pago_em_iso || null,
        comprovanteUrl: r.comprovante_url || null,
        origem: r.origem || null
      }))
    },
    contrato: contrato ? {
      id: contrato.id,
      url: contrato.url,
      status: contrato.status_assinatura,
      dataISO: contrato.assinado_em_iso
    } : null,
    addendos: adendos.map(a => ({
      id: a.id,
      motivo: a.motivo || null,
      url: a.url || null,
      status: a.status_assinatura,
      dataISO: a.assinado_em_iso || null
    }))
  });
});

// ===== Admin helpers (opcional)
app.post('/api/admin/eventos/:id', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {

  const id    = String(req.params.id);
  const valor = Math.round(Number(req.body.valorContrato || 0) * 100);
  db.prepare(`
    INSERT INTO eventos(id, valor_contrato_cents)
    VALUES(?, ?)
    ON CONFLICT(id) DO UPDATE SET valor_contrato_cents=excluded.valor_contrato_cents
  `).run(id, valor);
  res.json({ ok: true });
});

app.post('/api/admin/eventos/:id/parcelas', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {

  const id = String(req.params.id);
  const p  = req.body; // { id, descricao, valor, vencimentoISO }
  db.prepare(`
    INSERT INTO parcelas(id, event_id, descricao, valor_cents, vencimento_iso, status)
    VALUES(?, ?, ?, ?, ?, 'pendente')
    ON CONFLICT(id) DO UPDATE SET
      descricao=excluded.descricao,
      valor_cents=excluded.valor_cents,
      vencimento_iso=excluded.vencimento_iso
  `).run(
    String(p.id),
    id,
    p.descricao || null,
    Math.round(Number(p.valor || 0) * 100),
    p.vencimentoISO || null
  );
  res.json({ ok: true });
});
// Marcar uma parcela como paga (define status, pago_em_iso e opcionalmente comprovante)
app.post('/api/admin/parcelas/:parcelaId/pagar', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  const parcelaId = String(req.params.parcelaId);
  const pagoEmISO = String(req.body?.pagoEmISO || new Date().toISOString());
  const url       = req.body?.comprovanteUrl ? String(req.body.comprovanteUrl) : null;

  const found = db.prepare(`SELECT id FROM parcelas WHERE id = ?`).get(parcelaId);
  if (!found) return res.status(404).json({ error: 'parcela_not_found' });

  db.prepare(`
    UPDATE parcelas
      SET status='pago',
          pago_em_iso = ?,
          comprovante_url = COALESCE(?, comprovante_url)
    WHERE id = ?
  `).run(pagoEmISO, url, parcelaId);

  db.prepare(`
    INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
    VALUES (?, 'admin', 'parcelas', 'pagar', ?)
  `).run(new Date().toISOString(), JSON.stringify({ parcelaId, pagoEmISO, comprovanteUrl: url || null }));

  res.json({ ok: true, parcelaId, pagoEmISO });
});
// === [ADMIN] LISTAR PARCELAS (filtros opcionais) ===
// GET /api/admin/parcelas?eventId=...&status=pendente|pago|atrasado
app.get('/api/admin/parcelas', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  const { eventId, status } = req.query;
  let sql = `
    SELECT id, event_id, descricao, valor_cents, vencimento_iso, status, pago_em_iso, comprovante_url
    FROM parcelas
  `;
  const conds = [];
  const args  = [];
  if (eventId) { conds.push('event_id = ?'); args.push(String(eventId)); }
  if (status)  { conds.push('status = ?');   args.push(String(status));  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY date(vencimento_iso) ASC, id ASC';

  const rows = db.prepare(sql).all(...args).map(p => ({
    id: p.id,
    eventId: p.event_id,
    descricao: p.descricao || null,
    valor: (p.valor_cents || 0) / 100,
    vencimentoISO: p.vencimento_iso || null,
    status: p.status,
    pagoEmISO: p.pago_em_iso || null,
    comprovanteUrl: p.comprovante_url || null
  }));
  res.json({ ok:true, items: rows });
});

// === [ADMIN] DELETAR UMA PARCELA ===
// DELETE /api/admin/parcelas/:parcelaId
app.delete('/api/admin/parcelas/:parcelaId', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  const parcelaId = String(req.params.parcelaId);
  const found = db.prepare(`SELECT id FROM parcelas WHERE id = ?`).get(parcelaId);
  if (!found) return res.status(404).json({ error:'parcela_not_found' });

  db.prepare(`DELETE FROM parcelas WHERE id = ?`).run(parcelaId);
  db.prepare(`
    INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
    VALUES (?, 'admin', 'parcelas', 'delete', ?)
  `).run(new Date().toISOString(), JSON.stringify({ parcelaId }));

  res.json({ ok:true, parcelaId });
});

// ========================= PATCH F.3 — Auditoria JSON + CSV =========================
app.get('/audit/log', verifyFirebaseToken, ensureAllowed('audit'), (req, res) => {
  const { from, to, entity, actor, tenantId } = req.query;
  const all = loadJSON(AUDIT_FILE, []);
  const ini = from ? new Date(from) : null;
  const fim = to   ? new Date(to)   : null;

  const out = all.filter(x => {
    if (tenantId && String(x.tenantId||'') !== String(tenantId)) return false;
    if (entity && String(x.entity||'') !== String(entity)) return false;
    if (actor  && String(x.actor||'')  !== String(actor))  return false;
    if (ini && new Date(x.ts) < ini) return false;
    if (fim && new Date(x.ts) > fim) return false;
    return true;
  }).sort((a,b)=> new Date(b.ts) - new Date(a.ts));

  res.json({ ok:true, items: out });
});

app.get('/audit/log.csv', verifyFirebaseToken, ensureAllowed('audit'), (req, res) => {
  const { from, to, entity, actor, tenantId } = req.query;
  const all = loadJSON(AUDIT_FILE, []);
  const ini = from ? new Date(from) : null;
  const fim = to   ? new Date(to)   : null;

  const rows = all.filter(x => {
    if (tenantId && String(x.tenantId||'') !== String(tenantId)) return false;
    if (entity && String(x.entity||'') !== String(entity)) return false;
    if (actor  && String(x.actor||'')  !== String(actor))  return false;
    if (ini && new Date(x.ts) < ini) return false;
    if (fim && new Date(x.ts) > fim) return false;
    return true;
  }).sort((a,b)=> new Date(b.ts) - new Date(a.ts));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');

  const stream = csv.format({ headers:true });
  stream.pipe(res);
  for (const r of rows) {
    stream.write({
      ts: r.ts, type: r.type||'', entity: r.entity||'', actor: r.actor||'',
      tenantId: r.tenantId||'', area: r.area||'', path: r.path||'',
      method: r.method||'', rev: r.rev||''
    });
  }
  stream.end();
});

// Auditoria SQLite rápida (opcional)
app.post('/audit/log', verifyFirebaseToken, ensureAllowed('audit'), (req, res) => {
  const { actor = null, entity = null, action = null, payload = null } = req.body || {};
  db.prepare(`
    INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(new Date().toISOString(), actor, entity, action, JSON.stringify(payload ?? null));
  res.json({ ok: true });
});

app.get('/logs', verifyFirebaseToken, ensureAllowed('audit'), (req, res) => {

  const rows = db.prepare(`
    SELECT id, ts_iso, actor, entity, action, payload
    FROM audit_logs ORDER BY id DESC LIMIT 500
  `).all();
  res.json({ items: rows });
});

// ========================= PATCH F.4 — ZapSign webhook (JSON + SQLite opcional) =========================
app.post('/contracts/zapsign/webhook', express.json(), (req, res) => {

  // 1) Valida segredo por header
  const secret = req.headers['x-zapsign-token'] || '';
  if (String(process.env.ZAPSIGN_WEBHOOK_SECRET||'') && secret !== process.env.ZAPSIGN_WEBHOOK_SECRET) {
    return res.status(401).json({ error:'Invalid webhook secret' });
  }

  // 2) Persiste contrato (JSON)
  const payload  = req.body || {};
  const tenantId = String(req.headers['x-tenant-id']||'default');

  const CONTRACTS_FILE = 'contracts.json';
  const contracts = loadJSON(CONTRACTS_FILE, []);
  const id = String(payload?.document_id || payload?.contract_id || crypto.randomUUID());
  const found = contracts.find(c => c.id === id && c.tenantId === tenantId);
  const status = String(payload?.status || payload?.event || 'unknown');

  if (found) {
    found.status = status;
    found.lastUpdate = new Date().toISOString();
    found.raw = payload;
  } else {
    contracts.push({ id, tenantId, status, createdAt:new Date().toISOString(), raw: payload });
  }
  saveJSON(CONTRACTS_FILE, contracts);

  // 3) (Opcional) espelhar no SQLite "docs" atrelado a um eventId
  try {
    const evId = payload.eventId || payload.event_id || null;
    if (evId) {
      const tipo  = (payload.tipo || 'contrato');
      const url   = payload.documentUrl || payload.url || null;
      const signedAt = payload.signedAt || payload.assinado_em || null;
      const statusAss = (status === 'signed' || status === 'assinado') ? 'assinado' : 'pendente';

      db.prepare(`INSERT OR IGNORE INTO eventos(id) VALUES(?)`).run(String(evId));
      db.prepare(`
        INSERT INTO docs(id, event_id, tipo, motivo, url, status_assinatura, assinado_em_iso)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          motivo=excluded.motivo,
          url=excluded.url,
          status_assinatura=excluded.status_assinatura,
          assinado_em_iso=excluded.assinado_em_iso
      `).run(
        String(id), String(evId), String(tipo),
        payload.motivo || null, url, statusAss, signedAt
      );
    }
  } catch(e) {
    console.warn('[ZapSign->SQLite] falha ao espelhar docs:', e?.message||e);
  }

  // 4) Audita
  writeAudit({ type:'contract_status_changed', entity:'contracts', actor:'zapsign', tenantId, status });
  res.json({ ok:true });
});

/* ========================= Backup Snapshots (filesystem) ========================= */
const SNAP_DIR = path.join(process.cwd(), 'uploads', 'snapshots');
try { fs.mkdirSync(SNAP_DIR, { recursive: true }); } catch {}

app.put('/backup/snapshot', verifyFirebaseToken, ensureAllowed('admin'), async (req, res) => {
  try {
    // body: { name, data (string|object) }
    let name = String(req.body?.name || `snap-${Date.now()}.json`).replace(/[^a-z0-9_.-]/gi, '_');
    if (!name.endsWith('.json')) name += '.json';

    const payload = (typeof req.body?.data === 'string')
      ? req.body.data
      : JSON.stringify(req.body?.data || {}, null, 2);

    const filePath = path.join(SNAP_DIR, name);
    fs.writeFileSync(filePath, payload, 'utf-8');

    // auditoria local
    db.prepare(`
      INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
      VALUES (?, 'system', 'backup', 'put', ?)
    `).run(new Date().toISOString(), JSON.stringify({ name }));

    // (Opcional) Upload para Firebase Storage se houver credenciais no .env
    // Requer que o bucket tenha sido inicializado anteriormente (admin.storage().bucket(...))
    if (typeof bucket !== 'undefined' && bucket) {
      try {
        const tenantId = String(req.user?.tenantId || req.headers['x-tenant-id'] || 'default');
        const dest = `${tenantId}/backup/${name}`;
        await bucket.upload(filePath, { destination: dest, contentType: 'application/json' });
        console.log('[Storage] Snapshot enviado:', dest);
      } catch (e) {
        console.warn('[Storage] Falha ao enviar snapshot:', e?.message || e);
      }
    }

    res.json({ ok: true, name });
  } catch (err) {
    console.error('[Backup] Erro ao salvar snapshot:', err?.message || err);
    res.status(500).json({ ok: false, error: 'Falha ao salvar snapshot' });
  }
});


// GET /backup/snapshot           → lista arquivos
// GET /backup/snapshot?name=...  → retorna o conteúdo
app.get('/backup/snapshot', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  const name = String(req.query.name || '');
  if (!name) {
    const files = (fs.existsSync(SNAP_DIR) ? fs.readdirSync(SNAP_DIR) : []).filter(f => f.endsWith('.json'));
    return res.json({ files });
  }
  const p = path.join(SNAP_DIR, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  const data = fs.readFileSync(p, 'utf-8');
  res.type('application/json').send(data);
});

// DELETE por query (?name=...) ou por body { name }
app.delete('/backup/snapshot', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  const nameQ = req.query.name ? String(req.query.name) : null;
  const nameB = req.body && req.body.name ? String(req.body.name) : null;
  const name  = (nameQ || nameB || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  const p = path.join(SNAP_DIR, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });

  fs.unlinkSync(p);
  db.prepare(`
    INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
    VALUES (?, 'system', 'backup', 'delete', ?)
  `).run(new Date().toISOString(), JSON.stringify({ name }));

  res.json({ ok: true });
});

// ========================= PATCH F.6b — Financeiro (metrics unificado) =========================
// /fin/metrics agora aceita:
//   - range=YYYY-MM (padrão = mês atual)
//   - basis=vencimento|pago (padrão = vencimento, só para parcelas)
//   - includeParcelas=1|0 (padrão = 1 → soma parcelas do SQLite)
//
// Entradas/saídas do journal: lê /sync (dados em reais).
// Parcelas do SQLite: valor_cents (converte p/ reais). CUIDADO com contagem dupla se você também espelha parcelas no journal.
app.get('/fin/metrics', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
  try {
    const tenantId = String(req.user.tenantId || 'default');

    // range: YYYY-MM (ex.: 2025-11)
    const ym = (() => {
      const q = String(req.query.range || '').trim();
      if (/^\d{4}-\d{2}$/.test(q)) return q;
      return new Date().toISOString().slice(0, 7);
    })();

    // basis para parcelas (como considerar no mês): vencimento (default) ou pago
    const basis = (String(req.query.basis || 'vencimento').toLowerCase() === 'pago') ? 'pago' : 'vencimento';

    // incluir parcelas do SQLite nas saídas?
    const includeParcelas = String(req.query.includeParcelas ?? '1') !== '0';

    // 1) Journal (multi-tenant + decriptação)
    const journal = loadJSON(JOURNAL_FILE, []);
    const fin = journal
      .filter(x => x.tenantId === tenantId && x.entity === 'lancamento' && !x.tombstone)
      .map(x => ({ ...x, payload: maybeDecryptPayload(x.payload) }));

    const finMes = fin.filter(x => String(x.payload.data || '').startsWith(ym));
    const entradasJournal = finMes
      .filter(x => String(x.payload.tipo || '').toLowerCase() === 'entrada')
      .reduce((s, x) => s + (+x.payload.valor || 0), 0);

    const saidasJournal = finMes
      .filter(x => String(x.payload.tipo || '').toLowerCase() === 'saida')
      .reduce((s, x) => s + (+x.payload.valor || 0), 0);

    // 2) Parcelas do SQLite (opcional) → saídas do mês
    let saidasParcelas = 0;
    if (includeParcelas) {
      const rows = db.prepare(`
        SELECT valor_cents, vencimento_iso, pago_em_iso
        FROM parcelas
      `).all();

      if (basis === 'pago') {
        saidasParcelas = rows
          .filter(r => (r.pago_em_iso || '').startsWith(ym))
          .reduce((s, r) => s + (Number(r.valor_cents || 0) / 100), 0);
      } else {
        // basis=vencimento (default): mostra a "necessidade" do mês
        saidasParcelas = rows
          .filter(r => (r.vencimento_iso || '').startsWith(ym))
          .reduce((s, r) => s + (Number(r.valor_cents || 0) / 100), 0);
      }
    }

    const entradas = entradasJournal;
    const saidas = saidasJournal + saidasParcelas;
    const saldo = entradas - saidas;

    return res.json({
      ok: true,
      metrics: { entradas, saidas, saldo, range: ym, basis, includeParcelas: includeParcelas ? 1 : 0 }
    });
  } catch (e) {
    console.error('[fin/metrics] erro:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'metrics_failed' });
  }
});


// /fin/relatorios/extrato (SQLite — extrato por evento ou geral)
app.get('/fin/relatorios/extrato', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
  const evId = req.query.eventId ? String(req.query.eventId) : null;
  const result = { entradas: [], saidas: [] };

  const recs = evId
    ? db.prepare(`
        SELECT descricao, valor_cents, pago_em_iso, comprovante_url, origem
        FROM recebimentos WHERE event_id=? ORDER BY date(pago_em_iso) ASC, id ASC
      `).all(evId)
    : db.prepare(`
        SELECT descricao, valor_cents, pago_em_iso, comprovante_url, origem
        FROM recebimentos ORDER BY date(pago_em_iso) ASC, id ASC
      `).all();

  const parc = evId
    ? db.prepare(`
        SELECT descricao, valor_cents, vencimento_iso, status, pago_em_iso, comprovante_url
        FROM parcelas WHERE event_id=? ORDER BY date(vencimento_iso) ASC, id ASC
      `).all(evId)
    : db.prepare(`
        SELECT descricao, valor_cents, vencimento_iso, status, pago_em_iso, comprovante_url
        FROM parcelas ORDER BY date(vencimento_iso) ASC, id ASC
      `).all();

  result.entradas = recs.map(r => ({
    tipo: 'entrada',
    descricao: r.descricao || 'Recebimento',
    valor: (r.valor_cents || 0) / 100,
    data: r.pago_em_iso || null,
    comprovanteUrl: r.comprovante_url || null,
    origem: r.origem || null
  }));

  // Aqui tratamos "parcelas" como saídas; se seu conceito for outro, me avise.
  result.saidas = parc.map(p => ({
    tipo: 'saida',
    descricao: p.descricao || 'Parcela',
    valor: (p.valor_cents || 0) / 100,
    status: p.status,
    vencimento: p.vencimento_iso || null,
    pagoEm: p.pago_em_iso || null,
    comprovanteUrl: p.comprovante_url || null
  }));

  res.json(result);
});

// ========================= PATCH F.2 — /sync (push/pull com LWW) =========================
app.post('/sync/push', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  const { changes = [] } = req.body || {};
  const tenantId = String(req.user.tenantId||'default');

  if (!Array.isArray(changes)) return res.status(400).json({ error: 'changes[] required' });

  const journal = loadJSON(JOURNAL_FILE, []);
  const toAppend = [];

  for (const ch of changes) {
    const rev = Math.max(nextRev(), ch.rev||0);
    const entry = {
      id: String(ch.id||crypto.randomUUID()),
      entity: String(ch.entity||'misc'),
      action: String(ch.action||'upsert'),
      rev,
      tombstone: !!ch.tombstone,
      tenantId,
      actor: req.user.email,
      payload: maybeEncryptPayload(ch.payload||{}),
    };
    toAppend.push(entry);
    writeAudit({ type:'sync_push', entity:entry.entity, actor:req.user.email, tenantId, rev });
  }

  journal.push(...toAppend);
  saveJSON(JOURNAL_FILE, journal);

  return res.json({ ok:true, saved: toAppend.length, lastRev: toAppend.reduce((m, e) => Math.max(m, e.rev), 0) });
});

app.get('/sync/pull', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  const since = Number(req.query.since||0);
  const tenantId = String(req.user.tenantId||'default');
  const limit = Math.min(Number(req.query.limit||1000), 5000);

  const journal = loadJSON(JOURNAL_FILE, []);
  const list = journal
    .filter(e => e.tenantId === tenantId && e.rev > since)
    .sort((a,b)=> a.rev - b.rev)
    .slice(0, limit)
    .map(e => ({ ...e, payload: maybeDecryptPayload(e.payload) }));

  writeAudit({ type:'sync_pull', actor:req.user.email, tenantId, count:list.length, since });

  return res.json({ ok:true, changes:list, lastRev: list.reduce((m, e)=>Math.max(m, e.rev), since) });
});

// ========================= Healthcheck =========================
app.get('/health', (req, res) => {
  res.json({ ok: true, db: DB_PATH });
});

// ========================= Inicialização =========================
app.listen(PORT, () => {
  console.log(`KGB API rodando em http://localhost:${PORT}`);
  console.log(`DB em: ${DB_PATH}`);
  if (ALLOWLIST.length) {
    console.log('CORS allowlist:', ALLOWLIST.join(', '));
  } else {
    console.log('CORS allowlist vazia (aceita qualquer origem sem Origin em ambiente local).');
  }
});
