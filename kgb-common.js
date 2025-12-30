// =============== TOKEN PARA API ===============
// ==== MODO SÓ LOCAL (sem servidor) ====
// Isso desliga a sincronização com a API.
// Tudo fica só no navegador (localStorage) e some os erros de conexão.
window.syncPush = async function () {
  console.log('[syncPush] desativado (modo só local)');
  return Promise.resolve();
};

window.finSyncFromApi = async function () {
  console.log('[finSyncFromApi] desativado (modo só local)');
  return Promise.resolve();
};

window.__kgbAuthHeaders = function () {
  const token = localStorage.getItem("AUTH_TOKEN");
  if (!token) return {};
  return { Authorization: "Bearer " + token };
};
/* ===== Utils base ===== */
const has = (fn) => typeof fn === 'function';

const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

const safeCrypto = (typeof window !== 'undefined' && window.crypto) ? window.crypto : null;
const uid = (p='id_') => (safeCrypto?.randomUUID?.() || (p + Math.random().toString(36).slice(2,10)));

const ISO = (d=new Date()) => { try { return new Date(d).toISOString().slice(0,10); } catch { return ''; } };

const fmtBRL = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });

const toNum = v => (typeof v === 'number') ? v
  : (parseFloat(String(v ?? '').replace(/\./g,'').replace(',','.')) || 0);

// Keys relacionadas a orçamentos/leads que vamos sincronizar com a API
const ORC_KEYS = new Set(['leads','propostasIndex','notificacoes','propostaLogs','orcamentos','produtosBuffet','usuarios']);

// Leitura resiliente: por padrão usa localStorage, mas para chaves de orçamentos
// usa sessionStorage como cache e tenta atualizar em background via API.
const readLS = (k, fb=null) => {
  try {
    // se for chave de orçamentos, preferir sessionStorage (cache temporário)
    if (ORC_KEYS.has(k)) {
      try { const s = sessionStorage.getItem(k); if (s) return JSON.parse(s); } catch {}
      // disparar atualização em background (não bloqueante)
      try {
        if (window.__API_BASE__) {
          (async ()=>{
            try {
              const base = window.__API_BASE__;
              if (k === 'leads' || k === 'propostasIndex') {
                const r = await fetch(base + '/leads', { credentials: 'same-origin', headers: __kgbAuthHeaders() });
                if (r.ok) {
                  const d = await r.json();
                  sessionStorage.setItem('leads', JSON.stringify(Array.isArray(d) ? d : (d?.data||[])));
                  // propostasIndex pode ser derivado no cliente, mas gravamos o mesmo payload
                  sessionStorage.setItem('propostasIndex', JSON.stringify(Array.isArray(d) ? d : (d?.data||[])));
                }
              } else if (k === 'orcamentos') {
                const r = await fetch(base + '/orcamentos', { credentials: 'same-origin', headers: __kgbAuthHeaders() });
                if (r.ok) {
                  const d = await r.json();
                  sessionStorage.setItem('orcamentos', JSON.stringify(Array.isArray(d) ? d : (d?.data||[])));
                }
              }
            } catch(e){}
          })();
        }
      } catch(e){}
      return fb;
    }
    return JSON.parse(localStorage.getItem(k)) ?? fb;
  } catch { return fb; }
};

// Escrita resiliente: para chaves de orçamentos tentamos enviar para a API,
// com fallback para sessionStorage/localStorage quando offline.
const writeLS = (k,v)=> {
  try {
    if (ORC_KEYS.has(k)) {
      // persistir em sessionStorage imediatamente
      try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {}
      // tentar enviar para API (fire-and-forget)
      try {
        if (window.__API_BASE__) {
          const base = window.__API_BASE__;
          if (k === 'leads') {
            (async ()=>{
              try {
                // se v for array, enviar cada item via POST
                if (Array.isArray(v)) {
                  for (const it of v) {
                    await fetch(base + '/leads', { method: 'POST', headers: { 'Content-Type':'application/json', ...__kgbAuthHeaders() }, body: JSON.stringify(it) });
                  }
                } else {
                  await fetch(base + '/leads', { method: 'POST', headers: { 'Content-Type':'application/json', ...__kgbAuthHeaders() }, body: JSON.stringify(v) });
                }
              } catch(e){}
            })();
          } else if (k === 'orcamentos') {
            (async ()=>{
              try {
                if (Array.isArray(v)) {
                  for (const it of v) {
                    await fetch(base + '/orcamentos', { method: 'POST', headers: { 'Content-Type':'application/json', ...__kgbAuthHeaders() }, body: JSON.stringify(it) });
                  }
                } else {
                  await fetch(base + '/orcamentos', { method: 'POST', headers: { 'Content-Type':'application/json', ...__kgbAuthHeaders() }, body: JSON.stringify(v) });
                }
              } catch(e){}
            })();
          } else {
            // outros: gravar em session e tentar um endpoint genérico se houver
            (async ()=>{ try { await fetch(base + '/sync/storage', { method:'POST', headers: { 'Content-Type':'application/json', ...__kgbAuthHeaders() }, body: JSON.stringify({ key:k, value:v }) }); } catch(e){} })();
          }
        }
      } catch(e){}
      return;
    }
    localStorage.setItem(k, JSON.stringify(v));
  } catch {} };

/* ===== Storage Keys (padrão M30/M31) ===== */
const K_KEYS = {
  EVENTOS: 'm30.eventos',             // [{id,nome,data,local,hasIngressos,hasItens,contaId,status}]
  INGRESSO_TIPOS: 'm30.ingTipos',     // [{id,eventoId,nome,preco,ativo}]
  ITENS: 'm31.itens',                 // [{id,eventoId,nome,preco,estoqueMin,estoqueInicial,ativo}]
  LAYOUTS: 'm30.layouts',             // [{id,eventoId,tipo:'ingresso'|'ficha', nome, canvas:{w,h}, elements:[...] }]
  LOTES: 'm30.lotes',                 // [{id,eventoId,tipoId,qtd,from,to,digits,createdAt}]
  TICKETS: 'm30.tickets',             // [{id,eventoId,tipoId,seq,seqStr,ticketId,status}] status: 'reservado'|'vendido'|'usado'|'cancelado'
  SESSOES: 'm31.sessoes',             // [{id,eventoId,atendente,abertura,fechamento,fundo,status}]
  VENDAS: 'm31.vendas',               // [{id,eventoId,sessaoId,itens:[{itemId,nome,preco,qty}], total, desconto, forma, valorPago, troco, hora, status}]
  FIN_CONTAS: 'fin.contas',           // [{id,nome,descricao}]  << já existe no seu Financeiro
  FIN_GLOBAL: 'financeiroGlobal'      // integração: entradas por forma na conta do evento
};

// Expor helpers globais para compatibilidade com scripts antigos
try{
  if (typeof window !== 'undefined') {
    window.readLS = window.readLS || readLS;
    window.writeLS = window.writeLS || writeLS;
  }
} catch(e) {}

// Shim rápido: intercepta acessos diretos a localStorage para chaves de
// orçamentos/propostas e delega para readLS/writeLS (API-first). Isso permite
// que arquivos antigos que usam localStorage continuem funcionando sem editar
// dezenas de arquivos agora.
try{
  if (typeof window !== 'undefined' && window.localStorage) {
    const nativeGet = window.localStorage.getItem.bind(window.localStorage);
    const nativeSet = window.localStorage.setItem.bind(window.localStorage);
    const nativeRemove = window.localStorage.removeItem.bind(window.localStorage);

    const isOrcKey = (k) => {
      if (!k) return false;
      if (ORC_KEYS.has(k)) return true;
      // prefixes commonly used in the app
      const lower = String(k).toLowerCase();
      if (lower.startsWith('proposta') || lower.startsWith('propostas') || lower.startsWith('orcamento') || lower.startsWith('proposta_')) return true;
      return false;
    };

    window.localStorage.getItem = function(k){
      try{
        if (isOrcKey(k)){
          const v = readLS(k, null);
          return v === null || typeof v === 'undefined' ? null : (typeof v === 'string' ? v : JSON.stringify(v));
        }
      } catch(e){}
      return nativeGet(k);
    };

    window.localStorage.setItem = function(k, v){
      try{
        if (isOrcKey(k)){
          let parsed = v;
          try { parsed = JSON.parse(v); } catch(e) { parsed = v; }
          try { writeLS(k, parsed); return; } catch(e){}
        }
      } catch(e){}
      return nativeSet(k, v);
    };

    window.localStorage.removeItem = function(k){
      try{
        if (isOrcKey(k)){
          try { writeLS(k, null); } catch(e){}
          try { sessionStorage.removeItem(k); } catch(e){}
          return nativeRemove(k);
        }
      } catch(e){}
      return nativeRemove(k);
    };
  }
} catch(e){}

// === Permissões: helpers de pós-render ===
import { aplicarPermissoesNaTela, aplicarPermissoesNoMenu } from './api/proteger-pagina.js';

// Substitui innerHTML e já aplica permissões no nó raiz passado
export function setHTMLComPermissoes(el, html){
  if (!el) return;
  el.innerHTML = html;
  try { aplicarPermissoesNaTela(el); } catch {}
}

// Reaplica permissões em um container (útil após appendChild/insertAdjacentHTML)
export function reaplicarPermissoes(root=document){
  try { aplicarPermissoesNaTela(root); } catch {}
}

// Chama no carregamento para o menu lateral
document.addEventListener('DOMContentLoaded', () => {
  try { aplicarPermissoesNoMenu(document); } catch {}
});

/* ===== Helpers de domínio ===== */
export function findEvento(id){
  return (readLS(K_KEYS.EVENTOS,[])||[]).find(x => String(x.id) === String(id));
}
export function listEventos(){ return readLS(K_KEYS.EVENTOS,[]) || []; }

export function listContas(){
  // Lê a mesma fonte usada pela tela Financeiro – Configurações (configFinanceiro)
  let cfg;
  try { cfg = JSON.parse(localStorage.getItem('configFinanceiro') || '{}') || {}; }
  catch { cfg = {}; }

  const contas = Array.isArray(cfg.contas) ? cfg.contas : [];
  // Normaliza para {id, nome}
  return contas
    .filter(c => c && String(c.nome||'').trim().length)
    .map(c => ({ id: String(c.id || c.uid || uid('ct_compat_')), nome: String(c.nome).trim() }));
}

// checkin.html — leitura resiliente, com fallback se listTipos/listTickets não existirem no escopo global
export function tipos(evId){
  const src = has(window.listTipos) ? (window.listTipos('__ALL__') || [])
    : (JSON.parse(localStorage.getItem(K_KEYS.INGRESSO_TIPOS) || '[]') || []);
  return (src||[]).filter(t => String(t.eventoId) === String(evId));
}
export function tickets(evId){
  const src = has(window.listTickets) ? (window.listTickets('__ALL__') || [])
    : (JSON.parse(localStorage.getItem(K_KEYS.TICKETS) || '[]') || []);
  return (src||[]).filter(t => String(t.eventoId) === String(evId));
}

export function listItens(eventoId){
  return (readLS(K_KEYS.ITENS,[])||[]).filter(x => String(x.eventoId) === String(eventoId) && x.ativo !== false);
}
export function listLayouts(eventoId, tipo){
  return (readLS(K_KEYS.LAYOUTS,[])||[]).filter(x => String(x.eventoId) === String(eventoId) && x.tipo === tipo);
}
export function listVendas(eventoId){
  return (readLS(K_KEYS.VENDAS,[])||[]).filter(x => String(x.eventoId) === String(eventoId));
}

export function setLS(key, updater){
  const cur = readLS(key, []);
  const next = updater(Array.isArray(cur)? cur : []);
  writeLS(key, next);
  return next;
}

/* ===== Tickets (ingressos) ===== */
export function gerarLoteIngressos({eventoId,tipoId,qtd=100,digits=4}){
  const lotes = readLS(K_KEYS.LOTES,[]) || [];
  const ticketsArr = readLS(K_KEYS.TICKETS,[]) || [];

  const currentMax = ticketsArr
    .filter(t => String(t.eventoId) === String(eventoId))
    .reduce((m,t)=>Math.max(m, Number(t.seq||0)), 0);

  const from = currentMax + 1, to = currentMax + Number(qtd||0);
  const loteId = uid('lote_');

  for(let seq=from; seq<=to; seq++){
    const seqStr = String(seq).padStart(digits, '0');
    const ticketId = `${eventoId}-${tipoId}-${seqStr}`;
    ticketsArr.push({ id: uid('tk_'), eventoId, tipoId, seq, seqStr, ticketId, status:'reservado' });
  }

  lotes.push({ id:loteId, eventoId, tipoId, qtd, from, to, digits, createdAt:new Date().toISOString() });
  writeLS(K_KEYS.LOTES, lotes);
  writeLS(K_KEYS.TICKETS, ticketsArr);

  return { loteId, from, to };
}

/* ===== QR & Render (canvas layout → DOM/PDF/print) =====
  layout.canvas = {w:cm, h:cm} (ex.: ingresso 20x7)
  layout.elements = [{id,type:'text'|'var'|'qr'|'bg', x:%, y:%, w:%, h:%, text?, varKey?, font?, size?, align?, bold?}]
*/
function cmToPx(cm, dpi=300){ return Math.round(Number(cm||0) * (dpi/2.54)); }

export async function renderTicketToCanvas(layout, data, {dpi=300}={}){
  const cv = document.createElement('canvas');
  const W = cmToPx(layout?.canvas?.w || 0, dpi);
  const H = cmToPx(layout?.canvas?.h || 0, dpi);
  cv.width = Math.max(1, W); cv.height = Math.max(1, H);

  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,cv.width,cv.height);

  // background first
  for(const el of (layout?.elements || [])){
    if (el?.type === 'bg' && el?.src){
      const img = await loadImage(el.src);
      const x = Math.round(Number(el.x||0)*W), y = Math.round(Number(el.y||0)*H);
      const w = Math.round(Number(el.w||0)*W), h = Math.round(Number(el.h||0)*H);
      ctx.drawImage(img, x,y,w,h);
    }
  }

  // others
  for(const el of (layout?.elements || [])){
    const x = Math.round(Number(el.x||0)*W), y = Math.round(Number(el.y||0)*H);
    const w = Math.round(Number(el.w||0)*W), h = Math.round(Number(el.h||0)*H);

    if (el.type === 'text'){
      drawText(ctx, el.text || '', x,y,w,h, el);
    } else if (el.type === 'var'){
      const t = (data?.[el.varKey] ?? '');
      drawText(ctx, String(t), x,y,w,h, el);
    } else if (el.type === 'qr'){
      const payload = data?.qrPayload || '';
      if(!payload) continue;
      const qrCv = await makeQRCanvas(payload, Math.max(w,h));
      ctx.drawImage(qrCv, x,y, w,h);
    }
  }
  return cv;
}

function drawText(ctx, text, x,y,w,h, el){
  ctx.save();
  const fontSize = Math.max(1, Math.round((Number(el.size)||14) * 4)); // upscale for DPI
  ctx.font = `${el.bold ? '600':'400'} ${fontSize}px Inter, sans-serif`;
  ctx.fillStyle = el.color || '#2a211a';
  ctx.textBaseline = 'top';
  const lines = (el.wrap ? wrapText(ctx, String(text), w) : [String(text)]);
  const lh = Math.round(fontSize * 1.3);
  let yy = y;
  for(const ln of lines){
    let xx = x;
    const m = ctx.measureText(ln).width;
    if(el.align === 'center'){ xx = x + w/2 - m/2; }
    if(el.align === 'right'){  xx = x + w - m;   }
    ctx.fillText(ln, xx, yy);
    yy += lh;
    if (yy > y + h) break;
  }
  ctx.restore();
}
function wrapText(ctx, text, maxW){
  const words = String(text).split(/\s+/);
  const lines=[]; let cur='';
  for(const w of words){
    const test = cur ? cur + ' ' + w : w;
    if(ctx.measureText(test).width <= maxW) cur = test;
    else { if(cur) lines.push(cur); cur = w; }
  }
  if(cur) lines.push(cur);
  return lines;
}
function loadImage(src){
  return new Promise((res,rej)=>{
    try{
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    } catch(e){ rej(e); }
  });
}
function makeQRCanvas(text, size=512){
  return new Promise((resolve,reject)=>{
    try{
      if (typeof QRCode === 'undefined' || !QRCode?.toCanvas){
        return reject(new Error('QRCode lib não carregada'));
      }
      const cv = document.createElement('canvas');
      QRCode.toCanvas(cv, String(text), { width: Math.max(16, Number(size)||512), margin:1 }, err=>{
        if(err) return reject(err);
        resolve(cv);
      });
    }catch(e){ reject(e); }
  });
}

/* ===== Impressão de fichas (N por unidade) =====
   data por ficha: {EVENTO_NOME, ITEM_NOME, QTD_ITEM=1, VALOR, PEDIDO_NUM, SEQUENCIA_ITEM, SEQUENCIA_TOTAL, DATA_HORA, OPERADOR}
*/
export async function buildFichaHTML(layout, dataList){
  // layout.canvas.w/h em cm → convertemos para CSS mm (print)
  const wmm = (layout?.canvas?.w || 0) * 10;
  const hmm = (layout?.canvas?.h || 0) * 10;
  let html = `<div class="print-area">`;
  for(const data of (dataList || [])){
    const cv = await renderTicketToCanvas(layout, { ...data, qrPayload: data?.qrPayload || '' });
    const url = cv.toDataURL('image/png', 1.0);
    html += `<div style="page-break-after:always; width:${wmm}mm; height:${hmm}mm; display:block;">
      <img src="${url}" style="width:100%;height:100%;object-fit:contain"/>
    </div>`;
  }
  html += `</div>`;
  return html;
}

/* ===== Export financeiro por forma (para conta do evento) ===== */
export function exportFinanceiroPorForma({eventoId, contaId}){
  const vendas = listVendas(eventoId).filter(v => String(v.status||'') !== 'cancelada');
  const porForma = vendas.reduce((acc,v)=>{
    const f = String(v.forma||'Indefinido');
    const tot = Number(v.total||0) - Number(v.desconto||0);
    acc[f] = (acc[f] || 0) + tot;
    return acc;
  },{});

  const fg = readLS(K_KEYS.FIN_GLOBAL,[]) || [];
  Object.entries(porForma).forEach(([forma,valor])=>{
    fg.push({
      id: uid('fin_'),
      data: ISO(), tipo: 'entrada',
      categoria: 'Receita — Evento Pago',
      contaId,
      descricao: `Evento ${findEvento(eventoId)?.nome || eventoId} — ${forma}`,
      valor: Number(valor||0)
    });
  });
  writeLS(K_KEYS.FIN_GLOBAL, fg);
  return fg;
}

/* ===== Pequenas helpers de sessão/PDV ===== */
export function abrirSessao({eventoId, atendente, fundo=0}){
  const sess = {
    id: uid('sess_'),
    eventoId,
    atendente: String(atendente||''),
    abertura: new Date().toISOString(),
    fundo: toNum(fundo),
    status: 'aberta'
  };
  const xs = readLS(K_KEYS.SESSOES,[]) || [];
  xs.push(sess);
  writeLS(K_KEYS.SESSOES, xs);
  return sess;
}
export function fecharSessao(sessaoId){
  const xs = readLS(K_KEYS.SESSOES,[]) || [];
  const i = xs.findIndex(s => String(s.id) === String(sessaoId));
  if(i < 0) return;
  xs[i].fechamento = new Date().toISOString();
  xs[i].status = 'fechada';
  writeLS(K_KEYS.SESSOES, xs);
  return xs[i];
}

/* === INÍCIO PATCH FASE F — API BASE + apiFetch (fica no final do arquivo) === */
(function(){
  // 1) Define e expõe a base da API (Render em produção)
const DEFAULT_PROD_API = (typeof window !== 'undefined' && window.__API_BASE__) ? window.__API_BASE__ : ((typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '');

// Detecta se está rodando local (VS Code/Live Server) ou online (Netlify)
const isLocalhost =
  (typeof location !== 'undefined') &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

// 1) Se já veio definido por config.env.js, respeita (mas preferimos override salvo no localStorage)
let base = '';
try { base = (window.__API_BASE__ || '').trim(); } catch (e) {}

// 2) Lê override do localStorage (apenas para DEV local)
let saved = '';
try { saved = (localStorage.getItem('API_BASE') || '').trim(); } catch (e) {}

// Se estiver ONLINE (Netlify), nunca usar localhost salvo no localStorage
if (!isLocalhost && saved && (saved.includes('localhost') || saved.includes('127.0.0.1'))) {
  try { localStorage.removeItem('API_BASE'); } catch (e) {}
  saved = '';
}

// Regra final (prioriza `saved` se disponível):
// - Se houver `saved` explícito (ex.: via api-config.js ou localStorage), usamos ele.
// - Caso contrário, usamos `base` (vindo de window.__API_BASE__ ou DEFAULT_PROD_API).
if (saved) {
  base = saved;
} else if (!base) {
  base = (isLocalhost && saved) ? saved : DEFAULT_PROD_API;
}

window.__API_BASE__ = base;


  // === INÍCIO PATCH API-BASE RESOLVER ===
  function __kgbGetAPIBase() {
    try {
      if (typeof window.__API_BASE__ === 'string' && window.__API_BASE__)
        return window.__API_BASE__.trim();
      try {
        const ls = localStorage.getItem('API_BASE');
        if (ls && ls.trim()) return ls.trim();
      } catch (e) {}
    } catch (e) {}
    return '';
  }
  // === FIM PATCH API-BASE RESOLVER ===

  // 2) Helper padrão para chamadas REST da API real (com timeout + toasts)
  // Uso: apiFetch('/audit/log')  ou  apiFetch('/fin/metrics')
  const DEFAULT_TIMEOUT_MS = 12000;

  window.apiFetch = async function apiFetch(path, opts = {}) {
    const base = (__kgbGetAPIBase() || '').replace(/\/+$/, '');
    const p = String(path || '');
    const isAbsolute = /^https?:\/\//i.test(p);

    // Só exige API_BASE quando o caminho for relativo
    if (!isAbsolute && !base) {
      try { window.toast?.('API_BASE não configurada.', 'warn'); } catch {}
      throw new Error('API_BASE vazia');
    }

    const url = isAbsolute ? p : `${base}${p.startsWith('/') ? '' : '/'}${p}`;

    // Timeout
    const ctrl = new AbortController();
    const timeoutMs = opts.timeout ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs);

    try {
      // --- monta headers padrão + opcionais do caller
      const baseHeaders = (typeof __kgbAuthHeaders === 'function') ? __kgbAuthHeaders() : {};
      const headers = new Headers({ ...baseHeaders, ...(opts.headers || {}) });

      // Se body for objeto (e não FormData) e não houver content-type, serialize como JSON
      let body = opts.body;
      if (body && typeof body === 'object' && !(body instanceof FormData) && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
        try { body = JSON.stringify(body); } catch {}
      }

      const fetchOpts = {
        method: opts.method || (body ? 'POST' : 'GET'),
        headers,
        body,
        signal: ctrl.signal,
        credentials: opts.credentials || 'include'
      };

      const res = await fetch(url, fetchOpts);
      clearTimeout(timer);

      if (!res.ok) {
        let detail = '';
        try {
          const ctErr = res.headers.get('content-type') || '';
          if (ctErr.includes('application/json')) {
            const j = await res.json();
            detail = j?.error || j?.message || JSON.stringify(j);
          } else {
            detail = await res.text();
          }
        } catch {}
        const msg = `API ${res.status}: ${detail || res.statusText}`;
        try { window.toast?.(msg, 'error'); } catch {}
        const err = new Error(msg);
        err.status = res.status;
        err.url = url;
        throw err;
      }

      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? res.json() : res.text();

    } catch (err) {
      clearTimeout(timer);
      if (String(err?.message || err) === 'timeout' || err?.name === 'AbortError') {
        try { window.toast?.('Tempo de resposta da API esgotado.', 'warn'); } catch {}
        throw new Error('timeout');
      }
      throw err;
    }
  };

  /* === INÍCIO PATCH G — Toasts globais === */
  (function(){
    'use strict';
    if (window.toast) return; // evita duplicar

    const wrapId = 'kgb-toasts-wrap';
    function ensureWrap(){
      let w = document.getElementById(wrapId);
      if (!w){
        w = document.createElement('div');
        w.id = wrapId;
        w.style.cssText = `
          position:fixed; inset:auto 16px 16px auto; z-index:99999;
          display:flex; flex-direction:column; gap:8px; align-items:flex-end;
        `;
        document.body.appendChild(w);
      }
      return w;
    }

    function toast(msg, type='info', ms=3500){
      const w = ensureWrap();
      const el = document.createElement('div');
      el.className = `kgb-toast kgb-toast-${type}`;
      el.role = 'status';
      el.ariaLive = 'polite';
      el.style.cssText = `
        max-width:min(92vw,520px); padding:10px 14px; border-radius:12px;
        box-shadow:0 8px 24px rgba(0,0,0,.12); background:#fff; color:#222; font:14px/1.4 Inter,system-ui,Arial;
        display:flex; gap:10px; align-items:center; border:1px solid #eee;
      `;
      el.innerHTML = `
        <span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:99px;background:#6b7280"></span>
        <span class="txt">${msg}</span>
        <button type="button" aria-label="Fechar" style="margin-left:10px;border:0;background:transparent;cursor:pointer;font-size:16px">✕</button>
      `;
      const dot = el.querySelector('.dot');
      if (type==='success') dot.style.background = '#16a34a';
      if (type==='error')   dot.style.background = '#dc2626';
      if (type==='warn')    dot.style.background = '#f59e0b';
      const btn = el.querySelector('button');
      btn.addEventListener('click', ()=>el.remove());
      w.appendChild(el);
      if (ms>0) setTimeout(()=>el.remove(), ms);
    }

    window.toast = toast;
  })();
  /* === FIM PATCH G === */

  /* === INÍCIO PATCH L — sync helpers === */
  if (!window.syncPush || !window.syncPull) {
    async function syncPush(changes = []) {
      try {
        // se vier array, envelopa como {changes: [...]} (formato que o backend espera)
        const body = Array.isArray(changes) ? { changes } : changes;
        await apiFetch('/sync/push', { method:'POST', body });
        return true;
      } catch (e) {
        console.warn('[syncPush] falhou:', e);
        try { window.toast?.('Não foi possível sincronizar agora.', 'warn'); } catch {}
        return false;
      }
    }

    async function syncPull(sinceTs = 0) {
      try {
        const qs = sinceTs ? `?since=${encodeURIComponent(String(sinceTs))}` : '';
        const data = await apiFetch(`/sync/pull${qs}`);
        // aqui você decide como aplicar: mesclar FG, eventos, etc.
        return data || {};
      } catch (e) {
        console.warn('[syncPull] falhou:', e);
        return {};
      }
    }

    window.syncPush = syncPush;
    window.syncPull = syncPull;
  }
  /* === FIM PATCH L === */

})(); // <-- FECHAMENTO do IIFE principal
/* === FIM PATCH FASE F — API BASE + apiFetch === */

/* ===== Exposição opcional no window (para páginas sem import) ===== */
try {
  window.K_KEYS = K_KEYS;
  window.findEvento = findEvento;
  window.listEventos = listEventos;
  window.listContas  = listContas;
  window.tipos       = tipos;
  window.tickets     = tickets;
  window.listItens   = listItens;
  window.listLayouts = listLayouts;
  window.listVendas  = listVendas;
  window.setLS       = setLS;
  window.gerarLoteIngressos = gerarLoteIngressos;
  window.renderTicketToCanvas = renderTicketToCanvas;
  window.buildFichaHTML = buildFichaHTML;
  window.exportFinanceiroPorForma = exportFinanceiroPorForma;
  window.abrirSessao = abrirSessao;
  window.fecharSessao = fecharSessao;
} catch {}
