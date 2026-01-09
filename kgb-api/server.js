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
// Build identifier for debug/deploy verification
const BUILD_ID = `build_${new Date().toISOString()}`;
const pkg = (() => { try { return require('./package.json'); } catch (e) { return {}; }})();
const VERSION = pkg.version || process.env.SERVICE_VERSION || '0.0.0';
const bcrypt   = require('bcryptjs');

// Boot log to help identify which server.js is running on the host
console.log('[BOOT]', 'KGB API SERVER LOADED', new Date().toISOString());

// Optional AWS S3 presign support (enabled when AWS env vars are provided)
let s3Client = null;
let hasS3 = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET && process.env.AWS_REGION);
if (hasS3) {
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    console.log('[INFO] AWS S3 client configured for bucket', process.env.S3_BUCKET);
  } catch (e) {
    console.warn('[WARN] Failed to initialize AWS S3 client, continuing without S3 support', e && e.message);
    s3Client = null;
    hasS3 = false;
  }
} else {
  console.log('[INFO] AWS S3 not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET / AWS_REGION missing).');
}

// ===== Provider Mercado Pago (import dinâmico do arquivo mercadopago.mjs) =====
let mpProviderCache = null;

/**
 * Carrega o provider Mercado Pago (mercadopago.mjs) só uma vez.
 * Esse arquivo é ESM, então usamos import() dinâmico.
 */
async function getMercadoPagoProvider() {
  if (!mpProviderCache) {
    const mod = await import('./mercadopago.mjs');
    mpProviderCache = mod.default || mod;
  }
  return mpProviderCache;
}

// ========================= Config (.env) =========================
const PORT = process.env.PORT || 3333;
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

// Auth debug helper
const AUTH_DEBUG = process.env.AUTH_DEBUG === '1';
const dlog = (...args) => { if (AUTH_DEBUG) console.log('[AUTH_DEBUG]', ...args); };

// Runtime DB info (log once)
dlog('cwd=', process.cwd());
dlog('DB_PATH raw=', DB_PATH);
dlog('DB_PATH resolved=', path.resolve(DB_PATH));

// Initialize DB schema safely before any seed/migration/login runs
// Initialize DB schema safely before any seed/migration/login runs
function safeAddColumn(table, colDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
    console.log(`[DB] Added column ${table}.${colDef}`);
  } catch (e) {
    const msg = String(e && e.message || e || '');
    if (!msg.toLowerCase().includes('duplicate') && !msg.toLowerCase().includes('already exists') && !msg.toLowerCase().includes('duplicate column')) {
      console.warn(`[DB] safeAddColumn warn ${table}.${colDef}:`, msg);
    }
  }
}

function initDb() {
  // create usuarios (keep id as TEXT to preserve existing UUID usage)
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      nome TEXT,
      perfil TEXT,
      whatsapp TEXT,
      senha TEXT,
      senha_hash TEXT,
      must_change_password INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // password_resets table (used by recovery flow)
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT,
      token TEXT UNIQUE,
      expires_iso TEXT,
      used INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  // Safe-add missing columns for older DBs
  safeAddColumn('usuarios', "nome TEXT");
  safeAddColumn('usuarios', "perfil TEXT");
  safeAddColumn('usuarios', "whatsapp TEXT");
  safeAddColumn('usuarios', "senha TEXT");
  safeAddColumn('usuarios', "senha_hash TEXT");
  safeAddColumn('usuarios', "must_change_password INTEGER DEFAULT 0");
  safeAddColumn('usuarios', "created_at TEXT DEFAULT (datetime('now'))");

  // Try to migrate existing plain senha -> senha_hash (hash if needed)
  try {
    const cols = db.prepare("PRAGMA table_info(usuarios)").all().map(c => c.name);
    if (cols.includes('senha') && cols.includes('senha_hash')) {
      const rows = db.prepare('SELECT id, senha FROM usuarios').all();
      if (Array.isArray(rows) && rows.length) {
        const updateStmt = db.prepare('UPDATE usuarios SET senha_hash = ?, senha = ? WHERE id = ?');
        const tx = db.transaction((items) => {
          for (const r of items) {
            try {
              const raw = String(r.senha || '');
              if (!raw) continue;
              let hashed;
              if (raw.startsWith('$2')) {
                hashed = raw;
              } else {
                hashed = bcrypt.hashSync(raw, 10);
              }
              updateStmt.run(hashed, '', r.id);
            } catch (e) {
              console.warn('[migrate] failed to migrate senha for user', r && r.id, e && e.message);
            }
          }
        });
        tx(rows);
        console.log('[migrate] promoted existing usuarios.senha -> usuarios.senha_hash where applicable');
      }
    }
  } catch (e) {
    console.warn('[migrate] senha -> senha_hash migration failed', e && e.message);
  }
}

// Call initDb early to ensure core tables exist
initDb();

// Tabelas
db.exec(`
CREATE TABLE IF NOT EXISTS eventos (
  id TEXT PRIMARY KEY,
  valor_contrato_cents INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS parcelas (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  descricao TEXT,
  valor_cents INTEGER NOT NULL,
  vencimento_iso TEXT,
  status TEXT CHECK(status IN ('pendente','pago','atrasado')) DEFAULT 'pendente',
  comprovante_url TEXT,
  pago_em_iso TEXT,
  UNIQUE(id)
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
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  token TEXT,
  expires_iso TEXT,
  used INTEGER DEFAULT 0,
  created_at TEXT,
  UNIQUE(token)
);
CREATE TABLE IF NOT EXISTS cobrancas_bancarias (
  id TEXT PRIMARY KEY,
  gateway TEXT,
  metodo TEXT CHECK(metodo IN ('pix','boleto','cartao')) DEFAULT 'pix',
  status TEXT CHECK(status IN ('pendente','pago','cancelado')) DEFAULT 'pendente',
  event_id TEXT,
  origem TEXT, -- 'evento' ou 'dashboard'
  cliente_nome TEXT,
  cliente_doc TEXT,
  cliente_email TEXT,
  cliente_tel TEXT,
  total_cents INTEGER NOT NULL,
  n_parcelas INTEGER NOT NULL,
  vencimento_primeira_iso TEXT,
  criado_em_iso TEXT NOT NULL,
  pago_em_iso TEXT,
  raw_payload TEXT,
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

// Seed de admin compatível com frontend: cria admin@kgb.com se não existir
// NÃO rodar seed automático em produção — só quando NODE_ENV != 'production' e AUTO_SEED_ADMIN=1
if (process.env.NODE_ENV !== 'production' && process.env.AUTO_SEED_ADMIN === '1') {
  try {
    const ADMIN_EMAIL = 'admin@kgb.com';
    const existing = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(String(ADMIN_EMAIL).toLowerCase());
    if (!existing) {
      const id = crypto.randomUUID();
      const senhaHash = bcrypt.hashSync('123', 10);
      db.prepare('INSERT INTO usuarios(id,nome,email,whatsapp,perfil,senha_hash,senha,foto,created_at,must_change_password) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, 'Administrador', ADMIN_EMAIL, '', 'Administrador', senhaHash, '', '', new Date().toISOString(), 1);
      console.log('[SEED] admin criado: admin@kgb.com senha: 123 (must_change_password=1)');
    } else {
      console.log('[SEED] admin already exists:', existing.id || '(id?)');
    }
  } catch (e) {
    console.error('[SEED] erro ao garantir admin seed:', e && e.message);
  }
} else {
  console.log('[SEED] automatic admin seed skipped (production or AUTO_SEED_ADMIN not enabled)');
}

// Migração: garantir que a tabela `parcelas` aceite event_id NULL e não tenha FK rígida
try {
  const fkList = db.prepare("PRAGMA foreign_key_list('parcelas')").all();
  const colInfo = db.prepare("PRAGMA table_info('parcelas')").all();
  const eventCol = (colInfo || []).find(c => c.name === 'event_id');
  const hasFK = Array.isArray(fkList) && fkList.length > 0;
  const eventNotNull = eventCol ? (Number(eventCol.notnull) === 1) : false;
  if (hasFK || eventNotNull) {
    console.log('[migrate] ajustando tabela parcelas: removendo FK/NOT NULL em event_id');
    db.exec('BEGIN');
    db.exec(`
      CREATE TABLE IF NOT EXISTS parcelas_new (
        id TEXT PRIMARY KEY,
        event_id TEXT,
        descricao TEXT,
        valor_cents INTEGER NOT NULL,
        vencimento_iso TEXT,
        status TEXT CHECK(status IN ('pendente','pago','atrasado')) DEFAULT 'pendente',
        comprovante_url TEXT,
        pago_em_iso TEXT,
        UNIQUE(id)
      );
    `);
    // Copia dados existentes (event_id será preservado quando válido)
    db.exec(`INSERT INTO parcelas_new (id,event_id,descricao,valor_cents,vencimento_iso,status,comprovante_url,pago_em_iso) SELECT id,event_id,descricao,valor_cents,vencimento_iso,status,comprovante_url,pago_em_iso FROM parcelas;`);
    db.exec(`DROP TABLE parcelas;`);
    db.exec(`ALTER TABLE parcelas_new RENAME TO parcelas;`);
    db.exec('COMMIT');
    console.log('[migrate] migração parcelas concluída');
  }
} catch (e) {
  console.warn('[migrate] falha ao executar migração parcelas:', e && e.message);
}
db.exec(`
CREATE TABLE IF NOT EXISTS portal_eventos_publicos (
  event_id TEXT PRIMARY KEY,
  json     TEXT NOT NULL
);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY,
    nome TEXT,
    telefone TEXT,
    email TEXT,
    cidade TEXT,
    endereco TEXT,
    cpf_cnpj TEXT,
    observacoes TEXT,
    tags TEXT,
    status TEXT DEFAULT 'ativo',
    createdAt TEXT,
    updatedAt TEXT
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
// === TABELAS: PDV (vendas e movimentos de caixa) ===
db.exec(`
CREATE TABLE IF NOT EXISTS pdv_vendas (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  created_at_iso TEXT NOT NULL,
  operador TEXT,
  forma_id TEXT,
  forma_label TEXT,
  valor_bruto_cents INTEGER NOT NULL DEFAULT 0,
  desconto_cents INTEGER NOT NULL DEFAULT 0,
  valor_liquido_cents INTEGER NOT NULL DEFAULT 0,
  valor_pago_cents INTEGER NOT NULL DEFAULT 0,
  troco_cents INTEGER NOT NULL DEFAULT 0,
  categoria_id TEXT,
  subcategoria_id TEXT,
  origem TEXT,
  payload_json TEXT,
  created_by TEXT,
  tenant_id TEXT
);

CREATE TABLE IF NOT EXISTS pdv_movimentos (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  tipo TEXT NOT NULL, -- abertura, venda-itens, venda-ingressos, sangria, fechamento
  forma_label TEXT,
  valor_cents INTEGER NOT NULL DEFAULT 0,
  saldo_dinheiro_cents INTEGER NOT NULL DEFAULT 0,
  saldo_eletronico_cents INTEGER NOT NULL DEFAULT 0,
  resp TEXT,
  created_at_iso TEXT NOT NULL,
  created_by TEXT,
  tenant_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_pdv_vendas_event   ON pdv_vendas(event_id);
CREATE INDEX IF NOT EXISTS idx_pdv_vendas_created ON pdv_vendas(created_at_iso);
CREATE INDEX IF NOT EXISTS idx_pdv_mov_event      ON pdv_movimentos(event_id);
CREATE INDEX IF NOT EXISTS idx_pdv_mov_created    ON pdv_movimentos(created_at_iso);
`);
// === TABELA: docs_uploads — PDFs anexados manualmente em Contratos ===
db.exec(`
CREATE TABLE IF NOT EXISTS docs_uploads (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at_iso TEXT,
  UNIQUE(id)
);
CREATE INDEX IF NOT EXISTS idx_docs_uploads_event ON docs_uploads(event_id);
`);

// KV store para pequenos blobs JSON (usado por endpoints /buffet/*)
db.exec(`
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

// ========================= Firebase Admin (Storage) =========================
const admin = require('firebase-admin');

// Cloudinary opcional (upload para nuvem sem usar Firebase)
let cloudinary = null;
let hasCloudinary = false;
try {
  cloudinary = require('cloudinary').v2;
  hasCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
  if (hasCloudinary) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    console.log('[INFO] Cloudinary configurado ->', process.env.CLOUDINARY_CLOUD_NAME);
  } else {
    console.log('[INFO] Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET missing).');
  }
} catch (e) {
  // lib não instalada — não é fatal, apenas não usaremos Cloudinary
  cloudinary = null;
  hasCloudinary = false;
  console.log('[INFO] Cloudinary library não encontrada — ignorando Cloudinary support.');
}

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
  // Verifica se o bucket realmente existe no projeto; se não existir, desliga o suporte a Storage
  (async () => {
    try {
      // bucket.exists() retorna [exists]
      const [exists] = await bucket.exists();
      if (!exists) {
        console.warn('[WARN] Firebase bucket definido mas não existe ->', process.env.FIREBASE_STORAGE_BUCKET);
        bucket = null;
      } else {
        console.log('[INFO] Firebase Storage conectado ao bucket:', process.env.FIREBASE_STORAGE_BUCKET);
      }
    } catch (err) {
      console.warn('[WARN] Erro ao verificar Firebase bucket ->', err && err.message ? err.message : err);
      bucket = null;
    }
  })();
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
// (FEIRAS endpoints moved below to avoid using `app` before initialization)

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
// Em DEV: não confiar em proxy — usar host direto (evita comportamento de x-forwarded-proto alterando secure)
app.set('trust proxy', false);
const isDev = process.env.NODE_ENV !== 'production';

// ========================= Frontend no mesmo host (DEV) =========================
// Serve a pasta raiz do projeto (onde estão login.html, dashboard.html, js/, api/, etc.)
app.use(express.static(path.join(__dirname, '..')));

// Atalho: abrir "/" já manda para o login
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.use(cors({
  origin: function(origin, cb) {
    // permitir chamadas sem origin (curl, Postman) — considera same-origin
    if (!origin) return cb(null, true);

    if (origin === 'http://localhost:3333' || origin === 'http://127.0.0.1:3333') return cb(null, true);
    if (origin === 'http://localhost:5500' || origin === 'http://127.0.0.1:5500') return cb(null, true);

    // Netlify (produção + previews)
    if (origin === 'https://kgbprobuffet.netlify.app') return cb(null, true);
    if (origin && origin.endsWith('.netlify.app')) return cb(null, true);

    // negar sem lançar erro
    console.warn('[CORS] Origin não permitida:', origin);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-KGB-TOKEN','X-SEED-KEY']
}));

// Preflight OPTIONS com mesma política
app.options('*', cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true);
    if (origin === 'http://localhost:3333' || origin === 'http://127.0.0.1:3333') return cb(null, true);
    if (origin === 'http://localhost:5500' || origin === 'http://127.0.0.1:5500') return cb(null, true);
    // Netlify (produção + previews)
    if (origin === 'https://kgbprobuffet.netlify.app') return cb(null, true);
    if (origin && origin.endsWith('.netlify.app')) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type','Authorization','X-KGB-TOKEN','X-SEED-KEY']
}));

// Global CORS / preflight handler to ensure custom headers (X-SEED-KEY) are accepted
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-KGB-TOKEN, X-SEED-KEY');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Parser JSON global: deve ser declarado ANTES das rotas que esperam `req.body`.
// Mantemos rotas webhook que usam `rawJson` especificando `express.raw()` localmente.
app.use(express.json({ limit: '50mb' }));

// Diagnostic endpoint and boot log should be available early (before static/catch-all)
console.log('[BOOT]', 'express.json configured', new Date().toISOString());
// Track which feature routes are registered so deployed server can report
const BOOT_ROUTES = [];
app.get('/__debug/boot', (req, res) => {
  const hasBuffetRoutes = BOOT_ROUTES.includes('buffet');
  const hasEventosRoutes = BOOT_ROUTES.includes('eventos');
  res.json({
    ok: true,
    file: 'kgb-api/server.js',
    time: new Date().toISOString(),
    hasBuffetRoutes,
    hasEventosRoutes,
    routes: BOOT_ROUTES
  });
});

// ===== DEV/OPS: seed admin (PROTEGIDO) =====
// Uso: POST /dev/seed-admin com header X-SEED-KEY = process.env.SEED_KEY
// Body opcional: { email, senha, nome }
app.post('/dev/seed-admin', async (req, res) => {
  try {
    const SEED_KEY = process.env.SEED_KEY;
    if (!SEED_KEY) return res.status(404).json({ ok: false, error: 'Not found' });

    const provided = String(req.header('X-SEED-KEY') || '');
    if (provided !== String(SEED_KEY)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const email = String((req.body && req.body.email) || 'admin@kgb.com').toLowerCase().trim();
    const senha = String((req.body && req.body.senha) || 'Admin@12345').trim();
    const nome  = String((req.body && req.body.nome)  || 'Administrador').trim();

    if (senha.length < 8) return res.status(400).json({ ok: false, error: 'Senha deve ter pelo menos 8 caracteres' });

    const existing = db.prepare('SELECT id, email, nome, perfil FROM usuarios WHERE lower(email)=?').get(email);
    const hash = await bcrypt.hash(senha, 10);

    if (existing) {
      // update existing user: set new hash, clear legacy senha, force must_change_password
      try {
        const newNome = String((req.body && req.body.nome) || existing.nome || 'Administrador');
        const newPerfil = String((req.body && req.body.perfil) || existing.perfil || 'ADMIN');
        db.prepare('UPDATE usuarios SET senha_hash = ?, senha = ?, must_change_password = 1, nome = ?, perfil = ?, email = ? WHERE id = ?')
          .run(hash, '', newNome, newPerfil, email, existing.id);
        return res.json({ ok: true, created: false, updated: true, id: existing.id });
      } catch (e) {
        console.error('[SEED] failed to update existing admin user:', e && e.message);
        return res.status(500).json({ ok: false, error: 'Seed update failed' });
      }
    }

    try {
        const stmt = db.prepare(`
          INSERT INTO usuarios (email, senha_hash, senha, nome, perfil, created_at, must_change_password)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(email, hash, '', nome, 'ADMIN', new Date().toISOString(), 1);
      return res.json({ ok: true, created: true, id: info.lastInsertRowid, email });
    } catch (e1) {
        const stmt2 = db.prepare(`INSERT INTO usuarios (email, senha_hash, senha, must_change_password) VALUES (?, ?, ?, ?)`);
        const info2 = stmt2.run(email, hash, '', 1);
        return res.json({ ok: true, created: true, id: info2.lastInsertRowid, email, note: 'insert minimo (email,senha_hash)' });
    }
  } catch (err) {
    console.error('[SEED] error:', err);
    return res.status(500).json({ ok: false, error: 'Seed failed' });
  }
});

// List registered routes (methods + path) for debugging deployments
app.get('/__debug/routes', (req, res) => {
  try {
    const routes = [];
    const stack = (app._router && app._router.stack) || [];
    stack.forEach(layer => {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase());
        routes.push({ path: layer.route.path, methods });
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        layer.handle.stack.forEach(n => {
          if (n.route && n.route.path) {
            const methods = Object.keys(n.route.methods || {}).map(m => m.toUpperCase());
            routes.push({ path: n.route.path, methods });
          }
        });
      }
    });
    return res.json({ ok: true, count: routes.length, routes });
  } catch (e) {
    console.error('[DEBUG /__debug/routes] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// Cookies e JWT (autenticação por sessão via cookie httpOnly)
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || WEBHOOK_SECRET || 'troque-isto-jwt';

app.use(cookieParser());

// Compatibilidade: alias simples para versões legadas de rota
// Permite que POST /login seja tratado por /auth/login e GET /me por /auth/me
app.use((req, res, next) => {
  try {
    if (req.method === 'POST' && req.path === '/login') {
      req.url = '/auth/login';
    }
    if (req.method === 'GET' && req.path === '/me') {
      req.url = '/auth/me';
    }
  } catch (e) { /* ignore */ }
  return next();
});

function signToken(user) {
  const userId = user && (user.id ?? user.ID ?? user.Id);
  if (!userId) {
    dlog('signToken: missing user id, userKeys=', Object.keys(user || {}));
    throw new Error('Invalid user record (missing id)');
  }
  const tokenPayload = {
    id: userId,
    nome: user.nome,
    email: user.email,
    perfil: normalizePerfil(user.perfil)
  };
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });
}

// Normalize perfil strings to a small set of canonical display values
function normalizePerfil(raw) {
  try {
    const s = String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!s) return '';
    if (s.includes('admin')) return 'Administrador';
    if (s.includes('venda')) return 'Vendedor';
    if (s.includes('maitre') || s.includes('maitre')) return 'Maitre';
    if (s.includes('respons')) return 'Responsavel';
    // fallback: capitalize first letter
    return String(raw || '').charAt(0).toUpperCase() + String(raw || '').slice(1);
  } catch (e) {
    return String(raw || '');
  }
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}

// NOTE: switched to JWT-only tokens (no in-memory "kgb_" tokens)
const mockUsers = {
  'admin@kgb.com': { id: 'kgb-admin', nome: 'Administrador', email: 'admin@kgb.com', perfil: 'Administrador', permissoes: ['*'] },
  'vendas@kgb.com': { id: 'kgb-vendas', nome: 'Vendas', email: 'vendas@kgb.com', perfil: 'Vendedor', permissoes: ['vendas'] }
};

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ ok:false, error:'Unauthorized' });
  const token = m[1];
  try {
    if (!JWT_SECRET) return res.status(500).json({ ok:false, error:'Server misconfigured (JWT_SECRET)' });
    const payload = jwt.verify(token, JWT_SECRET);
    // Attach basic payload (id,email,perfil) — handlers may load full user if needed
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ ok:false, error:'Unauthorized' });
  }
}

// Rotas de autenticação: /auth/login, /auth/logout, /auth/me
app.post('/auth/login', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[AUTH] POST /auth/login req.headers=', req.headers);
    try { console.log('[AUTH] POST /auth/login body keys=', Object.keys(req.body || {})); } catch(e){}
  }
  const { email, senha } = req.body || {};
  const password = (senha ?? req.body?.password ?? '').toString();
  // expose build header to help detect which code is running
  try { res.setHeader('X-KGB-BUILD', BUILD_ID); } catch (e) {}
  console.log('[AUTH] login attempt (start)', { email, hasPassword: !!password, buildId: BUILD_ID });
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Missing email or password', buildId: BUILD_ID });

  try {
      const emailRaw = String(email || '');
      const emailNorm = emailRaw.trim().toLowerCase();
      // dup count for diagnostics
      try {
        const dup = db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE lower(trim(email)) = ?").get(emailNorm);
        dlog('login email=', emailNorm, 'dupCount=', dup && dup.c);
      } catch (e) { dlog('login dupCount failed', e && e.message); }

      let row = db.prepare(`
        SELECT
          COALESCE(u.id, u.rowid) as id,
          lower(trim(u.email)) as email,
          u.nome,
          u.perfil,
          u.senha_hash,
          u.senha,
          COALESCE(u.must_change_password, 0) as must_change_password
        FROM usuarios u
        WHERE lower(trim(u.email)) = ?
        LIMIT 1
      `).get(emailNorm);
      if (!row) {
        row = db.prepare(`
          SELECT
            COALESCE(u.id, u.rowid) as id,
            lower(trim(u.email)) as email,
            u.nome,
            u.perfil,
            u.senha_hash,
            u.senha,
            COALESCE(u.must_change_password, 0) as must_change_password
          FROM usuarios u
          WHERE lower(trim(u.nome)) = ?
          LIMIT 1
        `).get(emailNorm);
      }

      // If user not found, fail immediately (no fallback to mock)
      if (!row) {
        dlog('login: user not found', emailNorm);
        return res.status(401).json({ ok: false, error: 'Credenciais inválidas', buildId: BUILD_ID });
      }

      // Ensure id exists; try extra fallback to rowid if necessary
      if (!row.id) {
        try {
          const r2 = db.prepare(`SELECT rowid as id FROM usuarios WHERE lower(trim(email)) = ? LIMIT 1`).get(emailNorm);
          if (r2 && r2.id) row.id = r2.id;
        } catch (e) {
          dlog('login: fallback rowid failed', e && e.message);
        }
      }

      if (!row.id) {
        dlog('login: invalid user record missing id, rowKeys=', Object.keys(row || {}));
        return res.status(401).json({ ok: false, error: 'Credenciais inválidas', buildId: BUILD_ID });
      }

      // Se encontrou no DB, valida senha usando bcrypt (await) e atualiza legacy plaintext quando necessário
      if (row) {
        console.log('[AUTH] branch', 'db');
        try {
          let senhaOk = false;
          let bcryptOk = false;
          let legacyOk = false;
          const hasHash = !!(row.senha_hash && String(row.senha_hash).trim());
          const hasLegacy = !!(row.senha && String(row.senha).trim());
          if (hasHash) {
            bcryptOk = await bcrypt.compare(String(password || ''), String(row.senha_hash));
            senhaOk = bcryptOk;
          } else if (hasLegacy) {
            legacyOk = (String(password || '') === String(row.senha));
            senhaOk = legacyOk;
            if (legacyOk) {
              try {
                const newHash = await bcrypt.hash(String(password || ''), 10);
                db.prepare('UPDATE usuarios SET senha_hash = ?, senha = ? WHERE id = ?').run(newHash, '', row.id);
              } catch (e) {
                console.warn('[AUTH] failed to upgrade legacy senha to hash for user', row.id, e && e.message);
              }
            }
          }
          dlog('login check', { id: row.id, hasHash, hasLegacy, must_change_password: !!row.must_change_password, bcryptOk, legacyOk });
          console.log('[auth] login attempt', { email: emailNorm, userFound: true, passOk: !!senhaOk });
          if (!senhaOk) {
            console.warn('[AUTH] invalid credentials', { email, branch: 'db' });
            return res.status(401).json({ ok: false, error: 'Credenciais inválidas', buildId: BUILD_ID });
          }

          const userId = row.id ?? row.rowid;
          if (!userId) {
            dlog('login: invalid user record missing id, rowKeys=', Object.keys(row || {}));
            return res.status(500).json({ ok: false, error: 'Invalid user record (missing id)' });
          }
          const payload = { id: userId, nome: row.nome, email: row.email, perfil: row.perfil };
          const token = signToken(payload);

          // Em DEV: cookie httpOnly estático e consistente
          res.cookie('kgb_token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000
          });

          try { console.log('[AUTH] POST /auth/login -> Set-Cookie kgb_token (httpOnly) for user id=', payload.id, 'email=', payload.email); } catch(e){}
          // Expor o token JWT também no header para clientes que armazenam KGB_TOKEN
          try { res.setHeader('KGB_TOKEN', token); } catch (e) {}
          return res.status(200).json({ ok: true, token: token, mustChangePassword: !!row.must_change_password, user: { id: userId, email: row.email, nome: row.nome, perfil: normalizePerfil(row.perfil) }, buildId: BUILD_ID });
        } catch (errCompare) {
          console.warn('[AUTH] bcrypt compare failed', errCompare && errCompare.message);
          console.warn('[AUTH] invalid credentials', { email, branch: 'db', reason: 'compare_error' });
          return res.status(401).json({ ok: false, error: 'Credenciais inválidas', buildId: BUILD_ID });
        }
      }

      return res.status(401).json({ ok: false, error: 'Invalid credentials', buildId: BUILD_ID });
  } catch (err) {
    console.error('[auth] POST /auth/login erro:', err);
    return res.status(500).json({ ok: false, error: 'Erro interno', buildId: BUILD_ID });
  }
});

app.post('/auth/logout', (req, res) => {
  try {
    // limpar cookie com os mesmos atributos usados no set (DEV)
    res.clearCookie('kgb_token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    });
    if (process.env.NODE_ENV !== 'production') {
      try { console.log('[AUTH] POST /auth/logout -> cleared kgb_token cookie'); } catch(e){}
    }
    return res.json({ ok: true });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error('[auth] POST /auth/logout erro:', err);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

app.get('/auth/me', (req, res) => {
  // Suporta Authorization: Bearer <token> (in-memory tokenStore) OU cookie JWT (kgb_token)
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH] GET /auth/me req.cookies=', req.cookies);
      console.log('[AUTH] cookie header:', req.headers.cookie || '(none)');
      try { console.log('[AUTH] req.cookies:', Object.keys(req.cookies || {})); } catch(e){}
    }
  } catch(e){}

  // Primeiro: Authorization header (Bearer JWT) -> verify and load user
  try {
    const authH = String(req.headers.authorization || '');
    if (authH.toLowerCase().startsWith('bearer ')) {
      const bearer = authH.split(' ')[1];
      if (bearer) {
        try {
          if (!JWT_SECRET) return res.status(500).json({ ok:false, error:'Server misconfigured (JWT_SECRET)' });
          const payload = jwt.verify(bearer, JWT_SECRET);
          const u = db.prepare(`
            SELECT COALESCE(id, rowid) as id, email, nome, perfil
            FROM usuarios
            WHERE COALESCE(id, rowid) = ?
            LIMIT 1
          `).get(payload.id);
          if (!u) return res.status(401).json({ ok: false, error: 'User not found' });
          return res.json({ ok: true, data: { id: u.id, email: u.email, nome: u.nome, perfil: normalizePerfil(u.perfil) } });
        } catch (e) {
          // invalid/expired bearer, fallthrough to cookie
        }
      }
    }
  } catch (e) { /* continuar para cookie fallback */ }

  // Fallback: cookie JWT (existing behavior)
  const token = req.cookies && req.cookies.kgb_token;
  if (!token) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ ok: false, error: 'Invalid token' });

  try {
    const u = db.prepare(`
      SELECT COALESCE(id, rowid) as id, email, nome, perfil
      FROM usuarios
      WHERE COALESCE(id, rowid) = ?
      LIMIT 1
    `).get(decoded.id);
    if (!u) return res.status(401).json({ ok: false, error: 'User not found' });
    return res.json({ ok: true, data: { id: u.id, email: u.email, nome: u.nome, perfil: normalizePerfil(u.perfil) } });
  } catch (err) {
    console.error('[auth] GET /auth/me erro:', err);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// Simple version endpoint to validate deployed code
app.get('/version', (req, res) => {
  try {
    return res.json({ ok: true, service: 'kgb-api', version: VERSION, env: process.env.NODE_ENV || 'production', ts: Date.now(), buildId: BUILD_ID });
  } catch (e) {
    return res.json({ ok: true, service: 'kgb-api', version: VERSION, env: process.env.NODE_ENV || 'production', ts: Date.now(), buildId: BUILD_ID });
  }
});

// Insecure legacy endpoint removed: respond 404 for /auth/reset-password
app.post('/auth/reset-password', (_req, res) => {
  return res.status(404).json({ ok: false, error: 'Not found' });
});

// POST /auth/recover — inicia fluxo de recuperação (esqueci senha)
app.post('/auth/recover', async (req, res) => {
  try {
    const { email } = req.body || {};
    // Always return 200 to avoid leaking which emails exist
    if (!email) return res.json({ ok: true });

    const identifier = String(email || '').toLowerCase();
    const user = db.prepare('SELECT id,email FROM usuarios WHERE lower(email) = ?').get(identifier);
    if (!user) {
      console.log('[AUTH] recover requested for', identifier, '-> no user found (silent)');
      return res.json({ ok: true });
    }

    // generate token and store in password_resets
    const token = crypto.randomBytes(32).toString('hex');
    const id = crypto.randomUUID();
    const expires = new Date(Date.now() + (30 * 60 * 1000)).toISOString(); // 30 minutes
    db.prepare('INSERT INTO password_resets(id,user_id,email,token,expires_iso,used,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, user.id, user.email, token, expires, 0, new Date().toISOString());

    // Determine if request is from DEV/localhost
    const hostHeader = String(req.get('host') || '').toLowerCase();
    const isDev = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1') || ((process.env.NODE_ENV || '') !== 'production');

    // FRONT_URL used for local dev overrides; fallback to local Live Server
    const devFront = process.env.FRONT_URL || 'http://127.0.0.1:5500';
    const prodFront = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const frontend = isDev ? devFront : prodFront;

    const resetLink = `${frontend.replace(/\/+$/,'')}/redefinir-senha.html?token=${token}`;
    console.log('[AUTH] password reset link (log):', resetLink);

    // Always return ok:true to avoid leaking existence of email.
    // In DEV only, include resetUrl to speed up local testing.
    if (isDev) return res.json({ ok: true, resetUrl: resetLink });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[auth] POST /auth/recover erro:', e && e.message);
    return res.json({ ok: true });
  }
});

// POST /auth/reset — finaliza redefinição via token
app.post('/auth/reset', async (req, res) => {
  try {
    const { token, novaSenha } = req.body || {};
    if (!token || !novaSenha) return res.status(400).json({ ok: false, error: 'Missing token or novaSenha' });
    if (String(novaSenha).length < 8) return res.status(400).json({ ok: false, error: 'novaSenha must be >= 8 chars' });

    const row = db.prepare('SELECT id,user_id,email,token,expires_iso,used FROM password_resets WHERE token = ?').get(String(token));
    if (!row) return res.status(400).json({ ok: false, error: 'Token inválido ou expirado' });
    if (row.used) return res.status(400).json({ ok: false, error: 'Token inválido ou expirado' });
    if (new Date(row.expires_iso) < new Date()) return res.status(400).json({ ok: false, error: 'Token inválido ou expirado' });

    const hash = await bcrypt.hash(String(novaSenha), 10);
    if (row.user_id) {
      db.prepare('UPDATE usuarios SET senha_hash = ?, senha = ? WHERE id = ?').run(hash, '', row.user_id);
    } else if (row.email) {
      db.prepare('UPDATE usuarios SET senha_hash = ?, senha = ? WHERE lower(email) = ?').run(hash, '', String(row.email).toLowerCase());
    }
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[auth] POST /auth/reset erro:', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// POST /auth/change-password — usuário autenticado troca sua senha obrigatória
app.post('/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { novaSenha } = req.body || {};
    if (!novaSenha || String(novaSenha).length < 8) return res.status(400).json({ ok: false, error: 'novaSenha must be >= 8 chars' });

    // Garantir que temos id do usuário (compatibilidade com diferentes formas de req.user)
    const uid = (req.user && (req.user.id || req.user.userId || req.user.uid)) || (req.user?.id ?? req.user?.userId ?? req.user?.uid);
    if (!uid) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

    // email normalization and dup count for diagnostics (if available)
    try {
      const userEmail = req.user && req.user.email ? String(req.user.email) : '';
      const emailNorm = userEmail ? userEmail.trim().toLowerCase() : '';
      if (emailNorm) {
        const dup = db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE lower(trim(email)) = ?").get(emailNorm);
        dlog('change-password uid=', uid, 'email=', emailNorm, 'dupCount=', dup && dup.c);
      }
    } catch (e) { dlog('change-password dupCount failed', e && e.message); }

    const hash = await bcrypt.hash(String(novaSenha), 10);
    const info = db.prepare('UPDATE usuarios SET senha_hash = ?, senha = ?, must_change_password = 0 WHERE COALESCE(id,rowid) = ?').run(hash, '', uid);
    if (!info || Number(info.changes || 0) === 0) {
      return res.status(400).json({ ok: false, error: 'Senha não aplicada (user não encontrado)' });
    }

    // Post-update diagnostics
    try {
      const after = db.prepare('SELECT id, email, must_change_password, senha_hash, senha FROM usuarios WHERE id = ?').get(uid);
      if (after) {
        const hasHash = !!(after.senha_hash && String(after.senha_hash).trim());
        const hasLegacy = !!(after.senha && String(after.senha).trim());
        const hashPrefix = hasHash ? String(after.senha_hash).slice(0,7) : '';
        dlog('change-password result', { id: after.id, email: after.email, must_change_password: !!after.must_change_password, hasHash, hasLegacy, hashPrefix });
      }
    } catch (e) { dlog('change-password post-select failed', e && e.message); }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[auth] POST /auth/change-password erro:', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// ==================== Endpoints /buffet/* (KV-backed) ====================
// Persistem pequenos blobs JSON por chave no SQLite (kv_store)
console.log('[BOOT]', 'Registering /buffet routes');
if (!BOOT_ROUTES.includes('buffet')) BOOT_ROUTES.push('buffet');
app.get('/buffet/produtos', requireAuth, (req, res) => {
  try {
    const data = kvGet('buffet_produtos', '[]');
    return res.json({ ok: true, data });
  } catch (e) {
    console.error('[GET /buffet/produtos] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

app.put('/buffet/produtos', requireAuth, (req, res) => {
  try {
    const data = (req.body && (req.body.data !== undefined ? req.body.data : req.body)) || [];
    kvPut('buffet_produtos', data);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[PUT /buffet/produtos] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

app.get('/buffet/adicionais', requireAuth, (req, res) => {
  try {
    const data = kvGet('buffet_adicionais', '[]');
    return res.json({ ok: true, data });
  } catch (e) {
    console.error('[GET /buffet/adicionais] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

app.put('/buffet/adicionais', requireAuth, (req, res) => {
  try {
    const data = (req.body && (req.body.data !== undefined ? req.body.data : req.body)) || [];
    kvPut('buffet_adicionais', data);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[PUT /buffet/adicionais] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

app.get('/buffet/servicos', requireAuth, (req, res) => {
  try {
    const data = kvGet('buffet_servicos', '[]');
    return res.json({ ok: true, data });
  } catch (e) {
    console.error('[GET /buffet/servicos] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

app.put('/buffet/servicos', requireAuth, (req, res) => {
  try {
    const data = (req.body && (req.body.data !== undefined ? req.body.data : req.body)) || [];
    kvPut('buffet_servicos', data);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[PUT /buffet/servicos] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// ==================== Endpoints /eventos/* (KV-backed minimal API)
// Simple storage for frontend migration (eventos list persisted as JSON)
console.log('[BOOT]', 'Registering /eventos routes');
if (!BOOT_ROUTES.includes('eventos')) BOOT_ROUTES.push('eventos');

// GET /eventos -> retorna array de eventos (chave KV: 'eventos')
app.get('/eventos', requireAuth, (req, res) => {
  try {
    const data = kvGet('eventos', '[]');
    return res.json({ ok: true, data });
  } catch (e) {
    console.error('[GET /eventos] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// PUT /eventos -> substitui lista completa de eventos
app.put('/eventos', requireAuth, (req, res) => {
  try {
    const data = (req.body && (req.body.data !== undefined ? req.body.data : req.body)) || [];
    kvPut('eventos', data);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[PUT /eventos] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// GET /eventos/:id -> retorna 1 evento por id (404 se não existir)
app.get('/eventos/:id', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id obrigatório' });
    const all = kvGet('eventos', '[]');
    const ev = Array.isArray(all) ? all.find(e => String(e.id) === id) : null;
    if (!ev) return res.status(404).json({ ok: false, error: 'Evento não encontrado' });
    return res.json({ ok: true, data: ev });
  } catch (e) {
    console.error('[GET /eventos/:id] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// PUT /eventos/:id -> atualiza um evento específico (upsert na lista)
app.put('/eventos/:id', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id obrigatório' });
    const body = req.body || {};
    const all = kvGet('eventos', '[]');
    const arr = Array.isArray(all) ? all.slice() : [];
    const idx = arr.findIndex(e => String(e.id) === id);
    const now = new Date().toISOString();

    const updated = { ...(idx >= 0 ? arr[idx] : {}), ...body, id, updatedAt: now };
    if (idx >= 0) arr[idx] = updated; else arr.push(updated);
    kvPut('eventos', arr);
    return res.json({ ok: true, data: updated });
  } catch (e) {
    console.error('[PUT /eventos/:id] erro', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
  }
});

// Rota de debug para inspecionar headers e cookies (apenas em desenvolvimento)
// Removed /auth/debug (dev-only debug endpoint) as part of debug cleanup

// ========================= PATCH F.0 — bases, storage utils, journal =========================
const DATA_DIR = path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

function loadJSON(file, fb) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch { return fb; }
}
function saveJSON(file, obj) {
  const fp = path.join(DATA_DIR, file);
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2), 'utf8');

  // If Firebase Storage is configured, upload the saved JSON to the bucket
  // asynchronously so we preserve the current synchronous behavior.
  if (bucket) {
    (async () => {
      try {
        await bucket.file(file).save(JSON.stringify(obj, null, 2), {
          contentType: 'application/json'
        });
        console.log('[INFO] saveJSON: uploaded to Firebase Storage ->', file);
      } catch (err) {
        // Common failure modes:
        // - 404 / notFound: bucket name invalid or project misconfigured
        // - permission errors
        // For local dev we want a quieter log and actionable hint.
        const code = err && err.code;
        if (code === 404 || String(err?.message || '').toLowerCase().includes('notfound') || String(err?.message || '').toLowerCase().includes('not found')) {
          console.warn('[WARN] saveJSON: Firebase bucket not found for upload ->', file, '-', err?.message || err);
        } else {
          console.warn('[WARN] saveJSON: failed uploading to Firebase Storage ->', file, err?.message || err);
        }
      }
    })();
  }
}
// Simple KV store persisted in SQLite for small JSON blobs (used by frontend)
function kvGet(key, fallbackJsonString = '[]') {
  try {
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
    if (!row || !row.value) return JSON.parse(fallbackJsonString);
    try { return JSON.parse(row.value); } catch (e) { return JSON.parse(fallbackJsonString); }
  } catch (e) {
    console.warn('[kvGet] erro ao ler key', key, e && e.message);
    try { return JSON.parse(fallbackJsonString); } catch { return []; }
  }
}

function kvPut(key, data) {
  try {
    const value = JSON.stringify(data ?? null);
    const now = Date.now();
    db.prepare(`INSERT INTO kv_store(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(key, value, now);
    return { ok: true };
  } catch (e) {
    console.error('[kvPut] falha ao gravar key', key, e && e.message);
    return { ok: false, error: e && e.message };
  }
}
// === CONVITES / CHECK-IN (M30/M31) ===
const CONVITES_LOGS_FILE = 'convites-logs.json';

// garante que o arquivo exista
try {
  const fp = path.join(DATA_DIR, CONVITES_LOGS_FILE);
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, '[]', 'utf8');
  }
} catch (e) {
  console.error('Falha ao inicializar CONVITES_LOGS_FILE', e);
}

function loadConviteLogs() {
  return loadJSON(CONVITES_LOGS_FILE, []);
}
function saveConviteLogs(logs) {
  return saveJSON(CONVITES_LOGS_FILE, logs || []);
}
// Journal do sync (lista de mudanças em arquivo)
const JOURNAL_FILE = 'journal.json';
const LEADS_FILE = 'leads.json';
const FEIRAS_FILE = 'feiras.json';
const FEIRA_LEADS_FILE = 'feira-leads.json';
const FOTOS_FILE = 'fotos-clientes.json';
const LEADS_HISTORY_FILE = 'leads-historico.json';
const ORCAMENTOS_FILE = 'orcamentos.json';
const CLIENTES_FILE = 'clientes.json';
const EVENTOS_FILE = 'eventos.json';
const ESTOQUE_MATERIAIS_FILE   = 'estoque-materiais.json';
const ESTOQUE_SETORES_FILE     = 'estoque-setores.json';
const ESTOQUE_INSUMOS_FILE     = 'estoque-insumos.json';
const ESTOQUE_MOVIMENTOS_FILE  = 'estoque-movimentos.json';
const CHECKLIST_LINKS_FILE = 'checklist-links.json';


// === GET /leads/:id — retorna um lead específico (por ID) ===
app.get('/leads/:id', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const leadId   = String(req.params.id || '').trim();

    if (!leadId) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    const allLeads = loadJSON(LEADS_FILE, []);
    const leads    = Array.isArray(allLeads) ? allLeads : [];

    const lead = leads.find(
      (l) => String(l.id) === leadId && String(l.tenantId || 'default') === tenantId
    );

    if (!lead) {
      return res.status(404).json({ error: 'Lead não encontrado' });
    }

    return res.json({ ok: true, data: lead });
  } catch (e) {
    console.error('[GET /leads/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao buscar lead' });
  }
});
// === POST /leads — cria ou atualiza um lead (Módulo 7) ===
app.post('/leads', express.json({ limit: '50mb' }), requireAuth, (req, res) => {

  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const body     = req.body || {};

    // id do lead (se não mandar, geramos um)
    let id = String(body.id || '').trim();
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    }

    const allLeads = loadJSON(LEADS_FILE, []);
    const leads    = Array.isArray(allLeads) ? allLeads : [];

    const idx = leads.findIndex(
      (l) => String(l.id) === id && String(l.tenantId || 'default') === tenantId
    );

    // base do lead que vamos salvar
    const leadBase = {
      ...body,
      id,
      tenantId
    };

    // se o front já mandou token, usamos ele; senão geramos um
    if (!leadBase.token) {
      leadBase.token =
        (crypto.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36))) +
        '-' + Math.random().toString(36).slice(2, 6);
    }

    if (idx >= 0) {
      // atualiza lead existente
      const antigo = leads[idx];
      leads[idx] = {
        ...antigo,
        ...leadBase,
        id: antigo.id,
        tenantId: antigo.tenantId || tenantId
      };
    } else {
      // novo lead
      leads.push(leadBase);
    }

    saveJSON(LEADS_FILE, leads);

    // Log e retorno do lead completo (para o front receber os campos enviados)
    const savedLead = (idx >= 0) ? leads[idx] : leadBase;
    console.log('[POST /leads] body:', body);
    console.log('[POST /leads] saved:', savedLead && (typeof savedLead === 'object' ? JSON.stringify(savedLead) : savedLead));

    return res.json({ ok: true, data: savedLead });
  } catch (e) {
    console.error('[POST /leads] erro:', e);
    return res.status(500).json({ error: 'Erro ao salvar lead' });
  }
});

// === POST /public/leads — rota pública para criação de leads sem autenticação ===
app.post('/public/leads', express.json({ limit: '50mb' }), (req, res) => {
  try {
    const body = req.body || {};
    const tenantId = String(body.tenantId || 'default');

    // validações mínimas
    const nome = String(body.nome || '').trim();
    const whatsapp = String(body.whatsapp || '').trim();
    const email = String(body.email || '').trim();
    if (!nome || (!whatsapp && !email)) {
      return res.status(400).json({ ok: false, error: 'Campos obrigatórios: nome e (whatsapp ou email)' });
    }

    // id do lead
    let id = String(body.id || '').trim();
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    }

    const allLeads = loadJSON(LEADS_FILE, []);
    const leads = Array.isArray(allLeads) ? allLeads : [];

    const leadBase = {
      ...body,
      id,
      tenantId,
      status: body.status || 'Novo Lead'
    };

    if (!leadBase.token) {
      leadBase.token = (crypto.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36))) + '-' + Math.random().toString(36).slice(2, 6);
    }

    leads.push(leadBase);
    saveJSON(LEADS_FILE, leads);

    return res.status(201).json({ ok: true, lead: leadBase });
  } catch (e) {
    console.error('[POST /public/leads] erro:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao criar lead' });
  }
});
// ========================= CLIENTES (MÓDULO 10) =========================

app.get('/clientes', (req, res) => {
  try {
    // usa better-sqlite3 (sincrono)
    try {
      const rows = db.prepare('SELECT * FROM clientes').all();
      return res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
    } catch (e) {
      console.error('ERRO SQL /clientes:', e?.message || e);
      return res.json({ ok: true, data: [] });
    }
  } catch (err) {
    console.error('ERRO GERAL /clientes:', err);
    return res.json({ ok: true, data: [] });
  }
});



// GET /clientes/:id — retorna um cliente específico
app.get('/clientes/:id', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const id = String(req.params.id || '').trim();

    if (!id) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    const all = loadJSON(CLIENTES_FILE, []);
    const clientes = Array.isArray(all) ? all : [];

    const cli = clientes.find(
      c => String(c.id) === id && String(c.tenantId || 'default') === tenantId
    );

    if (!cli) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    return res.json({ ok: true, data: cli });
  } catch (e) {
    console.error('[GET /clientes/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

// POST /clientes — cria um novo cliente
app.post('/clientes', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const body = req.body || {};

    const all = loadJSON(CLIENTES_FILE, []);
    const clientes = Array.isArray(all) ? all : [];

    const id = String(body.id || crypto.randomUUID());
    const nowIso = new Date().toISOString();

    const novoCliente = {
      ...body,
      id,
      tenantId,
      createdAt: body.createdAt || nowIso,
      updatedAt: nowIso,
    };

    clientes.push(novoCliente);
    saveJSON(CLIENTES_FILE, clientes);

    // Também grava/atualiza na tabela SQLite para manter consistência
    try {
      const stmt = db.prepare(`INSERT OR REPLACE INTO clientes
        (id, nome, telefone, email, cidade, endereco, cpf_cnpj, observacoes, tags, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      stmt.run(
        String(novoCliente.id),
        novoCliente.nome || null,
        novoCliente.telefone || null,
        novoCliente.email || null,
        novoCliente.cidade || null,
        novoCliente.endereco || null,
        novoCliente.cpf_cnpj || null,
        novoCliente.observacoes || null,
        Array.isArray(novoCliente.tags) ? (novoCliente.tags.join(',')) : (typeof novoCliente.tags === 'string' ? novoCliente.tags : null),
        novoCliente.status || 'ativo',
        novoCliente.createdAt || nowIso,
        novoCliente.updatedAt || nowIso
      );
    } catch (e) {
      console.warn('[POST /clientes] falha ao gravar em SQLite:', e?.message || e);
    }
    return res.status(201).json({ ok: true, data: novoCliente });
  } catch (e) {
    console.error('[POST /clientes] erro:', e);
    return res.status(500).json({ error: 'Erro ao salvar cliente' });
  }
});

// PUT /clientes/:id — atualiza um cliente existente
app.put('/clientes/:id', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const id = String(req.params.id || '').trim();
    const body = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    const all = loadJSON(CLIENTES_FILE, []);
    const clientes = Array.isArray(all) ? all : [];

    const idx = clientes.findIndex(
      c => String(c.id) === id && String(c.tenantId || 'default') === tenantId
    );

    if (idx === -1) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const atual = clientes[idx];

    const atualizado = {
      ...atual,
      ...body,
      id,
      tenantId,
      createdAt: atual.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    clientes[idx] = atualizado;
    saveJSON(CLIENTES_FILE, clientes);

    return res.json({ ok: true, data: atualizado });
  } catch (e) {
    console.error('[PUT /clientes/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

// DELETE /clientes/:id — remove um cliente
app.delete('/clientes/:id', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const id = String(req.params.id || '').trim();

    if (!id) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    const all = loadJSON(CLIENTES_FILE, []);
    const clientes = Array.isArray(all) ? all : [];

    const restantes = clientes.filter(
      c => !(String(c.id) === id && String(c.tenantId || 'default') === tenantId)
    );

    if (restantes.length === clientes.length) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    saveJSON(CLIENTES_FILE, restantes);

    return res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /clientes/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao remover cliente' });
  }
});

  // ========================= FEIRAS / FEIRA_LEADS =========================
  // GET /feiras — lista de feiras
  app.get('/feiras', requireAuth, (req, res) => {
    try {
      const arr = loadJSON(FEIRAS_FILE, []);
      return res.json({ ok: true, data: Array.isArray(arr) ? arr : [] });
    } catch (e) {
      console.error('[GET /feiras] erro:', e);
      return res.json({ ok: true, data: [] });
    }
  });

  // POST /feiras — cria ou atualiza (se enviar id)
  app.post('/feiras', express.json({ limit: '50mb' }), requireAuth, (req, res) => {
    try {
      const body = req.body || {};
      const all = loadJSON(FEIRAS_FILE, []);
      const id = String(body.id || crypto.randomUUID());
      const idx = all.findIndex(f => String(f.id) === id);
      const now = new Date().toISOString();
      const feira = { ...(body || {}), id, criadoEm: body.criadoEm || now };
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...feira };
      } else {
        all.push(feira);
      }
      saveJSON(FEIRAS_FILE, all);
      return res.status(idx >= 0 ? 200 : 201).json({ ok: true, data: feira });
    } catch (e) {
      console.error('[POST /feiras] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao salvar feira' });
    }
  });

  // PUT /feiras/:id — atualiza feira
  app.put('/feiras/:id', express.json({ limit: '50mb' }), requireAuth, (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'id obrigatório' });
      const body = req.body || {};
      const all = loadJSON(FEIRAS_FILE, []);
      const idx = all.findIndex(f => String(f.id) === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'Feira não encontrada' });
      all[idx] = { ...all[idx], ...body };
      saveJSON(FEIRAS_FILE, all);
      return res.json({ ok: true, data: all[idx] });
    } catch (e) {
      console.error('[PUT /feiras/:id] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao atualizar feira' });
    }
  });

  // GET /feiraLeads — lista de leads captados em feiras
  app.get('/feiraLeads', requireAuth, (req, res) => {
    try {
      const arr = loadJSON(FEIRA_LEADS_FILE, []);
      return res.json({ ok: true, data: Array.isArray(arr) ? arr : [] });
    } catch (e) {
      console.error('[GET /feiraLeads] erro:', e);
      return res.json({ ok: true, data: [] });
    }
  });

  // POST /feiraLeads — cria ou atualiza
  app.post('/feiraLeads', express.json({ limit: '50mb' }), requireAuth, (req, res) => {
    try {
      const body = req.body || {};
      const all = loadJSON(FEIRA_LEADS_FILE, []);
      const id = String(body.id || crypto.randomUUID());
      const idx = all.findIndex(x => String(x.id) === id);
      const now = new Date().toISOString();
      const rec = { ...(body || {}), id, criadoEm: body.criadoEm || now };
      if (idx >= 0) all[idx] = { ...all[idx], ...rec }; else all.push(rec);
      saveJSON(FEIRA_LEADS_FILE, all);
      return res.status(idx >= 0 ? 200 : 201).json({ ok: true, data: rec });
    } catch (e) {
      console.error('[POST /feiraLeads] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao salvar feiraLead' });
    }
  });

  // PUT /feiraLeads/:id
  app.put('/feiraLeads/:id', express.json({ limit: '50mb' }), requireAuth, (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'id obrigatório' });
      const body = req.body || {};
      const all = loadJSON(FEIRA_LEADS_FILE, []);
      const idx = all.findIndex(x => String(x.id) === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: 'Lead de feira não encontrado' });
      all[idx] = { ...all[idx], ...body };
      saveJSON(FEIRA_LEADS_FILE, all);
      return res.json({ ok: true, data: all[idx] });
    } catch (e) {
      console.error('[PUT /feiraLeads/:id] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao atualizar feiraLead' });
    }
  });

  // (leads endpoints for general listing/updates may already exist elsewhere)

  // ========================= FOTOS CLIENTES =========================
  // GET /fotosClientes — retorna o mapa completo de fotos
  app.get('/fotosClientes', requireAuth, (req, res) => {
    try {
      const obj = loadJSON(FOTOS_FILE, {});
      return res.json({ ok: true, data: obj });
    } catch (e) {
      console.error('[GET /fotosClientes] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao ler fotos' });
    }
  });

  // POST /fotosClientes — grava/replace do mapa completo
  app.post('/fotosClientes', express.json({ limit: '5mb' }), requireAuth, (req, res) => {
    try {
      const body = req.body || {};
      if (!body || Object.keys(body).length === 0) {
        return res.status(400).json({ ok: false, error: 'payload vazio' });
      }
      // Fazer merge para manter compatibilidade com PUT (append/overwrite)
      const all = loadJSON(FOTOS_FILE, {});
      const merged = { ...all, ...body };
      saveJSON(FOTOS_FILE, merged);
      return res.status(201).json({ ok: true, data: merged });
    } catch (e) {
      console.error('[POST /fotosClientes] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao salvar fotos' });
    }
  });

  // PUT /fotosClientes — merge/atualiza chaves enviadas no mapa existente
  app.put('/fotosClientes', express.json({ limit: '5mb' }), requireAuth, (req, res) => {
    try {
      const body = req.body || {};
      if (!body || Object.keys(body).length === 0) {
        return res.status(400).json({ ok: false, error: 'payload vazio' });
      }
      const all = loadJSON(FOTOS_FILE, {});
      // sobrescreve as chaves enviadas, mantém as demais
      const merged = { ...all, ...body };
      saveJSON(FOTOS_FILE, merged);
      return res.json({ ok: true, data: merged });
    } catch (e) {
      console.error('[PUT /fotosClientes] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao atualizar fotos' });
    }
  });

  // PUT /fotosClientes/:key — atualiza uma chave específica do mapa
  app.put('/fotosClientes/:key', express.json({ limit: '2mb' }), requireAuth, (req, res) => {
    try {
      const key = String(req.params.key || '').trim();
      if (!key) return res.status(400).json({ ok: false, error: 'key obrigatório' });
      const body = req.body;
      const all = loadJSON(FOTOS_FILE, {});
      all[key] = body;
      saveJSON(FOTOS_FILE, all);
      return res.json({ ok: true, data: { key, value: body } });
    } catch (e) {
      console.error('[PUT /fotosClientes/:key] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao atualizar foto' });
    }
  });


if (!fs.existsSync(path.join(DATA_DIR, JOURNAL_FILE))) saveJSON(JOURNAL_FILE, []);

// Auditoria (log em arquivo para endpoints /audit/log e .csv)
const AUDIT_FILE = 'audit.json';
// >>> CONFIGURAÇÕES DO FUNIL / LISTAS (MÓDULO 3) <<<
const FUNIL_COLUNAS_FILE = 'funil-colunas.json';          // colunas do funil
const LISTAS_AUX_FILE    = 'listas-auxiliares.json';      // listas tipo "como conheceu" etc.
const CATALOGO_FILE      = 'catalogo.json';               // cardápios, adicionais, serviços

// garante que os arquivos existem
if (!fs.existsSync(path.join(DATA_DIR, FUNIL_COLUNAS_FILE))) {
  // começa vazio (o front pode semear "Novo Lead" na primeira gravação)
  saveJSON(FUNIL_COLUNAS_FILE, []);
}
if (!fs.existsSync(path.join(DATA_DIR, LISTAS_AUX_FILE))) {
  // objeto com várias listas dentro
  saveJSON(LISTAS_AUX_FILE, {});
}

// garante que o arquivo de catálogo exista
if (!fs.existsSync(path.join(DATA_DIR, CATALOGO_FILE))) {
  saveJSON(CATALOGO_FILE, {
    cardapios: [],
    adicionais: [],
    servicos: []
  });
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
// helpers do CATÁLOGO (cardápios, adicionais, serviços)
function loadCatalogo() {
  const raw = loadJSON(CATALOGO_FILE, null);
  const base = (!raw || typeof raw !== 'object') ? {} : raw;

  return {
    cardapios : Array.isArray(base.cardapios)  ? base.cardapios  : [],
    adicionais: Array.isArray(base.adicionais) ? base.adicionais : [],
    servicos  : Array.isArray(base.servicos)   ? base.servicos   : []
  };
}

function saveCatalogo(cat) {
  const norm = {
    cardapios : Array.isArray(cat.cardapios)  ? cat.cardapios  : [],
    adicionais: Array.isArray(cat.adicionais) ? cat.adicionais : [],
    servicos  : Array.isArray(cat.servicos)   ? cat.servicos   : []
  };
  saveJSON(CATALOGO_FILE, norm);
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
   req.user = {
  uid: 'dev',
  email: 'dev@local',
  tenantId: (req.headers['x-tenant-id'] || 'default'),
  roles: ['Administrador','sync','admin','owner'],
  permissions: ['sync','read','write','admin'],
};

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
    // Permite tudo em modo de desenvolvimento quando DISABLE_AUTH=1
    if (String(process.env.DISABLE_AUTH||'0') === '1') return next();

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

// Depois dos webhooks em raw: (parse global já declarado antes das rotas)

// ========================= M6 – Funil de Leads: API básica =========================

// GET /leads → lista leads do funil (usado no sync inicial)
app.get('/leads', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');

    const all = loadJSON(LEADS_FILE, []);
    let leads = Array.isArray(all)
      ? all.filter(l => String(l.tenantId || 'default') === tenantId)
      : [];

    // Filtro opcional: ?ids=1,2,3
    const idsStr = String(req.query.ids || '').trim();
    if (idsStr) {
      const idSet = new Set(
        idsStr.split(',').map(s => s.trim()).filter(Boolean)
      );
      leads = leads.filter(ld => idSet.has(String(ld.id)));
    }

    // pode devolver array direto (getLeadsAll aceita isso)
    return res.json(leads);
  } catch (e) {
    console.error('[GET /leads] erro:', e);
    return res.status(500).json({ error: 'Erro ao listar leads' });
  }
});

// PUT /leads/:id → chamado quando você arrasta o card de coluna
app.put('/leads/:id', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const id = String(req.params.id || '').trim();

    if (!id) {
      return res.status(400).json({ error: 'id é obrigatório' });
    }

    const all = loadJSON(LEADS_FILE, []);
    const leads = Array.isArray(all) ? all : [];
    const idx = leads.findIndex(
      l => String(l.id) === id && String(l.tenantId || 'default') === tenantId
    );

    if (idx < 0) {
      return res.status(404).json({ error: 'Lead não encontrado' });
    }

    const lead = { ...leads[idx] };
    const body = req.body || {};

    if (body.status != null) lead.status = String(body.status);
    if (body.dataFechamento != null) lead.dataFechamento = body.dataFechamento;
    if (body.proximoContato != null) lead.proximoContato = body.proximoContato;
    if (body.responsavel != null) lead.responsavel = body.responsavel;

    leads[idx] = lead;
    saveJSON(LEADS_FILE, leads);

    return res.json({ ok: true, lead });
  } catch (e) {
    console.error('[PUT /leads/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
});

// DELETE /leads/:id — remove um lead
app.delete('/leads/:id', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const id = String(req.params.id || '').trim();

    if (!id) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    const all = loadJSON(LEADS_FILE, []);
    const leads = Array.isArray(all) ? all : [];

    const restantes = leads.filter(
      l => !(String(l.id) === id && String(l.tenantId || 'default') === tenantId)
    );

    if (restantes.length === leads.length) {
      return res.status(404).json({ error: 'Lead não encontrado' });
    }

    saveJSON(LEADS_FILE, restantes);

    return res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /leads/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao remover lead' });
  }
});

// GET /leads/metrics → indicadores do funil (usado pelo funil-leads.js)
app.get('/leads/metrics', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const body = req.body || {};
    let ids = body.ids;

    if (Array.isArray(ids)) {
      ids = ids.map(v => String(v));
    } else {
      ids = [];
    }

    const all = loadJSON(LEADS_FILE, []);
    let leads = Array.isArray(all)
      ? all.filter(l => String(l.tenantId || 'default') === tenantId)
      : [];

    if (ids.length) {
      const set = new Set(ids);
      leads = leads.filter(l => set.has(String(l.id)));
    }

    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    const parseDate = (v) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d) ? null : d;
    };

    const isCurrentMonth = (v) => {
      const d = parseDate(v);
      if (!d) return false;
      return d.getMonth() === curMonth && d.getFullYear() === curYear;
    };

    // Total no mês (pela data do evento)
    const totalMes = leads.filter(l => isCurrentMonth(l.dataEvento)).length;

    // Coluna com mais leads
    const porCol = {};
    leads.forEach(l => {
      const s = l.status || 'Novo Lead';
      porCol[s] = (porCol[s] || 0) + 1;
    });
    let topColunaNome = '–';
    let topColunaQtd = 0;
    Object.keys(porCol).forEach(nome => {
      const qtd = porCol[nome];
      if (qtd > topColunaQtd) {
        topColunaQtd = qtd;
        topColunaNome = nome;
      }
    });

    // Tempo médio p/ fechar (dias)
    const fechados = leads.filter(l =>
      String(l.status || '').toLowerCase().startsWith('fechado')
    );
    const duracoes = fechados
      .map(l => {
        const ini = parseDate(l.dataCriacao || l.criadoEm || l.dataCadastro);
        const fim = parseDate(l.dataFechamento);
        if (!ini || !fim) return null;
        const diffDias = (fim - ini) / 86400000;
        return diffDias >= 0 ? diffDias : null;
      })
      .filter(v => v != null);

    const tempoMedioFechamentoDias = duracoes.length
      ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length
      : null;

    // Taxa de conversão
    const total = leads.length || 0;
    const taxaConversaoPercent = total
      ? (fechados.length / total) * 100
      : 0;

    return res.json({
      totalMes,
      topColunaNome,
      topColunaQtd,
      tempoMedioFechamentoDias,
      taxaConversaoPercent,
    });
  } catch (e) {
    console.error('[GET /leads/metrics] erro:', e);
    return res.status(500).json({ error: 'Erro ao calcular métricas de leads' });
  }
});
// ======================================================
//  ORÇAMENTOS – /orcamentos  (Módulo 7)
// ======================================================

// GET /orcamentos → lista orçamentos (filtra por tenant e opcional ?ids=1,2)
app.get('/orcamentos', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const all = loadJSON(ORCAMENTOS_FILE, []);
    let orcs = Array.isArray(all) ? all.filter(o => String(o.tenantId || 'default') === tenantId) : [];

    const idsStr = String(req.query.ids || '').trim();
    if (idsStr) {
      const idSet = new Set(idsStr.split(',').map(s => s.trim()).filter(Boolean));
      orcs = orcs.filter(o => idSet.has(String(o.id)));
    }

    // Filtrar por status (ex.: ?status=arquivado)
    const statusQ = String(req.query.status || '').trim().toLowerCase();
    if (statusQ) {
      const filtered = orcs.filter(o => {
        const s = String(o.status || o.situacao || o?.dados?.status || '').toLowerCase();
        const arquivadoFlag = !!(o.arquivamento || o.arquivado || o.motivoArquivamento || o.dataArquivamento || (s && s.includes('arquiv')));
        if (statusQ === 'arquivado' || statusQ === 'arquivados') return arquivadoFlag || s.includes('arquiv');
        if (statusQ === 'ativo' || statusQ === 'ativos') return !arquivadoFlag && (!s || !s.includes('arquiv'));
        return s === statusQ;
      });
      return res.json({ ok: true, items: filtered, orcamentos: filtered });
    }

    return res.json(orcs);
  } catch (e) {
    console.error('[GET /orcamentos] erro:', e);
    return res.status(500).json({ error: 'Erro ao listar orçamentos' });
  }
});

// GET /orcamentos/:id → retorna um orçamento específico
app.get('/orcamentos/:id', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const id = String(req.params.id || '').trim();

    if (!id) return res.status(400).json({ error: 'id obrigatório' });

    const all = loadJSON(ORCAMENTOS_FILE, []);
    const orcs = Array.isArray(all) ? all : [];

    const orc = orcs.find(o => String(o.id) === id && String(o.tenantId || 'default') === tenantId);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

    return res.json({ ok: true, data: orc });
  } catch (e) {
    console.error('[GET /orcamentos/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao buscar orçamento' });
  }
});

// PUT /orcamentos/:id → atualiza parcialmente um orçamento existente
app.put('/orcamentos/:id', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const orcId = String(req.params.id || '').trim();
    if (!orcId) return res.status(400).json({ error: 'id obrigatório' });

    const body = req.body || {};
    const all = loadJSON(ORCAMENTOS_FILE, []);
    const orcs = Array.isArray(all) ? all : [];

    const idx = orcs.findIndex(o => String(o.id) === orcId && String(o.tenantId || 'default') === tenantId);
    if (idx < 0) return res.status(404).json({ error: 'Orçamento não encontrado' });

    const antigo = orcs[idx];
    const agora = new Date().toISOString();

    // Atualiza campos permitidos (dados, leadId, status e campos de arquivamento)
    const atualizado = {
      ...antigo,
      leadId: body.leadId !== undefined ? body.leadId : antigo.leadId,
      dados: body.dados !== undefined ? body.dados : antigo.dados,
      status: body.status !== undefined ? body.status : (antigo.status !== undefined ? antigo.status : undefined),
      motivoArquivamento: body.motivoArquivamento !== undefined ? body.motivoArquivamento : (antigo.motivoArquivamento || null),
      dataArquivamento: body.dataArquivamento !== undefined ? body.dataArquivamento : (body.status && String(body.status).toLowerCase().includes('arquiv') ? (new Date().toISOString()) : antigo.dataArquivamento),
      arquivado: (body.status && String(body.status).toLowerCase().includes('arquiv')) || antigo.arquivado || false,
      updatedAt: agora
    };

    orcs[idx] = atualizado;
    saveJSON(ORCAMENTOS_FILE, orcs);

    return res.json({ ok: true, orcamento: atualizado });
  } catch (e) {
    console.error('[PUT /orcamentos/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao atualizar orçamento' });
  }
});

// POST /orcamentos → cria ou atualiza um orçamento
// A ideia é funcionar como "upsert": se vier id, atualiza; se não vier, cria um novo.
app.post('/orcamentos', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const body     = req.body || {};

    // Você pode mandar:
    // - id (opcional) → se vier, tentamos atualizar esse orçamento
    // - leadId (recomendado) → amarra orçamento ao lead
    let id = String(body.id || '').trim();
    const leadId = body.leadId ? String(body.leadId).trim() : '';

    const all = loadJSON(ORCAMENTOS_FILE, []);
    const orcs = Array.isArray(all) ? all : [];

    const agora = new Date().toISOString();

    let idx = -1;
    if (id) {
      idx = orcs.findIndex(
        o => String(o.id) === id && String(o.tenantId || 'default') === tenantId
      );
    }

    // Se não mandou id, geramos um
    if (!id) {
      id = crypto.randomUUID();
    }

    const baseOrc = {
      id,
      tenantId,
      leadId: leadId || null,
      // Aqui guardamos o "snapshot" do orçamento que vier do front
      dados: body.dados || body.detalhes || body.orcamento || body,
      createdAt: agora,
      updatedAt: agora
    };

    if (idx >= 0) {
      // Atualiza orçamento existente (mesmo id + tenant)
      const antigo = orcs[idx];
      orcs[idx] = {
        ...antigo,
        ...baseOrc,
        createdAt: antigo.createdAt || baseOrc.createdAt,
        updatedAt: agora
      };
    } else {
      // Novo orçamento
      orcs.push(baseOrc);
    }

    saveJSON(ORCAMENTOS_FILE, orcs);

    return res.json({ ok: true, orcamento: baseOrc });
  } catch (e) {
    console.error('[POST /orcamentos] erro:', e);
    return res.status(500).json({ error: 'Erro ao salvar orçamento' });
  }
});

// GET /orcamentos/:id → retorna um orçamento específico
app.get('/orcamentos/:id', requireAuth, (req, res) => {
  try {
    const tenantId   = String(req.user?.tenantId || 'default');
    const orcIdParam = String(req.params.id || '').trim();

    if (!orcIdParam) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    const all = loadJSON(ORCAMENTOS_FILE, []);
    const orcs = Array.isArray(all) ? all : [];

    const orc = orcs.find(
      o => String(o.id) === orcIdParam && String(o.tenantId || 'default') === tenantId
    );

    if (!orc) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    return res.json({ ok: true, orcamento: orc });
  } catch (e) {
    console.error('[GET /orcamentos/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao buscar orçamento' });
  }
});
// === GET /proposta/:token — endpoint público da proposta ===
app.get('/proposta/:token', (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'token obrigatório' });
    }

    const allLeads = loadJSON(LEADS_FILE, []);
    const leads    = Array.isArray(allLeads) ? allLeads : [];

    // procura pelo token de proposta
    const lead = leads.find(l => String(l.token || '') === token);

    if (!lead) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    // Monta um objeto "seguro" só com o que a proposta pública precisa
    const safeLead = {
      id: lead.id,
      token: lead.token,
      nome: lead.nome || lead.cliente || '',
      cliente: lead.cliente || '',
      tipoEvento: lead.tipoEvento || '',
      dataEvento: lead.dataEvento || '',
      dataEventoISO: lead.dataEventoISO || '',
      dataEventoBR: lead.dataEventoBR || '',
      horarioEvento: lead.horarioEvento || '',
      local: lead.local || '',
      qtd: lead.qtd || lead.convidados || '',
      convidados: lead.convidados || '',
      observacoes: lead.observacoes || '',
      valorTotal: lead.valorTotal || 0,
      descontoReais: lead.descontoReais || 0,
      descontoPorcentagem: lead.descontoPorcentagem || 0,
      cardapios_enviados: lead.cardapios_enviados || [],
      adicionaisSelecionados: lead.adicionaisSelecionados || [],
      servicosSelecionados: lead.servicosSelecionados || []
    };

    return res.json({ ok: true, data: safeLead });
  } catch (e) {
    console.error('[GET /proposta/:token] erro:', e);
    return res.status(500).json({ error: 'Erro ao buscar proposta' });
  }
});

// POST /leads/historico → adiciona item de histórico na timeline do lead
app.post('/leads/historico', requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const body = req.body || {};

    const leadId = String(body.leadId || '').trim();
    const item   = body.item || null;

    if (!leadId || !item || Object.keys(item).length === 0) {
      return res.status(400).json({ error: 'leadId e item são obrigatórios' });
    }

    // 1) Atualiza histórico dentro do próprio lead (em leads.json)
    const allLeads = loadJSON(LEADS_FILE, []);
    const leads = Array.isArray(allLeads) ? allLeads : [];

    const idx = leads.findIndex(
      l => String(l.id) === leadId && String(l.tenantId || 'default') === tenantId
    );

    if (idx >= 0) {
      const lead = { ...leads[idx] };
      if (!Array.isArray(lead.historico)) lead.historico = [];

      const nowIso = new Date().toISOString();
      lead.historico.push({
        ...item,
        dataISO: item.dataISO || nowIso,
      });

      leads[idx] = lead;
      saveJSON(LEADS_FILE, leads);
    }

    // 2) Opcional: registra também em um arquivo separado de histórico
    const histAll = loadJSON(LEADS_HISTORY_FILE, []);
    const histArr = Array.isArray(histAll) ? histAll : [];
    histArr.push({
      tenantId,
      leadId,
      ...item,
      ts: Date.now(),
    });
    saveJSON(LEADS_HISTORY_FILE, histArr);

    return res.json({ ok: true });
  } catch (e) {
    console.error('[POST /leads/historico] erro:', e);
    return res.status(500).json({ error: 'Erro ao registrar histórico do lead' });
  }
});

// ========================= NOTIFICAÇÕES FEED (M33) =========================

// GET /notificacoes → lista todas / ou filtradas por audience
app.get('/notificacoes', (req, res) => {
  try {
    const audience = String(req.query.audience || '').trim();
    let sql = "SELECT * FROM notificationsFeed";
    const args = [];

    if (audience) {
      sql += " WHERE audience = ?";
      args.push(audience);
    }

    sql += " ORDER BY datetime(createdAt) DESC";

    const rows = args.length
      ? db.prepare(sql).all(...args)
      : db.prepare(sql).all();

    return res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[GET /notificacoes] erro:', e);
    return res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
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
// POST /notificacoes/marcar-todas-lidas → marca todas as notificações como lidas
app.post('/notificacoes/marcar-todas-lidas', (req, res) => {
  try {
    // no futuro podemos usar isso pra segmentar por área (comercial, financeiro, etc.)
    const audience = String(req.body?.audience || '').trim();

    if (audience) {
      // Marca como lidas só as notificações de uma "audiência" específica
      db.prepare(`UPDATE notificationsFeed SET read = 1 WHERE audience = ?`).run(audience);
    } else {
      // Se não enviar audiência, marca TODAS como lidas
      db.prepare(`UPDATE notificationsFeed SET read = 1`).run();
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[POST /notificacoes/marcar-todas-lidas] erro:', err);
    return res.status(500).json({ error: 'Erro ao marcar notificações como lidas.' });
  }
});

// POST /notificacoes/marcar-todas-lidas → marca todas como lidas
app.post('/notificacoes/marcar-todas-lidas', (req, res) => {
  try {
    const audience = String(req.body?.audience || '').trim();

    if (audience) {
      // Marca como lidas só as notificações daquele público (ex.: "comercial", "financeiro")
      db.prepare(`UPDATE notificationsFeed SET read = 1 WHERE audience = ?`).run(audience);
    } else {
      // Se não mandar audience, marca TODAS como lidas
      db.prepare(`UPDATE notificationsFeed SET read = 1`).run();
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[POST /notificacoes/marcar-todas-lidas] erro:', e);
    return res.status(500).json({ error: 'Erro ao marcar notificações como lidas.' });
  }
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

/**
 * POST /contratos
 * Cria um contrato (admin) — corpo: { eventoId, contratoHtml, dadosCliente }
 */
app.post('/contratos', express.json({ limit: '50mb' }), requireAuth, (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const { eventoId, contratoHtml, dadosCliente } = req.body || {};
    if (!eventoId || !contratoHtml) return res.status(400).json({ error: 'eventoId e contratoHtml são obrigatórios.' });

    const token = gerarTokenAssinatura();
    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO eventos(id) VALUES(?)`).run(String(eventoId));

    const stmt = db.prepare(`
      INSERT INTO assinaturas_contratos (
        token, event_id, contrato_html, dados_cliente_json,
        status_cliente, status_empresa, created_at_iso, updated_at_iso
      ) VALUES (?, ?, ?, ?, 'pendente','pendente', ?, ?)
    `);
    const info = stmt.run(token, String(eventoId), String(contratoHtml), JSON.stringify(dadosCliente || {}), now, now);

    return res.status(201).json({ ok: true, id: info.lastInsertRowid, token });
  } catch (e) {
    console.error('[POST /contratos] erro:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao criar contrato.' });
  }
});

// GET /contratos/:id -> retorna contrato por id
app.get('/contratos/:id', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatório.' });
    const row = db.prepare(`SELECT * FROM assinaturas_contratos WHERE id = ? LIMIT 1`).get(id);
    if (!row) return res.status(404).json({ error: 'Contrato não encontrado.' });
    let dados = {};
    try { dados = JSON.parse(row.dados_cliente_json || '{}'); } catch { dados = {}; }
    return res.json({ ok: true, data: { id: row.id, token: row.token, eventoId: row.event_id, contratoHtml: row.contrato_html, dadosCliente: dados, statusCliente: row.status_cliente, statusEmpresa: row.status_empresa, createdAt: row.created_at_iso, updatedAt: row.updated_at_iso } });
  } catch (e) {
    console.error('[GET /contratos/:id] erro:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao buscar contrato.' });
  }
});

// PUT /contratos/:id -> atualiza parcialmente
app.put('/contratos/:id', express.json({ limit: '50mb' }), requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || '').trim(); if (!id) return res.status(400).json({ error: 'id obrigatório.' });
    const body = req.body || {};
    const row = db.prepare(`SELECT * FROM assinaturas_contratos WHERE id = ? LIMIT 1`).get(id);
    if (!row) return res.status(404).json({ error: 'Contrato não encontrado.' });
    const now = new Date().toISOString();
    const atualizado = {
      contrato_html: body.contratoHtml !== undefined ? String(body.contratoHtml) : row.contrato_html,
      dados_cliente_json: body.dadosCliente !== undefined ? JSON.stringify(body.dadosCliente || {}) : row.dados_cliente_json,
      status_cliente: body.statusCliente !== undefined ? String(body.statusCliente) : row.status_cliente,
      status_empresa: body.statusEmpresa !== undefined ? String(body.statusEmpresa) : row.status_empresa,
      updated_at_iso: now
    };
    db.prepare(`
      UPDATE assinaturas_contratos SET contrato_html = @contrato, dados_cliente_json = @dados, status_cliente = @sc, status_empresa = @se, updated_at_iso = @ts WHERE id = @id
    `).run({ contrato: atualizado.contrato_html, dados: atualizado.dados_cliente_json, sc: atualizado.status_cliente, se: atualizado.status_empresa, ts: atualizado.updated_at_iso, id });
    return res.json({ ok: true, data: { id, ...atualizado } });
  } catch (e) {
    console.error('[PUT /contratos/:id] erro:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao atualizar contrato.' });
  }
});

// DELETE /contratos/:id -> remove
app.delete('/contratos/:id', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id || '').trim(); if (!id) return res.status(400).json({ error: 'id obrigatório.' });
    const result = db.prepare(`DELETE FROM assinaturas_contratos WHERE id = ?`).run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Contrato não encontrado.' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /contratos/:id] erro:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao apagar contrato.' });
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

    // 1) Começa com o que foi salvo no token (se existir)
    let evPublic = entry.evento || {};

    // 2) Tenta complementar com os dados oficiais do evento (eventos.json)
    try {
      const allEventos = loadJSON(EVENTOS_FILE, []);
      const evFull = Array.isArray(allEventos)
        ? allEventos.find(e =>
            String(e.id) === String(entry.eventId || entry.event_id)
          )
        : null;

      if (evFull) {
        evPublic = {
          ...evPublic,
          id: evFull.id,
          nomeEvento:
            evFull.nomeEvento ||
            evFull.titulo ||
            evFull.nome ||
            evPublic.nomeEvento ||
            '',
          dataEvento:
            evFull.dataEvento ||
            evFull.data ||
            evFull.dataISO ||
            evPublic.dataEvento ||
            null,
          local:
            evFull.local ||
            evFull.endereco ||
            evFull.salao ||
            evPublic.local ||
            '',
          qtdConvidados:
            evFull.qtdConvidados ||
            evFull.quantidadeConvidados ||
            evPublic.qtdConvidados ||
            null,
          cliente: evFull.cliente || evPublic.cliente || null,
        };
      }
    } catch (e) {
      console.warn(
        '[portal/me] Não consegui complementar dados do evento oficial:',
        e?.message || e
      );
    }

    return res.json({ evento: evPublic });
  } catch (err) {
    console.error('Erro em GET /portal/me', err);
    return res
      .status(500)
      .json({ error: 'Erro ao carregar evento do portal do cliente' });
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

// GET /portal/eventos/:id/timeline — retorna timeline de um evento (portal)
app.get('/portal/eventos/:id/timeline', verifyFirebaseToken, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const TIMELINE_FILE = 'portal_timeline.json';
    const all = loadJSON(TIMELINE_FILE, {});
    const items = Array.isArray(all[id]) ? all[id] : [];
    return res.json({ ok: true, items });
  } catch (e) {
    console.error('[portal] erro em GET /portal/eventos/:id/timeline', e);
    return res.status(500).json({ ok: false, error: 'Erro ao carregar timeline.' });
  }
});

// POST /portal/eventos/:id/timeline — adiciona um item à timeline
app.post('/portal/eventos/:id/timeline', verifyFirebaseToken, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const TIMELINE_FILE = 'portal_timeline.json';
    const all = loadJSON(TIMELINE_FILE, {});
    if (!Array.isArray(all[id])) all[id] = [];
    const item = req.body || {};
    if (!item.id) item.id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,8);
    all[id].push(item);
    saveJSON(TIMELINE_FILE, all);
    return res.json({ ok: true, items: all[id] });
  } catch (e) {
    console.error('[portal] erro em POST /portal/eventos/:id/timeline', e);
    return res.status(500).json({ ok: false, error: 'Erro ao gravar timeline.' });
  }
});

// PUT /portal/eventos/:id/timeline — substitui lista ou atualiza item por id
app.put('/portal/eventos/:id/timeline', verifyFirebaseToken, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const TIMELINE_FILE = 'portal_timeline.json';
    const all = loadJSON(TIMELINE_FILE, {});
    if (!Array.isArray(all[id])) all[id] = [];

    const body = req.body || {};
    if (Array.isArray(body.items)) {
      all[id] = body.items;
      saveJSON(TIMELINE_FILE, all);
      return res.json({ ok: true, items: all[id] });
    }

    // upsert single item by id
    const item = body;
    if (item && item.id) {
      let found = false;
      all[id] = all[id].map(it => { if (it && String(it.id) === String(item.id)) { found = true; return item; } return it; });
      if (!found) all[id].push(item);
      saveJSON(TIMELINE_FILE, all);
      return res.json({ ok: true, items: all[id] });
    }

    return res.status(400).json({ ok: false, error: 'Invalid body: provide { items: [...] } or an item with id' });
  } catch (e) {
    console.error('[portal] erro em PUT /portal/eventos/:id/timeline', e);
    return res.status(500).json({ ok: false, error: 'Erro ao atualizar timeline.' });
  }
});

// ===== API minimal (temporário) — endpoints para `eventos-pagos.html`

// Inicializa DB em memória do servidor quando ausente
if (!globalThis.__MEM_DB__) globalThis.__MEM_DB__ = { itens: [], ingressoTipos: [], tickets: [], finConfig: {} };

// GET /financeiro/config
app.get('/financeiro/config', requireAuth, (req, res) => {
  try {
    // Tenta ler de uma fonte persistente (se existir), senão usa memória em processo
    let cfg = {};
    try {
      const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financeiro_config'").get();
      if (hasTable) {
        const row = db.prepare(`SELECT json FROM financeiro_config LIMIT 1`).get();
        if (row && row.json) cfg = JSON.parse(row.json || '{}');
      }
    } catch (e) {
      // ignore — fallback para memória
    }
    if (!cfg || Object.keys(cfg).length === 0) cfg = globalThis.__MEM_DB__.finConfig || {};
    return res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error('GET /financeiro/config failed', e);
    return res.status(500).json({ ok: false, error: 'erro_ao_carregar_config_financeiro' });
  }
});

// GET /itens
app.get('/itens', requireAuth, (req, res) => {
  try {
    const eventoId = req.query?.eventoId ? String(req.query.eventoId) : null;
    let arr = [];
    try {
      const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='itens'").get();
      if (hasTable) {
        const rows = eventoId ? db.prepare("SELECT * FROM itens WHERE event_id = ?").all(eventoId) : db.prepare("SELECT * FROM itens").all();
        arr = (rows || []).map(r => ({ id: r.id, eventoId: r.event_id || r.evento_id || r.eventoId || null, nome: r.nome || r.name || null, preco: (r.preco_cents||r.preco||0)/100, ativo: r.ativo !== 0 && r.ativo !== false }));
      } else {
        arr = (globalThis.__MEM_DB__.itens || []).filter(x => !eventoId || String(x.eventoId) === String(eventoId));
      }
    } catch (e) {
      arr = (globalThis.__MEM_DB__.itens || []).filter(x => !eventoId || String(x.eventoId) === String(eventoId));
    }
    return res.json({ ok: true, items: arr, itens: arr });
  } catch (e) {
    console.error('GET /itens failed', e);
    return res.status(500).json({ ok: false, error: 'erro_ao_buscar_itens' });
  }
});

// GET /ingresso-tipos
app.get('/ingresso-tipos', requireAuth, (req, res) => {
  try {
    const eventoId = req.query?.eventoId ? String(req.query.eventoId) : null;
    let arr = [];
    try {
      const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ingresso_tipos'").get();
      if (hasTable) {
        const rows = eventoId ? db.prepare("SELECT * FROM ingresso_tipos WHERE event_id = ?").all(eventoId) : db.prepare("SELECT * FROM ingresso_tipos").all();
        arr = (rows || []).map(r => ({ id: r.id, eventoId: r.event_id || r.eventoId || null, nome: r.nome || null, preco: (r.preco_cents||r.preco||0)/100, ativo: r.ativo !== 0 && r.ativo !== false }));
      } else {
        arr = (globalThis.__MEM_DB__.ingressoTipos || []).filter(x => !eventoId || String(x.eventoId) === String(eventoId));
      }
    } catch (e) {
      arr = (globalThis.__MEM_DB__.ingressoTipos || []).filter(x => !eventoId || String(x.eventoId) === String(eventoId));
    }
    return res.json({ ok: true, items: arr });
  } catch (e) {
    console.error('GET /ingresso-tipos failed', e);
    return res.status(500).json({ ok: false, error: 'erro_ao_buscar_ingresso_tipos' });
  }
});

// GET /tickets
app.get('/tickets', requireAuth, (req, res) => {
  try {
    const eventoId = req.query?.eventoId ? String(req.query.eventoId) : null;
    let arr = [];
    try {
      const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'").get();
      if (hasTable) {
        const rows = eventoId ? db.prepare("SELECT * FROM tickets WHERE event_id = ?").all(eventoId) : db.prepare("SELECT * FROM tickets").all();
        arr = (rows || []).map(r => ({ id: r.id, eventoId: r.event_id || r.eventoId || null, tipoId: r.tipoId || r.tipo_id || null, status: r.status || null, seq: r.seq || null }));
      } else {
        arr = (globalThis.__MEM_DB__.tickets || []).filter(x => !eventoId || String(x.eventoId) === String(eventoId));
      }
    } catch (e) {
      arr = (globalThis.__MEM_DB__.tickets || []).filter(x => !eventoId || String(x.eventoId) === String(eventoId));
    }
    return res.json({ ok: true, items: arr, tickets: arr });
  } catch (e) {
    console.error('GET /tickets failed', e);
    return res.status(500).json({ ok: false, error: 'erro_ao_buscar_tickets' });
  }
});

// ===== Escrita mínima para eventos-pagos (ITENS / INGRESSO TIPOS / TICKETS) =====

// POST /itens
app.post('/itens', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const eventoId = body.eventoId ? String(body.eventoId) : null;
    const nome = body.nome ? String(body.nome) : (body.name ? String(body.name) : '');
    const preco = Math.round(Number(body.preco || body.preco_cents || 0) || 0);
    const ativo = body.ativo == null ? 1 : (body.ativo ? 1 : 0);
    const estoqueInicial = Number.isFinite(Number(body.estoqueInicial || body.estoque || 0)) ? Number(body.estoqueInicial || body.estoque || 0) : null;

    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='itens'").get();
    if (hasTable) {
      try {
        db.prepare(`INSERT INTO itens (id, event_id, nome, preco_cents, ativo, estoque_inicial) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(id, eventoId, nome, preco, ativo, estoqueInicial);
        const saved = db.prepare(`SELECT * FROM itens WHERE id = ?`).get(id);
        return res.status(201).json({ ok:true, data: saved, items: [saved], itens: [saved] });
      } catch (e) {
        console.warn('POST /itens DB insert failed, falling back to memory', e);
      }
    }

    // fallback memory
    globalThis.__MEM_DB__ = globalThis.__MEM_DB__ || { itens: [], ingressoTipos: [], tickets: [], finConfig: {} };
    const novo = { id, eventoId, nome, preco_cents: preco, ativo: !!ativo, estoqueInicial };
    globalThis.__MEM_DB__.itens.push(novo);
    return res.status(201).json({ ok:true, data: novo, items: [novo], itens: [novo] });
  } catch (err) {
    console.error('POST /itens erro:', err);
    return res.status(500).json({ ok:false, error: 'erro_ao_criar_item' });
  }
});

// PUT /itens/:id
app.put('/itens/:id', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    const body = req.body || {};
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='itens'").get();
    if (hasTable) {
      try {
        db.prepare(`UPDATE itens SET nome=?, preco_cents=?, ativo=?, estoque_inicial=? WHERE id = ?`)
          .run(String(body.nome||''), Math.round(Number(body.preco||body.preco_cents||0)||0), body.ativo?1:0, body.estoqueInicial||null, id);
        const updated = db.prepare(`SELECT * FROM itens WHERE id = ?`).get(id);
        if (!updated) return res.status(404).json({ ok:false, error:'item_not_found' });
        return res.json({ ok:true, data: updated, items:[updated], itens:[updated] });
      } catch(e) {
        console.warn('PUT /itens DB update failed, falling back to memory', e);
      }
    }

    globalThis.__MEM_DB__ = globalThis.__MEM_DB__ || { itens: [], ingressoTipos: [], tickets: [], finConfig: {} };
    const arr = globalThis.__MEM_DB__.itens || [];
    const idx = arr.findIndex(x => String(x.id) === String(id));
    if (idx === -1) return res.status(404).json({ ok:false, error:'item_not_found' });
    arr[idx] = { ...arr[idx], ...body };
    return res.json({ ok:true, data: arr[idx], items:[arr[idx]], itens:[arr[idx]] });
  } catch (err) {
    console.error('PUT /itens erro:', err);
    return res.status(500).json({ ok:false, error: 'erro_ao_atualizar_item' });
  }
});

// POST /ingresso-tipos
app.post('/ingresso-tipos', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const eventoId = body.eventoId ? String(body.eventoId) : null;
    const nome = String(body.nome || body.label || body.descricao || '');
    const preco = Math.round(Number(body.preco || body.preco_cents || 0) || 0);
    const ativo = body.ativo == null ? 1 : (body.ativo ? 1 : 0);

    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ingresso_tipos'").get();
    if (hasTable) {
      try {
        db.prepare(`INSERT INTO ingresso_tipos (id, event_id, nome, preco_cents, ativo) VALUES (?, ?, ?, ?, ?)`)
          .run(id, eventoId, nome, preco, ativo);
        const saved = db.prepare(`SELECT * FROM ingresso_tipos WHERE id = ?`).get(id);
        return res.status(201).json({ ok:true, data: saved, items:[saved] });
      } catch(e){ console.warn('POST /ingresso-tipos DB insert failed', e); }
    }

    globalThis.__MEM_DB__ = globalThis.__MEM_DB__ || { itens: [], ingressoTipos: [], tickets: [], finConfig: {} };
    const novo = { id, eventoId, nome, preco_cents: preco, ativo: !!ativo };
    globalThis.__MEM_DB__.ingressoTipos.push(novo);
    return res.status(201).json({ ok:true, data: novo, items:[novo] });
  } catch (err) {
    console.error('POST /ingresso-tipos erro:', err);
    return res.status(500).json({ ok:false, error:'erro_ao_criar_tipo' });
  }
});

// PUT /ingresso-tipos/:id
app.put('/ingresso-tipos/:id', requireAuth, (req, res) => {
  try {
    const id = String(req.params.id);
    const body = req.body || {};
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ingresso_tipos'").get();
    if (hasTable) {
      try {
        db.prepare(`UPDATE ingresso_tipos SET nome=?, preco_cents=?, ativo=? WHERE id = ?`)
          .run(String(body.nome||''), Math.round(Number(body.preco||body.preco_cents||0)||0), body.ativo?1:0, id);
        const updated = db.prepare(`SELECT * FROM ingresso_tipos WHERE id = ?`).get(id);
        if (!updated) return res.status(404).json({ ok:false, error:'tipo_not_found' });
        return res.json({ ok:true, data: updated, items:[updated] });
      } catch(e){ console.warn('PUT /ingresso-tipos DB update failed', e); }
    }

    globalThis.__MEM_DB__ = globalThis.__MEM_DB__ || { itens: [], ingressoTipos: [], tickets: [], finConfig: {} };
    const arr = globalThis.__MEM_DB__.ingressoTipos || [];
    const idx = arr.findIndex(x => String(x.id) === String(id));
    if (idx === -1) return res.status(404).json({ ok:false, error:'tipo_not_found' });
    arr[idx] = { ...arr[idx], ...body };
    return res.json({ ok:true, data: arr[idx], items:[arr[idx]] });
  } catch (err) {
    console.error('PUT /ingresso-tipos erro:', err);
    return res.status(500).json({ ok:false, error:'erro_ao_atualizar_tipo' });
  }
});

// POST /tickets/bulk
app.post('/tickets/bulk', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const eventoId = String(body.eventoId || '');
    const tipoId = String(body.tipoId || '');
    const qtd = Math.max(0, parseInt(body.qtd || 0, 10));
    const digits = Math.max(1, parseInt(body.digits || 4, 10));
    if (!eventoId || !tipoId || !qtd) return res.status(400).json({ ok:false, error:'missing_params' });

    const pad = (n) => String(n).padStart(digits, '0');
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'").get();
    let startSeq = 1;
    const created = [];

    if (hasTable) {
      try {
        const row = db.prepare("SELECT MAX(seq) as m FROM tickets WHERE event_id = ?").get(eventoId);
        startSeq = (row && Number.isFinite(Number(row.m))) ? Number(row.m) + 1 : 1;
        for (let i=0;i<qtd;i++){
          const seq = startSeq + i;
          const seqStr = pad(seq);
          const ticketId = `${eventoId}-${tipoId}-${seqStr}`;
          const id = crypto.randomUUID();
          db.prepare(`INSERT INTO tickets (id, event_id, tipo_id, seq, seq_str, ticket_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(id, eventoId, tipoId, seq, seqStr, ticketId, 'reservado');
          const t = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
          created.push({ id: t.id, eventoId: t.event_id || t.evento_id || eventoId, tipoId: t.tipo_id || t.tipoId || tipoId, seq: t.seq, seqStr: t.seq_str || t.seqStr || seqStr, ticketId: t.ticket_id || t.ticketId || ticketId, status: t.status || 'reservado' });
        }
        return res.json({ ok:true, items: created, tickets: created });
      } catch(e){ console.warn('POST /tickets/bulk DB insert failed', e); }
    }

    // fallback memory
    globalThis.__MEM_DB__ = globalThis.__MEM_DB__ || { itens: [], ingressoTipos: [], tickets: [], finConfig: {} };
    const arr = globalThis.__MEM_DB__.tickets || [];
    // compute startSeq from mem
    const existing = arr.filter(t => String(t.eventoId) === String(eventoId));
    const maxSeq = existing.reduce((acc,t)=> Math.max(acc, Number(t.seq)||0), 0);
    startSeq = maxSeq + 1;
    for (let i=0;i<qtd;i++){
      const seq = startSeq + i;
      const seqStr = pad(seq);
      const ticketId = `${eventoId}-${tipoId}-${seqStr}`;
      const id = crypto.randomUUID();
      const t = { id, eventoId, tipoId, seq, seqStr, ticketId, status: 'reservado' };
      arr.push(t); created.push(t);
    }
    globalThis.__MEM_DB__.tickets = arr;
    return res.json({ ok:true, items: created, tickets: created });
  } catch (err) {
    console.error('POST /tickets/bulk erro:', err);
    return res.status(500).json({ ok:false, error:'erro_ao_gerar_tickets' });
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



const SNAP_DIR = path.join(process.cwd(), 'uploads', 'snapshots');
try { fs.mkdirSync(SNAP_DIR, { recursive: true }); } catch {}

// ==== Dump completo do banco SQLite em JSON (por tenant) ====
function gerarDumpBanco(tenantId) {
  const snapshot = {
    _meta: {
      generatedAt: new Date().toISOString(),
      tenantId: tenantId || 'default'
    }
  };

  // Lista todas as tabelas do SQLite (menos as internas)
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all();

  for (const row of tables) {
    const tableName = row.name;
    if (!tableName) continue;

    try {
      // Descobre as colunas dessa tabela
      const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all();

      const hasTenantSnake = cols.some(c => c.name === 'tenant_id');
      const hasTenantCamel = cols.some(c => c.name === 'tenantId');

      let rows;

      if (hasTenantSnake || hasTenantCamel) {
        // Monta o WHERE só com colunas que realmente existem
        const whereParts = [];
        const params     = [];

        if (hasTenantSnake) {
          whereParts.push('"tenant_id" = ?');
          params.push(tenantId);
        }
        if (hasTenantCamel) {
          whereParts.push('"tenantId" = ?');
          params.push(tenantId);
        }

        const sql = `SELECT * FROM "${tableName}" WHERE ${whereParts.join(' OR ')}`;
        rows = db.prepare(sql).all(...params);
      } else {
        // Tabela global (sem coluna de tenant): traz tudo
        const sql = `SELECT * FROM "${tableName}"`;
        rows = db.prepare(sql).all();
      }

      snapshot[tableName] = rows;
    } catch (e) {
      console.warn('[Backup] Não consegui ler tabela', tableName, e?.message || e);
    }
  }

  return snapshot;
}

// POST /backup/dump  → gera um arquivo JSON com dump completo do banco
app.post('/backup/dump', verifyFirebaseToken, ensureAllowed('admin'), async (req, res) => {
  try {
    const tenantRaw = String(req.user?.tenantId || req.headers['x-tenant-id'] || 'default');
    const tenantSafe = tenantRaw.replace(/[^a-z0-9_.-]/gi, '_') || 'default';

    // 1) Monta o dump em memória
    const dump = gerarDumpBanco(tenantRaw);

    // 2) Define nome do arquivo
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `dump-${tenantSafe}-${ts}.json`;
    const filePath = path.join(SNAP_DIR, name);

    // 3) Salva em disco
    fs.writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf-8');

    // 4) Grava auditoria local
    db.prepare(`
      INSERT INTO audit_logs (ts_iso, actor, entity, action, payload)
      VALUES (?, 'system', 'backup', 'dump', ?)
    `).run(
      new Date().toISOString(),
      JSON.stringify({ name, tenantId: tenantRaw })
    );

    // 5) (Opcional) Enviar para Firebase Storage – DESATIVADO por enquanto
    // Se quiser ativar depois, é só descomentar o bloco abaixo
    /*
    if (typeof bucket !== 'undefined' && bucket) {
      try {
        const dest = `${tenantSafe}/backup/${name}`;
        await bucket.upload(filePath, {
          destination: dest,
          contentType: 'application/json'
        });
        console.log('[Storage] Dump enviado:', dest);
      } catch (e) {
        console.warn('[Storage] Falha ao enviar dump:', e?.message || e);
      }
    }
    */

    // 6) Resposta para o frontend
    res.json({ ok: true, name });
  } catch (err) {
    console.error('[Backup] Erro ao gerar dump do banco:', err?.message || err);
    res.status(500).json({ ok: false, error: 'Falha ao gerar backup do banco' });
  }
});

// ===== Fotos de clientes: armazenamento centralizado (mapa chave -> dataURL)
// GET /fotos-clientes  => retorna mapa para o tenant
// PUT /fotos-clientes  => substitui o mapa do tenant (body = object)
app.get('/fotos-clientes', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const file = 'fotos-clientes.json';
    const all = loadJSON(file, {});
    const map = (all && typeof all === 'object') ? (all[tenantId] || {}) : {};
    return res.json({ ok: true, data: map });
  } catch (e) {
    console.error('[GET /fotos-clientes] erro:', e);
    return res.status(500).json({ error: 'Erro ao ler fotosClientes' });
  }
});

app.put('/fotos-clientes', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const body = req.body || {};
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'body inválido, espere um objeto' });
    const file = 'fotos-clientes.json';
    const all = loadJSON(file, {});
    const base = (all && typeof all === 'object') ? all : {};
    base[tenantId] = body;
    saveJSON(file, base);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[PUT /fotos-clientes] erro:', e);
    return res.status(500).json({ error: 'Erro ao salvar fotosClientes' });
  }
});

// PATCH /fotos-clientes => merge parcial do mapa do tenant
app.patch('/fotos-clientes', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const body = req.body || {};
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'body inválido, espere um objeto' });
    const file = 'fotos-clientes.json';
    const all = loadJSON(file, {});
    const base = (all && typeof all === 'object') ? all : {};
    const current = (base[tenantId] && typeof base[tenantId] === 'object') ? base[tenantId] : {};

    // Suporta dois formatos:
    // 1) { key: 'foto1', value: 'data:...' }
    // 2) { foto1: 'data:...', foto2: 'data:...' }
    // Se a nova value for `null`, tentamos remover o objeto armazenado (S3 ou local)
    function handleSetSync(k, newValue) {
      const oldValue = current && Object.prototype.hasOwnProperty.call(current, k) ? current[k] : undefined;

      if (newValue === null && typeof oldValue === 'string') {
        try {
          // Local uploads path (POC): /uploads/<tenantId>/filename
          if (oldValue.startsWith('/uploads/') || oldValue.startsWith('uploads/')) {
            const rel = oldValue.replace(/^\/*/, '');
            const fp = path.join(__dirname, 'public', rel);
            try { fs.unlinkSync(fp); console.log('[INFO] removed local upload:', fp); } catch (e) { /* ignore */ }
          }

          // S3 URL pattern: https://<bucket>.s3.<region>.amazonaws.com/<key>
          if (hasS3 && typeof oldValue === 'string' && process.env.S3_BUCKET) {
            const bucketHost = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`;
            if (oldValue.indexOf(bucketHost) === 0) {
              try {
                const objectKey = oldValue.slice(bucketHost.length);
                const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
                // fire-and-forget async delete; log errors if any
                s3Client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }))
                  .then(() => console.log('[INFO] deleted S3 object:', objectKey))
                  .catch((e) => console.warn('[WARN] failed deleting S3 object for', oldValue, e && e.message));
              } catch (e) { console.warn('[WARN] failed initiating S3 delete for', oldValue, e && e.message); }
            }
          }
        } catch (e) {
          console.warn('[WARN] error while attempting to remove previous file for key', k, e && e.message);
        }
        // keep the key with null (signals removal)
        current[k] = null;
        return;
      }

      // Otherwise set/overwrite normally
      current[k] = newValue;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'key') && Object.prototype.hasOwnProperty.call(body, 'value')) {
      const k = String(body.key);
      handleSetSync(k, body.value);
    } else {
      // Mescla todas as chaves do body no mapa atual
      Object.keys(body || {}).forEach(k => {
        handleSetSync(k, body[k]);
      });
    }

    base[tenantId] = current;
    saveJSON(file, base);
    return res.json({ ok: true, data: current });
  } catch (e) {
    console.error('[PATCH /fotos-clientes] erro:', e);
    return res.status(500).json({ error: 'Erro ao aplicar patch fotosClientes' });
  }
});
// POST /fotos-clientes/presign => opcional: gera URL presign para upload direto ao S3
app.post('/fotos-clientes/presign', verifyFirebaseToken, ensureAllowed('sync'), async (req, res) => {
  try {
    if (!s3Client) return res.status(400).json({ ok: false, error: 'S3 não está configurado no servidor' });
    const tenantId = String(req.user?.tenantId || 'default');
    const body = req.body || {};
    const key = String(body.key || '').trim();
    const contentType = String(body.contentType || 'image/png');
    if (!key) return res.status(400).json({ ok: false, error: 'key obrigatório' });

    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    // Normaliza e monta a key no bucket (prefix per-tenant)
    const filename = `${tenantId}/${String(key).replace(/[^a-z0-9_.-]/gi,'_')}-${Date.now()}.png`;
    const bucket = process.env.S3_BUCKET;

    const cmd = new PutObjectCommand({ Bucket: bucket, Key: filename, ContentType: contentType });
    const presignUrl = await getSignedUrl(s3Client, cmd, { expiresIn: 900 });
    const publicUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;

    return res.json({ ok: true, presignUrl, publicUrl });
  } catch (err) {
    console.error('[POST /fotos-clientes/presign] erro:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao gerar presign URL' });
  }
});

// POST /fotos-clientes/upload => upload POC: aceita { key, data } onde data é dataURL
app.post('/fotos-clientes/upload', verifyFirebaseToken, ensureAllowed('sync'), async (req, res) => {
  try {
    const storageMode = String(process.env.STORAGE_MODE || '').toLowerCase();
    const tenantId = String(req.user?.tenantId || 'default');
    const body = req.body || {};
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'body inválido, espere objeto { key, data }' });
    const { key, data } = body;
    if (!key) return res.status(400).json({ error: 'espera { key, data } com key válida' });
    if (!data || typeof data !== 'string') return res.status(400).json({ error: 'espera { key, data } com data como dataURL' });

    // decode dataURL
    const m = String(data).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!m) return res.status(400).json({ error: 'data não parece um dataURL base64 de imagem' });
    const contentType = m[1];
    const b64 = m[2];
    const buf = Buffer.from(b64, 'base64');

    // prepare upload path: prefer Firebase bucket if configured
    let publicUrl = null;
    const filename = `${String(key).replace(/[^a-z0-9_.-]/gi,'_')}-${Date.now()}.png`;

    // Se o modo obrigar Cloudinary, valide configuração antes de prosseguir
    const enforceCloudinaryOnly = storageMode === 'cloudinary';
    if (enforceCloudinaryOnly && !hasCloudinary) {
      console.error('[POST /fotos-clientes/upload] STORAGE_MODE=cloudinary mas Cloudinary não está configurado');
      return res.status(500).json({ ok: false, error: 'STORAGE_MODE=cloudinary configurado, mas CLOUDINARY_* não presentes/no pacote' });
    }

    // Primeiro: se Cloudinary estiver configurado, tente enviar para lá (independente do Firebase)
    if (!publicUrl && hasCloudinary && cloudinary) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({ folder: `${tenantId}` }, (error, result) => {
            if (error) return reject(error);
            resolve(result);
          });
          stream.end(buf);
        });
        publicUrl = uploadResult.secure_url || uploadResult.url;
        console.log('[INFO] upload to Cloudinary ->', uploadResult.public_id);
      } catch (eCloud) {
        console.warn('[WARN] upload to Cloudinary failed ->', eCloud?.message || eCloud);
        // Se estamos no modo Cloudinary-only, falhamos imediatamente (não usar fallback)
        if (enforceCloudinaryOnly) {
          console.error('[POST /fotos-clientes/upload] Falha ao enviar para Cloudinary e STORAGE_MODE=cloudinary ativo');
          return res.status(500).json({ ok: false, error: 'Falha ao enviar para Cloudinary' });
        }
      }
    }

    // Em seguida, se ainda não temos publicUrl e o Firebase bucket existir, tente enviar para Firebase
    if (!publicUrl && bucket) {
      try {
        const dest = `${tenantId}/${filename}`;
        const fileRef = bucket.file(dest);
        await fileRef.save(buf, {
          contentType: contentType,
          resumable: false,
          metadata: { contentType }
        });
        const [signedUrl] = await fileRef.getSignedUrl({ action: 'read', expires: '2100-01-01' });
        publicUrl = signedUrl;
        console.log('[INFO] upload to Firebase Storage ->', dest);
      } catch (e) {
        console.warn('[WARN] upload to Firebase failed, falling back to local file ->', e?.message || e);
      }
    }

    // Se ainda não temos URL pública, decidir fallback.
    if (!publicUrl) {
      if (enforceCloudinaryOnly) {
        console.error('[POST /fotos-clientes/upload] STORAGE_MODE=cloudinary ativo mas não obtivemos URL após tentativa');
        return res.status(500).json({ ok: false, error: 'Nenhuma URL pública obtida (Cloudinary required)' });
      }
      // gravar localmente (fallback)
      const uploadsDir = path.join(__dirname, 'public', 'uploads', tenantId);
      try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (err) {}
      const fp = path.join(uploadsDir, filename);
      fs.writeFileSync(fp, buf);
      publicUrl = `/uploads/${tenantId}/${filename}`;
    }

    // Persist mapping in fotos-clientes.json
    const file = 'fotos-clientes.json';
    const all = loadJSON(file, {});
    const base = (all && typeof all === 'object') ? all : {};
    const current = (base[tenantId] && typeof base[tenantId] === 'object') ? base[tenantId] : {};
    current[String(key)] = publicUrl;
    base[tenantId] = current;
    saveJSON(file, base);

    return res.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('[POST /fotos-clientes/upload] erro:', err);
    return res.status(500).json({ error: 'Erro ao processar upload' });
  }
});

// Enhance PATCH /fotos-clientes: when a key is set to null, attempt to delete stored file (S3 or local)
// This keeps storage tidy when frontend removes a photo.
// The existing PATCH handler already merges keys; we add deletion behavior before persisting.
// Note: we only delete when the new value is strictly null.
// If the previous value points to the configured S3 bucket, we call DeleteObjectCommand.
// If it points to a local /uploads path, we remove the file from disk.


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
    const basis = (String(req.query.basis || 'vencimento').toLowerCase() === 'pago') ? 'pago' : 'vencimento';
    const includeParcelas = String(req.query.includeParcelas ?? '1') !== '0';

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
        // somar parcelas pagas no mês (pago_em_iso)
        saidasParcelas = rows
          .filter(r => r && r.pago_em_iso && String(r.pago_em_iso).startsWith(ym))
          .reduce((s, r) => s + ((r.valor_cents || 0) / 100), 0);
      } else {
        // somar parcelas vencidas no mês (vencimento_iso)
        saidasParcelas = rows
          .filter(r => r && r.vencimento_iso && String(r.vencimento_iso).startsWith(ym))
          .reduce((s, r) => s + ((r.valor_cents || 0) / 100), 0);
      }
    }

    return res.json({ ok: true, entradasJournal, saidasJournal, saidasParcelas });
  } catch (e) {
    console.error('[fin/metrics] erro (stub):', e);
    return res.status(500).json({ error: 'Erro fin/metrics stub' });
  }
});

    // ========================= LEADS (Funil) – API básica =========================

// PUT /leads/:id → atualiza alguns campos do lead (status, dataFechamento, etc.)
app.put('/leads/:id', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const leadId   = String(req.params.id || '').trim();
    const body     = req.body || {};

    if (!leadId) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    const allLeads = loadJSON(LEADS_FILE, []);
    const leads    = Array.isArray(allLeads) ? allLeads : [];

    const idx = leads.findIndex(
      l => String(l.id) === leadId && String(l.tenantId || 'default') === tenantId
    );

    if (idx < 0) {
      return res.status(404).json({ error: 'Lead não encontrado' });
    }

    const lead = { ...leads[idx] };

    // Campos que podem vir do front (ajuste se quiser mandar mais coisa)
    if (body.status != null) {
      lead.status = String(body.status);
    }
    if (body.dataFechamento != null) {
      lead.dataFechamento = body.dataFechamento;
    }
    if (body.proximoContato != null) {
      lead.proximoContato = body.proximoContato;
    }
    if (body.responsavel != null) {
      lead.responsavel = body.responsavel;
    }
    if (body.degustacao != null) {
      lead.degustacao = body.degustacao;
    }
    if (body.arquivado != null) {
      lead.arquivado = body.arquivado;
    }

    leads[idx] = lead;
    saveJSON(LEADS_FILE, leads);

    return res.json({ ok: true, lead });
  } catch (e) {
    console.error('[PUT /leads/:id] erro:', e);
    return res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
});


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

    
// Rotina derivada: rota compatível com o cálculo financeiro (legacy)
app.get('/fin/metrics-legacy', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
  try {
    const tenantId = String(req.user?.tenantId || 'default');
    const ym = (() => {
      const q = String(req.query.range || '').trim();
      if (/^\d{4}-\d{2}$/.test(q)) return q;
      return new Date().toISOString().slice(0, 7);
    })();
    const basis = (String(req.query.basis || 'vencimento').toLowerCase() === 'pago') ? 'pago' : 'vencimento';
    const includeParcelas = String(req.query.includeParcelas ?? '1') !== '0';

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
        // somar parcelas pagas no mês (pago_em_iso)
        saidasParcelas = rows
          .filter(r => r && r.pago_em_iso && String(r.pago_em_iso).startsWith(ym))
          .reduce((s, r) => s + ((r.valor_cents || 0) / 100), 0);
      } else {
        // somar parcelas vencidas no mês (vencimento_iso)
        saidasParcelas = rows
          .filter(r => r && r.vencimento_iso && String(r.vencimento_iso).startsWith(ym))
          .reduce((s, r) => s + ((r.valor_cents || 0) / 100), 0);
      }
    }

    return res.json({ ok: true, entradasJournal, saidasJournal, saidasParcelas });
  } catch (e) {
    console.error('[fin/metrics-legacy] erro:', e);
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
// ========================= CATÁLOGO — Upload de imagem de cardápio/adicional =========================
// POST /catalogo/imagens
// body: multipart/form-data com campo "file"
app.post(
  '/catalogo/imagens',
  // se quiser travar por login depois, dá pra colocar verifyFirebaseToken e ensureAllowed('admin') aqui
  upload.single('file'),
  async (req, res) => {
    try {
      if (!bucket) {
        return res.status(500).json({ ok: false, error: 'storage_desativado' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: 'arquivo_obrigatorio' });
      }

      const mime = file.mimetype || '';
      const size = file.size || 0;

      const isImage = mime.startsWith('image/');

      if (!isImage) {
        return res.status(400).json({
          ok: false,
          error: 'tipo_invalido',
          detail: 'Somente imagens (png, jpg, webp) são permitidas para o catálogo.'
        });
      }

      // limite: 5MB por imagem
      if (size > 5 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'imagem_maior_5mb' });
      }

      const original = file.originalname || 'imagem-catalogo';
      const ext = original.includes('.') ? original.split('.').pop() : 'jpg';

      const randomPart = crypto.randomBytes(8).toString('hex');
      const fileName   = `${Date.now()}_${randomPart}.${ext}`;

      // Caminho no Storage: catalogo/imagens/{fileName}
      const storagePath = `catalogo/imagens/${fileName}`;
      const blob = bucket.file(storagePath);

      await blob.save(file.buffer, {
        contentType: mime,
        resumable: false,
        metadata: { contentType: mime }
      });

      // URL de leitura longa
      const [signedUrl] = await blob.getSignedUrl({
        action: 'read',
        expires: '2100-01-01'
      });

      return res.status(201).json({
        ok: true,
        data: {
          url: signedUrl,
          mime,
          size
        }
      });
    } catch (e) {
      console.error('[POST /catalogo/imagens] erro:', e);
      return res.status(500).json({ ok: false, error: 'upload_imagem_falhou' });
    }
  }
);

// ========================= EVENTOS — Upload de documentos (PDF) para Contratos =========================

// Lista documentos anexados de um evento
// GET /eventos/:id/docs-upload
app.get('/eventos/:id/docs-upload', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
  try {
    const eventId = String(req.params.id || '');

    const docs = db.prepare(`
      SELECT id, event_id, nome, url, created_at_iso
      FROM docs_uploads
      WHERE event_id = ?
      ORDER BY datetime(created_at_iso) ASC, id ASC
    `).all(eventId);

    return res.json({
      ok: true,
      data: docs.map(d => ({
        id: d.id,
        eventId: d.event_id,
        nome: d.nome,
        url: d.url,
        createdAt: d.created_at_iso
      }))
    });
  } catch (e) {
    console.error('[GET /eventos/:id/docs-upload] erro:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao listar documentos do evento.' });
  }
});

// Faz upload de um PDF para o evento e salva no Firebase Storage + SQLite
// POST /eventos/:id/docs-upload  (body: multipart/form-data com campo "file")
app.post(
  '/eventos/:id/docs-upload',
  verifyFirebaseToken,
  ensureAllowed('finance'),
  upload.single('file'),
  async (req, res) => {
    try {
      const eventId = String(req.params.id || '');

      if (!bucket) {
        // Storage não configurado
        return res.status(500).json({ ok: false, error: 'storage_desativado' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: 'arquivo_obrigatorio' });
      }

      const mime = file.mimetype || '';
      const size = file.size || 0;

      // Aceita somente PDF aqui
      const isPdf = mime === 'application/pdf';
      if (!isPdf) {
        return res.status(400).json({
          ok: false,
          error: 'tipo_invalido',
          detail: 'Somente PDF é permitido para documentos de contratos.'
        });
      }

      // Limite de tamanho do PDF (10MB)
      if (size > 10 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'pdf_maior_10mb' });
      }

      const docId = crypto.randomUUID();
      const originalName = file.originalname || 'documento.pdf';
      const safeName = originalName.replace(/\s+/g, '-');
      const objectPath = `docs/${eventId}/${docId}-${safeName}`;

      const blob = bucket.file(objectPath);

      await blob.save(file.buffer, {
        contentType: mime,
        resumable: false,
        metadata: { contentType: mime }
      });

      // URL de leitura longa
      const [signedUrl] = await blob.getSignedUrl({
        action: 'read',
        expires: '2100-01-01'
      });

      const agoraIso = new Date().toISOString();

      db.prepare(`
        INSERT INTO docs_uploads (id, event_id, nome, url, created_at_iso)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        docId,
        eventId,
        originalName,
        signedUrl,
        agoraIso
      );

      return res.status(201).json({
        ok: true,
        data: {
          id: docId,
          eventId,
          nome: originalName,
          url: signedUrl,
          createdAt: agoraIso
        }
      });
    } catch (e) {
      console.error('[POST /eventos/:id/docs-upload] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao fazer upload de documento do evento.' });
    }
  }
);

// Exclui um documento (apenas apaga do banco; o arquivo pode ser limpo manualmente no Storage se você quiser)
// DELETE /eventos/:id/docs-upload/:docId
app.delete(
  '/eventos/:id/docs-upload/:docId',
  verifyFirebaseToken,
  ensureAllowed('finance'),
  async (req, res) => {
    try {
      const eventId = String(req.params.id || '');
      const docId = String(req.params.docId || '');

      db.prepare(`
        DELETE FROM docs_uploads
        WHERE id = ? AND event_id = ?
      `).run(docId, eventId);

      return res.json({ ok: true });
    } catch (e) {
      console.error('[DELETE /eventos/:id/docs-upload/:docId] erro:', e);
      return res.status(500).json({ ok: false, error: 'Erro ao remover documento do evento.' });
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
// Cria um lançamento financeiro vinculado ao evento (parcela pendente)
app.post('/fin/lancamentos', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
  try {
    const body = req.body || {};
    const eventoIdRaw  = String(body.eventoId || body.eventId || '').trim();
    const descricao    = String(body.descricao || 'Cobrança pós-evento');
    const valorNumber  = Number(body.valor || 0);
    const vencimentoISO = body.vencimentoISO || body.vencimento || new Date().toISOString().slice(0,10);

    // eventoId é opcional — gravamos NULL quando ausente ou inválido
    const eventoId = eventoIdRaw || null;
    if (!(valorNumber > 0)) {
      return res.status(400).json({ ok: false, error: 'Valor deve ser maior que zero.' });
    }

    const valorCents = Math.round(valorNumber * 100);
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO parcelas (id, event_id, descricao, valor_cents, vencimento_iso, status, comprovante_url, pago_em_iso)
      VALUES (?, ?, ?, ?, ?, 'pendente', NULL, NULL)
    `).run(id, eventoId, descricao, valorCents, vencimentoISO);

    return res.status(201).json({
      ok: true,
      data: {
        id,
        eventId: eventoId,
        descricao,
        valor: valorNumber,
        vencimentoISO,
        status: 'pendente'
      }
    });
  } catch (e) {
    console.error('POST /fin/lancamentos falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao criar lançamento financeiro.' });
  }
});

// Atualiza um lançamento financeiro por id
app.put('/fin/lancamentos/:id', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id_invalido' });

    const exists = db.prepare(`SELECT id, event_id, descricao, valor_cents, vencimento_iso, status, pago_em_iso, comprovante_url FROM parcelas WHERE id = ?`).get(id);
    if (!exists) return res.status(404).json({ ok: false, error: 'lancamento_nao_encontrado' });

    const body = req.body || {};
    const descricao = typeof body.descricao === 'undefined' ? exists.descricao : String(body.descricao || null);
    const valorNumber = typeof body.valor === 'undefined' ? (exists.valor_cents || 0) / 100 : Number(body.valor || 0);
    const vencimentoISO = typeof body.data === 'undefined' && typeof body.vencimentoISO === 'undefined' ? exists.vencimento_iso : (body.data || body.vencimentoISO || null);
    const status = typeof body.status === 'undefined' ? exists.status : String(body.status || exists.status);
    const eventoIdRaw = typeof body.eventoId === 'undefined' ? (exists.event_id || null) : String(body.eventoId || '').trim();
    const eventoId = eventoIdRaw || null;

    if (!(valorNumber > 0)) return res.status(400).json({ ok: false, error: 'Valor deve ser maior que zero.' });

    const valorCents = Math.round(valorNumber * 100);

    db.prepare(`
      UPDATE parcelas SET event_id = ?, descricao = ?, valor_cents = ?, vencimento_iso = ?, status = ?, pago_em_iso = ? WHERE id = ?
    `).run(eventoId, descricao, valorCents, vencimentoISO, status, exists.pago_em_iso || null, id);

    const updated = db.prepare(`SELECT id, event_id, descricao, valor_cents, vencimento_iso, status, pago_em_iso, comprovante_url FROM parcelas WHERE id = ?`).get(id);

    return res.json({ ok: true, data: updated ? {
      id: updated.id,
      eventId: updated.event_id,
      descricao: updated.descricao || null,
      valor: (updated.valor_cents || 0) / 100,
      vencimentoISO: updated.vencimento_iso || null,
      status: updated.status,
      pagoEmISO: updated.pago_em_iso || null,
      comprovanteUrl: updated.comprovante_url || null
    } : null });
  } catch (e) {
    console.error('PUT /fin/lancamentos/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao atualizar lançamento.' });
  }
});

// Deleta um lançamento financeiro por id
app.delete('/fin/lancamentos/:id', verifyFirebaseToken, ensureAllowed('finance'), (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id_invalido' });

    const found = db.prepare(`SELECT id FROM parcelas WHERE id = ?`).get(id);
    if (!found) return res.status(404).json({ ok: false, error: 'lancamento_nao_encontrado' });

    db.prepare(`DELETE FROM parcelas WHERE id = ?`).run(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /fin/lancamentos/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao deletar lançamento.' });
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
// ========================= MÓDULO 11 – EVENTOS =========================

function loadEventos() {
  return loadJSON(EVENTOS_FILE, []);
}

function saveEventos(eventos) {
  saveJSON(EVENTOS_FILE, eventos);
}

// Lista todos os eventos do tenant atual
app.get('/eventos', verifyFirebaseToken, (req, res) => {
  try {
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    let eventos = loadEventos();

    if (tenantId) {
      eventos = eventos.filter(ev => String(ev.tenantId || '') === String(tenantId));
    }

    return res.json({ ok: true, data: eventos });
  } catch (e) {
    console.error('GET /eventos falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao listar eventos.' });
  }
});

// Busca um único evento por ID
app.get('/eventos/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    const eventos = loadEventos();
    const ev = eventos.find(e => {
      if (String(e.id) !== String(id)) return false;
      if (!tenantId) return true;
      return String(e.tenantId || '') === String(tenantId);
    });

    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
    }

    return res.json({ ok: true, data: ev });
  } catch (e) {
    console.error('GET /eventos/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao buscar evento.' });
  }
});

// Cria um novo evento
app.post('/eventos', verifyFirebaseToken, (req, res) => {
  try {
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    let eventos = loadEventos();

    const now = new Date().toISOString();
    const id = String(body.id || crypto.randomUUID());

    const novo = {
      ...body,
      id,
      tenantId,
      status: body.status || 'ativo',
      criadoEm: body.criadoEm || now,
      atualizadoEm: now,
    };

    const idx = eventos.findIndex(e => String(e.id) === String(id));
    if (idx > -1) {
      eventos[idx] = { ...eventos[idx], ...novo, atualizadoEm: now };
    } else {
      eventos.push(novo);
    }

    saveEventos(eventos);

    return res.status(201).json({ ok: true, data: novo });
  } catch (e) {
    console.error('POST /eventos falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao criar evento.' });
  }
});

// Atualiza um evento existente
app.put('/eventos/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const patch = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    let eventos = loadEventos();
    const idx = eventos.findIndex(e => String(e.id) === String(id));

    if (idx === -1) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
    }

    const atual = eventos[idx];

    if (tenantId && String(atual.tenantId || '') !== String(tenantId)) {
      return res.status(403).json({ ok: false, error: 'Evento de outro tenant.' });
    }

    const now = new Date().toISOString();
    const atualizado = {
      ...atual,
      ...patch,
      id: atual.id,
      tenantId: atual.tenantId || tenantId,
      atualizadoEm: now,
    };

    eventos[idx] = atualizado;
    saveEventos(eventos);

    return res.json({ ok: true, data: atualizado });
  } catch (e) {
    console.error('PUT /eventos/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao atualizar evento.' });
  }
});

// Remove um evento
app.delete('/eventos/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    let eventos = loadEventos();
    const idx = eventos.findIndex(e => String(e.id) === String(id));

    if (idx === -1) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
    }

    const atual = eventos[idx];
    if (tenantId && String(atual.tenantId || '') !== String(tenantId)) {
      return res.status(403).json({ ok: false, error: 'Evento de outro tenant.' });
    }

    eventos.splice(idx, 1);
    saveEventos(eventos);

    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /eventos/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao remover evento.' });
  }
});
// ========================= CHECKLIST / PÓS-EVENTO =========================
// Armazena tokens de execução (link/QR)
function loadChecklistLinks() {
  return loadJSON(CHECKLIST_LINKS_FILE, []);
}
function saveChecklistLinks(lista) {
  saveJSON(CHECKLIST_LINKS_FILE, Array.isArray(lista) ? lista : []);
}

// POST /eventos/:id/checklist-link
// Gera (ou reaproveita) um token de execução com validade
app.post('/eventos/:id/checklist-link', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user    = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const eventos = loadEventos();
    const { evento } = findEventoByIdAndTenant(eventos, id, tenantId);
    if (!evento) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado para gerar link.' });
    }

    let links = loadChecklistLinks();
    if (!Array.isArray(links)) links = [];

    const nowMs = Date.now();
    const seteDias = 7*24*60*60*1000;

    // tenta reutilizar token válido existente
    let link = links.find(
      l => String(l.eventoId) === String(id) &&
           String(l.tenantId || 'default') === String(tenantId) &&
           Number(l.expiresAt || 0) > nowMs
    );

    if (!link) {
      // cria novo
      const token = crypto.randomUUID();
      const expiresAt = nowMs + seteDias;
      link = {
        id: crypto.randomUUID(),
        token,
        eventoId: String(id),
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt
      };
      links.push(link);
    } else {
      link.updatedAt = new Date().toISOString();
    }

    saveChecklistLinks(links);

    return res.json({
      ok: true,
      data: {
        token    : link.token,
        eventoId : link.eventoId,
        expiresAt: link.expiresAt
      }
    });
  } catch (e) {
    console.error('POST /eventos/:id/checklist-link falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao gerar link de execução.' });
  }
});

// GET /eventos/checklist-por-token?t=...
// Valida o token, checa validade e devolve evento + checklist
app.get('/eventos/checklist-por-token', verifyFirebaseToken, (req, res) => {
  try {
    const t = String(req.query.t || '').trim();
    if (!t) {
      return res.status(400).json({ ok: false, error: 'Token ausente.' });
    }

    const user     = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    let links = loadChecklistLinks();
    if (!Array.isArray(links)) links = [];

    const nowMs = Date.now();
    const link = links.find(
      l => String(l.token) === t &&
           String(l.tenantId || 'default') === String(tenantId) &&
           Number(l.expiresAt || 0) > nowMs
    );

    if (!link) {
      return res.status(404).json({ ok: false, error: 'Link inválido ou expirado.' });
    }

    const eventos = loadEventos();
    const { evento } = findEventoByIdAndTenant(eventos, link.eventoId, tenantId);
    if (!evento) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado para este token.' });
    }

    return res.json({
      ok: true,
      data: {
        evento,
        checklistSaida  : evento.checklistSaida   || null,
        checklistRetorno: evento.checklistRetorno || null
      }
    });
  } catch (e) {
    console.error('GET /eventos/checklist-por-token falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao validar link de execução.' });
  }
});

// Helpers internos
function findEventoByIdAndTenant(eventos, id, tenantId) {
  const idx = eventos.findIndex(e => String(e.id) === String(id));
  if (idx === -1) return { idx: -1, evento: null };

  const ev = eventos[idx];
  if (tenantId && String(ev.tenantId || '') !== String(tenantId)) {
    return { idx: -1, evento: null };
  }
  return { idx, evento: ev };
}

// GET /eventos/:id/checklist-saida
app.get('/eventos/:id/checklist-saida', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    const eventos = loadEventos();
    const { evento } = findEventoByIdAndTenant(eventos, id, tenantId);

    if (!evento) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
    }

    // pode ser null se ainda não tiver sido gerado
    const payload = evento.checklistSaida || null;
    return res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('GET /eventos/:id/checklist-saida falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao carregar checklist de saída.' });
  }
});

// PUT /eventos/:id/checklist-saida
app.put('/eventos/:id/checklist-saida', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    const eventos = loadEventos();
    const { idx, evento } = findEventoByIdAndTenant(eventos, id, tenantId);

    if (!evento || idx === -1) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
    }

    const now = new Date().toISOString();
    const payload = {
      ...body,
      eventoId: id,
      atualizadoEm: now,
      criadoEm: body.criadoEm || evento.checklistSaida?.criadoEm || now,
    };

    eventos[idx] = {
      ...evento,
      checklistSaida: payload,
      atualizadoEm: now,
    };

    saveEventos(eventos);
    return res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('PUT /eventos/:id/checklist-saida falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao salvar checklist de saída.' });
  }
});

// GET /eventos/:id/checklist-retorno
app.get('/eventos/:id/checklist-retorno', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    const eventos = loadEventos();
    const { evento } = findEventoByIdAndTenant(eventos, id, tenantId);

    if (!evento) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
    }

    const payload = evento.checklistRetorno || null;
    return res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('GET /eventos/:id/checklist-retorno falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao carregar checklist de retorno.' });
  }
});

// PUT /eventos/:id/checklist-retorno
app.put('/eventos/:id/checklist-retorno', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    const eventos = loadEventos();
    const { idx, evento } = findEventoByIdAndTenant(eventos, id, tenantId);

    if (!evento || idx === -1) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
    }

    const now = new Date().toISOString();
    const payload = {
      ...body,
      eventoId: id,
      atualizadoEm: now,
      criadoEm: body.criadoEm || evento.checklistRetorno?.criadoEm || now,
    };

    eventos[idx] = {
      ...evento,
      checklistRetorno: payload,
      atualizadoEm: now,
    };

    saveEventos(eventos);
    return res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('PUT /eventos/:id/checklist-retorno falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao salvar checklist de retorno.' });
  }
});

// GET /eventos/:id/pos-evento  → atalho para o que o módulo Pós-Evento já salva dentro do evento
app.get('/eventos/:id/pos-evento', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || null;

    const eventos = loadEventos();
    const { evento } = findEventoByIdAndTenant(eventos, id, tenantId);

    if (!evento) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
    }

    // o pos-evento já é salvo hoje dentro do objeto evento (campo ev.posEvento)
    return res.json({ ok: true, data: evento.posEvento || null });
  } catch (e) {
    console.error('GET /eventos/:id/pos-evento falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao carregar pós-evento.' });
  }
});

// ========================= MÓDULO 20 – ESTOQUE (materiais, setores, insumos) =========================

// Helpers de leitura/gravação
function loadEstoqueMateriais() {
  return loadJSON(ESTOQUE_MATERIAIS_FILE, []);
}
function saveEstoqueMateriais(lista) {
  saveJSON(ESTOQUE_MATERIAIS_FILE, Array.isArray(lista) ? lista : []);
}

function loadEstoqueSetores() {
  return loadJSON(ESTOQUE_SETORES_FILE, []);
}
function saveEstoqueSetores(lista) {
  saveJSON(ESTOQUE_SETORES_FILE, Array.isArray(lista) ? lista : []);
}

function loadEstoqueInsumos() {
  return loadJSON(ESTOQUE_INSUMOS_FILE, []);
}
function saveEstoqueInsumos(lista) {
  saveJSON(ESTOQUE_INSUMOS_FILE, Array.isArray(lista) ? lista : []);
}

function loadEstoqueMovimentos() {
  return loadJSON(ESTOQUE_MOVIMENTOS_FILE, []);
}
function saveEstoqueMovimentos(lista) {
  saveJSON(ESTOQUE_MOVIMENTOS_FILE, Array.isArray(lista) ? lista : []);
}

// ---------- SETORES ----------

// GET /estoque/setores  → lista setores do tenant
app.get('/estoque/setores', verifyFirebaseToken, (req, res) => {
  try {
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const todos = loadEstoqueSetores();
    const setores = (Array.isArray(todos) ? todos : [])
      .filter(s => !s.tenantId || String(s.tenantId) === String(tenantId));

    return res.json({ ok: true, data: setores });
  } catch (e) {
    console.error('GET /estoque/setores falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao listar setores.' });
  }
});

// POST /estoque/setores → cria ou atualiza um setor
app.post('/estoque/setores', verifyFirebaseToken, (req, res) => {
  try {
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const now = new Date().toISOString();
    const id = String(body.id || crypto.randomUUID());

    let list = loadEstoqueSetores();
    if (!Array.isArray(list)) list = [];

    const base = {
      id,
      nome: String(body.nome || '').trim(),
      ativo: body.ativo !== false,
      tenantId,
      atualizadoEm: now,
      criadoEm: body.criadoEm || now
    };

    const idx = list.findIndex(
      s => String(s.id) === id && String(s.tenantId || 'default') === String(tenantId)
    );
    if (idx > -1) list[idx] = { ...list[idx], ...base };
    else list.push(base);

    saveEstoqueSetores(list);
    return res.status(201).json({ ok: true, data: base });
  } catch (e) {
    console.error('POST /estoque/setores falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao salvar setor.' });
  }
});

// PUT /estoque/setores/:id → atualiza um setor existente
app.put('/estoque/setores/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const now = new Date().toISOString();

    let list = loadEstoqueSetores();
    if (!Array.isArray(list)) list = [];

    const idx = list.findIndex(
      s => String(s.id) === String(id) && String(s.tenantId || 'default') === String(tenantId)
    );
    if (idx === -1) {
      // cria se não existir
      const novo = {
        id: String(id),
        nome: String(body.nome || '').trim(),
        ativo: body.ativo !== false,
        tenantId,
        criadoEm: now,
        atualizadoEm: now
      };
      list.push(novo);
      saveEstoqueSetores(list);
      return res.json({ ok: true, data: novo });
    }

    const atualizado = {
      ...list[idx],
      ...body,
      id: list[idx].id,
      tenantId,
      atualizadoEm: now
    };
    list[idx] = atualizado;
    saveEstoqueSetores(list);

    return res.json({ ok: true, data: atualizado });
  } catch (e) {
    console.error('PUT /estoque/setores/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao atualizar setor.' });
  }
});

// DELETE /estoque/setores/:id → remove um setor
app.delete('/estoque/setores/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    let list = loadEstoqueSetores();
    if (!Array.isArray(list)) list = [];

    const novo = list.filter(
      s => !(String(s.id) === String(id) && String(s.tenantId || 'default') === String(tenantId))
    );

    saveEstoqueSetores(novo);
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /estoque/setores/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao excluir setor.' });
  }
});

// ---------- MATERIAIS ----------

app.get('/estoque/materiais', verifyFirebaseToken, (req, res) => {
  try {
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const todos = loadEstoqueMateriais();
    const mats = (Array.isArray(todos) ? todos : [])
      .filter(m => !m.tenantId || String(m.tenantId) === String(tenantId));

    return res.json({ ok: true, data: mats });
  } catch (e) {
    console.error('GET /estoque/materiais falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao listar materiais.' });
  }
});

app.post('/estoque/materiais', verifyFirebaseToken, (req, res) => {
  try {
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const now = new Date().toISOString();
    const id = String(body.id || crypto.randomUUID());

    let list = loadEstoqueMateriais();
    if (!Array.isArray(list)) list = [];

    const base = {
      ...body,
      id,
      tenantId,
      atualizadoEm: now,
      criadoEm: body.criadoEm || now
    };

    const idx = list.findIndex(
      m => String(m.id) === id && String(m.tenantId || 'default') === String(tenantId)
    );
    if (idx > -1) list[idx] = { ...list[idx], ...base };
    else list.push(base);

    saveEstoqueMateriais(list);
    return res.status(201).json({ ok: true, data: base });
  } catch (e) {
    console.error('POST /estoque/materiais falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao salvar material.' });
  }
});

app.put('/estoque/materiais/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const now = new Date().toISOString();

    let list = loadEstoqueMateriais();
    if (!Array.isArray(list)) list = [];

    const idx = list.findIndex(
      m => String(m.id) === String(id) && String(m.tenantId || 'default') === String(tenantId)
    );
    if (idx === -1) {
      const novo = {
        ...body,
        id: String(id),
        tenantId,
        criadoEm: now,
        atualizadoEm: now
      };
      list.push(novo);
      saveEstoqueMateriais(list);
      return res.json({ ok: true, data: novo });
    }

    const atualizado = {
      ...list[idx],
      ...body,
      id: list[idx].id,
      tenantId,
      atualizadoEm: now
    };
    list[idx] = atualizado;
    saveEstoqueMateriais(list);

    return res.json({ ok: true, data: atualizado });
  } catch (e) {
    console.error('PUT /estoque/materiais/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao atualizar material.' });
  }
});

app.delete('/estoque/materiais/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    let list = loadEstoqueMateriais();
    if (!Array.isArray(list)) list = [];

    const novo = list.filter(
      m => !(String(m.id) === String(id) && String(m.tenantId || 'default') === String(tenantId))
    );

    saveEstoqueMateriais(novo);
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /estoque/materiais/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao excluir material.' });
  }
});

// ---------- INSUMOS (entradas de estoque / sobras) ----------

app.get('/estoque/insumos', verifyFirebaseToken, (req, res) => {
  try {
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const todos = loadEstoqueInsumos();
    const lista = (Array.isArray(todos) ? todos : [])
      .filter(m => !m.tenantId || String(m.tenantId) === String(tenantId));

    return res.json({ ok: true, data: lista });
  } catch (e) {
    console.error('GET /estoque/insumos falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao listar insumos.' });
  }
});

app.post('/estoque/insumos', verifyFirebaseToken, (req, res) => {
  try {
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const now = new Date().toISOString();
    const id = String(body.id || crypto.randomUUID());

    let list = loadEstoqueInsumos();
    if (!Array.isArray(list)) list = [];

    const base = {
      ...body,
      id,
      tenantId,
      dataISO: body.dataISO || now,
      atualizadoEm: now,
      criadoEm: body.criadoEm || now
    };

    const idx = list.findIndex(
      m => String(m.id) === id && String(m.tenantId || 'default') === String(tenantId)
    );
    if (idx > -1) list[idx] = { ...list[idx], ...base };
    else list.push(base);

    saveEstoqueInsumos(list);
    return res.status(201).json({ ok: true, data: base });
  } catch (e) {
    console.error('POST /estoque/insumos falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao salvar insumo.' });
  }
});

app.put('/estoque/insumos/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const now = new Date().toISOString();

    let list = loadEstoqueInsumos();
    if (!Array.isArray(list)) list = [];

    const idx = list.findIndex(
      m => String(m.id) === String(id) && String(m.tenantId || 'default') === String(tenantId)
    );
    if (idx === -1) {
      const novo = {
        ...body,
        id: String(id),
        tenantId,
        dataISO: body.dataISO || now,
        criadoEm: now,
        atualizadoEm: now
      };
      list.push(novo);
      saveEstoqueInsumos(list);
      return res.json({ ok: true, data: novo });
    }

    const atualizado = {
      ...list[idx],
      ...body,
      id: list[idx].id,
      tenantId,
      atualizadoEm: now
    };
    list[idx] = atualizado;
    saveEstoqueInsumos(list);

    return res.json({ ok: true, data: atualizado });
  } catch (e) {
    console.error('PUT /estoque/insumos/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao atualizar insumo.' });
  }
});

app.delete('/estoque/insumos/:id', verifyFirebaseToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    let list = loadEstoqueInsumos();
    if (!Array.isArray(list)) list = [];

    const novo = list.filter(
      m => !(String(m.id) === String(id) && String(m.tenantId || 'default') === String(tenantId))
    );

    saveEstoqueInsumos(novo);
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /estoque/insumos/:id falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao excluir insumo.' });
  }
});

// ---------- MOVIMENTOS DE ESTOQUE (saídas definitivas, perdas, ajustes) ----------

app.post('/estoque/movimentos', verifyFirebaseToken, (req, res) => {
  try {
    const body = req.body || {};
    const user = req.user || {};
    const tenantId = user.tenantId || user.uid || 'default';

    const now = new Date().toISOString();
    const id = String(body.id || crypto.randomUUID());

    let list = loadEstoqueMovimentos();
    if (!Array.isArray(list)) list = [];

    const movimento = {
      ...body,
      id,
      tenantId,
      dataISO: body.dataISO || now,
      criadoEm: now
    };

    list.push(movimento);
    saveEstoqueMovimentos(list);

    return res.status(201).json({ ok: true, data: movimento });
  } catch (e) {
    console.error('POST /estoque/movimentos falhou:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao registrar movimento.' });
  }
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
// ==== CATÁLOGO – Cardápios, Adicionais, Serviços ====

// GET /catalogo/cardapios
app.get('/catalogo/cardapios', requireAuth, (req, res) => {
  try {
    const cat = loadCatalogo();
    // apiFetch vai retornar cat.cardapios por causa do "data"
    res.json({ ok: true, data: cat.cardapios });
  } catch (e) {
    console.error('[catalogo/cardapios][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_cardapios' });
  }
});

// POST /catalogo/cardapios  → cria/atualiza 1 cardápio
app.post('/catalogo/cardapios', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  try {
    const body = req.body || {};
    const cat  = loadCatalogo();

    const lista = Array.isArray(cat.cardapios) ? cat.cardapios : [];

    // garante um id
    let id = String(body.id || '').trim();
    if (!id) id = String(Date.now());

    const novo = {
      ...body,
      id,
      tipo: body.tipo || 'cardapio'
    };

    const idx = lista.findIndex(p => String(p.id) === String(id));
    if (idx >= 0) {
      lista[idx] = novo;
    } else {
      lista.push(novo);
    }

    cat.cardapios = lista;
    saveCatalogo(cat);

    res.json({ ok: true, data: novo });
  } catch (e) {
    console.error('[catalogo/cardapios][POST] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_salvar_cardapio' });
  }
});

// GET /catalogo/adicionais
app.get('/catalogo/adicionais', requireAuth, (req, res) => {
  try {
    const cat = loadCatalogo();
    return res.json({ ok: true, items: Array.isArray(cat.adicionais)?cat.adicionais:[], itens: Array.isArray(cat.adicionais)?cat.adicionais:[] });
  } catch (e) {
    console.error('[catalogo/adicionais][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_adicionais' });
  }
});

// POST /catalogo/adicionais
app.post('/catalogo/adicionais', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  try {
    const body = req.body || {};
    const cat  = loadCatalogo();
    const lista = Array.isArray(cat.adicionais) ? cat.adicionais : [];

    let id = String(body.id || '').trim();
    if (!id) id = String(Date.now());

    const novo = { ...body, id };

    const idx = lista.findIndex(a => String(a.id) === String(id));
    if (idx >= 0) {
      lista[idx] = novo;
    } else {
      lista.push(novo);
    }

    cat.adicionais = lista;
    saveCatalogo(cat);

    res.json({ ok: true, data: novo });
  } catch (e) {
    console.error('[catalogo/adicionais][POST] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_salvar_adicional' });
  }
});

// GET /catalogo/servicos
app.get('/catalogo/servicos', requireAuth, (req, res) => {
  try {
    const cat = loadCatalogo();
    res.json({ ok: true, data: cat.servicos });
  } catch (e) {
    console.error('[catalogo/servicos][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_servicos' });
  }
});

// GET /catalogo/produtos
app.get('/catalogo/produtos', requireAuth, (req, res) => {
  try {
    // DB-first: try common table names
    const tableCandidates = ['produtos', 'produtos_buffet', 'produtosBuffet'];
    let rows = null;
    for (const t of tableCandidates) {
      const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (has) {
        try { rows = db.prepare(`SELECT * FROM ${t}`).all(); } catch(e) { rows = []; }
        break;
      }
    }
    if (!rows) rows = (globalThis.__MEM_DB__ && Array.isArray(globalThis.__MEM_DB__.produtos)) ? globalThis.__MEM_DB__.produtos : [];
    return res.json({ ok: true, items: rows, itens: rows });
  } catch (e) {
    console.error('[catalogo/produtos][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_produtos' });
  }
});

// GET /catalogo/custos-fixos
app.get('/catalogo/custos-fixos', requireAuth, (req, res) => {
  try {
    const tableCandidates = ['custos_fixos', 'custosFixos', 'custosFixosBuffet', 'custos_fixos_buffet'];
    let rows = null;
    for (const t of tableCandidates) {
      const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (has) {
        try { rows = db.prepare(`SELECT * FROM ${t}`).all(); } catch(e) { rows = []; }
        break;
      }
    }
    if (!rows) rows = (globalThis.__MEM_DB__ && Array.isArray(globalThis.__MEM_DB__.custosFixos)) ? globalThis.__MEM_DB__.custosFixos : [];
    return res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[catalogo/custos-fixos][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_custos_fixos' });
  }
});

// GET /catalogo/tipos-cardapio
app.get('/catalogo/tipos-cardapio', requireAuth, (req, res) => {
  try {
    const tableCandidates = ['tipos_cardapio', 'tiposCardapio', 'tiposCardapioCatalogo'];
    let rows = null;
    for (const t of tableCandidates) {
      const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (has) {
        try { rows = db.prepare(`SELECT * FROM ${t}`).all(); } catch(e) { rows = []; }
        break;
      }
    }
    if (!rows) rows = (globalThis.__MEM_DB__ && Array.isArray(globalThis.__MEM_DB__.tiposCardapio)) ? globalThis.__MEM_DB__.tiposCardapio : (globalThis.__MEM_DB__ && Array.isArray(globalThis.__MEM_DB__.tipos) ? globalThis.__MEM_DB__.tipos : []);
    return res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[catalogo/tipos-cardapio][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_tipos_cardapio' });
  }
});

// GET /fichas-tecnicas
app.get('/fichas-tecnicas', requireAuth, (req, res) => {
  try {
    // try dedicated tables first
    const tableCandidates = ['fichas_tecnicas', 'fichasTecnicas', 'ft_pratos', 'ft_pratos'];
    let rows = null;
    for (const t of tableCandidates) {
      const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (has) {
        try { rows = db.prepare(`SELECT * FROM ${t}`).all(); } catch(e) { rows = []; }
        break;
      }
    }
    if (!rows) rows = (globalThis.__MEM_DB__ && Array.isArray(globalThis.__MEM_DB__.fichasTecnicas)) ? globalThis.__MEM_DB__.fichasTecnicas : [];
    return res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[fichas-tecnicas][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_fichas_tecnicas' });
  }
});

// POST /catalogo/servicos
app.post('/catalogo/servicos', verifyFirebaseToken, ensureAllowed('admin'), (req, res) => {
  try {
    const body = req.body || {};
    const cat  = loadCatalogo();
    const lista = Array.isArray(cat.servicos) ? cat.servicos : [];

    let id = String(body.id || '').trim();
    if (!id) id = String(Date.now());

    const novo = { ...body, id };

    const idx = lista.findIndex(s => String(s.id) === String(id));
    if (idx >= 0) {
      lista[idx] = novo;
    } else {
      lista.push(novo);
    }

    cat.servicos = lista;
    saveCatalogo(cat);

    res.json({ ok: true, data: novo });
  } catch (e) {
    console.error('[catalogo/servicos][POST] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_salvar_servico' });
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
// ===== Integrações – teste de pagamentos (Mercado Pago real) =====
app.post('/api/integracoes/test/payments', async (req, res) => {
  try {
    const { gateway, pixKey } = req.body || {};

    const gw = String(gateway || '').toLowerCase();

    if (gw !== 'mercadopago') {
      return res.json({
        ok: true,
        message: 'Configurações de pagamentos recebidas. (Gateway diferente de Mercado Pago).'
      });
    }

    if (!pixKey || !String(pixKey).trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Informe a chave PIX para testar a conexão.'
      });
    }

    const mp = await getMercadoPagoProvider();
    const ok = await mp.testConnection();
  
    if (!ok) {
      return res.status(400).json({
        ok: false,
        message: 'Não foi possível conectar ao Mercado Pago. Verifique o Access Token.'
      });
    }

    return res.json({
      ok: true,
      message: 'Conexão com o Mercado Pago OK! Token válido e chave PIX preenchida.'
    });
  } catch (e) {
    console.error('[integracoes] erro em POST /api/integracoes/test/payments', e);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao testar pagamentos com Mercado Pago.'
    });
  }
});

// ===== Integrações – criação de cobrança (Fase 1: simulada) =====
// Esta rota recebe o payload do financeiro-modal (PIX/BOLETO/CARTÃO)
// e apenas registra/loga a cobrança de forma simples, sem chamar um
// gateway real ainda. Depois podemos trocar o miolo para Mercado Pago.
// ===== Integrações – criação de cobrança (Fase 2: gravando no banco) =====
// ===== Integrações – criação de cobrança (Mercado Pago real) =====
app.post('/api/integracoes/payments/cobranca', async (req, res) => {
  try {
    const body      = req.body || {};
    const cobranca  = body.cobranca || {};
    const parcelas  = Array.isArray(body.parcelas) ? body.parcelas : [];
    const metodo    = (cobranca.metodo || 'pix').toLowerCase();
    const clienteNome  = cobranca.nome || 'Cliente não informado';
    const clienteDoc   = (cobranca.documento && cobranca.documento.numero) || null;
    const clienteEmail = cobranca.email || null;
    const clienteTel   = cobranca.telefone || null;
    const eventoId     = body.eventoId || null;
    const origem       = eventoId ? 'evento' : 'dashboard';

    // soma o total das parcelas (já em reais)
    const total = parcelas.reduce((soma, p) => {
      const v = Number(p.valor || 0);
      return soma + (isNaN(v) ? 0 : v);
    }, 0);

    const nParcelas    = parcelas.length || 0;
    const vencPrimeira = nParcelas > 0 ? (parcelas[0].vencimentoISO || null) : null;

    if (!total || !nParcelas) {
      return res.status(400).json({
        ok: false,
        message: 'Nenhuma parcela/valor encontrado para gerar a cobrança.'
      });
    }

    // Nesta fase vamos trabalhar só com PIX e Boleto
    if (!['pix', 'boleto'].includes(metodo)) {
      return res.status(400).json({
        ok: false,
        message: 'Apenas PIX ou Boleto estão habilitados nesta fase da integração.'
      });
    }

    // Provider Mercado Pago (já configurado lá em cima com getMercadoPagoProvider)
    const mp = await getMercadoPagoProvider();

    const mpResp = await mp.createCharge({
      method: metodo,                     // 'pix' ou 'boleto'
      amount: Number(total.toFixed(2)),   // valor em reais
      description: cobranca.descricao || cobranca.desc || 'Cobrança de evento',
      due_date: metodo === 'boleto' && vencPrimeira
        ? String(vencPrimeira).slice(0, 10) // YYYY-MM-DD
        : undefined,
      customer: {
        name: clienteNome,
        email: clienteEmail || undefined,
        document: clienteDoc ? String(clienteDoc).replace(/\D/g, '') : undefined
      },
      metadata: {
        origem,
        event_id: eventoId,
        lancamento_id: body.lancamentoId || null
      }
    });

    const nowIso = new Date().toISOString();
    const mpId   = (mpResp && mpResp.id != null)
      ? String(mpResp.id)
      : ('COB-' + Date.now().toString(36).toUpperCase());

    const tx = (mpResp
      && mpResp.point_of_interaction
      && mpResp.point_of_interaction.transaction_data) || {};

    // Persiste no banco
    db.prepare(`
      INSERT INTO cobrancas_bancarias (
        id, gateway, metodo, status,
        event_id, origem,
        cliente_nome, cliente_doc, cliente_email, cliente_tel,
        total_cents, n_parcelas, vencimento_primeira_iso,
        criado_em_iso, raw_payload
      ) VALUES (
        @id, @gateway, @metodo, @status,
        @event_id, @origem,
        @cliente_nome, @cliente_doc, @cliente_email, @cliente_tel,
        @total_cents, @n_parcelas, @vencimento_primeira_iso,
        @criado_em_iso, @raw_payload
      )
    `).run({
      id: mpId,
      gateway: 'mercadopago',
      metodo,
      status: 'pendente',
      event_id: eventoId,
      origem,
      cliente_nome: clienteNome,
      cliente_doc: clienteDoc,
      cliente_email: clienteEmail,
      cliente_tel: clienteTel,
      total_cents: Math.round(total * 100),
      n_parcelas: nParcelas,
      vencimento_primeira_iso: vencPrimeira,
      criado_em_iso: nowIso,
      raw_payload: JSON.stringify({ requisicao: body, resposta_gateway: mpResp })
    });

    const respPayload = {
      ok: true,
      gateway: 'mercadopago',
      tipo: metodo,
      id: mpId,
      // aqui em reais (ex.: 150.5) – o modal cuida do formato BR
      valor: Number(total.toFixed(2))
    };

    if (metodo === 'pix') {
      respPayload.pix = {
        // o modal aceita qualquer um destes campos
        qr_base64: tx.qr_code_base64 || tx.qrCodeBase64 || null,
        qr_code:   tx.qr_code || null,
        copia_cola: tx.qr_code || null,
        checkout_url: tx.ticket_url || null
      };
    } else if (metodo === 'boleto') {
      respPayload.boleto = {
        boleto_url:
          (mpResp.transaction_details && mpResp.transaction_details.external_resource_url) ||
          mpResp.ticket_url ||
          null
      };
    }

    return res.json(respPayload);
  } catch (e) {
    console.error('[integracoes] erro em POST /api/integracoes/payments/cobranca', e);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao criar cobrança no Mercado Pago.'
    });
  }
});


// ===== Usuários (cadastro-usuario.html / usuarios.html) =====

// GET /usuarios -> lista todos (sem campo senha)
app.get('/usuarios', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM usuarios
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
    const senhaRaw = (typeof senha === 'string' ? senha : String(senha || ''));
    const senhaHash = senhaRaw ? bcrypt.hashSync(String(senhaRaw), 10) : '';

    db.prepare(`
      INSERT INTO usuarios (id, nome, email, whatsapp, perfil, senha_hash, senha, foto, created_at, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(nome || '').trim(),
      emailNorm,
      String(whatsapp || ''),
      String(perfil || '').trim(),
      senhaHash,
      '',
      (typeof foto === 'string' ? foto : null),
      nowIso,
      1
    );

    const user = db
      .prepare('SELECT * FROM usuarios WHERE id = ?')
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

    // If senha provided, hash and store in both senha and senha_hash for compatibility
    let newSenhaHash = atual.senha_hash || '';
    if (typeof senha === 'string' && senha.length) {
      newSenhaHash = bcrypt.hashSync(String(senha), 10);
    }

    db.prepare(`
      UPDATE usuarios
         SET nome       = ?,
             email      = ?,
             whatsapp   = ?,
             perfil     = ?,
             senha_hash = ?,
             senha      = ?,
             foto       = ?
       WHERE id = ?
    `).run(
      nome ?? atual.nome,
      emailNorm,
      whatsapp ?? atual.whatsapp,
      perfil ?? atual.perfil,
      newSenhaHash,
      '',
      (typeof foto === 'string' ? foto : atual.foto),
      id
    );

    const atualizado = db
      .prepare('SELECT * FROM usuarios WHERE id = ?')
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
// ===== Usuários (CRUD básico para o sistema) =====

// GET /usuarios -> lista todos (sem campo senha)
app.get('/usuarios', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT *
        FROM usuarios
       ORDER BY datetime(created_at_iso) DESC
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
      INSERT INTO usuarios (id, nome, email, whatsapp, perfil, senha_hash, senha, foto, created_at_iso, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(nome || '').trim(),
      emailNorm,
      String(whatsapp || ''),
      String(perfil || '').trim(),
      (senha ? bcrypt.hashSync(String(senha), 10) : ''),
      '',
      typeof foto === 'string' ? foto : null,
      nowIso,
      1
    );

    const salvo = db
      .prepare('SELECT * FROM usuarios WHERE id = ?')
      .get(id);

    return res.status(201).json({ status: 201, data: salvo });
  } catch (err) {
    console.error('[usuarios] POST /usuarios erro:', err);
    return res.status(500).json({ status: 500, error: 'Erro ao criar usuário.' });
  }
});

// ADMIN: reset password for a user and force must_change_password=1
app.post('/admin/users/:id/reset-password', requireAuth, async (req, res) => {
  try {
    // Verify admin
    const actor = req.user;
    if (!actor || !(String(actor.perfil || '').toLowerCase().includes('admin') || String(actor.perfil || '') === 'ADMIN')) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const targetId = req.params.id;
    const { senhaProvisoria } = req.body || {};
    if (!targetId || !senhaProvisoria || String(senhaProvisoria).length < 8) return res.status(400).json({ ok: false, error: 'Invalid payload' });

    const hash = await bcrypt.hash(String(senhaProvisoria), 10);
    const info = db.prepare('UPDATE usuarios SET senha_hash = ?, senha = ?, must_change_password = 1 WHERE id = ?').run(hash, '', targetId);
    if ((info && info.changes) === 0) return res.status(404).json({ ok: false, error: 'User not found' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[ADMIN] reset-password erro:', e && e.message);
    return res.status(500).json({ ok: false, error: 'Erro interno' });
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
      typeof senha === 'string' ? senha : atual.senha,
      typeof foto === 'string' ? foto : atual.foto,
      id
    );

    const atualizado = db
      .prepare('SELECT * FROM usuarios WHERE id = ?')
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
// ========================= PDV – Vendas & Caixa (M30/M31) =========================

/**
 * POST /pdv/vendas
 * Body esperado:
 *  {
 *    venda: {...},     // objeto que o PDV monta (centavos, etc.)
 *    origem: "itens" | "ingressos",
 *    formaLabel: "Dinheiro" | "Crédito" | ...
 *  }
 */
app.post('/pdv/vendas', (req, res) => {
  try {
    const body  = req.body || {};
    const venda = body.venda || {};
    const origem = String(body.origem || '').trim() || null;

    const id      = String(venda.id || '').trim();
    const eventId = String(venda.eventoId || '').trim();

    if (!id || !eventId) {
      return res.status(400).json({ ok: false, error: 'id_e_eventoId_obrigatorios' });
    }

    const nowIso       = new Date().toISOString();
    const createdAtIso = String(venda.createdAt || nowIso);
    const bruto        = Number(venda.valorBruto || 0)  || 0;
    const desc         = Number(venda.desconto || 0)    || 0;
    const liquido      = Math.max(0, bruto - desc);
    const pago         = Number(venda.valorPago || 0)   || 0;
    const troco        = Number(venda.troco || 0)       || 0;

    const formaId      = String(venda.forma || '');
    const formaLabel   = String(body.formaLabel || venda.formaLabel || '');
    const operador     = String(venda.operador || '');
    const categoriaId  = venda.categoriaId != null ? String(venda.categoriaId) : null;
    const subcatId     = venda.subcategoriaId != null ? String(venda.subcategoriaId) : null;

    const tenantId = String(req.headers['x-tenant-id'] || 'default');
    const createdBy = (req.user && req.user.uid) ? String(req.user.uid) : null;

    db.prepare(`
      INSERT OR REPLACE INTO pdv_vendas (
        id,
        event_id,
        created_at_iso,
        operador,
        forma_id,
        forma_label,
        valor_bruto_cents,
        desconto_cents,
        valor_liquido_cents,
        valor_pago_cents,
        troco_cents,
        categoria_id,
        subcategoria_id,
        origem,
        payload_json,
        created_by,
        tenant_id
      ) VALUES (
        @id,
        @event_id,
        @created_at_iso,
        @operador,
        @forma_id,
        @forma_label,
        @valor_bruto_cents,
        @desconto_cents,
        @valor_liquido_cents,
        @valor_pago_cents,
        @troco_cents,
        @categoria_id,
        @subcategoria_id,
        @origem,
        @payload_json,
        @created_by,
        @tenant_id
      )
    `).run({
      id,
      event_id: eventId,
      created_at_iso: createdAtIso,
      operador,
      forma_id: formaId,
      forma_label: formaLabel,
      valor_bruto_cents: bruto,
      desconto_cents: desc,
      valor_liquido_cents: liquido,
      valor_pago_cents: pago,
      troco_cents: troco,
      categoria_id: categoriaId,
      subcategoria_id: subcatId,
      origem,
      payload_json: JSON.stringify(venda || {}),
      created_by: createdBy,
      tenant_id: tenantId
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[PDV] erro em POST /pdv/vendas:', e);
    return res.status(500).json({ ok: false, error: 'erro_interno_pdv_vendas' });
  }
});

/**
 * POST /pdv/caixa/movimentos
 * Body esperado:
 *  {
 *    eventoId: "<id do evento>",
 *    tipo: "abertura" | "venda-itens" | "venda-ingressos" | "sangria" | "fechamento",
 *    formaLabel: "Dinheiro" | "PIX" | ... (opcional),
 *    valorCents: 12000,
 *    saldoDinheiroCents: 8000,
 *    saldoEletronicoCents: 4000,
 *    resp: "Nome do responsável"
 *  }
 */
app.post('/pdv/caixa/movimentos', (req, res) => {
  try {
    const body = req.body || {};
    const eventId = String(body.eventoId || body.eventId || '').trim();
    const tipo    = String(body.tipo || '').trim();

    if (!eventId || !tipo) {
      return res.status(400).json({ ok: false, error: 'eventoId_e_tipo_obrigatorios' });
    }

    const nowIso = new Date().toISOString();
    const id = 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const tenantId  = String(req.headers['x-tenant-id'] || 'default');
    const createdBy = (req.user && req.user.uid) ? String(req.user.uid) : null;

    const valor       = Number(body.valorCents || 0) || 0;
    const saldoDin    = Number(body.saldoDinheiroCents || 0) || 0;
    const saldoElec   = Number(body.saldoEletronicoCents || 0) || 0;
    const formaLabel  = String(body.formaLabel || '');
    const resp        = String(body.resp || '');

    db.prepare(`
      INSERT INTO pdv_movimentos (
        id,
        event_id,
        tipo,
        forma_label,
        valor_cents,
        saldo_dinheiro_cents,
        saldo_eletronico_cents,
        resp,
        created_at_iso,
        created_by,
        tenant_id
      ) VALUES (
        @id,
        @event_id,
        @tipo,
        @forma_label,
        @valor_cents,
        @saldo_dinheiro_cents,
        @saldo_eletronico_cents,
        @resp,
        @created_at_iso,
        @created_by,
        @tenant_id
      )
    `).run({
      id,
      event_id: eventId,
      tipo,
      forma_label: formaLabel,
      valor_cents: valor,
      saldo_dinheiro_cents: saldoDin,
      saldo_eletronico_cents: saldoElec,
      resp,
      created_at_iso: nowIso,
      created_by: createdBy,
      tenant_id: tenantId
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[PDV] erro em POST /pdv/caixa/movimentos:', e);
    return res.status(500).json({ ok: false, error: 'erro_interno_pdv_movimentos' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, db: DB_PATH });
});
// ===============================================
//  CONVITES / CHECK-IN – LOGS NA API (M30/M31)
// ===============================================
/**
 * POST /convites/:ticketId/checkin
 *  Corpo esperado:
 *  {
 *    "eventoId": "<id do evento>",
 *    "numero": "<numero impresso do convite>",
 *    "tipo": "<nome do tipo (opcional)>",
 *    "portaria": "<identificador da portaria/leitor>",
 *    "extra": { ... qualquer outra coisa ... }
 *  }
 */
app.post('/convites/:ticketId/checkin', verifyFirebaseToken, async (req, res) => {
  try {
    const user = req.user || {};
    const ticketId = String(req.params.ticketId || '');
    const body = req.body || {};

    if (!ticketId) {
      return res.status(400).json({ ok: false, error: 'ticketId obrigatório' });
    }

    const logs = loadConviteLogs();
    const now = new Date().toISOString();

    const log = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      action: 'checkin',
      ticketId,
      eventoId: String(body.eventoId || ''),
      numero: String(body.numero || ''),
      tipo: String(body.tipo || ''),
      portaria: String(body.portaria || ''),
      actorId: String(user.uid || user.id || ''),
      actorEmail: String(user.email || ''),
      actorName: String(user.name || ''),
      extra: body.extra || null,
      createdAt: now
    };

    logs.push(log);
    saveConviteLogs(logs);

    return res.json({ ok: true, log });
  } catch (e) {
    console.error('Erro em POST /convites/:ticketId/checkin', e);
    return res.status(500).json({ ok: false, error: 'erro-interno' });
  }
});

/**
 * POST /convites/:ticketId/uncheckin
 *  Corpo esperado:
 *  {
 *    "eventoId": "<id do evento>",
 *    "motivo": "<opcional>"
 *  }
 */
app.post('/convites/:ticketId/uncheckin', verifyFirebaseToken, async (req, res) => {
  try {
    const user = req.user || {};
    const ticketId = String(req.params.ticketId || '');
    const body = req.body || {};

    if (!ticketId) {
      return res.status(400).json({ ok: false, error: 'ticketId obrigatório' });
    }

    const logs = loadConviteLogs();
    const now = new Date().toISOString();

    const log = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      action: 'uncheckin',
      ticketId,
      eventoId: String(body.eventoId || ''),
      motivo: String(body.motivo || ''),
      portaria: String(body.portaria || ''),
      actorId: String(user.uid || user.id || ''),
      actorEmail: String(user.email || ''),
      actorName: String(user.name || ''),
      extra: body.extra || null,
      createdAt: now
    };

    logs.push(log);
    saveConviteLogs(logs);

    return res.json({ ok: true, log });
  } catch (e) {
    console.error('Erro em POST /convites/:ticketId/uncheckin', e);
    return res.status(500).json({ ok: false, error: 'erro-interno' });
  }
});

/**
 * GET /convites/logs?eventoId=XXX&ticketId=YYY
 *  – lista logs para relatórios/auditoria
 */
app.get('/convites/logs', verifyFirebaseToken, async (req, res) => {
  try {
    const eventoId = String(req.query.eventoId || '') || null;
    const ticketId = String(req.query.ticketId || '') || null;

    let logs = loadConviteLogs();
    if (eventoId) logs = logs.filter(l => String(l.eventoId) === String(eventoId));
    if (ticketId) logs = logs.filter(l => String(l.ticketId) === String(ticketId));

    // ordena mais recentes primeiro
    logs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return res.json({ ok: true, logs });
  } catch (e) {
    console.error('Erro em GET /convites/logs', e);
    return res.status(500).json({ ok: false, error: 'erro-interno' });
  }
});

/**
 * POST /api/storage-backup
 * Recebe um dump JSON do localStorage/sessionStorage do navegador e grava em `data/backups/`.
 * Autenticação permissiva: aceita
 *  - Firebase Bearer token (se Firebase ativado), ou
 *  - Header `x-backup-token` igual a env `BACKUP_UPLOAD_TOKEN`, ou
 *  - DISABLE_AUTH=1 (modo dev).
 */
app.post('/api/storage-backup', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    // Autenticação/autorizações
    const backupToken = process.env.BACKUP_UPLOAD_TOKEN || '';
    const disableAuth = String(process.env.DISABLE_AUTH || '0') === '1';
    let actor = 'anonymous';
    let tenantId = req.headers['x-tenant-id'] || 'default';

    // 1) dev override
    if (disableAuth) {
      actor = 'dev';
    } else {
      // 2) x-backup-token header
      const hdrToken = String(req.headers['x-backup-token'] || '');
      if (backupToken && hdrToken && hdrToken === backupToken) {
        actor = 'backup-token';
      } else if (hasFirebaseCreds) {
        // 3) try Firebase bearer
        const auth = req.headers.authorization || '';
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (!m) return res.status(401).json({ ok: false, error: 'missing auth' });
        try {
          const decoded = await admin.auth().verifyIdToken(m[1]);
          actor = decoded.email || decoded.uid || 'firebase-user';
          tenantId = req.headers['x-tenant-id'] || tenantId;
        } catch (e) {
          return res.status(401).json({ ok: false, error: 'invalid token' });
        }
      } else {
        return res.status(401).json({ ok: false, error: 'auth required' });
      }
    }

    // Payload sanity
    const payload = req.body || {};
    const now = new Date().toISOString();
    const backupsDir = path.join(DATA_DIR, 'backups');
    try { fs.mkdirSync(backupsDir, { recursive: true }); } catch (e) {}

    const fname = `${Date.now()}_${(tenantId||'default').replace(/[^a-z0-9\-_.]/gi,'')}_${crypto.randomBytes(4).toString('hex')}.json`;
    const fp = path.join(backupsDir, fname);
    const content = { meta: { actor, tenantId, receivedAt: now }, data: payload };
    fs.writeFileSync(fp, JSON.stringify(content, null, 2), 'utf8');

    // opcional: espelhar no Firebase Storage se disponível
    if (bucket) {
      (async () => {
        try {
          await bucket.file(`backups/${fname}`).save(JSON.stringify(content, null, 2), { contentType: 'application/json' });
          console.log('[storage-backup] uploaded to Firebase Storage ->', `backups/${fname}`);
        } catch (err) {
          console.error('[storage-backup] failed uploading to Firebase Storage', err?.message || err);
        }
      })();
    }

    writeAudit({ type: 'storage-backup', actor, tenantId, payload: { file: fname, keys: Object.keys(payload || {}) } });

    return res.json({ ok: true, file: `data/backups/${fname}` });
  } catch (e) {
    console.error('POST /api/storage-backup error', e);
    return res.status(500).json({ ok: false, error: 'erro-interno' });
  }
});

// GET /api/backups — lista backups gravados no servidor
app.get('/api/backups', async (req, res) => {
  try {
    const backupToken = process.env.BACKUP_UPLOAD_TOKEN || '';
    const disableAuth = String(process.env.DISABLE_AUTH || '0') === '1';
    let allowed = false;

    if (disableAuth) allowed = true;
    const hdr = String(req.headers['x-backup-token'] || '');
    if (backupToken && hdr && hdr === backupToken) allowed = true;

    if (!allowed && hasFirebaseCreds) {
      const auth = req.headers.authorization || '';
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (!m) return res.status(401).json({ ok: false, error: 'missing auth' });
      try {
        await admin.auth().verifyIdToken(m[1]);
        allowed = true;
      } catch (e) {
        return res.status(401).json({ ok: false, error: 'invalid token' });
      }
    }

    if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden' });

    const backupsDir = path.join(DATA_DIR, 'backups');
    try { fs.mkdirSync(backupsDir, { recursive: true }); } catch (e) {}

    const files = (fs.readdirSync(backupsDir) || []).filter(f => f.endsWith('.json'))
      .map(f => {
        const st = fs.statSync(path.join(backupsDir, f));
        return { file: f, size: st.size, mtime: st.mtime.toISOString() };
      }).sort((a,b) => b.mtime.localeCompare(a.mtime));

    return res.json({ ok: true, count: files.length, files });
  } catch (e) {
    console.error('GET /api/backups error', e);
    return res.status(500).json({ ok: false, error: 'erro-interno' });
  }
});

// Rotina: limpeza automática de backups antigos (dias definíveis por BACKUP_RETENTION_DAYS, default 30)
function cleanupOldBackups() {
  try {
    const days = Number(process.env.BACKUP_RETENTION_DAYS || '30');
    if (Number.isNaN(days) || days <= 0) return;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const backupsDir = path.join(DATA_DIR, 'backups');
    try { fs.mkdirSync(backupsDir, { recursive: true }); } catch (e) {}
    const files = (fs.readdirSync(backupsDir) || []).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const fp = path.join(backupsDir, f);
        const st = fs.statSync(fp);
        if (st.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          console.log('[cleanup-backups] removed', f);
        }
      } catch (e) { /* ignore per-file errors */ }
    }
  } catch (e) {
    console.error('[cleanup-backups] erro', e?.message || e);
  }
}

// Executa na inicialização e depois a cada 24h
try { cleanupOldBackups(); } catch(e){}
setInterval(() => { try{ cleanupOldBackups(); } catch(e){} }, 24 * 60 * 60 * 1000);

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
