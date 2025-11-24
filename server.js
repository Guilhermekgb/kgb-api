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
const multer   = require('multer');

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
CREATE TABLE IF NOT EXISTS assinaturas_contratos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  event_id TEXT NOT NULL,
  contrato_html TEXT NOT NULL,
  dados_cliente_json TEXT,
  status_cliente TEXT CHECK(status_cliente IN ('pendente','assinado')) DEFAULT 'pendente',
  status_empresa TEXT CHECK(status_empresa IN ('pendente','assinado')) DEFAULT 'pendente',
  assinatura_cliente_base64 TEXT,
  assinatura_empresa_base64 TEXT,
  cliente_assinou_em_iso TEXT,
  empresa_assinou_em_iso TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES eventos(id)
);
CREATE TABLE IF NOT EXISTS portal_tokens (
  token TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  expires_at_iso TEXT NOT NULL,
  created_at_iso TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES eventos(id)
);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS portal_eventos_publicos (
  event_id TEXT PRIMARY KEY,
  json     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  whatsapp TEXT,
  perfil TEXT NOT NULL,
  senha TEXT,
  foto TEXT,
  created_at TEXT NOT NULL
);
`);


db.exec(`
CREATE INDEX IF NOT EXISTS idx_parcelas_event      ON parcelas(event_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_venc       ON parcelas(vencimento_iso);
CREATE INDEX IF NOT EXISTS idx_parcelas_pago       ON parcelas(pago_em_iso);
CREATE INDEX IF NOT EXISTS idx_receb_event         ON recebimentos(event_id);
CREATE INDEX IF NOT EXISTS idx_receb_pago          ON recebimentos(pago_em_iso);
CREATE INDEX IF NOT EXISTS idx_assinaturas_token   ON assinaturas_contratos(token);
CREATE INDEX IF NOT EXISTS idx_assinaturas_event   ON assinaturas_contratos(event_id);
`);
// === TABELA: agendaUnified ===
// Armazena follow-ups, atrasos, lembretes, eventos e avisos do sistema
db.exec(`
CREATE TABLE IF NOT EXISTS agendaUnified (
  id TEXT PRIMARY KEY,
  src TEXT,
  title TEXT,
  date TEXT,
  timeStart TEXT,
  status TEXT,
  audience TEXT,
  entityType TEXT,
  entityId TEXT,
  extra TEXT,
  createdAt TEXT,
  updatedAt TEXT
);
`);

// === TABELA: notificationsFeed ===
// Central de notificações internas (comercial / vendedor / responsável / admin)
db.exec(`
CREATE TABLE IF NOT EXISTS notificationsFeed (
  id TEXT PRIMARY KEY,
  kind TEXT,
  title TEXT,
  message TEXT,
  level TEXT,
  audience TEXT,
  entityType TEXT,
  entityId TEXT,
  createdAt TEXT,
  read INT DEFAULT 0
);
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
// Upload em memória para anexos de comprovantes (imagens/PDF)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // limite máximo absoluto (10MB) — vamos validar 5MB para imagem na rota
    fileSize: 10 * 1024 * 1024
  }
});
// ==== PORTAL DO CLIENTE – arquivo de tokens ====
const PORTAL_TOKENS_FILE = path.join(process.cwd(), 'portal-tokens.json');

function loadPortalTokens() {
  // usa o mesmo helper loadJSON do resto do sistema
  return loadJSON(PORTAL_TOKENS_FILE, []);
}

function savePortalTokens(tokens) {
  // usa o mesmo helper saveJSON do resto do sistema
  saveJSON(PORTAL_TOKENS_FILE, tokens || []);
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
const LEADS_FILE = 'leads.json';

if (!fs.existsSync(path.join(DATA_DIR, JOURNAL_FILE))) saveJSON(JOURNAL_FILE, []);

// Auditoria (log em arquivo para endpoints /audit/log e .csv)
const AUDIT_FILE = 'audit.json';
// >>> CONFIGURAÇÕES DO FUNIL / LISTAS (MÓDULO 3) <<<
const FUNIL_COLUNAS_FILE = 'funil-colunas.json';          // colunas do funil
const LISTAS_AUX_FILE    = 'listas-auxiliares.json';      // listas tipo "como conheceu" etc.

// garante que os arquivos existem
if (!fs.existsSync(path.join(DATA_DIR, FUNIL_COLUNAS_FILE))) {
  // começa vazio (o front pode semear "Novo Lead" na primeira gravação)
  saveJSON(FUNIL_COLUNAS_FILE, []);
}
if (!fs.existsSync(path.join(DATA_DIR, LISTAS_AUX_FILE))) {
  // objeto com várias listas dentro
  saveJSON(LISTAS_AUX_FILE, {});
}

// helpers para ler/gravar essas listas auxiliares
function loadListasAux() {
  const obj = loadJSON(LISTAS_AUX_FILE, {});
  return (obj && typeof obj === 'object') ? obj : {};
}
function saveListasAux(obj) {
  saveJSON(LISTAS_AUX_FILE, obj || {});
}

// mapeia o "slug" da URL para a chave interna no JSON
const LIST_KEYS = {
  'como-conheceu'       : 'comoConheceu',
  'motivos-arquivamento': 'motivosArquivamento',
  'tipos-evento'        : 'tiposEvento',
  'funcoes-equipe'      : 'funcoesEquipe',
  'tipos-agenda'        : 'tiposAgenda',
  'categorias-servicos' : 'categoriasServicos',
  'categorias-cardapio' : 'categoriasCardapio'
};

function getListKey(slug) {
  return LIST_KEYS[String(slug || '').toLowerCase()] || null;
}

if (!fs.existsSync(path.join(DATA_DIR, AUDIT_FILE))) saveJSON(AUDIT_FILE, []);

// Token para links de assinatura de contrato
function gerarTokenAssinatura() {
  // Ex: "ass_abcdef1234..."
  return 'ass_' + crypto.randomBytes(16).toString('hex');
}

// Rev monotônico (last-write-wins)
function nextRev() {
  return Date.now();
}

// Auditoria helper (arquivo)
function writeAudit(entry) {
  const all = loadJSON(AUDIT_FILE, []);
  // inclui os campos de entry junto com o timestamp
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

function maybeEncryptPayload(payload) {
  const out = { ...(payload || {}) };
  for (const k of Object.keys(out)) {
    if (SENSITIVE_FIELDS.has(k)) {
      out[k] = { __enc: true, data: encryptJSON(out[k]) };
    }
  }
  return out;
}

function maybeDecryptPayload(payload) {
  const out = { ...(payload || {}) };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v && v.__enc && typeof v.data === 'string') {
      out[k] = decryptJSON(v.data);
    }
  }
  return out;
}

// === COMISSÃO AUTOMÁTICA (helper) ===
function registrarComissao({ tenantId, actor, eventId, parcelaId, valorParcela, dataISO }) {
  try {
    const journal = loadJSON(JOURNAL_FILE, []);
    const rev = nextRev();

    // >>> REGRA DE COMISSÃO <<<
    // Aqui você define qual porcentagem quer usar.
    // EXEMPLO: 10% de comissão
    const percentual = 0.10; // 10%
    const valorComissao = Number(valorParcela || 0) * percentual;

    if (!valorComissao || valorComissao <= 0) {
      console.warn('[comissao] valor de comissão zerado, não registrando');
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      entity: 'lancamento',
      action: 'upsert',
      rev,
      tombstone: false,
      tenantId: String(tenantId || 'default'),
      actor: String(actor || 'system'),
      payload: maybeEncryptPayload({
        tipo: 'saida',                    // saída de dinheiro
        valor: valorComissao,             // valor da comissão
        data: (dataISO || new Date().toISOString()).slice(0,10), // 'YYYY-MM-DD'
        categoria: 'Comissão',            // você pode renomear depois
        descricao: `Comissão sobre parcela ${parcelaId || ''}`,
        eventoId: eventId || null,
        origem: 'comissao_auto'
      })
    };

    journal.push(entry);
    saveJSON(JOURNAL_FILE, journal);
    console.log('[comissao] lançada comissão automática da parcela', parcelaId, '=>', valorComissao);
  } catch (e) {
    console.error('[comissao] erro ao registrar comissão:', e?.message || e);
  }
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

// Assinaturas (webhook ZapSign antigo, se ainda usar)
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

// Depois dos webhooks em raw:
app.use(express.json({ limit: '50mb' }));

// ========================= NOTIFICAÇÕES FEED (M33) =========================

// GET /notificacoes → lista todas / ou filtradas por audience
app.get('/notificacoes', (req, res) => {
  const audience = String(req.query.audience || '').trim();
  let sql = "SELECT * FROM notificationsFeed";
  const args = [];

  if (audience) {
    sql += " WHERE audience = ?";
    args.push(audience);
  }

  sql += " ORDER BY datetime(createdAt) DESC";

  const rows = db.prepare(sql).all(...args);
  return res.json({ ok: true, items: rows });
});


// POST /notificacoes → inserir nova notificação
app.post('/notificacoes', (req, res) => {
  const n = req.body || {};
  const id = n.id || crypto.randomUUID();

  db.prepare(`
    INSERT INTO notificationsFeed (
      id, kind, title, message, level, audience,
      entityType, entityId, createdAt, read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    n.kind || null,
    n.title || '',
    n.message || '',
    n.level || 'info',
    n.audience || '',
    n.entityType || null,
    n.entityId || null,
    new Date().toISOString()
  );

  res.json({ ok: true, id });
});

// PUT /notificacoes/:id/read → marcar como lida
app.put('/notificacoes/:id/read', (req, res) => {
  const id = String(req.params.id);
  db.prepare(`UPDATE notificationsFeed SET read = 1 WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ====== UNIFIED AGENDA ======
// GET /agenda/unified → lista todos os itens sincronizados
app.get('/agenda/unified', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM agendaUnified
    ORDER BY datetime(date) ASC, timeStart ASC
  `).all();

  res.json({ ok: true, items: rows });
});

// ========================= ENDPOINTS DE ASSINATURA PRÓPRIA =========================

// POST /api/assinaturas/contratos
// chamado na hora de gerar o link no contrato.js
app.post('/api/assinaturas/contratos', (req, res) => {
  try {
    const { eventoId, contratoHtml, dadosCliente } = req.body || {};

    if (!eventoId || !contratoHtml) {
      return res.status(400).json({ error: 'eventoId e contratoHtml são obrigatórios.' });
    }

    const token = gerarTokenAssinatura();
    const now = new Date().toISOString();

    db.prepare(`INSERT OR IGNORE INTO eventos(id) VALUES(?)`).run(String(eventoId));

    db.prepare(`
      INSERT INTO assinaturas_contratos (
        token, event_id, contrato_html, dados_cliente_json,
        status_cliente, status_empresa,
        created_at_iso, updated_at_iso
      )
      VALUES (?, ?, ?, ?, 'pendente', 'pendente', ?, ?)
    `).run(
      token,
      String(eventoId),
      String(contratoHtml),
      JSON.stringify(dadosCliente || {}),
      now,
      now
    );

    // Monta URL de assinatura (frontend vai usar assinatura.html)
    const urlAssinatura = `/assinatura.html?token=${encodeURIComponent(token)}`;

    return res.status(201).json({
      ok: true,
      token,
      urlAssinatura
    });
  } catch (e) {
    console.error('[assinaturas] erro ao criar contrato:', e);
    return res.status(500).json({ error: 'Erro ao criar registro de assinatura.' });
  }
});

// GET /api/assinaturas/:token
// usado pela assinatura.html para carregar o contrato e os status
app.get('/api/assinaturas/:token', (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!token) {
      return res.status(400).json({ error: 'token obrigatório.' });
    }

    const row = db.prepare(`
      SELECT *
      FROM assinaturas_contratos
      WHERE token = ?
      LIMIT 1
    `).get(token);

    if (!row) {
      return res.status(404).json({ error: 'Assinatura não encontrada ou link expirado.' });
    }

    let dadosCliente = {};
    try {
      dadosCliente = JSON.parse(row.dados_cliente_json || '{}');
    } catch {
      dadosCliente = {};
    }

    return res.json({
      token: row.token,
      eventoId: row.event_id,
      contratoHtml: row.contrato_html,
      dadosCliente,
      statusCliente: row.status_cliente,
      statusEmpresa: row.status_empresa,
      assinaturaClienteBase64: row.assinatura_cliente_base64 || null,
      assinaturaEmpresaBase64: row.assinatura_empresa_base64 || null,
      clienteAssinouEm: row.cliente_assinou_em_iso || null,
      empresaAssinouEm: row.empresa_assinou_em_iso || null,
      createdAt: row.created_at_iso,
      updatedAt: row.updated_at_iso,
    });
  } catch (e) {
    console.error('[assinaturas] erro ao carregar contrato:', e);
    return res.status(500).json({ error: 'Erro ao carregar assinatura.' });
  }
});

// POST /api/assinaturas/:token/cliente
// usado pela assinatura.html quando o CLIENTE confirma a assinatura
app.post('/api/assinaturas/:token/cliente', (req, res) => {
  try {
    const token = String(req.params.token || '');
    const { assinaturaBase64 } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: 'token obrigatório.' });
    }
    if (!assinaturaBase64) {
      return res.status(400).json({ error: 'assinaturaBase64 é obrigatória.' });
    }

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE assinaturas_contratos
      SET
        assinatura_cliente_base64 = @assinatura,
        status_cliente = 'assinado',
        cliente_assinou_em_iso = @ts,
        updated_at_iso = @ts
      WHERE token = @token
    `);

    const result = stmt.run({
      assinatura: String(assinaturaBase64),
      ts: now,
      token
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[assinaturas] erro ao salvar assinatura do cliente:', e);
    return res.status(500).json({ error: 'Erro ao salvar assinatura do cliente.' });
  }
});

// POST /api/assinaturas/:token/empresa
// usado pela assinatura.html quando o BUFFET confirma a assinatura
app.post('/api/assinaturas/:token/empresa', (req, res) => {
  try {
    const token = String(req.params.token || '');
    const { assinaturaBase64 } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: 'token obrigatório.' });
    }
    if (!assinaturaBase64) {
      return res.status(400).json({ error: 'assinaturaBase64 é obrigatória.' });
    }

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE assinaturas_contratos
      SET
        assinatura_empresa_base64 = @assinatura,
        status_empresa = 'assinado',
        empresa_assinou_em_iso = @ts,
        updated_at_iso = @ts
      WHERE token = @token
    `);

    const result = stmt.run({
      assinatura: String(assinaturaBase64),
      ts: now,
      token
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[assinaturas] erro ao salvar assinatura da empresa:', e);
    return res.status(500).json({ error: 'Erro ao salvar assinatura da empresa.' });
  }
});
// ========================= CONTRATOS (compatível com contrato.js) =========================

// Mapeia status_cliente/status_empresa -> status geral
function mapContratoStatus(row) {
  const stCli = row.status_cliente || 'pendente';
  const stEmp = row.status_empresa || 'pendente';

  if (stCli === 'assinado' && stEmp === 'assinado') return 'assinado';
  if (stCli === 'assinado' && stEmp === 'pendente') return 'aguardando_empresa';
  if (stCli === 'pendente' && stEmp === 'assinado') return 'aguardando_cliente';
  return 'pendente';
}

/**
 * GET /contratos?eventoId=123
 * Usado pelo contrato.js para descobrir o CONTRATO_ATUAL de um evento
 */
app.get('/contratos', (req, res) => {
  try {
    const eventoId = String(req.query.eventoId || '').trim();
    if (!eventoId) {
      return res.json({ data: [] });
    }

    const row = db.prepare(`
      SELECT
        id,
        token,
        event_id    AS eventoId,
        status_cliente,
        status_empresa,
        created_at_iso AS createdAt,
        updated_at_iso AS updatedAt
      FROM assinaturas_contratos
      WHERE event_id = ?
      ORDER BY datetime(created_at_iso) DESC, id DESC
      LIMIT 1
    `).get(eventoId);

    if (!row) {
      return res.json({ data: [] });
    }

    const statusGeral = mapContratoStatus(row);

    return res.json({
      data: [{
        id: row.id,
        token: row.token,
        eventoId: row.eventoId,
        status: statusGeral,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }]
    });
  } catch (e) {
    console.error('[GET /contratos] erro:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao listar contratos.' });
  }
});

/**
 * GET /contratos/status?id=1
 * Usado pelo contrato.js no polling para atualizar os chips de status
 */
app.get('/contratos/status', (req, res) => {
  try {
    const id = Number(req.query.id || 0);
    if (!id) {
      return res.status(400).json({ error: 'id obrigatório.' });
    }

    const row = db.prepare(`
      SELECT
        id,
        token,
        status_cliente,
        status_empresa,
        updated_at_iso AS updatedAt
      FROM assinaturas_contratos
      WHERE id = ?
      LIMIT 1
    `).get(id);

    if (!row) {
      return res.status(404).json({ error: 'Contrato não encontrado.' });
    }

    const statusGeral = mapContratoStatus(row);

    return res.json({
      data: {
        id: row.id,
        token: row.token,
        status: statusGeral,
        updatedAt: row.updatedAt
      }
    });
  } catch (e) {
    console.error('[GET /contratos/status] erro:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao consultar status do contrato.' });
  }
});
// ========================= Portal do Cliente (tokens + /portal/me) =========================

function gerarPortalToken() {
  // prefixo 'pt_' só pra ficar fácil de reconhecer esses tokens
  return 'pt_' + crypto.randomBytes(16).toString('hex');
}

/**
 * POST /portal/token
 * Gera um token de acesso para um evento.
 * Usa autenticação (somente painel interno).
 * Corpo esperado (JSON): { "eventoId": "123" }
 */
app.post('/portal/token', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  try {
    // vem do evento-detalhado.js: { eventId, eventoPublico }
    const { eventId, eventoPublico } = req.body || {};
    const id = String(eventId || '').trim();



    if (!id) {
      return res.status(400).json({ error: 'eventoId é obrigatório' });
    }

      // garante que o evento exista na tabela eventos
    db.prepare('INSERT OR IGNORE INTO eventos(id) VALUES (?)').run(id);

    const token  = gerarPortalToken();
    const nowIso = new Date().toISOString();
    const expIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 dias

    db.prepare(`
      INSERT INTO portal_tokens (token, event_id, expires_at_iso, created_at_iso)
      VALUES (?, ?, ?, ?)
    `).run(token, id, expIso, nowIso);

    // 🔹 NOVO: guarda o "evento público" (nome, data, convidados...) para usar no portal do cliente
    try {
      const json = JSON.stringify(eventoPublico || {});
      db.prepare(`
        INSERT INTO portal_eventos_publicos(event_id, json)
        VALUES (?, ?)
        ON CONFLICT(event_id) DO UPDATE SET json = excluded.json
      `).run(id, json);
    } catch (e) {
      console.warn('[portal] não consegui salvar eventoPublico', e);
    }

    // resposta: token + infos básicas
    return res.json({ ok: true, token, eventoId: id, expiresAt: expIso });
  } catch (e) {
    console.error('[portal] erro em POST /portal/token', e);
    return res.status(500).json({ error: 'Erro ao gerar token do portal.' });
  }
});


/**
 * GET /portal/me?token=...
 * Usado pelo area-cliente.js quando o cliente abre o link com ?token=...
 * NÃO tem autenticação, pois o cliente externo acessa direto.
 */
app.get('/portal/me', (req, res) => {
  try {
    const token = String(req.query.token || req.query.t || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }

    const row = db.prepare(
      'SELECT token, event_id, expires_at_iso FROM portal_tokens WHERE token = ? LIMIT 1'
    ).get(token);

    if (!row) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const agora = new Date();
    const exp   = new Date(row.expires_at_iso);
    if (exp < agora) {
      return res.status(401).json({ error: 'Token expirado' });
    }

    const id = String(row.event_id);

    // --- MESMO JEITO do /api/eventos/:id, só que sem precisar de login ---
    const evRow = db.prepare(
      'SELECT id, valor_contrato_cents FROM eventos WHERE id = ?'
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

    const evento = {
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
    };

    // o area-cliente.js faz: ev = data.evento || data;
    // então podemos devolver direto o objeto do evento:
    return res.json(evento);
  } catch (e) {
    console.error('[portal] erro em GET /portal/me', e);
    return res.status(500).json({ error: 'Erro ao carregar dados do portal.' });
  }
});

// ========================= Área do Cliente — Resumo evento/financeiro =========================
app.get('/api/eventos/:id', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
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
// ========================= Portal do Cliente — Financeiro (4.2) =========================

// GET /portal/eventos/:id/parcelas
app.get('/portal/eventos/:id/parcelas', (req, res) => {
  try {
    const id = String(req.params.id);

    const parcelas = db.prepare(`
      SELECT id, descricao, valor_cents, vencimento_iso, status, comprovante_url, pago_em_iso
      FROM parcelas WHERE event_id = ?
      ORDER BY date(vencimento_iso) ASC, id ASC
    `).all(id);

    const resp = parcelas.map(p => ({
      id: p.id,
      descricao: p.descricao || null,
      valor: (p.valor_cents || 0) / 100,
      vencimentoISO: p.vencimento_iso || null,
      status: p.status,
      comprovanteUrl: p.comprovante_url || null,
      pagoEmISO: p.pago_em_iso || null
    }));

    return res.json(resp);
  } catch (e) {
    console.error('[portal] erro em GET /portal/eventos/:id/parcelas', e);
    return res.status(500).json({ error: 'Erro ao carregar parcelas.' });
  }
});

// GET /portal/eventos/:id/financeiro (totais + detalhes)
app.get('/portal/eventos/:id/financeiro', (req, res) => {
  try {
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

    const contratoTotal = (evRow.valor_contrato_cents || 0) / 100;

    const totalPago = recebimentos.reduce(
      (acc, r) => acc + ((r.valor_cents || 0) / 100),
      0
    );

    const pendente = Math.max(0, contratoTotal - totalPago);

    const body = {
      contratoTotal,
      totalContrato: contratoTotal,
      pago: totalPago,
      totalPago,
      recebido: totalPago,
      pendente,
      saldoDevedor: pendente,
      falta: pendente,

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
    };

    return res.json(body);
  } catch (e) {
    console.error('[portal] erro em GET /portal/eventos/:id/financeiro', e);
    return res.status(500).json({ error: 'Erro ao carregar financeiro.' });
  }
});
// ===== Integrações – teste de pagamentos (ETAPA 5.1) =====
app.post('/api/integracoes/test/payments', (req, res) => {
  try {
    const { gateway, pixKey } = req.body || {};

    if (!pixKey || !String(pixKey).trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Informe a chave PIX para testar a conexão.'
      });
    }

    // FUTURO:
    // Aqui você pode colocar um teste REAL com o gateway (Mercado Pago, Asaas, etc.).
    // Por enquanto, se chegou até aqui, consideramos o teste básico OK.

    return res.json({
      ok: true,
      message: 'Configurações de pagamentos recebidas. Teste básico OK.'
    });
  } catch (e) {
    console.error('[integracoes] erro em POST /api/integracoes/test/payments', e);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao testar pagamentos.'
    });
  }
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

// === [ADMIN] PAGAR PARCELA (marcar como paga + opcionalmente comprovante)
app.post('/api/admin/parcelas/:parcelaId/pagar', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  const parcelaId = String(req.params.parcelaId);
  const pagoEmISO = String(req.body?.pagoEmISO || new Date().toISOString());
  const url       = req.body?.comprovanteUrl ? String(req.body.comprovanteUrl) : null;

  const found = db.prepare(`SELECT id FROM parcelas WHERE id = ?`).get(parcelaId);
  if (!found) return res.status(404).json({ error: 'parcela_not_found' });

  // Atualiza parcela como paga
  db.prepare(`
    UPDATE parcelas
      SET status='pago',
          pago_em_iso = ?,
          comprovante_url = COALESCE(?, comprovante_url)
    WHERE id = ?
  `).run(pagoEmISO, url, parcelaId);

  // Audit log padrão (já existia)
  db.prepare(`
    INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
    VALUES (?, ?, 'parcelas', 'pagar', ?)
  `).run(
    new Date().toISOString(),
    String(req.user?.email || 'admin'),
    JSON.stringify({ parcelaId, pagoEmISO, comprovanteUrl: url || null })
  );

  // === NOVO BLOCO: REGISTRA COMISSÃO AUTOMÁTICA ===
  try {
    // Busca dados da parcela pra saber valor e evento
    const row = db.prepare(`
      SELECT event_id, valor_cents
      FROM parcelas
      WHERE id = ?
    `).get(parcelaId);

    if (row) {
      const valorParcela = Number(row.valor_cents || 0) / 100;

      registrarComissao({
        tenantId: String(req.user?.tenantId || 'default'),
        actor   : String(req.user?.email || 'admin'),
        eventId : row.event_id,
        parcelaId,
        valorParcela,
        dataISO : pagoEmISO
      });
    } else {
      console.warn('[parcelas/pagar] parcela não encontrada ao tentar registrar comissão', parcelaId);
    }
  } catch (e) {
    console.warn('[parcelas/pagar] falha ao registrar comissão:', e?.message || e);
  }

  return res.json({ ok: true, parcelaId, pagoEmISO });
});


// === [ADMIN] LISTAR PARCELAS (filtros opcionais) ===
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

  // 1) Valida segredo por header OU por query (?token=...)
  const provided = req.headers['x-zapsign-token'] || String(req.query.token || '');
  const secret   = String(process.env.ZAPSIGN_WEBHOOK_SECRET || '');
  if (secret && provided !== secret) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
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
app.get('/fin/metrics', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
  try {
    const tenantId = String(req.user.tenantId || 'default');

    // range: YYYY-MM (ex.: 2025-11)
    const ym = (() => {
      const q = String(req.query.range || '').trim();
      if (/^\d{4}-\d{2}$/.test(q)) return q;
      return new Date().toISOString().slice(0, 7);
    })();
// ========================= PATCH 3.3 — Leads (metrics para Dashboard) =========================
app.get('/leads/metrics', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');

    // Lê lista de leads do arquivo JSON (por enquanto, é só um "banco simples")
    const allLeads = loadJSON(LEADS_FILE, []);
    const leads = Array.isArray(allLeads)
      ? allLeads.filter(l => String(l.tenantId || 'default') === tenantId)
      : [];

    // range=YYYY-MM ou "mes" -> usamos o mês atual como padrão
    const now = new Date();
    const q = String(req.query.range || '').trim();
    let ym;
    if (/^\d{4}-\d{2}$/.test(q)) {
      ym = q;
    } else {
      ym = now.toISOString().slice(0, 7); // ex: "2025-11"
    }

    const inYM = (iso, ym) =>
      typeof iso === 'string' && iso.slice(0, 7) === ym;

    const statusClass = (s) => {
      const v = String(s || '').toLowerCase();
      if (v.includes('ganh') || v.includes('fechad') || v.includes('contrat')) return 'ganho';
      if (v.includes('negoci') || v.includes('propost') || v.includes('andament')) return 'negociacao';
      if (v.includes('perd') || v.includes('arquiv') || v.includes('cancel') || v.includes('inativ') || v.includes('descart')) return 'finalizado';
      return 'outros';
    };

    const createdAtField = (l) =>
      l.dataCriacaoISO || l.createdAt || l.created_at_iso || l.created_at || null;

    // KPIs do mês atual
    const doMes = leads.filter(l => inYM(createdAtField(l), ym));

    let totalLeadsMes   = doMes.length;
    let vendasRealizadas = 0;
    let emNegociacao     = 0;
    let finalizados      = 0;

    for (const l of doMes) {
      const c = statusClass(l.status);
      if (c === 'ganho')       vendasRealizadas++;
      else if (c === 'negociacao') emNegociacao++;
      else if (c === 'finalizado') finalizados++;
    }

    const kpis = {
      ym,
      totalLeadsMes,
      vendasRealizadas,
      emNegociacao,
      finalizados
    };

    // Série para o gráfico de conversão (últimos 6 meses)
    const addMonths = (d, n) => {
      const nd = new Date(d);
      nd.setMonth(nd.getMonth() + n);
      return nd;
    };

    const meses = [];
    const conversao = [];
    for (let i = 5; i >= 0; i--) {
      const d = addMonths(now, -i);
      const label = d.toISOString().slice(0, 7); // YYYY-MM
      meses.push(label);

      const doMesX = leads.filter(l => inYM(createdAtField(l), label));
      if (!doMesX.length) {
        conversao.push(0);
        continue;
      }

      const ganhosX = doMesX.filter(l => statusClass(l.status) === 'ganho');
      const taxa = (ganhosX.length / doMesX.length) * 100;
      conversao.push(Number(taxa.toFixed(2)));
    }

    const grafico = {
      labels: meses,
      values: conversao
    };

    return res.json({
      ok: true,
      metrics: kpis,  // o dashboard procura resp.metrics ou resp.kpis
      kpis,
      grafico        // o dashboard procura resp.grafico / resp.chart / resp.conversao
    });
  } catch (e) {
    console.error('[leads/metrics] erro:', e);
    return res.status(500).json({ error: 'Erro ao calcular métricas de leads' });
  }
});

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
// ========================= FINANCEIRO — Upload de comprovante de parcela =========================
// POST /fin/parcelas/:id/comprovante
// body: multipart/form-data com campo "file"
app.post(
  '/fin/parcelas/:id/comprovante',
  verifyFirebaseToken,
  ensureAllowed('finance'),
  upload.single('file'),
  async (req, res) => {
    try {
      // Se o Firebase Storage não estiver configurado
      if (!bucket) {
        return res.status(500).json({ ok: false, error: 'storage_desativado' });
      }

      const parcelaId = String(req.params.id || '').trim();
      if (!parcelaId) {
        return res.status(400).json({ ok: false, error: 'parcela_id_obrigatorio' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: 'arquivo_obrigatorio' });
      }

      const mime = file.mimetype || '';
      const size = file.size || 0;

      const isImage = mime.startsWith('image/');
      const isPdf   = mime === 'application/pdf';

      // aceita só imagem ou PDF
      if (!isImage && !isPdf) {
        return res.status(400).json({
          ok: false,
          error: 'tipo_invalido',
          detail: 'Somente imagem ou PDF são permitidos.'
        });
      }

      // limites de tamanho
      if (isImage && size > 5 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'imagem_maior_5mb' });
      }
      if (isPdf && size > 10 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'pdf_maior_10mb' });
      }

      // Gera um nome único pro arquivo
      const ext = (file.originalname || '').includes('.')
        ? file.originalname.split('.').pop()
        : (isPdf ? 'pdf' : 'bin');

      const randomPart = crypto.randomBytes(8).toString('hex');
      const fileName   = `${Date.now()}_${randomPart}.${ext}`;

      // Caminho no Storage: fin/parcelas/{parcelaId}/{fileName}
      const storagePath = `fin/parcelas/${parcelaId}/${fileName}`;
      const blob = bucket.file(storagePath);

      // Salva o arquivo no Storage
      await blob.save(file.buffer, {
        contentType: mime,
        resumable: false,
        metadata: { contentType: mime }
      });

      // Gera URL de leitura (válida por muitos anos)
      const [signedUrl] = await blob.getSignedUrl({
        action: 'read',
        expires: '2100-01-01'
      });

      const agora = Math.floor(Date.now() / 1000);

      // Atualiza a parcela no banco (campo comprovante_url)
      db.prepare(`
        UPDATE parcelas
        SET comprovante_url = ?
        WHERE id = ?
      `).run(signedUrl, parcelaId);

      // Retorno que o front vai usar
      return res.json({
        ok: true,
        url: signedUrl,
        tipo: mime,
        dataUpload: agora,
        userId: req.user?.uid || null,
        parcelaId
      });
    } catch (err) {
      console.error('[fin/parcelas/:id/comprovante] Erro ao fazer upload:', err);
      return res.status(500).json({ ok: false, error: 'erro_interno' });
    }
  }
);
// ========================= FINANCEIRO — Remover comprovante de parcela (opcional) =========================
// DELETE /fin/parcelas/:id/comprovante
app.delete(
  '/fin/parcelas/:id/comprovante',
  verifyFirebaseToken,
  ensureAllowed('finance'),
  async (req, res) => {
    try {
      if (!bucket) {
        // Mesmo comportamento da rota de upload: sem Storage configurado
        return res.status(500).json({ ok: false, error: 'storage_desativado' });
      }

      const parcelaId = String(req.params.id || '').trim();
      if (!parcelaId) {
        return res.status(400).json({ ok: false, error: 'parcela_invalida' });
      }

      // Busca a parcela para descobrir a URL atual
      const row = db.prepare(`
        SELECT id, event_id, descricao, valor_cents, vencimento_iso, status,
               pago_em_iso, comprovante_url
        FROM parcelas
        WHERE id = ?
      `).get(parcelaId);

      if (!row) {
        return res.status(404).json({ ok: false, error: 'parcela_nao_encontrada' });
      }

      const url = row.comprovante_url;
      if (url) {
        try {
          // Tenta descobrir o caminho do arquivo dentro do bucket a partir da URL assinada
          const u = new URL(url);
          const fullPath = decodeURIComponent(u.pathname); // ex.: /meu-bucket/fin/parcelas/123/arquivo.pdf
          const prefix = `/${bucket.name}/`;
          const idx = fullPath.indexOf(prefix);

          if (idx >= 0) {
            const filePath = fullPath.slice(idx + prefix.length); // ex.: fin/parcelas/123/arquivo.pdf
            await bucket.file(filePath).delete({ ignoreNotFound: true });
          }
        } catch (e) {
          console.warn('[DELETE comprovante] Falha ao apagar do Storage (seguindo mesmo assim):', e?.message || e);
        }
      }

      // Limpa o campo no banco
      db.prepare(`
        UPDATE parcelas
        SET comprovante_url = NULL
        WHERE id = ?
      `).run(parcelaId);

      // Recarrega a parcela já atualizada
      const updated = db.prepare(`
        SELECT id, event_id, descricao, valor_cents, vencimento_iso, status,
               pago_em_iso, comprovante_url
        FROM parcelas
        WHERE id = ?
      `).get(parcelaId);

      return res.json({
        ok: true,
        removed: !!url,
        parcela: updated ? {
          id: updated.id,
          eventId: updated.event_id,
          descricao: updated.descricao || null,
          valor: (updated.valor_cents || 0) / 100,
          vencimentoISO: updated.vencimento_iso || null,
          status: updated.status,
          pagoEmISO: updated.pago_em_iso || null,
          comprovanteUrl: updated.comprovante_url || null
        } : null
      });
    } catch (err) {
      console.error('[DELETE /fin/parcelas/:id/comprovante] Erro ao remover comprovante:', err);
      return res.status(500).json({ ok: false, error: 'erro_interno' });
    }
  }
);

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

  // Aqui tratamos "parcelas" como saídas
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
// ========================= MÓDULO 3 – FUNIL E LISTAS AUXILIARES =========================

// --- Colunas do Funil ---
// GET /funil/colunas  → qualquer perfil que possa usar o funil (RBAC_SYNC_ROLES) pode ler
app.get('/funil/colunas', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const colunas = loadJSON(FUNIL_COLUNAS_FILE, []);
    // garante que seja sempre array
    const arr = Array.isArray(colunas) ? colunas : [];
    res.json({ ok: true, colunas: arr });
  } catch (e) {
    console.error('[funil/colunas][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_colunas' });
  }
});

// PUT /funil/colunas  → ADMIN atualiza o conjunto inteiro de colunas
// body esperado: { colunas: [ { nome, icone, descricao }, ... ] }
app.put('/funil/colunas', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  try {
    const body = req.body || {};
    const colunas = Array.isArray(body.colunas) ? body.colunas : [];

    // limpeza básica: só mantém campos esperados
    const limpas = colunas.map(c => ({
      nome      : String(c?.nome || '').trim(),
      icone     : String(c?.icone || '').trim(),
      descricao : String(c?.descricao || '').trim()
    }));

    saveJSON(FUNIL_COLUNAS_FILE, limpas);
    res.json({ ok: true, colunas: limpas });
  } catch (e) {
    console.error('[funil/colunas][PUT] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_salvar_colunas' });
  }
});


// --- Listas auxiliares (como conheceu, motivos etc.) ---
// GET /listas/:slug  → lê uma lista (qualquer perfil que use o funil pode ler)
app.get('/listas/:slug', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const slug = req.params.slug;
    const key  = getListKey(slug);
    if (!key) {
      return res.status(404).json({ ok: false, error: 'lista_nao_encontrada' });
    }

    const all   = loadListasAux();
    const items = Array.isArray(all[key]) ? all[key] : [];

      // devolve nos dois formatos: "items" e "itens"
    res.json({ ok: true, slug, items, itens: items });
  } catch (e) {
    console.error('[listas/:slug][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_lista' });
  }
});

// PUT /listas/:slug  → ADMIN sobrescreve a lista inteira
// body esperado: { items: ["Item 1", "Item 2", ...] }
app.put('/listas/:slug', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  try {
    const slug = req.params.slug;
    const key  = getListKey(slug);
    if (!key) {
      return res.status(404).json({ ok: false, error: 'lista_nao_encontrada' });
    }

    const body  = req.body || {};
    const items = Array.isArray(body.items)
      ? body.items
      : (Array.isArray(body.itens) ? body.itens : []);


    const all = loadListasAux();
    all[key] = items.map(v => String(v || '').trim()).filter(Boolean);
    saveListasAux(all);

        res.json({ ok: true, slug, items: all[key], itens: all[key] });
  } catch (e) {
    console.error('[listas/:slug][PUT] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_salvar_lista' });
  }
});

// ==== PORTAL DO CLIENTE – geração e validação de token ====

// Gera token seguro para o portal de um evento
app.post('/portal/token', verifyFirebaseToken, (req, res) => {
  try {
    const user = req.user || {};
    const tenantId = String(user.tenantId || 'default');

    const body = req.body || {};
    const eventId = String(body.eventId || body.id || '').trim();
    const eventoPublico = body.eventoPublico || body.evento || {};

    if (!eventId) {
      return res.status(400).json({ error: 'eventId obrigatório' });
    }

    const tokens = loadPortalTokens();

    // gera token aleatório
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');

    // monta só os dados "públicos" do evento (nada sensível)
    const safeEvento = {
      id: eventId,
      nomeEvento:
        eventoPublico.nomeEvento ||
        eventoPublico.titulo ||
        eventoPublico.nome ||
        '',
      dataEvento:
        eventoPublico.dataEvento ||
        eventoPublico.data ||
        eventoPublico.dataISO ||
        null,
      local:
        eventoPublico.local ||
        eventoPublico.endereco ||
        eventoPublico.salao ||
        '',
      qtdConvidados:
        eventoPublico.qtdConvidados ||
        eventoPublico.quantidadeConvidados ||
        null,
      cliente: eventoPublico.cliente || null,
    };

    tokens.push({
      token,
      tenantId,
      eventId,
      evento: safeEvento,
      createdAt: new Date().toISOString(),
    });

    savePortalTokens(tokens);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/area-cliente.html?token=${encodeURIComponent(
      token
    )}`;

    return res.json({ ok: true, token, link });
  } catch (err) {
    console.error('Erro em POST /portal/token', err);
    return res
      .status(500)
      .json({ error: 'Erro ao gerar token do portal do cliente' });
  }
});

// Valida token e devolve dados públicos do evento
app.get('/portal/me', (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'token obrigatório' });
    }

    const tokens = loadPortalTokens();
    const entry = tokens.find((t) => t.token === token);

    if (!entry) {
      return res
        .status(404)
        .json({ error: 'token inválido ou expirado', code: 'INVALID_TOKEN' });
    }

    // se quiser, aqui você pode aplicar regra de expiração por data (entry.createdAt)
    return res.json({ evento: entry.evento });
  } catch (err) {
    console.error('Erro em GET /portal/me', err);
    return res
      .status(500)
      .json({ error: 'Erro ao carregar evento do portal do cliente' });
  }
});

// ===== Integrações – teste de pagamentos (ETAPA 5.1) =====
app.post('/api/integracoes/test/payments', (req, res) => {
  try {
    const { gateway, pixKey } = req.body || {};

    if (!pixKey || !String(pixKey).trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Informe a chave PIX para testar a conexão.'
      });
    }

    // FUTURO:
    // Aqui você pode colocar um teste REAL com o gateway (Mercado Pago, Asaas, etc.).
    // Por enquanto, se chegou até aqui, consideramos o teste básico OK.

    return res.json({
      ok: true,
      message: 'Configurações de pagamentos recebidas. Teste básico OK.'
    });
  } catch (e) {
    console.error('[integracoes] erro em POST /api/integracoes/test/payments', e);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao testar pagamentos.'
    });
  }
});
// ===== Usuários (cadastro-usuario.html / usuarios.html) =====

// GET /usuarios -> lista todos (sem campo senha)
app.get('/usuarios', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, nome, email, whatsapp, perfil, foto, created_at
      FROM usuarios
      ORDER BY datetime(created_at) DESC
    `).all();

    return res.json({ status: 200, data: rows });
  } catch (err) {
    console.error('[usuarios] GET /usuarios erro:', err);
    return res.status(500).json({ status: 500, error: 'Erro ao listar usuários.' });
  }
});

// POST /usuarios -> cria novo usuário
app.post('/usuarios', (req, res) => {
  const { nome, email, whatsapp, perfil, senha, foto } = req.body || {};
  const emailNorm = String(email || '').toLowerCase().trim();

  if (!nome || !emailNorm || !perfil) {
    return res.status(400).json({ status: 400, error: 'Campos obrigatórios.' });
  }

  try {
    const exists = db
      .prepare('SELECT 1 FROM usuarios WHERE lower(email) = ?')
      .get(emailNorm);

    if (exists) {
      return res.status(409).json({ status: 409, error: 'Já existe um usuário com esse e-mail.' });
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO usuarios (id, nome, email, whatsapp, perfil, senha, foto, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(nome || '').trim(),
      emailNorm,
      String(whatsapp || ''),
      String(perfil || '').trim(),
      String(senha || ''),
      (typeof foto === 'string' ? foto : null),
      nowIso
    );

    const user = db
      .prepare('SELECT id, nome, email, whatsapp, perfil, foto, created_at FROM usuarios WHERE id = ?')
      .get(id);

    return res.status(201).json({ status: 201, data: user });
  } catch (err) {
    console.error('[usuarios] POST /usuarios erro:', err);
    return res.status(500).json({ status: 500, error: 'Erro ao criar usuário.' });
  }
});

// PUT /usuarios -> atualiza usuário (por id)
app.put('/usuarios', (req, res) => {
  const { id, nome, email, whatsapp, perfil, senha, foto } = req.body || {};

  if (!id) {
    return res.status(400).json({ status: 400, error: 'ID obrigatório.' });
  }

  try {
    const atual = db
      .prepare('SELECT * FROM usuarios WHERE id = ?')
      .get(id);

    if (!atual) {
      return res.status(404).json({ status: 404, error: 'Usuário não encontrado.' });
    }

    const emailNorm = email
      ? String(email).toLowerCase().trim()
      : atual.email;

    // Se trocou e-mail, verifica se já existe outro com esse e-mail
    if (emailNorm !== atual.email) {
      const outro = db
        .prepare('SELECT 1 FROM usuarios WHERE lower(email) = ? AND id <> ?')
        .get(emailNorm, id);

      if (outro) {
        return res.status(409).json({ status: 409, error: 'Já existe usuário com esse e-mail.' });
      }
    }

    db.prepare(`
      UPDATE usuarios
         SET nome     = ?,
             email    = ?,
             whatsapp = ?,
             perfil   = ?,
             senha    = ?,
             foto     = ?
       WHERE id = ?
    `).run(
      nome ?? atual.nome,
      emailNorm,
      whatsapp ?? atual.whatsapp,
      perfil ?? atual.perfil,
      (typeof senha === 'string' ? senha : atual.senha),
      (typeof foto === 'string' ? foto : atual.foto),
      id
    );

    const atualizado = db
      .prepare('SELECT id, nome, email, whatsapp, perfil, foto, created_at FROM usuarios WHERE id = ?')
      .get(id);

    return res.json({ status: 200, data: atualizado });
  } catch (err) {
    console.error('[usuarios] PUT /usuarios erro:', err);
    return res.status(500).json({ status: 500, error: 'Erro ao atualizar usuário.' });
  }
});

// DELETE /usuarios -> remove por id OU por email
app.delete('/usuarios', (req, res) => {
  const { id, email } = req.body || {};
  const emailNorm = email ? String(email).toLowerCase().trim() : null;

  if (!id && !emailNorm) {
    return res.status(400).json({ status: 400, error: 'ID ou e-mail obrigatório.' });
  }

  try {
    let changes = 0;

    if (id) {
      const info = db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
      changes += info.changes || 0;
    }

    if (!changes && emailNorm) {
      const info = db.prepare('DELETE FROM usuarios WHERE lower(email) = ?').run(emailNorm);
      changes += info.changes || 0;
    }

    if (!changes) {
      return res.status(404).json({ status: 404, error: 'Usuário não encontrado.' });
    }

    return res.json({ status: 200, data: { removed: changes } });
  } catch (err) {
    console.error('[usuarios] DELETE /usuarios erro:', err);
    return res.status(500).json({ status: 500, error: 'Erro ao remover usuário.' });
  }
});

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
