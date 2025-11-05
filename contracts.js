// contracts.js — Servidor CONTRATOS/ZapSign (ESM) — Porta 3333

// ── Imports (ESM) ─────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ── __dirname para ESM ────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Carrega o .env.contracts (mesma pasta) ────────────────────
dotenv.config({ path: path.join(__dirname, '.env.contracts') });

// ── Config/consts ─────────────────────────────────────────────
const app = express();
const PORT          = process.env.PORT || 3333;
const ZAPSIGN_TOKEN = process.env.ZAPSIGN_TOKEN || '';  // obrigatório para criar documentos
const PUBLIC_URL    = process.env.PUBLIC_URL || '';      // opcional (para webhook público)
const ALLOWED = String(process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Permite chamadas sem Origin (ex.: curl, health check)
    if (!origin) return cb(null, true);
    // Permite somente se estiver na lista
    if (ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origem não permitida: ' + origin));
  },
  credentials: true
}));

app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '25mb' })); // PDF em dataURI

// ── "DB" em arquivo JSON ──────────────────────────────────────
const DB_FILE = path.resolve(__dirname, 'contracts-db.json');
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { contratos: [], logs: [] }; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
const now = () => Date.now();

// ── Helpers ───────────────────────────────────────────────────
function asBase64PdfFromDataUri(dataUri) {
  if (!dataUri) return null;
  const m = String(dataUri).match(/^data:application\/pdf;base64,(.+)$/i);
  return m ? m[1] : String(dataUri); // aceita base64 “puro” também
}

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── /contratos (GET/POST/PUT/DELETE) ──────────────────────────
app.all('/contratos', (req, res) => {
  const method = req.method.toUpperCase();
  // Para GET use querystring; para POST/PUT/DELETE use body
  const body  = (method === 'GET') ? (req.query || {}) : (req.body || {});
  const db    = loadDB();

  if (method === 'GET') {
    let list = db.contratos || [];
    if (body.id)       list = list.filter(c => String(c.id) === String(body.id));
    if (body.eventoId) list = list.filter(c => String(c.eventoId) === String(body.eventoId));
    list.sort((a,b)=> Number(b.ts||0) - Number(a.ts||0));
    return res.json({ status: 200, data: list });
  }

  if (method === 'POST') {
    const eventoId = String(body?.eventoId || '').trim();
    if (!eventoId) return res.json({ status: 400, error: 'eventoId é obrigatório.' });

    const id = randomUUID();
    const novo = {
      id, ts: now(), eventoId,
      tipo: String(body?.tipo || 'contrato').toLowerCase(),
      titulo: String(body?.titulo || 'Contrato'),
      html: String(body?.html || ''), pdf: body?.pdf || null,
      signers: Array.isArray(body?.signers) ? body.signers : [],
      provider: 'zapsign',
      providerDocId: body?.providerDocId || null,
      status: 'rascunho', statusTs: now(),
      timeline: [{ ts: now(), by: 'api', action: 'CRIADO' }]
    };
    db.contratos.push(novo); saveDB(db);
    return res.json({ status: 201, data: novo });
  }

  if (method === 'PUT') {
    const id = String(body?.id || '').trim();
    if (!id) return res.json({ status: 400, error: 'id é obrigatório.' });

    const ix = (db.contratos || []).findIndex(c => String(c.id) === id);
    if (ix < 0) return res.json({ status: 404, error: 'Contrato não encontrado.' });

    const cur = { ...db.contratos[ix] };
    if (typeof body?.html          !== 'undefined') cur.html = String(body.html || '');
    if (typeof body?.pdf           !== 'undefined') cur.pdf  = body.pdf || null;
    if (typeof body?.signers       !== 'undefined' && Array.isArray(body.signers)) cur.signers = body.signers;
    if (typeof body?.providerDocId !== 'undefined') cur.providerDocId = body.providerDocId || null;
    if (typeof body?.titulo        !== 'undefined') cur.titulo = String(body.titulo || '').trim();
    if (typeof body?.status        !== 'undefined') {
      const s = String(body.status).toLowerCase().trim();
      cur.status = s; cur.statusTs = now();
      (cur.timeline = cur.timeline || []).push({ ts: now(), by: 'api', action: 'STATUS_' + s.toUpperCase() });
    }

    db.contratos[ix] = cur; saveDB(db);
    return res.json({ status: 200, data: cur });
  }

  if (method === 'DELETE') {
    const id = String(body?.id || '').trim();
    if (!id) return res.json({ status: 400, error: 'id é obrigatório.' });
    const before = (db.contratos || []).length;
    db.contratos = (db.contratos || []).filter(c => String(c.id) !== id);
    saveDB(db);
    return res.json({ status: 200, data: { removed: before - db.contratos.length } });
  }

  return res.json({ status: 405, error: 'Método não suportado.' });
});

// ── /zapsign/create  (envia PDF para ZapSign) ─────────────────
app.post('/zapsign/create', async (req, res) => {
  try {
    if (!ZAPSIGN_TOKEN) return res.json({ status: 400, error: 'Configure ZAPSIGN_TOKEN no servidor.' });

    const { contratoId, titulo='Contrato', signers=[], pdfDataUri } = req.body || {};
    if (!contratoId) return res.json({ status: 400, error: 'contratoId obrigatório.' });

    const base64_pdf = asBase64PdfFromDataUri(pdfDataUri);
    if (!base64_pdf) return res.json({ status: 400, error: 'PDF inválido.' });

    const payload = {
      name: titulo,
      base64_pdf,
      signers: (signers || []).map(s => ({
        name: s.nome || s.name,
        email: s.email || '',
        phone_country: s.whatsapp ? '55' : '',
        phone_number: s.whatsapp ? String(s.whatsapp).replace(/\D/g,'') : '',
        lock_email: !!s.email, lock_phone: !!s.whatsapp, lock_name: !!(s.nome || s.name)
      })),
      ...(PUBLIC_URL ? { webhook_url: `${PUBLIC_URL.replace(/\/$/,'')}/webhooks/zapsign` } : {})
    };

    const r = await fetch('https://api.zapsign.com.br/api/v1/docs/', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${ZAPSIGN_TOKEN}` },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));

    if (!r.ok) {
      return res.json({ status: r.status || 400, error: j?.detail || 'Erro na ZapSign', raw: j });
    }

    const providerDocId = j?.token;
    const signerLinks = Array.isArray(j?.signers)
      ? j.signers.map(s => ({ token: s.token, link: `https://app.zapsign.co/sign/${s.token}` }))
      : [];

    // atualiza contrato
    const db = loadDB();
    const ix = db.contratos.findIndex(c => String(c.id) === String(contratoId));
    if (ix >= 0) {
      db.contratos[ix].providerDocId = providerDocId;
      db.contratos[ix].status = 'enviado';
      db.contratos[ix].statusTs = now();
      (db.contratos[ix].timeline = db.contratos[ix].timeline || []).push({ ts: now(), by: 'zapsign', action: 'STATUS_ENVIADO' });
      saveDB(db);
    }

    return res.json({ status: 200, data: { providerDocId, signerLinks, zapsign: j } });
  } catch (err) {
    console.error(err);
    return res.json({ status: 500, error: 'Falha ao criar documento na ZapSign.' });
  }
});

// ── Webhook ZapSign ────────────────────────────────────────────
app.post('/webhooks/zapsign', (req, res) => {
  try {
    const body = req.body || {};
    const event = (body.event || body.type || '').toString().toLowerCase();
    const token = body.doc_token || body.token || body.document_token || body?.data?.token || '';
    const signedFile = body.signed_file || body?.data?.signed_file || null;

    const mapStatus = () => {
      if (event.includes('signed'))   return 'assinado';
      if (event.includes('refused') || event.includes('rejected')) return 'recusado';
      if (event.includes('deleted') || event.includes('cancel'))   return 'cancelado';
      if (event.includes('expired'))  return 'expirado';
      return 'enviado';
    };

    const db = loadDB();
    const ix = db.contratos.findIndex(c => String(c.providerDocId || '') === String(token));
    if (ix >= 0) {
      db.contratos[ix].status = mapStatus();
      db.contratos[ix].statusTs = now();
      if (signedFile) db.contratos[ix].pdf = signedFile;
      (db.contratos[ix].timeline = db.contratos[ix].timeline || [])
        .push({ ts: now(), by: 'webhook:zapsign', action: `STATUS_${db.contratos[ix].status.toUpperCase()}` });
      saveDB(db);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    // Webhooks não devem re-enfileirar: retorne 200 mesmo em erro
    return res.status(200).json({ ok: true });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[contracts-api] http://localhost:${PORT}`);
});
