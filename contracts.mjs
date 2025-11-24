// contracts.js — Servidor CONTRATOS/ZapSign (ESM)

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

// ── __dirname (ESM) ───────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── ENV (.env.contracts na mesma pasta) ───────────────────────
dotenv.config({ path: path.join(__dirname, '.env.contracts') });

// ── App/Config ────────────────────────────────────────────────
const app = express();
const PORT          = process.env.PORT || 3001;
const ZAPSIGN_TOKEN = process.env.ZAPSIGN_TOKEN || '';
const PUBLIC_URL    = process.env.PUBLIC_URL || '';

const ALLOWED_ORIGINS = String(
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:5500,http://127.0.0.1:5500,https://kgbrobuffet.netlify.app'
).split(',').map(s => s.trim()).filter(Boolean);

// Middlewares
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '25mb' })); // aceita PDF dataURI
// Em desenvolvimento, libera CORS para qualquer origem
app.use(cors());


// ── "DB" simples em arquivo (somente metadados, sem PDF) ─────
const DB_FILE = path.resolve(__dirname, 'contracts-db.json');
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { contratos: [], logs: [] }; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
const now = () => Date.now();

function asBase64PdfFromDataUri(dataUri) {
  if (!dataUri) return null;

  // Aceita:
  //  - data:application/pdf;base64,AAAA...
  //  - data:application/pdf;filename=...;base64,AAAA...
  //  - data:application/pdf;qualquer=coisa;outra=coisa;base64,AAAA...
  const m = String(dataUri).match(/^data:application\/pdf(?:;[^,]+)*;base64,(.+)$/i);

  // Se bateu no formato acima, devolve só o pedaço base64.
  // Se não bateu, devolve a string original (já pode estar em base64 puro).
  return m ? m[1] : String(dataUri);
}

// ── Função reutilizável para criar documento na ZapSign ──────
async function criarDocumentoZapSign({ contratoId, titulo = 'Contrato', signers = [], pdfDataUri }) {
  // 1) Validações básicas
  if (!ZAPSIGN_TOKEN) {
    const err = new Error('Configure ZAPSIGN_TOKEN no servidor.');
    err.httpStatus = 400;
    throw err;
  }

  if (!contratoId) {
    const err = new Error('contratoId obrigatório.');
    err.httpStatus = 400;
    throw err;
  }

  const base64_pdf = asBase64PdfFromDataUri(pdfDataUri);
  if (!base64_pdf) {
    const err = new Error('PDF inválido.');
    err.httpStatus = 400;
    throw err;
  }

  // 2) Monta payload para a ZapSign
  const payload = {
    name: titulo,
    base64_pdf,
    signers: (signers || []).map((s) => ({
      name: s.nome || s.name,
      email: s.email || '',
      phone_country: s.whatsapp ? '55' : '',
      phone_number: s.whatsapp ? String(s.whatsapp).replace(/\D/g, '') : '',
      lock_email: !!s.email,
      lock_phone: !!s.whatsapp,
      lock_name: !!(s.nome || s.name),
    })),
    ...(PUBLIC_URL
      ? { webhook_url: `${PUBLIC_URL.replace(/\/$/, '')}/webhooks/zapsign` }
      : {}),
  };

  // 3) Chama a API da ZapSign
  const r = await fetch('https://api.zapsign.com.br/api/v1/docs/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ZAPSIGN_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    const err = new Error(j?.detail || 'Erro na ZapSign');
    err.httpStatus = r.status || 400;
    err.zapsign = j;
    throw err;
  }

  const providerDocId = j?.token;
  const signerLinks = Array.isArray(j?.signers)
    ? j.signers.map((s) => ({
        token: s.token,
        link: `https://app.zapsign.co/sign/${s.token}`,
      }))
    : [];

  // 4) Atualiza o contrato no "banco" (contracts-db.json)
  const db = loadDB();
  const ix = db.contratos.findIndex((c) => String(c.id) === String(contratoId));
  if (ix >= 0) {
    db.contratos[ix].providerDocId = providerDocId;
    db.contratos[ix].status = 'enviado';
    db.contratos[ix].statusTs = now();
    (db.contratos[ix].timeline = db.contratos[ix].timeline || []).push({
      ts: now(),
      by: 'zapsign',
      action: 'STATUS_ENVIADO',
    });
    saveDB(db);
  }

  // 5) Retorna dados importantes para quem chamou
  return { providerDocId, signerLinks, zapsign: j };
}


// ── Health ────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Enviar contrato e criar documento na ZapSign ──────────────
app.post('/contracts/send', async (req, res) => {
  try {
    const {
      eventoId,
      titulo = 'Contrato',
      signers = [],
      pdfDataUri = null,
    } = req.body || {};

    if (!eventoId) {
      return res
        .status(400)
        .json({ ok: false, error: 'eventoId é obrigatório' });
    }

    // Aceita qualquer data URI de PDF, mesmo com "filename=...;base64"
    if (pdfDataUri && !/^data:application\/pdf/i.test(String(pdfDataUri))) {
      return res.status(400).json({
        ok: false,
        error:
          'pdfDataUri inválido (esperado algo começando com data:application/pdf)',
      });
    }

    // 1) Cria recibo local e grava metadados no arquivo
    const id = randomUUID();
    const receipt = {
      id,
      ok: true,
      eventId: String(eventoId),
      title: String(titulo || 'Contrato'),
      provider: 'zapsign',
      providerDocId: null,
      url: null,
      status: 'enviado',
      signers: (Array.isArray(signers) ? signers : []).map((s) => ({
        nome: s.nome || s.name || '',
        email: s.email || '',
        whatsapp: s.whatsapp || s.phone || '',
      })),
      ts: Date.now(),
    };

    const db = loadDB();
    db.contratos = db.contratos || [];
    db.contratos.push({
      id: receipt.id,
      ts: receipt.ts,
      eventoId: receipt.eventId,
      tipo: 'contrato',
      titulo: receipt.title,
      html: null,
      pdf: null, // NÃO guardamos base64
      signers: receipt.signers,
      provider: receipt.provider,
      providerDocId: receipt.providerDocId,
      status: receipt.status,
      statusTs: receipt.ts,
      timeline: [{ ts: receipt.ts, by: 'api', action: 'ENVIADO' }],
    });
    saveDB(db);

    // 2) Cria o documento REAL na ZapSign (reutilizando a função)
    const zap = await criarDocumentoZapSign({
      contratoId: id,
      titulo: receipt.title,
      signers: receipt.signers,
      pdfDataUri,
    });

    // 3) Enriquecer o recibo com dados da ZapSign
    receipt.providerDocId = zap.providerDocId || null;
    receipt.url =
      (zap.signerLinks && zap.signerLinks[0] && zap.signerLinks[0].link) ||
      null;
    receipt.zapsign = zap.zapsign || null;

    return res.json(receipt);
  } catch (e) {
    console.error('[contracts/send] erro:', e);
    const httpStatus = e.httpStatus || 500;
    return res
      .status(httpStatus)
      .json({ ok: false, error: e?.message || 'fail' });
  }
});


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

// ── /zapsign/create  (envia PDF para ZapSign, usando helper) ─────
app.post('/zapsign/create', async (req, res) => {
  try {
    const { contratoId, titulo = 'Contrato', signers = [], pdfDataUri } = req.body || {};

    const data = await criarDocumentoZapSign({
      contratoId,
      titulo,
      signers,
      pdfDataUri,
    });

    return res.json({ status: 200, data });
  } catch (err) {
    console.error('[zapsign/create] erro:', err);
    const httpStatus = err.httpStatus || 500;
    const payload = {
      status: httpStatus,
      error: err.message || 'Falha ao criar documento na ZapSign.',
    };
    if (err.zapsign) payload.raw = err.zapsign;
    return res.status(httpStatus).json(payload);
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

// ── Start (ÚNICO app.listen) ──────────────────────────────────
app.listen(PORT, () => {
  console.log(`[contracts-api] http://localhost:${PORT} — allowed: ${ALLOWED_ORIGINS.join(' | ')}`);
});
