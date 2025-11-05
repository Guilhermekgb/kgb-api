require('dotenv').config();
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import * as mp from './providers/mercadopago.js'; // <- deixe só este

const app = express();
const PORT = process.env.PORT || 3001;

const allowed = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);             // sem Origin (ex.: arquivos locais) → permite
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origem não permitida: ' + origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// HEALTH
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ... (demais rotas)
app.listen(PORT, () => console.log(`[financeiro-api] http://localhost:${PORT}`));


// ----------------------------------------------------------------------------
// HEALTH
// ----------------------------------------------------------------------------
app.post('/api/providers/test', async (req, res) => {
  if (!mp) return res.status(501).json({ ok:false, error:'Mercado Pago não configurado' });
  try {
    const { env = process.env.MP_ENV || 'sandbox', credentials = {} } = req.body || {};
    const ok = await mp.testConnection({ env, credentials });
    res.json({ ok: !!ok, provider: 'mercadopago' });
  } catch (e) { res.status(500).json({ ok:false, error: e?.message || 'fail' }); }
});

app.post('/api/payments', async (req, res) => {
  if (!mp) return res.status(501).json({ error:'Mercado Pago não configurado' });
  try {
    const { method, amount, description, due_date, customer, desconto, juros, metadata = {}, env = process.env.MP_ENV || 'sandbox', credentials = {} } = req.body || {};
    if (!method || !amount || !customer?.name) return res.status(400).json({ error:'Dados obrigatórios ausentes.' });
    const out = await mp.createCharge({ method, amount, description, due_date, customer, desconto, juros, metadata, env, credentials });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e?.message || 'Falha ao criar cobrança' }); }
});

app.post('/api/providers/mercadopago/webhook', async (req, res) => {
  if (!mp) return res.sendStatus(200); // não reenvia infinitamente
  try {
    const topic = req.query.topic || req.body?.type || req.body?.action || 'unknown';
    const paymentId = req.query.id || req.body?.data?.id;
    console.log('[MP Webhook] topic:', topic, 'paymentId:', paymentId);
    // ... (mantenha sua lógica aqui)
    res.sendStatus(200);
  } catch (e) { console.error('[MP Webhook] erro', e); res.sendStatus(200); }
});


// ----------------------------------------------------------------------------
// MERCADO PAGO — Teste de provider
// ----------------------------------------------------------------------------
app.post('/api/providers/test', async (req, res) => {
  try {
    const { env = process.env.MP_ENV || 'sandbox', credentials = {} } = req.body || {};
    const ok = await mp.testConnection({ env, credentials });
    res.json({ ok: !!ok, provider: 'mercadopago' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || 'fail' });
  }
});

// ----------------------------------------------------------------------------
// MERCADO PAGO — Criar cobrança
// ----------------------------------------------------------------------------
app.post('/api/payments', async (req, res) => {
  try {
    const {
      method,               // 'boleto' | 'pix' | 'card'
      amount,
      description,
      due_date,             // YYYY-MM-DD (boleto)
      customer,             // { name, email, document }
      desconto,             // compatibilidade (MP ignora)
      juros,                // compatibilidade (MP ignora)
      metadata = {},
      env = process.env.MP_ENV || 'sandbox',
      credentials = {}      // { accessToken }
    } = req.body || {};

    if (!method || !amount || !customer?.name) {
      return res.status(400).json({ error: 'Dados obrigatórios ausentes.' });
    }

    const out = await mp.createCharge({
      method, amount, description, due_date, customer, desconto, juros, metadata, env, credentials
    });

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'Falha ao criar cobrança' });
  }
});

// ============================================================================
// =======================  M13: ROTAS EM MEMÓRIA  ============================
// ============================================================================

const store = {
  eventos: new Map(),
  agenda:  new Map()
};

const todayISO = () => new Date().toISOString().slice(0,10);
const addDays = (iso, days) => {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + (Number(days)||0));
  return d.toISOString().slice(0,10);
};
const prazoReal = (dataEventoISO, dias, tipo) => {
  const off = (Number(dias)||0) * (tipo === 'depois' ? +1 : -1);
  return dataEventoISO ? addDays(dataEventoISO, off) : null;
};

function recalcAtrasos(ev) {
  const total = Object.values(ev.checklistsPorTipo || {})
    .flat()
    .filter(x => x && x.status !== 'ok' && x.prazoISO && x.prazoISO < todayISO()).length;
  ev.checklist_atrasos_total = total;
  return total;
}

// ---- EVENTOS
app.post('/api/eventos', (req, res) => {
  const id = req.body?.id || crypto.randomUUID();
  const novo = {
    id,
    titulo: req.body?.titulo || 'Evento sem título',
    data: req.body?.data || null,
    local: req.body?.local || '',
    dados: req.body?.dados || {},
    checklistsPorTipo: req.body?.checklistsPorTipo || {},
    checklist_atrasos_total: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  Object.values(novo.checklistsPorTipo || {}).forEach(arr => {
    (arr || []).forEach(it => { if (!it.id) it.id = crypto.randomUUID(); });
  });

  for (const itens of Object.values(novo.checklistsPorTipo || {})) {
    (itens || []).forEach(it => {
      if (it.prazoISO) {
        const aid = crypto.randomUUID();
        store.agenda.set(aid, {
          id: aid,
          evento_id: id,
          tipo: 'checklist',
          titulo: it.item,
          data: it.prazoISO,
          status: it.status || 'pendente'
        });
      }
    });
  }

  recalcAtrasos(novo);
  store.eventos.set(id, novo);
  res.status(201).json(novo);
});

app.get('/api/eventos/:id', (req, res) => {
  const ev = store.eventos.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
  res.json(ev);
});

app.put('/api/eventos/:id', (req, res) => {
  const cur = store.eventos.get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Evento não encontrado' });

  const oldData = String(cur.data || '');
  const next = { ...cur, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };

  const newData = String(next.data || '');
  const dataMudou = (oldData !== newData);

  if (dataMudou) {
    const novoChecklist = {};
    Object.entries(next.checklistsPorTipo || {}).forEach(([aba, itens]) => {
      novoChecklist[aba] = (itens || []).map(it => {
        const idItem = it.id || crypto.randomUUID();
        const prazo = (it.dias != null && it.tipo)
          ? prazoReal(newData, it.dias, it.tipo)
          : (it.prazoISO || null);
        return { ...it, id: idItem, prazoISO: prazo };
      });
    });
    next.checklistsPorTipo = novoChecklist;

    for (const [aid, a] of store.agenda) {
      if (String(a.evento_id) === String(next.id) && a.tipo === 'checklist') {
        store.agenda.delete(aid);
      }
    }
    Object.values(next.checklistsPorTipo || {}).flat().forEach(it => {
      if (!it?.prazoISO) return;
      const aid = crypto.randomUUID();
      store.agenda.set(aid, {
        id: aid,
        evento_id: next.id,
        tipo: 'checklist',
        titulo: it.item,
        data: it.prazoISO,
        status: it.status || 'pendente'
      });
    });

    recalcAtrasos(next);
  }

  store.eventos.set(req.params.id, next);
  res.json(next);
});

// ---- CHECKLIST
app.get('/api/eventos/:id/checklist', (req, res) => {
  const ev = store.eventos.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
  res.json(ev.checklistsPorTipo || {});
});

app.put('/api/checklist/itens/:itemId', (req, res) => {
  const { itemId } = req.params;
  const { eventoId, status, item, obs } = req.body || {};
  const ev = store.eventos.get(String(eventoId));
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });

  let updated = null;
  for (const [_, itens] of Object.entries(ev.checklistsPorTipo || {})) {
    const idx = (itens || []).findIndex(x => String(x.id) === String(itemId));
    if (idx >= 0) {
      const old = itens[idx];
      const next = { ...old };
      if (status != null) next.status = status;
      if (item   != null) next.item   = item;
      if (obs    != null) next.obs    = obs;
      itens[idx] = next;
      updated = next;
      break;
    }
  }
  if (!updated) return res.status(404).json({ error: 'Item não encontrado' });

  for (const [aid, a] of store.agenda) {
    if (String(a.evento_id) === String(eventoId) && a.tipo === 'checklist' && a.titulo === updated.item) {
      if (updated.status) a.status = updated.status;
    }
  }

  recalcAtrasos(ev);
  store.eventos.set(String(eventoId), ev);
  res.json(updated);
});

// ---- AGENDA
app.get('/api/agenda', (req, res) => {
  const vencidos = String(req.query.vencidos || '') === 'true';
  const all = [...store.agenda.values()];
  const out = vencidos
    ? all.filter(a => a.tipo === 'checklist' && a.status !== 'ok' && a.data && String(a.data) < todayISO())
    : all;
  res.json(out);
});

app.put('/api/agenda/:id', (req, res) => {
  const a = store.agenda.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Registro de agenda não encontrado' });
  const next = { ...a, ...req.body };
  store.agenda.set(req.params.id, next);

  const ev = store.eventos.get(String(next.evento_id));
  if (ev) {
    recalcAtrasos(ev);
    store.eventos.set(String(next.evento_id), ev);
  }
  res.json(next);
});

// ============================================================================

app.listen(PORT, () =>
  console.log(`[financeiro-api] rodando em http://localhost:${PORT}`)
);
