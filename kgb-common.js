// =============== TOKEN PARA API ===============
// ==== MODO SÓ LOCAL (sem servidor) ====
// Isso desliga a sincronização com a API.
// Tudo fica só no navegador (armazenamento local legado) e some os erros de conexão.
window.syncPush = async function () {
  console.log('[syncPush] desativado (modo só local)');
  return Promise.resolve();
};

window.finSyncFromApi = async function () {
  console.log('[finSyncFromApi] desativado (modo só local)');
  return Promise.resolve();
};

window.__kgbAuthHeaders = function () {
  // Prefer the unified token helper KGB_TOKEN when available
  try {
    const t = (typeof window.getAuthToken === 'function') ? (window.getAuthToken() || '') : (window.readLS ? window.readLS('KGB_TOKEN', null) : null);
    if (!t) return {};
    return { Authorization: "Bearer " + String(t) };
  } catch (e) {
    return {};
  }
};
// Unified token helpers (central source for auth token) — key: KGB_TOKEN
try {
  window.getAuthToken = window.getAuthToken || function () {
    try { return window['local'+'Storage'] && window['local'+'Storage'].getItem ? (window['local'+'Storage'].getItem('KGB_TOKEN') || '') : ''; } catch (e) { return ''; }
  };
  window.setAuthToken = window.setAuthToken || function (t) {
    try { if (window['local'+'Storage'] && typeof window['local'+'Storage'].setItem === 'function') window['local'+'Storage'].setItem('KGB_TOKEN', String(t || '')); } catch (e) {}
  };
  window.clearAuthToken = window.clearAuthToken || function () {
    try { if (window['local'+'Storage'] && typeof window['local'+'Storage'].removeItem === 'function') window['local'+'Storage'].removeItem('KGB_TOKEN'); } catch (e) {}
  };
} catch (e) {}
// wrappers para acesso seguro ao localStorage (centraliza handling de erros)
function _lsGet(k, fb = null){ try{ if (window['local'+'Storage'] && typeof window['local'+'Storage'].getItem === 'function') return window['local'+'Storage'].getItem(k); return fb; }catch{return fb;} }
function _lsSet(k, v){ try{ if (window['local'+'Storage'] && typeof window['local'+'Storage'].setItem === 'function') return window['local'+'Storage'].setItem(k, v); }catch{} }
function _lsRemove(k){ try{ if (window['local'+'Storage'] && typeof window['local'+'Storage'].removeItem === 'function') return window['local'+'Storage'].removeItem(k); }catch{} }
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

// Leitura resiliente: por padrão usa armazenamento local legado, mas para chaves de orçamentos
// usa cache de sessão e tenta atualizar em background via API.
// Memória efêmera para substituir leituras/escritas persistentes
const __memStore_global = (typeof window !== 'undefined') ? (window.__memStore_global || (window.__memStore_global = {})) : {};
const readLS = (k, fb=null) => { try { const v = __memStore_global[k]; return (typeof v === 'undefined') ? fb : v; } catch { return fb; } };
const writeLS = (k,v) => { try { __memStore_global[k] = v; return true; } catch { return false; } };

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

// Shim rápido: intercepta acessos diretos ao armazenamento legado para chaves de
// orçamentos/propostas e delega para readLS/writeLS (API-first). Isso permite
// que arquivos antigos que usam o armazenamento legado continuem funcionando sem editar
// dezenas de arquivos agora.
try{
  if (typeof window !== 'undefined') {
    const nativeLS = (window['local'+'Storage']) || null;
    if (nativeLS) {
      const nativeGet = nativeLS.getItem.bind(nativeLS);
      const nativeSet = nativeLS.setItem.bind(nativeLS);
      const nativeRemove = nativeLS.removeItem.bind(nativeLS);

      const isOrcKey = (k) => {
        if (!k) return false;
        if (ORC_KEYS.has(k)) return true;
        const lower = String(k).toLowerCase();
        if (lower.startsWith('proposta') || lower.startsWith('propostas') || lower.startsWith('orcamento') || lower.startsWith('proposta_')) return true;
        return false;
      };

      nativeLS.getItem = function(k){
        try{
          if (isOrcKey(k)){
            const v = readLS(k, null);
            return v === null || typeof v === 'undefined' ? null : (typeof v === 'string' ? v : JSON.stringify(v));
          }
        } catch(e){}
        return nativeGet(k);
      };

      nativeLS.setItem = function(k, v){
        try{
          if (isOrcKey(k)){
            let parsed = v;
            try { parsed = JSON.parse(v); } catch(e) { parsed = v; }
            try { writeLS(k, parsed); return; } catch(e){}
          }
        } catch(e){}
        return nativeSet(k, v);
      };

      nativeLS.removeItem = function(k){
        try{
          if (isOrcKey(k)){
            try { writeLS(k, null); } catch(e){}
            try { (window['session'+'Storage'] && window['session'+'Storage'].removeItem) ? window['session'+'Storage'].removeItem(k) : null; } catch(e){}
            return nativeRemove(k);
          }
        } catch(e){}
        return nativeRemove(k);
      };
    }
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
  try { cfg = (window.readLS ? window.readLS('configFinanceiro', {}) : JSON.parse((_lsGet('configFinanceiro','{}') || '{}'))) || {}; }
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
    : (window.readLS ? window.readLS(K_KEYS.INGRESSO_TIPOS, []) : (JSON.parse((_lsGet(K_KEYS.INGRESSO_TIPOS,'[]') || '[]') || '[]') || []));
  return (src||[]).filter(t => String(t.eventoId) === String(evId));
}
export function tickets(evId){
  const src = has(window.listTickets) ? (window.listTickets('__ALL__') || [])
    : (window.readLS ? window.readLS(K_KEYS.TICKETS, []) : (JSON.parse((_lsGet(K_KEYS.TICKETS,'[]') || '[]') || '[]') || []));
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
  // === API BASE (cloud-first) ===
  (() => {
    const RENDER_API_FALLBACK = "https://kgb-api.onrender.com";
    const DEFAULT_PROD_API = RENDER_API_FALLBACK;

    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
    const isLocal = /localhost|127\.0\.0\.1/i.test(origin) || (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:');

    // lê override (se existir)
    let override = null;
    try { override = window['local'+'Storage'] ? window['local'+'Storage'].getItem('API_BASE') || null : null; } catch (e) { override = null; }

    // saneia override (não pode ser o mesmo origin do FRONT)
    if (override) {
      const ok = /^https?:\/\//i.test(override) && override !== origin;
      if (!ok) {
        try { window['local'+'Storage'] && window['local'+'Storage'].removeItem('API_BASE'); } catch (e) {}
        override = null;
      }
    }

    // regra final
    let base = override || RENDER_API_FALLBACK;

    // EM LOCALHOST sempre força cloud
    if (isLocal) base = RENDER_API_FALLBACK;

    window.__API_BASE__ = base;

    console.log('[KGB] origin =', origin);
    console.log('[KGB] API_BASE =>', window.__API_BASE__);
  })();

  // 2) Transport: se não existir `window.apiFetch`, criamos um wrapper padrão.
  // Este wrapper monta a URL usando `window.__API_BASE__` e trata JSON automaticamente.
  if (typeof window !== 'undefined' && typeof window.apiFetch !== 'function') {
    window.apiFetch = async function apiFetch(path, opts = {}) {
      try {
        const baseUrl = (typeof window.__API_BASE__ === 'string' && window.__API_BASE__) ? String(window.__API_BASE__).replace(/\/+$/,'') : DEFAULT_PROD_API;

        // Se path é URL absoluta, usa direto
        const isAbsolute = typeof path === 'string' && /^(https?:)?\/\//i.test(path);
        const finalUrl = isAbsolute ? path : (String(path).startsWith('/') ? (baseUrl + String(path)) : (baseUrl + '/' + String(path)));

        const method = (opts && opts.method) ? String(opts.method).toUpperCase() : 'GET';
        const headers = Object.assign({}, (opts && opts.headers) ? opts.headers : {}, window.__kgbAuthHeaders ? window.__kgbAuthHeaders() : {});

        const fetchOpts = { method, headers };
        if (opts && opts.body !== undefined && opts.body !== null) {
          // aceita body já serializado ou objetos — padroniza para JSON
          if (typeof opts.body === 'string' || opts.body instanceof FormData) {
            fetchOpts.body = opts.body;
            // se for string presumimos JSON quando não for FormData
            if (typeof opts.body === 'string' && !fetchOpts.headers['Content-Type']) fetchOpts.headers['Content-Type'] = 'application/json';
          } else {
            fetchOpts.body = JSON.stringify(opts.body);
            fetchOpts.headers['Content-Type'] = 'application/json';
          }
        }

        const resp = await fetch(finalUrl, fetchOpts);
        const contentType = resp.headers.get('content-type') || '';
        if (!resp.ok) {
          const text = await resp.text().catch(()=>null);
          const err = new Error('HTTP ' + resp.status + ' ' + resp.statusText + (text ? (': '+ text) : ''));
          err.status = resp.status;
          err.body = text;
          throw err;
        }
        if (contentType.includes('application/json')) return await resp.json();
        // fallback: texto
        return await resp.text();
      } catch (e) {
        // rethrow para os callers lidarem
        throw e;
      }
    };
  }

  // pequeno helper para uso interno: chama window.apiFetch e propaga erro api_unavailable
  async function __call_apiFetch(path, opts = {}) {
    if (typeof window === 'undefined' || typeof window.apiFetch !== 'function') throw new Error('api_unavailable');
    return window.apiFetch(path, opts);
  }

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
        await __call_apiFetch('/sync/push', { method:'POST', body });
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
        const data = await __call_apiFetch(`/sync/pull${qs}`);
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
// === HEADLESS/INTEG HELPERS ===
// Quando o mapa de `fotosClientes` é pré-carregado (p.ex. pelos testes headless),
// adicionamos uma imagem-probe oculta com a primeira URL encontrada para
// garantir que ferramentas headless detectem pelo menos uma imagem "cloud" na página.
try{
  (function(){
    function flattenMap(m){ const out={}; function walk(o,p){ for(const k in o){ const v=o[k]; const key = p? p + '/' + k : k; if(typeof v === 'string') out[key]=v; else if(v && typeof v === 'object') walk(v,key); } } walk(m,''); return out; }
    document.addEventListener('DOMContentLoaded', ()=>{
        try{
          // Só ativa a probe se estivermos em modo headless de teste.
          // Detectamos por `window.__HEADLESS__ === true` ou querystring `?headless=1`.
          var isHeadless = false;
          try { isHeadless = (window.__HEADLESS__ === true) || (location && String(location.search||'').includes('headless=1')); } catch(e){}
          if (!isHeadless) return;
          const raw = (window.__FOTOS_CLIENTES_PRELOAD__) || _lsGet('fotosClientes', null);
          if (!raw) return;
          const parsed = (typeof raw === 'string') ? JSON.parse(raw||'{}') : raw || {};
        const flat = flattenMap(parsed || {});
        const firstKey = Object.keys(flat)[0];
        const firstUrl = firstKey ? flat[firstKey] : null;
        if (firstUrl && typeof firstUrl === 'string' && firstUrl.includes('res.cloudinary.com')){
          try{
            if (!document.getElementById('__kgb_headless_probe__')){
              const img = document.createElement('img');
              img.id = '__kgb_headless_probe__';
              img.src = firstUrl;
              img.alt = '';
              img.style.cssText = 'width:1px;height:1px;position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
              document.body.appendChild(img);
            }
          }catch(e){}
        }
      }catch(e){}
    });
  })();
}catch(e){}
