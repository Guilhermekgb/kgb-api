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
app.get('/leads/:id', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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
app.post('/leads', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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

    // devolve id e token pro front
    return res.json({
      ok: true,
      data: {
        id: leadBase.id,
        token: leadBase.token
      }
    });
  } catch (e) {
    console.error('[POST /leads] erro:', e);
    return res.status(500).json({ error: 'Erro ao salvar lead' });
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

// ========================= M6 – Funil de Leads: API básica =========================

// GET /leads → lista leads do funil (usado no sync inicial)
app.get('/leads', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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
app.put('/leads/:id', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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

// GET /leads/metrics → indicadores do funil (usado pelo funil-leads.js)
app.get('/leads/metrics', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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

// POST /orcamentos → cria ou atualiza um orçamento
// A ideia é funcionar como "upsert": se vier id, atualiza; se não vier, cria um novo.
app.post('/orcamentos', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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
app.get('/orcamentos/:id', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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
app.post('/leads/historico', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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
    const eventoId     = String(body.eventoId || body.eventId || '').trim();
    const descricao    = String(body.descricao || 'Cobrança pós-evento');
    const valorNumber  = Number(body.valor || 0);
    const vencimentoISO = body.vencimentoISO || body.vencimento || new Date().toISOString().slice(0,10);

    if (!eventoId) {
      return res.status(400).json({ ok: false, error: 'eventoId obrigatório.' });
    }
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
app.get('/catalogo/cardapios', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
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
app.get('/catalogo/adicionais', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const cat = loadCatalogo();
    res.json({ ok: true, data: cat.adicionais });
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
app.get('/catalogo/servicos', verifyFirebaseToken, ensureAllowed('sync'), (req, res) => {
  try {
    const cat = loadCatalogo();
    res.json({ ok: true, data: cat.servicos });
  } catch (e) {
    console.error('[catalogo/servicos][GET] erro:', e?.message || e);
    res.status(500).json({ ok: false, error: 'erro_ao_listar_servicos' });
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
// ===== Usuários (CRUD básico para o sistema) =====

// GET /usuarios -> lista todos (sem campo senha)
app.get('/usuarios', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, nome, email, whatsapp, perfil, foto, created_at_iso
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
      INSERT INTO usuarios (id, nome, email, whatsapp, perfil, senha, foto, created_at_iso)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(nome || '').trim(),
      emailNorm,
      String(whatsapp || ''),
      String(perfil || '').trim(),
      senha ? String(senha) : null,
      typeof foto === 'string' ? foto : null,
      nowIso
    );

    const salvo = db
      .prepare('SELECT id, nome, email, whatsapp, perfil, foto, created_at_iso FROM usuarios WHERE id = ?')
      .get(id);

    return res.status(201).json({ status: 201, data: salvo });
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
      typeof senha === 'string' ? senha : atual.senha,
      typeof foto === 'string' ? foto : atual.foto,
      id
    );

    const atualizado = db
      .prepare('SELECT id, nome, email, whatsapp, perfil, foto, created_at_iso FROM usuarios WHERE id = ?')
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
