// === financeiro-evento.js (versão estável) === 
/* ======= BOOT DE HELPERS E CONTEXTO (FF-BOOT) ======= */
(() => {
  if (typeof window.$  !== 'function') window.$  = (s, el=document) => el.querySelector(s);
  if (typeof window.$$ !== 'function') window.$$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  if (typeof window.toNum !== 'function') {
    window.toNum = v => (typeof v === 'number') ? v :
      (parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0);
  }
  if (typeof window.readLS !== 'function') {
    window.readLS = (k, fb=null) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  }
  if (typeof window.writeLS !== 'function') {
    window.writeLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  }
  if (!window.fmtBRL) {
    window.fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  if (typeof window.eventoId === 'undefined' || !window.eventoId) {
    window.eventoId =
      (new URLSearchParams(location.search).get('id')) ||
      localStorage.getItem('eventoSelecionado') || '';
  }

  if (typeof window.emitFGChange !== 'function') {
    window.emitFGChange = function(type, payload){
      try { window.dispatchEvent(new CustomEvent('fg:change', { detail: { type, payload } })); } catch {}
    };
  }
})();
// todayISO global
try { window.todayISO = window.todayISO || (() => new Date().toISOString().slice(0,10)); } catch {}

// Alias seguro p/ eventoId
function __evId(){
  try {
    return (typeof __getEventoIdAtual === 'function')
      ? __getEventoIdAtual()
      : (new URLSearchParams(location.search).get('id') || localStorage.getItem('eventoSelecionado') || '');
  } catch { return ''; }
}
try { window.eventoId = window.eventoId || __evId(); } catch {}
window.addEventListener('focus', () => { try { window.eventoId = __evId(); } catch {} });

// Exposição do formatador BRL e helper
try { window.fmtBRL = window.fmtBRL || new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }); } catch {}
function __fmtBRL(n){ try { return window.fmtBRL.format(Number(n||0)); } catch { return `R$ ${(Number(n||0)).toFixed(2)}`; } }


  // ────────────────────────── Utilitários ──────────────────────────
 (() => { 'use strict';

  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const toNum = v => (typeof v === 'number') ? v :
    (parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0);
  const readLS  = (k, fb=null) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch (e) { return fb; } };
  const writeLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // ID do evento (URL primeiro, depois fallback em LS)
  const params   = new URLSearchParams(location.search);
  const eventoId = params.get('id') || localStorage.getItem('eventoSelecionado') || '';
  if (eventoId) localStorage.setItem('eventoSelecionado', String(eventoId));
// === INÍCIO PATCH FF-1 (Parcelas Admin UI) — Helpers API Bridge ===
(function(){
  // fetch com x-tenant-id default e JSON automático
  window.__ff1Api = async function(path, opts={}){
    const base = (typeof window.__API_BASE__ === 'string') ? window.__API_BASE__ : '';
    const url  = path.startsWith('http') ? path : (base + path);
    const headers = new Headers(opts.headers || {});
    if (!headers.has('x-tenant-id')) headers.set('x-tenant-id', 'default');
    if (!headers.has('content-type') && opts.body && typeof opts.body === 'object') {
      headers.set('content-type','application/json');
    }
  
    return fetch(url, { ...opts, headers });
  };

  // id do evento atual (query ?id=...), ou via helper do seu arquivo
  window.__ff1GetEventoId = function(){
    try{
      if (typeof __getEventoIdAtual === 'function') return __getEventoIdAtual();
      const q = new URLSearchParams(location.search);
      return q.get('id') || q.get('eventoId') || q.get('evento') || null;
    }catch{ return null; }
  };

  // Espelhar CRIAR/ATUALIZAR parcela na API
  window.__ff1ApiUpsertParcela = async function(p){
    const evId = __ff1GetEventoId(); if (!evId) return;
    const body = {
      id: String(p.id),
      descricao    : p.descricao || p.desc || p.title || '',
      valor        : Number(p.valor || p.total || 0),
      vencimentoISO: p.vencimentoISO || p.ven || p.vencimento || null
    };
    try {
      await __ff1Api(`/api/admin/eventos/${encodeURIComponent(evId)}/parcelas`, {
        method:'POST', body: JSON.stringify(body)
      });
    } catch(e){ console.warn('[FF-1] upsert parcela falhou', e); }
  };

  // Espelhar PAGAR parcela na API
  window.__ff1ApiPagarParcela = async function(p, comprovanteUrl){
    const id = p?.id; if (!id) return;
    try {
      await __ff1Api(`/api/admin/parcelas/${encodeURIComponent(id)}/pagar`, {
        method:'POST',
        body: JSON.stringify({
          pagoEmISO: p.dataPagamentoISO || new Date().toISOString(),
          comprovanteUrl: comprovanteUrl || null
        })
      });
    } catch(e){ console.warn('[FF-1] pagar parcela falhou', e); }
  };

  // Espelhar EXCLUIR parcela na API
  window.__ff1ApiExcluirParcela = async function(parcelaId){
    if (!parcelaId) return;
    try {
      await __ff1Api(`/api/admin/parcelas/${encodeURIComponent(parcelaId)}`, { method:'DELETE' });
    } catch(e){ console.warn('[FF-1] excluir parcela falhou', e); }
  };
})();
// === FIM PATCH FF-1 (Parcelas Admin UI) — Helpers API Bridge ===

 function emitFGChange(reason = 'fg:changed', payload = {}) {
  // BroadcastChannel
  try {
    const bc = new BroadcastChannel('kgb-sync');
    bc.postMessage({ type: 'fg:changed', reason, payload, ts: Date.now() });
    bc.close?.();
  } catch {}

  // Storage ping (para outras abas / telas)
  try {
    localStorage.setItem('fg:ping', String(Date.now()));
    localStorage.setItem('financeiroGlobal:ping', String(Date.now())); // 👈 novo
  } catch {}
}


  function afterFGUpdateDebug(eventId) {
    // Opcional: loga algo útil para inspeção rápida
    try {
      console.info('[FG] Atualizado por evento', eventId, '—', new Date().toLocaleString());
    } catch {}
  }
  /* === FIM PATCH D.1 === */
/* === INÍCIO PATCH F — Export helpers p/ escopo global === */
try {
  // utilitários declarados no topo do arquivo (dentro do IIFE)
  window.$   = window.$   || $;
  window.$$  = window.$$  || $$;
  window.readLS  = window.readLS  || readLS;
  window.writeLS = window.writeLS || writeLS;
  window.fmtBRL = window.fmtBRL || fmtBRL;   // << NOVO: expõe o formatador de moeda

  // sinais/realtime
  window.emitFGChange       = window.emitFGChange       || emitFGChange;
  window.afterFGUpdateDebug = window.afterFGUpdateDebug || afterFGUpdateDebug;

  // id do evento atual (sempre que precisar fora do IIFE)
  window.__getEventoIdAtual = window.__getEventoIdAtual || (function(){
    return function(){
      try {
        const q  = new URLSearchParams(location.search);
        return q.get('id') || localStorage.getItem('eventoSelecionado') || '';
      } catch { return ''; }
    };
  })();
} catch {}
/* === FIM PATCH F — Export helpers p/ escopo global === */
// === INÍCIO PATCH FF-EVID (shim global p/ eventoId) ===
function __evId(){
  try {
    return (typeof __getEventoIdAtual === 'function')
      ? __getEventoIdAtual()
      : (new URLSearchParams(location.search).get('id') || localStorage.getItem('eventoSelecionado') || '');
  } catch { return ''; }
}
// publica um alias global para quem ainda referencia "eventoId"
try { window.eventoId = window.eventoId || __evId(); } catch {}
// e mantenha-o atualizado quando a aba ganhar foco (caso mude a URL)
window.addEventListener('focus', () => { try { window.eventoId = __evId(); } catch {} });
// === FIM PATCH FF-EVID ===

// === INÍCIO PATCH FF-FMTBRL (exposição e alias seguro) ===
try {
  // garante o formatador global
  window.fmtBRL = window.fmtBRL || new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
} catch {}
// helper para usar sempre a versão global (evita ReferenceError)
function __fmtBRL(n){ try { return window.fmtBRL.format(Number(n||0)); } catch { return `R$ ${(Number(n||0)).toFixed(2)}`; } }
// === FIM PATCH FF-FMTBRL ===
// === PATCH T1 — todayISO global shim ===
try {
  // se já existir, não sobrescreve; senão cria a função global
  window.todayISO = window.todayISO || (() => new Date().toISOString().slice(0,10));
} catch {}


  // ==== SHIMS/Shared (sem imports ES6) ====
  // se existirem globais, usa; se não, cria no-op
  const FIN_EVENTOS_KEY     = window.FIN_EVENTOS_KEY     || 'eventos';
  const FIN_LANCAMENTOS_KEY = window.FIN_LANCAMENTOS_KEY || 'financeiroGlobal';
  const buildLancamentoFromParcela = window.buildLancamentoFromParcela || (p => p);
  const emitFinStoreChanged        = window.emitFinStoreChanged        || function(){};
  const onFinStoreChanged          = window.onFinStoreChanged          || function(){};
  // helper simples
  const newId = () => (crypto.randomUUID?.() || (Date.now() + Math.random()).toString(36));

   // garante que o modal exista e sincroniza financeiro com backend antes de usar
  window.addEventListener('DOMContentLoaded', async () => {
    // 1) tenta sincronizar com backend (M36)
    try {
      if (window.finSyncFromApi) {
        await window.finSyncFromApi();
      }
    } catch (e) {
      console.warn('[financeiro-evento] erro ao sincronizar financeiro:', e);
    }

    // 2) garante que o modal exista
    try { window.FinModal?.ensureModal?.(); } catch (e) {}
  });


  // Quando o modal salva (writeFG), sincroniza movimentos e re-renderiza a tela do evento
  window.addEventListener('finmodal:confirm', () => {
    try { syncAccountMovementsForEvento(); } catch (e) {}
    try { refresh?.(); } catch (e) {}
  });

  // …(restante do arquivo)…

})();

  // ───── Financeiro Global e Comissões ─────
  function __fgAll(){
    try { return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}') || {}; }
    catch { return {}; }
  }
  function __eventoIdAtual(){
    return (typeof __getEventoIdAtual==='function' && __getEventoIdAtual())
        || new URLSearchParams(location.search).get('id') || '';
  }
  function __brl_local(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

  function totalComissoesDoEvento(evId){
    const g = __fgAll();
    const lancs = Array.isArray(g.lancamentos) ? g.lancamentos : [];
    const parcs = Array.isArray(g.parcelas) ? g.parcelas : [];
    let soma = 0;
    for (const l of lancs){
      const isDoEvento = String(l.eventoId||'') === String(evId);
      const isComissao = String(l.categoria||'').toLowerCase().includes('comiss')
                      || String(l.descricao||'').toLowerCase().includes('comiss');
      if (!isDoEvento || !isComissao) continue;
      const ps = parcs.filter(p => String(p.lancamentoId||p.lancId) === String(l.id));
      if (ps.length){ for (const p of ps) soma += Number(p.valor||0); }
      else { soma += Number(l.valor||0); }
    }
    return soma;
  }

  // ───── Valores e datas ─────
  function valorRealDaParcela(p){
    // Campos já em reais
    for (const key of ['valor','valorParcela','totalPago']){
      if (p?.[key] != null) {
        return (typeof p[key] === 'number')
          ? p[key]
          : (parseFloat(String(p[key]).replace(/\./g,'').replace(',','.')) || 0);
      }
    }
    // Legados: às vezes em centavos
    const raw = p?.total ?? p?.totalPrevisto ?? null;
    if (raw != null) {
      if (typeof raw === 'string') {
        const s = raw.trim();
        if (/^\d+$/.test(s) && s.length >= 3) return Number(s)/100;
        return (parseFloat(s.replace(/\./g,'').replace(',','.')) || 0);
      }
      const n = Number(raw);
      return (n >= 10000 ? n/100 : n);
    }
    return 0;
  }
  function brl(n) {
    try { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    catch { return `R$ ${Number(n||0).toFixed(2)}`; }
  }
  function parseMoneyBR(v){
    if (typeof v === 'number') return v;
    let s = String(v || '').trim();
    s = s.replace(/[R$\s]/gi, '').replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  function normalizarData(v){
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [Y,M,D] = s.split('-'); return `${D}/${M}/${Y}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const d = new Date(s); if (!isFinite(d)) return '';
    const iso = d.toISOString().slice(0,10); const [Y,M,D] = iso.split('-'); return `${D}/${M}/${Y}`;
  }
  // ===== AVISO "Sem conta" (Evento) =====
function __openAvisoSemContaEvt(){
  const dlg = document.getElementById('dlgAvisoContaEvt');
  if (!dlg) return { ok: (cb)=>cb() };
  if (dlg.showModal) dlg.showModal(); else dlg.hidden = false;

  return {
    on(action, cb){
      const off = ()=> {
        dlg?.close?.(); dlg.hidden = true;
        dlg.querySelectorAll('[data-close]').forEach(b => b.removeEventListener('click', onClose));
        document.getElementById('btnEvtVoltar')?.removeEventListener('click', onVoltar);
        document.getElementById('btnEvtSalvarMesmo')?.removeEventListener('click', onSalvarMesmo);
      };
      const onClose = ()=>{ off(); action==='voltar' && cb?.(); };
      const onVoltar = ()=>{ off(); action==='voltar' && cb?.(); };
      const onSalvarMesmo = ()=>{ off(); action==='salvar' && cb?.(); };

      dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', onClose));
      document.getElementById('btnEvtVoltar')?.addEventListener('click', onVoltar);
      document.getElementById('btnEvtSalvarMesmo')?.addEventListener('click', onSalvarMesmo);
      return this;
    },
    ok(cb){ return this.on('salvar', cb); },
    cancel(cb){ return this.on('voltar', cb); }
  };
}

// Usa a prioridade: conta da parcela → conta do lançamento → (se vazio, cai no aviso)
function __needsContaWarningForParcela(parcela){
  const id = parcela?.contaId ?? parcela?.lanc?.contaId ?? null;
  return !String(id||'').trim();
}
// ===== Wrapper: salvar parcela com aviso quando não há conta =====
function salvarParcela__comAviso(parcela, salvarCb){
  if (!__needsContaWarningForParcela(parcela)) {
    // tem conta → salva normal
    salvarCb(parcela);
    return;
  }
  // sem conta → abre aviso
  __openAvisoSemContaEvt()
    .ok(()=> salvarCb(parcela))      // "Salvar assim mesmo"
    .cancel(()=> { /* volta pro form, nada a fazer */ });
}

// ───── Movimentos de Contas (interligação com Categorias) ─────
function __fgLoad(){ try{ return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}')||{}; }catch{ return {}; } }
function __fgSave(g){ try{ localStorage.setItem('financeiroGlobal', JSON.stringify(g)); localStorage.setItem('financeiroGlobal:ping', String(Date.now())); }catch{} }
function __cfg(){ try{ return JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{}; }catch{ return {}; } }

function __ensureG(g){
  if (!g || typeof g!=='object') g={};
  if (!Array.isArray(g.contas)) g.contas=[];
  if (!Array.isArray(g.movimentos)) g.movimentos=[];
  return g;
}
function __syncContasFromConfig(g){
  const cfg = __cfg();
  const cfgContas = Array.isArray(cfg.contas)?cfg.contas:[];
  const byId = new Map(g.contas.map(c=>[String(c.id),c]));
  for (const ct of cfgContas){
    const id = ct.id;
    const nome = ct.nome || '';
    const saldoInicial = Number(ct.saldo||0); // tratamos “saldo” do config como SALDO INICIAL
    const ex = byId.get(String(id));
    if (ex){ ex.nome = nome; ex.saldoInicial = saldoInicial; }
    else { g.contas.push({ id, nome, saldoInicial, saldoAtual: saldoInicial }); }
  }
  // remove contas que não existem mais no config (opcional: manter)
  g.contas = g.contas.filter(c => cfgContas.some(ct => String(ct.id)===String(c.id)));
}

function __removeMovementByRef(refKey){
  const g = __ensureG(__fgLoad());
  const before = (g.movimentos||[]).length;
  g.movimentos = (g.movimentos||[]).filter(m => String(m.refKey)!==String(refKey));
  if (g.movimentos.length !== before){ __fgSave(g); }
}
function __upsertMovement(mov){
  const g = __ensureG(__fgLoad());
  __syncContasFromConfig(g);
  const i = (g.movimentos||[]).findIndex(m => String(m.refKey)===String(mov.refKey));
 if (i >= 0) g.movimentos[i] = { ...g.movimentos[i], ...mov };
else g.movimentos.push({
  id: mov.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,8)),
  ...mov
});

  __fgSave(g);
  __recomputeAllAccountBalances(); // garante saldoAtual
}
function __recomputeAllAccountBalances(){
  const g = __ensureG(__fgLoad());
  __syncContasFromConfig(g);

  const byId = {};
  for (const c of g.contas){
    c.saldoInicial = Number(c.saldoInicial||0);
    c.saldoAtual   = Number(c.saldoInicial);
    byId[String(c.id)] = c;
  }
  for (const m of (g.movimentos||[])){
    const conta = byId[String(m.contaId)];
    if (!conta) continue;
    const v = Number(m.valor||0);
    if (m.tipo === 'credito') conta.saldoAtual += v;
    else if (m.tipo === 'debito') conta.saldoAtual -= v;
  }

  // >>> NOVO: manter também o mapa usado por Resumo/Widgets
  const map = {};
  for (const c of g.contas){
    map[c.id] = Number(c.saldoAtual||0);
  }
  g.saldoPorConta = map;

  __fgSave(g); // também emite 'financeiroGlobal:ping'
}


function __pick(...arr){
  const norm = v => (v==null?'':String(v));
  for (const x of arr){ const s = norm(x).trim(); if (s!=='') return x; }
  return null;
}
function __extractContaFromParcela(p){
  const cfg = __cfg();
  const contas = cfg.contas || [];
  const contaId = __pick(p.contaId, p.idConta, p.conta_id, p.contaBancariaId, p.pagamento?.contaId, p.liquidacao?.contaId, p.baixa?.contaId, p.lanc?.contaId, p.lanc?.idConta);
  if (contaId==null) return { contaId:null, contaNome:'' };
  const c = (contas||[]).find(x => [x?.id, x?.value, x?.codigo].map(v=>String(v)).includes(String(contaId)));
  return { contaId: c?.id ?? contaId, contaNome: c?.nome || p.contaNome || p.lanc?.contaNome || '' };
}
// Resolve o ID/nome da conta antes de gravar o movimento (aceita id ou nome)
function __resolveConta(g, contaId, contaNome){
  try{
   const cfg = __cfg();
    const contasG  = Array.isArray(g?.contas) ? g.contas : [];
    const contasCfg = Array.isArray(cfg?.contas) ? cfg.contas : [];

    // normaliza
    let id   = (contaId == null ? '' : String(contaId)).trim();
    let nome = (contaNome || '').trim();

    // 1) se já existe conta com esse ID no FG ou no config, mantém
    if (id && (contasG.some(c => String(c.id)===id) || contasCfg.some(c => String(c.id)===id))) {
      if (!nome) {
        nome = (contasG.find(c=>String(c.id)===id)?.nome)
            || (contasCfg.find(c=>String(c.id)===id)?.nome)
            || '';
      }
      return { id, nome };
    }

    // 2) tentar casar por nome (ou pelo próprio "id" se ele veio na verdade como nome)
    const alvoNome = nome || id;
    if (alvoNome) {
      const achouG   = contasG.find(c => String(c.nome||'').trim() === alvoNome);
      const achouCfg = contasCfg.find(c => String(c.nome||c.descricao||'').trim() === alvoNome);
      if (achouG || achouCfg) {
        const hit = achouG || achouCfg;
        return { id: String(hit.id), nome: String(hit.nome || hit.descricao || '') };
      }
    }

    // 3) último caso: mantém como veio (pode gerar zero efeito no recompute, mas não quebra)
    return { id, nome };
  }catch{
    return { id:(contaId==null?'':String(contaId)), nome:(contaNome||'') };
  }
}

function __valorRealDaParcela(p){
  if (!p) return 0;
  if (p.totalPago && Number(p.totalPago)>0) return Number(p.totalPago);
  for (const k of ['valor','valorParcela']){ if (p[k]!=null) return (typeof p[k]==='number'?p[k]:parseFloat(String(p[k]).replace(/\./g,'').replace(',','.'))||0); }
  return 0;
}

function syncAccountMovementsForEvento(){
  const partes = (typeof getParcelasDoEvento==='function') ? getParcelasDoEvento() : [];
  // 1) Para cada parcela do evento, garantir consistência
  for (const p of partes){
    const st = String(p.status||'pendente').toLowerCase();
    const refKey = `lanc:${p.lancamentoId}:parc:${p.id}`;
    const tipoLanc = String(p.lanc?.tipo || p.tipo || 'entrada').toLowerCase(); // entrada | saida
    const isPago = ['pago','recebido','quitado','baixado','liquidado'].includes(st);
    if (!isPago){
      __removeMovementByRef(refKey);
      continue;
    }
    // pago/recebido => gera/atualiza movimento
    const { contaId, contaNome } = __extractContaFromParcela(p);
    if (!contaId) { __removeMovementByRef(refKey); continue; } // sem conta definida, não registra
    const valor = __valorRealDaParcela(p);
    const dataISO = (p.dataPagamentoISO || p.vencimentoISO || p.data || new Date().toISOString().slice(0,10)).toString().slice(0,10);
    const tipoMov = (tipoLanc==='saida') ? 'debito' : 'credito';
    __upsertMovement({
      refKey, origem:'evento', lancamentoId: p.lancamentoId, parcelaId: p.id,
      contaId, contaNome, tipo: tipoMov, valor: Number(valor)||0, dataISO
    });
  }
  // 2) Recalcula e pinga
  __recomputeAllAccountBalances();
  try{ localStorage.setItem('financeiroGlobal:ping', String(Date.now())); }catch{}
}
// ───── PUBLICAÇÃO NO FINANCEIRO GLOBAL (para Resumo/Análises) ─────
function __ensureFG(g){ g=g||{}; if(!Array.isArray(g.lancamentos)) g.lancamentos=[]; if(!Array.isArray(g.parcelas)) g.parcelas=[]; if(!Array.isArray(g.contas)) g.contas=[]; if(!Array.isArray(g.movimentos)) g.movimentos=[]; return g; }

// Normaliza um lançamento associado ao Evento (centavos, flags e metadados do evento)
function __normLancEvt(l) {
  // helpers locais
  const toCents = (v) => {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return Math.round(v * 100);
    // aceita "1.234,56" ou "1234.56"
    const s = String(v).trim().replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? Math.round(n * 100) : 0;
  };

  // tenta obter o id do evento da estrutura atual, da função auxiliar ou da querystring (?id=)
  const evId = (l?.idEvento ?? l?.eventoId
    ?? (typeof __getEventoIdAtual === 'function' ? __getEventoIdAtual()
    : (new URLSearchParams(location.search).get('id') || null)));

  // resolve nome do evento por cascata (preferir o que já veio no lançamento)
  let nomeEv = (l?.nomeEvento || l?.eventoNome || l?.eventoTitulo || '');
  if (!nomeEv && evId) {
    try {
      const eventos = JSON.parse(localStorage.getItem('eventos') || '[]') || [];
      const ev = eventos.find(e => String(e.id) === String(evId)) || {};
      nomeEv = ev.nomeEvento || ev.titulo || ev.nome || '';
    } catch (e) {}
  }

  const nowISO = new Date().toISOString();

  return {
    // --- identidade do lançamento ---
    id            : String(l?.id ?? l?.uuid ?? crypto.randomUUID()),
    tipo          : l?.tipo || 'entrada',           // 'entrada' | 'saida'
    categoriaId   : l?.categoriaId ?? l?.catId ?? null,
    contaId       : l?.contaId ?? null,

    // --- valores (em centavos) ---
    valorCents    : toCents(l?.valor ?? l?.valorTotal ?? 0),
    descontoCents : toCents(l?.desconto ?? 0),
    acrescimoCents: toCents(l?.acrescimo ?? 0),

    // --- datas/status coerentes ---
    createdAt     : l?.createdAt || nowISO,
    updatedAt     : nowISO,
    competencia   : l?.competencia || (new Date().toISOString().slice(0,10)),
    status        : (String(l?.status || '').toLowerCase() || 'pendente'), // 'pago' | 'pendente' | 'cancelado'...

    // --- vínculos com evento (💡 novo: garantir idEvento + nomeEvento) ---
    eventoId      : evId ? String(evId) : null,
    nomeEvento    : nomeEv || null,

    // --- informações auxiliares de exibição ---
    descricao     : l?.descricao || l?.memo || '',
    origem        : l?.origem || 'evento',
    fonte         : 'financeiro-evento', // para rastreabilidade
  };
}

// Helpers para resolver nomes de conta/forma a partir do config
function __resolveContaNome(contaId, fallback){
  const cfg = __cfg();
  const c = (cfg.contas||[]).find(x => String(x.id)===String(contaId));
  return c?.nome || fallback || '';
}
function __resolveFormaDesc(formaId, fallback){
  const cfg = __cfg();
  const t = (cfg.tipos||[]).find(x => String(x.id)===String(formaId));
  return t?.descricao || t?.nome || t?.label || fallback || '';
}

// Polyfill: se não existir um util central, monta “Forma · Conta”
window.getFormaContaDisplay = window.getFormaContaDisplay || function(p){
  const forma = p?.formaDescricao || '';
  const conta = p?.contaNome || '';
  return [forma, conta].filter(Boolean).join(' · ');
};

// === SUBSTITUA ESTA FUNÇÃO ===
function __normParcEvt(p){
  // Conta (pega da parcela, do lanc ou fica vazia)
  let contaId   = p?.contaId ?? p?.lanc?.contaId ?? null;
  let contaNome = p?.contaNome ?? p?.lanc?.contaNome ?? '';

  // Forma (aceita tanto formaId quanto formaPagamento)
  let formaId   = p?.formaId ?? p?.formaPagamento ?? p?.lanc?.formaId ?? p?.lanc?.formaPagamento ?? null;
  let formaDesc = p?.formaDescricao ?? p?.lanc?.formaDescricao ?? '';

  // Resolve nomes a partir do config, se necessário
  if (contaId && !contaNome)   contaNome = __resolveContaNome(contaId, contaNome);
  if (formaId && !formaDesc)   formaDesc = __resolveFormaDesc(formaId, formaDesc);

  // String de exibição “Forma · Conta”
  const meioTxt = window.getFormaContaDisplay
    ? window.getFormaContaDisplay({ formaDescricao: formaDesc, contaNome })
    : [formaDesc, contaNome].filter(Boolean).join(' · ');

  return {
    id: p?.id,
    lancamentoId: (p?.lancamentoId ?? p?.lanc?.id),
    status: (p?.status || ''),
    valor: Number(p?.valor || 0),
    totalPago: Number(p?.totalPago || 0),
    dataPagamentoISO: (p?.dataPagamentoISO || null),
    vencimentoISO: (p?.vencimentoISO || null),

    // CAMPOS PARA A LISTA
    contaId,
    contaNome,
    formaId,                 // <-- mantemos o id padronizado
    formaPagamento: formaId, // <-- compat com códigos antigos que liam “formaPagamento”
    formaDescricao: formaDesc,
    meio: meioTxt
  };
}

// publica (mescla) somente os lançamentos/parcelas relativos a ESTE evento
function __publishFGFromEvento() {
  // 0) obter id do evento atual (para o dispatch do change e filtros)
  const currentEventoId = (typeof __getEventoIdAtual === 'function'
    ? __getEventoIdAtual()
    : (new URLSearchParams(location.search).get('id') || null));
  const currentEventoIdStr = currentEventoId != null ? String(currentEventoId) : null;

  // 1) coletar dados do evento atual
  //    1º tenta o store local específico do evento; se vazio, cai no FG
  let partes = [];
  try {
    const KEY = `parcelas:${currentEventoIdStr || ''}`;
    const loc = JSON.parse(localStorage.getItem(KEY) || '[]') || [];
    if (Array.isArray(loc) && loc.length) {
      // mantém p.lanc se existir; se não, deixa null (vamos inferir depois)
      partes = loc.map(p => ({ ...p, lanc: p.lanc || null }));
    }
  } catch (e) {}
  if (!Array.isArray(partes) || !partes.length) {
    partes = (typeof getParcelasDoEvento === 'function') ? getParcelasDoEvento() : [];
  }

  // garantir unicidade de lançamentos vindos das parcelas
  const lancsSet = new Map();
  for (const p of partes) {
    if (p?.lanc?.id != null) {
      lancsSet.set(String(p.lanc.id), p.lanc);
    }
  }

  // 🔧 Fallback: se não veio nenhum "lanc" embutido nas parcelas, sintetiza por lancamentoId
  if (lancsSet.size === 0) {
    const vistos = new Set();
    for (const p of partes) {
      const lid = p?.lancamentoId ?? p?.lanc?.id;
      if (lid == null) continue;
      const key = String(lid);
      if (vistos.has(key)) continue;
      vistos.add(key);
      // tenta inferir tipo/descricao a partir de alguma parcela equivalente
      const tipoInf = (p?.lanc?.tipo || p?.tipo || 'entrada');
      const descInf = (p?.lanc?.descricao || p?.descricao || '');
      lancsSet.set(key, {
        id: key,
        tipo: tipoInf,
        descricao: descInf,
        // garanta vínculo com o evento
        eventoId: currentEventoIdStr
      });
    }
  }

  // normaliza lançamentos e parcelas com as funções desta página
  const lancs = [...lancsSet.values()].map(__normLancEvt);
  const parcs = partes.map(__normParcEvt);

  // 1.1) garantir vínculo entre parcela -> lançamento.id (lancamentoId)
  //      e propagar eventoId/nomeEvento para a parcela também (se faltar)
  const lancById = new Map(lancs.map(x => [String(x.id), x]));
  for (const p of parcs) {
    // se a normalização da parcela não setou o lancamentoId, tentar casar por chave alternativa
    if (!p.lancamentoId && p?.lanc?.id != null) p.lancamentoId = String(p.lanc.id);
    // fallback defensivo: se ainda não houver, tenta casar por primeira chave conhecida
    if (!p.lancamentoId && lancs[0]) p.lancamentoId = String(lancs[0].id);

    // propagar metadados do evento também na parcela
    const lk = p.lancamentoId ? lancById.get(String(p.lancamentoId)) : null;
    if (lk) {
      if (!p.eventoId)   p.eventoId   = lk.eventoId || currentEventoIdStr || null;
      if (!p.nomeEvento) p.nomeEvento = lk.nomeEvento || null;
    } else {
      if (!p.eventoId)   p.eventoId   = currentEventoIdStr || null;
    }
  }

  // 2) carregar FG e retirar quaisquer entradas antigas desses ids (id do lançamento)
  const FG = __ensureFG(__fgLoad());
  const ids = new Set(lancs.map(x => String(x.id)));

  // filtra lançamentos/parcelas antigos pelo conjunto de ids deste evento
  FG.lancamentos = (FG.lancamentos || []).filter(x => !ids.has(String(x.id)));
  FG.parcelas    = (FG.parcelas    || []).filter(x => !ids.has(String(x.lancamentoId)));

  // 3) inserir as versões atuais
  FG.lancamentos.push(...lancs);
  FG.parcelas.push(...parcs);

  // 4) salvar + notificar interessados
  __fgSave(FG);

  /* === INÍCIO PATCH D.2 — Persistência + sinais === */
  try {
    // 2) Opcional: versionamento/heartbeat
    try { localStorage.setItem('fg:version', String(Date.now())); } catch {}

    // 3) Emite sinais globais para outras telas (Dashboard/Relatórios/…)
    const evIdForLog = currentEventoIdStr || (lancs[0]?.eventoId || null);
    emitFGChange('evento:financeiro:updated', { eventId: evIdForLog });

    // 4) Log para debug (console)
    afterFGUpdateDebug(evIdForLog);
  } catch (e) {
    console.warn('[FG] Falha ao finalizar atualização:', e);
  }
  /* === FIM PATCH D.2 === */
}

__publishFGFromEvento()
// ===== COMMIT CENTRAL DA PARCELA (alvo do wrapper) =====
// Recebe a parcela pronta (p) e faz exatamente o que seu fluxo precisa:
// 1) persiste no storage do evento, 2) publica no FG, 3) atualiza movimentos/saldos,
// 4) notifica (criada/baixa), 5) espelha na API real (create/update/pagar), 6) sinais/UX.
function __commitParcelaNoEvento(p){
  try{
    // 0) normaliza id e status para evitar problemas
    const parc = __normalizeParcelaBeforeCommit({ ...p });

    // 1) Persistir no storage do evento
    const evId = (new URLSearchParams(location.search).get('id')) || '';
    const KEY  = `parcelas:${evId}`;
    let arr;
    try { arr = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { arr = []; }

    // Verificar se já existia (para detectar "criado" vs "atualização/baixa")
    const idx     = arr.findIndex(x => String(x.id) === String(parc.id));
    const existed = idx >= 0;
    const prev    = existed ? arr[idx] : null;
    const prevSt  = String(prev?.status || '').toLowerCase();

    // Upsert local
    if (existed) arr[idx] = { ...prev, ...parc };
    else         arr.push(parc);

    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}

    // === INÍCIO PATCH FF-1 (espelho create/update) ===
    try {
      // dispara "fire-and-forget" para não travar a UI
      __ff1ApiUpsertParcela(parc);
    } catch(e) {
      console.warn('[FF-1] espelho create/update falhou:', e);
    }
    // === FIM PATCH FF-1 ===

    // 2) Publicar no Financeiro Global (Resumo/Análises)
    try { __publishFGFromEvento(); } catch {}

    // 3) Espelhar movimentos/saldos por conta
    try { syncAccountMovementsForEvento(); } catch {}

    // 3.1) Notificações (somente após persistir)
    try {
      const cur = String((existed ? arr[idx] : parc).status || '').toLowerCase();

      // Parcela NOVA → notifica criação
      if (!existed) {
        const lanc = parc.lanc || prev?.lanc || null;
        try {
          notifyParcelaCriada({
            ...parc,
            // garantir campos que o helper usa
            clienteNome: parc.clienteNome || prev?.clienteNome || '',
            descricao  : parc.descricao   || prev?.descricao   || '',
          }, lanc);
        } catch {}
      }

            // === INÍCIO PATCH FF-1 (espelho pagar na API) ===
      // Transição para pago/recebido → notifica baixa + espelha na API + dispara comissão
      const pagoLike = (s) => ['pago','recebido','baixado','quitado','liquidado']
        .includes(String(s || '').toLowerCase());

      if (!pagoLike(prevSt) && pagoLike(cur)) {
        // 1) notify visual da baixa (como já era)
        try {
          notifyBaixaParcela({
            ...parc,
            clienteNome: parc.clienteNome || prev?.clienteNome || '',
            valor      : Number(parc.valor ?? prev?.valor ?? 0),
            forma      : parc.forma || parc.formaDescricao || prev?.forma || prev?.formaDescricao || ''
          });
        } catch {}

        // 2) POST antigo /api/admin/parcelas/:id/pagar (se ainda estiver em uso)
        try {
          __ff1ApiPagarParcela(parc, parc.comprovanteUrl || null);
        } catch (e) {
          console.warn('[FF-1] espelho pagar parcela falhou:', e);
        }

        // 3) NOVO: avisar backend M36 para GERAR COMISSÃO dessa parcela
        try {
          if (window.handleRequest) {
            window.handleRequest('/fin/comissoes/gerar', {
              method: 'POST',
              body: {
                parcelaId: parc.id,
                // infos extras, se o backend quiser usar:
                eventoId: parc.eventoId || parc.eventId || null,
                valorParcela: Number(parc.valor ?? prev?.valor ?? 0)
              }
            });
          }
        } catch (e) {
          console.warn('[M36] gerar comissão na baixa falhou', e);
        }
      }
      // === FIM PATCH FF-1 ===


    } catch (e) {
      console.warn('M33: notificações (parcela criada/baixa) falharam', e);
    }

    // 4) Persistência auxiliar + sinais globais
    try{
      // heartbeat/version
      try { localStorage.setItem('fg:version', String(Date.now())); } catch {}
      // emite sinais para outras telas
      try { emitFGChange('evento:financeiro:updated', { eventId: evId }); } catch {}
      // log debug opcional
      try { afterFGUpdateDebug(evId); } catch {}
    }catch(e){
      console.warn('[FG] Falha ao finalizar atualização:', e);
    }

    // 5) UX opcional já existente no arquivo
    try { atualizarContratoFaltaReceber?.(evId); } catch {}
    try { refresh?.(); } catch {}
// === INÍCIO PATCH FF-SYNC · Parcela do Evento ===
// Envia a parcela para o /sync/push (não trava a UI se estiver offline)
try {
  // 'parc', 'evId' e 'existed' já existem nesse escopo da função
  const payload = {
    id: String(parc.id),
    eventId: String(evId || ''),
    descricao: parc.descricao || (parc.lanc?.descricao) || 'Parcela',
    valor: Number(parc.valor ?? parc.totalPago ?? 0),
    vencimentoISO: (parc.vencimentoISO || parc.venc || parc.data || null),
    status: String(parc.status || '').toLowerCase() || 'pendente',
    pagoEmISO: (parc.dataPagamentoISO || parc.pagoEmISO || parc.pago_em || null),
    comprovanteUrl: (parc.comprovanteUrl || null),
    lancamentoId: (parc.lancamentoId || parc.lanc?.id || null),
    origem: 'fin-evento'
  };

  const change = {
    entity: 'parcela',
    action: 'upsert',
    payload
  };

  // dispara as syncs sem usar await (fire-and-forget)
  if (window.syncPush) {
    window.syncPush({ changes: [change] })
      .catch(e => console.warn('[sync] parcela push falhou:', e));
  }
  if (window.syncPull) {
    window.syncPull()
      .catch(e => console.warn('[sync] parcela pull falhou:', e));
  }
} catch (e) {
  console.warn('[sync] parcela push falhou:', e);
}
// === FIM PATCH FF-SYNC · Parcela do Evento ===

    return true;
  }catch(e){
    console.error('Falha ao commitar parcela do evento:', e);
    alert('Não foi possível salvar a parcela. Verifique os dados e tente novamente.');
    return false;
  }
}



// (Opcional) normaliza campos básicos antes do commit
function __normalizeParcelaBeforeCommit(p){
  const out = { ...p };
  // id obrigatório
  if (!out.id) out.id = (Date.now().toString(36) + Math.random().toString(36).slice(2,8));
  // status
  out.status = String(out.status || '').toLowerCase() || 'pendente';
  // vinculo com lancamento (se você já usa)
  if (!out.lancamentoId && out.lanc?.id) out.lancamentoId = out.lanc.id;
  // datas
  if (out.vencimento && !out.vencimentoISO) {
    try{ out.vencimentoISO = new Date(out.vencimento).toISOString().slice(0,10); }catch{}
  }
  if (out.dataPagamento && !out.dataPagamentoISO) {
    try{ out.dataPagamentoISO = new Date(out.dataPagamento).toISOString().slice(0,10); }catch{}
  }
  return out;
}

  // ───── Valor do contrato ─────
  function calcTotalContratadoComDescontos(ev){
    if (!ev) return 0;
    const qtd = parseInt(ev.quantidadeConvidados ?? ev.convidados ?? ev.qtdConvidados ?? 0, 10) || 0;
    const itens = Array.isArray(ev.itensSelecionados) ? ev.itensSelecionados : [];
    if (!itens.length) return 0;
    let total = 0;
    itens.forEach(it => {
      const valor = toNum(it.valor ?? it.preco ?? it.preço ?? it.total ?? 0);
      const tipo  = String(it.tipoCobranca ?? it.cobranca ?? 'fixo').toLowerCase();
      const base  = /pessoa/.test(tipo) ? (valor * qtd) : valor;
      const perc     = toNum(it.descontoPorcentagem ?? it.percentualDesconto ?? it.descontoPercentual ?? 0);
      const descTipo = String(it.descontoTipo || '').trim();
      const dRaw     = String(it.desconto ?? it.descontoValor ?? it.valorDesconto ?? '').trim();
      let descontoAbs = 0;
      if (perc) descontoAbs = base * (perc/100);
      else if (/%\s*$/.test(dRaw)) {
        const p = toNum(dRaw.replace('%',''));
        if (p) descontoAbs = base * (p/100);
      } else if (dRaw) {
        let v = toNum(dRaw);
        if (/pesso(a|as)/i.test(descTipo) || it.descontoPorPessoa === true) v *= qtd;
        descontoAbs = v;
      }
      const liquido = Math.max(0, base - Math.max(0, Math.min(base, descontoAbs)));
      total += liquido;
    });
    return Math.round(total * 100) / 100;
  }
  function calcValorContratoDoEvento(ev, evId){
    const num = (v)=> (typeof v==='number') ? v :
      (parseFloat(String(v??'').replace(/\./g,'').replace(',','.')) || 0);
    let contrato = num(ev?.valorContrato) ?? 0;
    if (!contrato) contrato = num(ev?.totalContrato);
    if (!contrato) contrato = num(ev?.contratoValor);
    if (!contrato) contrato = num(ev?.financeiro?.contrato?.total);
    if (!contrato) contrato = num(ev?.resumoFinanceiro?.contratoTotal);
    if (!contrato) contrato = num(ev?.totais?.contrato);
    if (!contrato) contrato = num(ev?.financeiro?.resumo?.contrato);
    if (!contrato) {
      try{
        const itens = Array.isArray(ev?.itensSelecionados) ? ev.itensSelecionados : [];
        contrato = itens.reduce((acc,it)=> acc + num(it?.valor ?? it?.preco ?? it?.preço ?? it?.total), 0);
      }catch{}
    }
    if (!contrato) {
      try{
        const temp = JSON.parse(localStorage.getItem('eventoTemp')||'null');
        if (temp && String(temp.id)===String(evId) && Array.isArray(temp.itensSelecionados)){
          contrato = temp.itensSelecionados.reduce((acc,it)=> acc + num(it?.valor ?? it?.preco ?? it?.preço ?? it?.total),0);
        }
      }catch{}
    }
    return Math.max(0, Number(contrato)||0);
  }
 // Retorna o evento “mesclado”: eventos[id] + overrides do eventoTemp (se id bater)
function getEventoMergedById(id) {
  try {
    const eventos = JSON.parse(localStorage.getItem('eventos') || '[]') || [];
    const base = eventos.find(e => String(e.id) === String(id)) || null;
    const temp = JSON.parse(localStorage.getItem('eventoTemp') || '{}') || {};
    if (!base) return temp?.id ? temp : null;
    if (String(temp.id||'') !== String(id)) return base;

    // Campos do temp que devem prevalecer
    const merged = { ...base };
    if (Array.isArray(temp.itensSelecionados)) merged.itensSelecionados = temp.itensSelecionados.slice();
    if (Number.isFinite(+temp.quantidadeConvidados) || Number.isFinite(+temp.qtdConvidados)) {
      merged.quantidadeConvidados = Number(temp.quantidadeConvidados || temp.qtdConvidados || 0);
      merged.qtdConvidados        = merged.quantidadeConvidados;
    }
    if (temp.totalContrato != null) {
      merged.valorContrato = Number(temp.totalContrato) || 0;
      merged.resumoFinanceiro = { ...(merged.resumoFinanceiro||{}), contratoTotal: merged.valorContrato };
    }
    return merged;
  } catch {
    return null;
  }
}

  function getValorContratoEventoById(evId){
    const eventos = readLS('eventos', []);
    const ev = (eventos||[]).find(e => String(e.id) === String(evId));
    if (!ev) return 0;
    const direto =
      ev?.financeiro?.valorContrato ??
      ev?.valorContrato ??
      ev?.totalContrato ??
      ev?.contratoValor ??
      ev?.financeiro?.contrato?.total ??
      ev?.resumoFinanceiro?.contratoTotal ??
      ev?.totais?.contrato ??
      ev?.financeiro?.resumo?.contrato ?? '';
    if (direto !== '' && direto != null) return parseMoneyBR(direto);
    const totDesc = calcTotalContratadoComDescontos(ev);
    if (totDesc > 0) return totDesc;
    return calcValorContratoDoEvento(ev, evId) || 0;
  }

  // ───── Comprovantes (abrir/preview) ─────
function __ensureDataUrl(s){
  if (!s) return null;

  // marcador usado quando o comprovante foi "seco" para fora
  if (typeof s === 'string' && s.trim() === '[separado]') return null;

  // 🆕 NOVO: se já for uma URL (http, https, blob ou caminho relativo), usa direto
  if (typeof s === 'string') {
    const trimmed = s.trim();
    // http(s)://...   blob:...   /algum/caminho
    if (/^(https?:|blob:|\/)/i.test(trimmed)) {
      return trimmed;
    }
    // se já for data:, também devolve direto
    if (/^data:/i.test(trimmed)) {
      return trimmed;
    }
  }

  // A partir daqui, assume que é um "pedaço" de base64 puro
  const b64 = String(s).replace(/\s+/g,'');

  // tenta detectar tipo do arquivo pelos primeiros bytes
  if (b64.startsWith('JVBERi0'))  return 'data:application/pdf;base64,'  + b64; // PDF
  if (b64.startsWith('/9j/'))     return 'data:image/jpeg;base64,'       + b64; // JPG
  if (b64.startsWith('iVBORw0K')) return 'data:image/png;base64,'        + b64; // PNG
  if (b64.startsWith('R0lGOD'))   return 'data:image/gif;base64,'        + b64; // GIF

  // fallback genérico
  return 'data:application/octet-stream;base64,' + b64;
}

  function __abrirComprovanteSrc(src, filename = 'comprovante'){
    const url = __ensureDataUrl(src);
    if (!url){ alert('Comprovante inválido.'); return; }
    if (typeof window.__showComprovanteDataUrl === 'function'){
      window.__showComprovanteDataUrl(url); return;
    }
    const w = window.open('about:blank', '_blank');
    if (w && w.document){
      w.document.open('text/html');
      w.document.write(`<iframe src="${url}" style="border:0;width:100vw;height:100vh"></iframe>`);
      w.document.close();
    } else {
      location.href = url;
    }
  }



// faz o bind após o DOM carregar (idempotente)
window.addEventListener('DOMContentLoaded', () => {
  try { window.bindReciboLivePreview?.(); } catch {}
});


  // ───── Estado local ─────
  const state = { valorContrato: 0 };

  // ───── Cabeçalho do evento + “Falta Receber” no card Contrato ─────
  function atualizarContratoFaltaReceber(evId) {
    const elVal = document.getElementById('kContratoFalta');
    const card  = document.querySelector('.card-contrato');
    if (!elVal || !card) return;
    const totalContrato = Number(getValorContratoEventoById(evId) || 0);
    const totalRecebido = Number(totalRecebidoDoEvento(evId) || 0);
    const falta = Math.max(0, totalContrato - totalRecebido);
    elVal.textContent = brl(falta);
    if (falta <= 0.0001) card.classList.add('quitado');
    else card.classList.remove('quitado');
  }
  // soma apenas parcelas com status Pago/Recebido
  function totalRecebidoDoEvento(evId) {
    if (typeof getParcelasDoEvento === 'function' && typeof valorRealDaParcela === 'function') {
      const parcelas = getParcelasDoEvento(evId) || [];
      return parcelas.reduce((acc, p) => {
        const st = String(p.status || '').toLowerCase();
        const pago = st === 'pago' || st === 'recebido';
        return acc + (pago ? valorRealDaParcela(p) : 0);
      }, 0);
    }
    try {
      const raw = localStorage.getItem(`parcelas:${evId}`) || '[]';
      const parcelas = JSON.parse(raw);
      return parcelas.reduce((acc, p) => {
        const st = String(p.status || '').toLowerCase();
        const pago = st === 'pago' || st === 'recebido';
        const valor = Number(p.valorLiquido ?? p.valor ?? 0);
        return acc + (pago ? valor : 0);
      }, 0);
   } catch (e) { return 0; }
  }

function carregarEvento(){
  const evId = (typeof __getEventoIdAtual === 'function') ? __getEventoIdAtual() : '';
  const eventos = readLS('eventos', []);
  const ev = (eventos || []).find(e => String(e.id) === String(evId)) || {};
  const elNome  = $('#evNome');
  const elData  = $('#evData');
  const elLocal = $('#evLocal');
  const elConvs = $('#evConvs');
    if (elNome)  elNome.textContent  = ev.nomeEvento || ev.titulo || ev.nome || '—';
    if (elData)  elData.textContent  = normalizarData(ev.data || ev.dataEvento || ev.dataDoEvento) || '—';
    if (elLocal) elLocal.textContent = ev.local || ev.localEvento || ev.enderecoEvento || ev.endereco || '—';
    if (elConvs) elConvs.textContent = (ev.quantidadeConvidados ?? ev.convidados ?? ev.qtdConvidados ?? 0) + '';

      const valorContrato = getValorContratoEventoById(evId);
  state.valorContrato = valorContrato;
    const k1 = $('#kContrato');
    const k2 = $('#kContrato2');
  if (k1) k1.textContent = window.fmtBRL.format(valorContrato);
if (k2) k2.textContent = window.fmtBRL.format(valorContrato);

   atualizarContratoFaltaReceber(evId);
  }

window.addEventListener('storage', (e) => {
  const k = e?.key || '';
  if (['financeiroGlobal','financeiroEvento:ping','eventos','eventos:ping'].includes(k)) {
    refresh(); // recarrega e recalcula
  }
});


  // se seu fluxo dispara um evento custom ao salvar parcela, “escute” aqui:
  document.addEventListener('financeiro:salvou-parcela', (e) => {
    const id = e?.detail?.eventoId || eventoId;
    if (id) atualizarContratoFaltaReceber(id);
  });

  // ───── Estimativa de custo ─────
  function calcularCustoCardapioSelecionado(ev, card){
    const qtdConvidados = parseInt(ev.quantidadeConvidados ?? ev.convidados ?? ev.qtdConvidados ?? 0, 10) || 0;
   const _evId = (typeof __getEventoIdAtual === 'function') ? __getEventoIdAtual() : '';
const sessDef = readLS('definicoes_evento_' + (_evId || 'semid'), null) || {};
    const escolhidos = sessDef.itens || {};
    const composicao = readLS('composicaoCardapio_' + String(card.id), []) || [];
    const adicionaisCfg = readLS('adicionaisBuffet', []) || [];
    const fichas = readLS('fichasTecnicas', []) || [];
    let somaPorPessoa = 0;
    let somaAdicionais = 0;
    Object.entries(escolhidos).forEach(([cat, arr])=>{
      (arr||[]).forEach(sel=>{
        const item = composicao.find(i => String(i.id) === String(sel.id) && String(i.categoria) === String(cat));
        if (!item) return;
        if (cat === 'adicional'){
          const adicional = adicionaisCfg.find(a => a?.nome === item.nome);
          const tipo = String(adicional?.cobranca || 'fixo').toLowerCase();
          const ficha = fichas.find(f => f?.nome === item.nome);
          const custoUnit = ficha
            ? (ficha.ingredientes||[]).reduce((s,ing)=> s + (ing.custoPorPessoa||0), 0)
            : (Number(item.custo)||0);
          if (tipo === 'pessoa') somaAdicionais += custoUnit * qtdConvidados;
          else somaAdicionais += Number(item.custo)||0;
        } else {
          somaPorPessoa += Number(item.custo) || 0;
        }
      });
    });
    return (somaPorPessoa * qtdConvidados) + somaAdicionais;
  }

  function carregarEstimativa(){
    const eventos = readLS('eventos', []);
    const ev = (eventos||[]).find(e => String(e.id)===String(eventoId)) || {};
    let card = { id: null, nome: '—' };

    try{
      const sessDef = readLS('definicoes_evento_' + (eventoId || 'semid'), null) || {};
      if (sessDef?.cardapio?.id != null){
        card.id   = sessDef.cardapio.id;
        card.nome = sessDef.cardapio.nome || card.nome;
      }
    }catch{}

    if (!card.nome || card.nome === '—'){
      try{
        const itensSel = Array.isArray(ev?.itensSelecionados) ? ev.itensSelecionados : [];
        const itCard = itensSel.find(it => /card[aá]pio/i.test(String(it?.nome ?? it?.nomeItem ?? '')));
        if (itCard){
          card.nome = String(itCard.nome ?? itCard.nomeItem ?? 'Cardápio');
          if (itCard.cardapioId != null) card.id = itCard.cardapioId;
        }
      }catch{}
    }

    if (!card.nome || card.nome === '—'){
      card.nome =
        ev?.cardapio?.nome ||
        ev?.cardapioSelecionado?.nome ||
        ev?.resumo?.cardapioNome ||
        ev?.financeiro?.cardapio?.nome ||
        card.nome;
      if (card.id == null){
        card.id =
          ev?.cardapio?.id ??
          ev?.cardapioSelecionado?.id ??
          ev?.financeiro?.cardapio?.id ??
          null;
      }
    }
    if ((!card.nome || card.nome === '—') || card.id == null){
      const g = readLS('cardapioSelecionado', null);
      if (g){
        card.nome = (card.nome && card.nome !== '—') ? card.nome : (g.nome || '—');
        if (card.id == null && g.id != null) card.id = g.id;
      }
    }

    const elNome = document.getElementById('kNomeCardapio');
    if (elNome) elNome.textContent = card.nome || '—';

    let sessMont = null;
    if (card.id != null) sessMont = readLS('sessaoMontagem_'+String(card.id), null);
    if (!sessMont)      sessMont = readLS('sessaoMontagem_'+String(eventoId), null);

    let custoCardapioTotal = 0;
    try{
      if (typeof calcularCustoCardapioSelecionado === 'function'){
        custoCardapioTotal = Number(calcularCustoCardapioSelecionado(ev, card)) || 0;
      }
    }catch(e){ console.warn('Falha no calcularCustoCardapioSelecionado:', e); }
    if (!custoCardapioTotal){
      custoCardapioTotal = toNum(
        sessMont?.totais?.custoCardapio ?? sessMont?.totais?.custo_total ?? 0
      );
    }

    const elCustoCard = document.getElementById('kCustoCard');
    if (elCustoCard) elCustoCard.textContent = fmtBRL.format(custoCardapioTotal);

    const fixoLS = readLS('custosFixosEvento_'+String(eventoId), null);
    let custoFixosEvento = toNum(fixoLS?.total ?? 0);
    if (!custoFixosEvento) {
      const eventosAll = readLS('eventos', []);
      const evAtual = (eventosAll||[]).find(e => String(e.id)===String(eventoId)) || {};
      custoFixosEvento = toNum(evAtual?.financeiro?.custosFixos ?? 0);
    }
    const elCustoFix = document.getElementById('kCustoFixos');
    if (elCustoFix) elCustoFix.textContent = fmtBRL.format(custoFixosEvento);

    const contrato = Number(state?.valorContrato || getValorContratoEventoById(eventoId) || 0);
    const lucroEst = Math.max(0, contrato - (custoCardapioTotal + custoFixosEvento));
    const elLucEst = document.getElementById('kLucroEst');
    if (elLucEst) elLucEst.textContent = fmtBRL.format(lucroEst);
  }

  // ───── Financeiro Global (parcelas) ─────
  // ───── Financeiro Global (parcelas) ─────
function getFG(){
  try { return JSON.parse(localStorage.getItem('financeiroGlobal')) || { lancamentos:[], parcelas:[] }; }
  catch { return { lancamentos:[], parcelas:[] }; }
}
function getParcelasDoEvento(){
  const G = getFG?.() || {};

  // id do evento atual (igual ao resto do arquivo)
  const idEvento = new URLSearchParams(location.search).get('id')
                || localStorage.getItem('eventoSelecionado')
                || '';

  if (!idEvento) return [];

  // ajuda a padronizar o ID do lançamento e o vínculo nas parcelas
  const getLancId = (l) => String(
    l?.id ?? l?.lancamentoId ?? l?.lancId ?? l?.idLancamento ?? ''
  );

  const getParcLancId = (p) => String(
    p?.lancamentoId ?? p?.lancId ?? p?.idLancamento ?? ''
  );

  // 1) Filtra só lançamentos do evento (aceitando variações de chave)
  const lancsEvento = (G.lancamentos || []).filter(l => {
    const evId = String(
      l?.eventoId ?? l?.evento ?? l?.idEvento ?? l?.evento_id ?? l?.event_id ?? ''
    );
    return evId === String(idEvento);
  }).filter(l => {
    // 2) Remove lançamentos de “ajuste de saldo”
    const isAjuste = (
      l?.isSaldoAjuste === true ||
      String(l?.categoriaId || '') === '_ajuste_saldo_' ||
      String(l?.origem || '') === 'ajuste_saldo'
    );
    return !isAjuste;
  });

  // 3) Mapa de lançamentos por ID
  const porId = new Map(lancsEvento.map(l => [getLancId(l), l]));

  // 4) Junta parcelas do evento e anexa o lançamento correspondente
  const partes = (G.parcelas || [])
    .filter(p => {
      const lk = getParcLancId(p);
      return lk && porId.has(lk);
    })
    .map(p => {
      const lk = getParcLancId(p);
      return { ...p, lanc: porId.get(lk) };
    })
    // 5) (opcional) Ordena por vencimento crescente, quando houver
    .sort((a, b) => {
      const da = new Date(a?.vencimento || a?.dtVenc || a?.dueDate || 0).getTime() || 0;
      const db = new Date(b?.vencimento || b?.dtVenc || b?.dueDate || 0).getTime() || 0;
      return da - db;
    });

  return partes;
}


  function pickValorParcela(p){
    const value = valorRealDaParcela(p);
    return { value, cents: Math.round(value * 100) };
  }

  // ───── KPIs ─────
  function atualizarKPIs(){
    const partes = getParcelasDoEvento();
    let entPrev=0, entRec=0, saiPrev=0, saiPago=0;
    let atraso = false;
    const hoje = todayISO();

    const isPago = (st) => {
      st = String(st||'').toLowerCase();
      return st === 'pago' || st === 'quitado' || st === 'liquidado' || st === 'recebido' || st === 'baixado';
    };
    const toISOorNull = (v) => {
      if (!v) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return String(v).slice(0,10);
      const d = new Date(v);
      if (!isFinite(d)) return null;
      const m = String(d.getMonth()+1).padStart(2,'0');
      const dia = String(d.getDate()).padStart(2,'0');
      return `${d.getFullYear()}-${m}-${dia}`;
    };

    partes.forEach(p=>{
      const tipo = (p.lanc && p.lanc.tipo) ? p.lanc.tipo : 'entrada';
      const base = valorRealDaParcela(p);
      const st   = String(p.status || 'pendente').toLowerCase();
      const ven  = toISOorNull(p.vencimentoISO || p.vencimento || p.dataVenc || p.data);

      if (tipo === 'entrada'){
        entPrev += base;
        if (isPago(st)) entRec += valorRealDaParcela(p);
        else if (ven && ven < hoje) atraso = true;
      } else {
        saiPrev += base;
        if (isPago(st)) saiPago += valorRealDaParcela(p);
        else if (ven && ven < hoje) atraso = true;
      }
    });

    const contrato = state.valorContrato || 0;

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmtBRL.format(val); };
    setTxt('kEntPrev', entPrev);
    setTxt('kEntRec', entRec);
    setTxt('kEntFalta', Math.max(0, entPrev - entRec));
    const faltaContrato = Math.max(0, (state.valorContrato || 0) - (entRec || 0));
    setTxt('kContratoFalta', faltaContrato);
    setTxt('kContratoFalta2', faltaContrato);
    setTxt('kSaiPrev', saiPrev);
    setTxt('kSaiPago', saiPago);
    setTxt('kSaiFalta', Math.max(0, saiPrev - saiPago));
    setTxt('kLucPrev', Math.max(0, contrato - saiPrev));
    setTxt('kLucReal', Math.max(0, entRec - saiPago));

    const box = $('#kSituacao');
    if (box){
      box.textContent = atraso ? 'ATRASADO' : 'EM DIA';
      box.className   = 'status ' + (atraso ? 'late' : 'ok');
    }

    // Snapshot p/ outras telas
    try {
      const id = String(new URLSearchParams(location.search).get('id') || localStorage.getItem('eventoSelecionado') || '');
      if (id) {
        localStorage.setItem(`financeiroEvento:${id}`, JSON.stringify({
          id,
          contrato: state.valorContrato || 0,
          recebido: entRec || 0,
          falta: faltaContrato || 0,
          ts: Date.now()
        }));
        localStorage.setItem('financeiro:return:ping', String(Date.now()));
      }
    } catch (e) {
      console.warn('publish faltaContrato failed', e);
    }
  }

  // ───── Forma/Conta display (SUBSTITUIR A EXISTENTE) ─────
function getFormaContaDisplay(p){
  if (!p || typeof p !== 'object') return '';

  const norm = (s) => {
    const t = String(s ?? '').trim();
    const tl = t.toLowerCase();
    if (!t) return '';
    if (['undefined','null','-','--','selecione','(selecione)','selecionar'].includes(tl) || tl.startsWith('selecione ')) {
      return '';
    }
    return t;
  };

  const pick = (...arr) => arr.flat().map(norm).find(Boolean);

  // 1) Se já veio pronto (ex.: "PIX · Conta Itaú"), usa direto
  if (norm(p.meio)) return p.meio;

  // 2) Se já temos nomes explícitos, monta
  if (p.formaDescricao || p.contaNome) {
    const pronto = [norm(p.formaDescricao), norm(p.contaNome)].filter(Boolean).join(' · ');
    if (pronto) return pronto;
  }

  // 3) Tenta descobrir nomes por vários campos possíveis
  let formaNome = pick(
    p.formaDescricao, p.formaPagamentoNome, p.forma_pagamento_nome,
    p.meioDescricao, p.forma, p.meio, p.metodo, p.metodoPagamento, p.metodo_pagamento,
    p.formaPagamento, p.forma_pagamento, p.forma_pgto, p.meioPagamento, p.meio_pagamento,
    p.pagamento?.formaDescricao, p.pagamento?.forma, p.pagamento?.formaNome, p.pagamento?.formaPagamento,
    p.liquidacao?.formaDescricao, p.liquidacao?.forma, p.liquidacao?.formaNome, p.liquidacao?.formaPagamento,
    p.baixa?.formaDescricao, p.baixa?.forma, p.baixa?.formaNome, p.baixa?.formaPagamento,
    p.lanc?.formaDescricao, p.lanc?.meioDescricao, p.lanc?.forma, p.lanc?.meio,
    p.lanc?.formaPagamentoNome, p.lanc?.formaPagamento, p.lanc?.forma_pagamento
  );

  let contaNome = pick(
    p.contaNome, p.conta_nome, p.contaDescricao, p.nomeConta, p.conta,
    p.contaBancariaNome, p.conta_bancaria_nome, p.bancoNome,
    p.pagamento?.contaNome, p.liquidacao?.contaNome, p.baixa?.contaNome,
    p.lanc?.contaNome, p.lanc?.contaDescricao, p.lanc?.nomeConta
  );

  // 4) Se ainda faltou, tenta resolver pelo ID via configFinanceiro
  try {
    const read = (k, fb=[]) => { try{ return JSON.parse(localStorage.getItem(k))||fb; }catch{ return fb; } };
    const cfg    = read('configFinanceiro', {}) || {};
    const formas = cfg.tipos   || read('formasPagamento') || read('financeiro_formas') || read('config_formas') || [];
    const contas = cfg.contas  || read('contasFinanceiras') || read('contasBancarias') || read('financeiro_contas') || read('config_contas') || [];

    const formaId = pick(
      p.formaId, p.meioId, p.idForma, p.forma_pagamento_id, p.formaPagamentoId, p.forma_pag_id,
      p.pagamento?.formaId, p.liquidacao?.formaId, p.baixa?.formaId,
      p.lanc?.formaId, p.lanc?.meioId, p.lanc?.formaPagamentoId
    );
    const contaId = pick(
      p.contaId, p.idConta, p.conta_id, p.contaBancariaId,
      p.pagamento?.contaId, p.liquidacao?.contaId, p.baixa?.contaId,
      p.lanc?.contaId, p.lanc?.idConta
    );

    if (!formaNome && formaId != null) {
      const f = (formas||[]).find(x => [x?.id,x?.value,x?.codigo].map(String).includes(String(formaId)));
      if (f) formaNome = norm(f.descricao || f.nome || f.label || f.id);
    }
    if (!contaNome && contaId != null) {
      const c = (contas||[]).find(x => [x?.id,x?.value,x?.codigo].map(String).includes(String(contaId)));
      if (c) contaNome = norm(c.nome || c.descricao || c.label || c.id);
    }
  } catch {}

  return [norm(formaNome), norm(contaNome)].filter(Boolean).join(' · ');
}

function getLancamentosDoEvento(){
  const G = getFG();
  const idEvento = new URLSearchParams(location.search).get('id')
                || localStorage.getItem('eventoSelecionado')
                || '';
  const isAjusteSaldo = (l) =>
    l?.isSaldoAjuste === true ||
    String(l?.categoriaId || '') === '_ajuste_saldo_' ||
    String(l?.origem || '') === 'ajuste_saldo';
  return (G.lancamentos || []).filter(l =>
    String(l.eventoId || l.evento || l.idEvento || l.evento_id || l.event_id || '') === String(idEvento)
  ).filter(l => !isAjusteSaldo(l));
}

  // ───── Tabela de lançamentos ─────
function renderTabela(){
  const tb = $('#tbLancs');
  if (!tb) return;

  const todasDoEvento = getParcelasDoEvento();
  const totaisPorLanc = {};
  todasDoEvento.forEach(pp => {
    const k = String(pp.lancamentoId);
    totaisPorLanc[k] = (totaisPorLanc[k] || 0) + 1;
  });

  const _fg = () => { try{ return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}') }catch{ return {} } };
  const _valueFromObj = (o) => {
    if (!o || typeof o !== 'object') return '';
    const cand = [o.dataUrl, o.url, o.src, o.conteudo, o.content, o.base64, o.b64].find(Boolean);
    return typeof cand === 'string' ? cand : '';
  };
  const _extrairSrcAnexo = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    const candStr = [
      obj?.comprovanteUrl, obj?.comprovanteURL, obj?.comprovante,
      obj?.anexoUrl, obj?.anexoURL, obj?.anexo,
      obj?.arquivoUrl, obj?.arquivo, obj?.imagem, obj?.image
    ].filter(v => typeof v === 'string' && v && v !== '[separado]');
    if (candStr.length) return String(candStr[0]);
    const candObj = [obj?.comprovante, obj?.anexo, obj?.arquivo, obj?.imagem, obj?.image]
      .map(_valueFromObj).filter(Boolean);
    if (candObj.length) return candObj[0];
    try {
      if (obj?.id != null) {
        const sepParc = localStorage.getItem(`fg.comp.parc:${obj.id}`) || '';
        if (sepParc) return sepParc;
        const sepLanc = localStorage.getItem(`fg.comp:${obj.id}`) || '';
        if (sepLanc) return sepLanc;
      }
    } catch (e) {}
    if (obj?.id != null) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (/\b(comp|anexo|comprov)/i.test(k) && new RegExp(String(obj.id)).test(k)) {
            const val = localStorage.getItem(k) || '';
            if (val) return val;
          }
        }
      } catch (e) {}
    }
    return '';
  };
  const _pickComprovanteForLanc = (lancId) => {
    const G = _fg();
    const lanc = (G.lancamentos||[]).find(l => String(l.id)===String(lancId));
    if (!lanc) return null;
    let src = _extrairSrcAnexo(lanc);
    if (src) return { src, filename: `comprovante-lanc-${lanc.id}` };
    const partes = (G.parcelas||[]).filter(p => String(p.lancamentoId)===String(lancId));
    if (!partes.length) return null;
    partes.sort((a,b)=> (b.dataPagamentoISO||b.vencimentoISO||'').localeCompare(a.dataPagamentoISO||a.vencimentoISO||''));
    for (const p of partes){
      const s = String(p.status||'').toLowerCase();
      const tem = _extrairSrcAnexo(p);
      if (tem && (s==='pago' || s==='recebido' || s==='parcial'))
        return { src: tem, filename: `comprovante-parc-${p.id}` };
    }
    for (const p of partes){
      const tem = _extrairSrcAnexo(p);
      if (tem) return { src: tem, filename: `comprovante-parc-${p.id}` };
    }
    return null;
  };

  const partes = todasDoEvento.map(p => {
    const tipo = (p.lanc && p.lanc.tipo) ? p.lanc.tipo : 'entrada';
    const ven  = (p.vencimentoISO || p.vencimento || p.dataVenc || p.data || '');
    const desc = (p.descricao && String(p.descricao).trim() !== '') ? p.descricao : (p.lanc?.descricao || '');
    const valor = valorRealDaParcela(p);
    const meio = getFormaContaDisplay(p);
    const num  = (p.numero || p.n || p.parcelaNumero || 1);
    const de   = Number(p.de || p.parcelas || p.totalParcelas || p.qtd || 1);
    const st   = String(p.status || 'pendente').toLowerCase();
    return { id: p.id, lancId: p.lancamentoId, tipo, ven, desc, valor, meio, num, de, st, _p: p };
  });

  partes.sort((a,b) => String(a.ven||'').localeCompare(String(b.ven||'')));

  if (!partes.length){
    tb.innerHTML = `<tr><td colspan="8" class="muted">Nenhum lançamento cadastrado.</td></tr>`;
    return;
  }

  tb.innerHTML = '';
  const hoje = todayISO();

  for (const row of partes){
    const idBase = row.id || row.lancId || '';
    let tagClass, tagLabel;
    if (row.st === 'pago' || row.st === 'recebido') {
      tagClass = 'ok';
      tagLabel = (row.tipo === 'entrada') ? 'RECEBIDO' : 'PAGO';
    } else if (row.ven && row.ven < hoje) {
      tagClass = 'late';
      tagLabel = 'PENDENTE (ATRASO)';
    } else {
      tagClass = 'wait';
      tagLabel = (row.tipo === 'entrada') ? 'RECEBER' : 'PAGAR';
    }

    const srcParc = _extrairSrcAnexo(row._p);
    let pick = srcParc ? { src: srcParc, filename: `comprovante-parc-${row.id}` } : _pickComprovanteForLanc(row.lancId);

    // Botão do comprovante (só se existir)
    const btnAnexo = pick ? `
      <button class="btn-chip icon-only" data-act="anexo"
              data-lanc="${row.lancId}" data-parc="${row.id}"
              title="Ver comprovante" aria-label="Ver comprovante">
        <i data-lucide="paperclip"></i>
      </button>` : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.tipo}</td>
      <td>${formatDate(row.ven)}</td>
      <td>${esc(descShort(row.desc))}</td>
      <td style="text-align:right">${fmtBRL.format(row.valor)}</td>
      <td>${row.num}/${row.de}</td>
      <td><span class="tag ${tagClass}">${tagLabel}</span></td>
      <td>${esc(row.meio || '-')}</td>
      <td class="acoes">
        <!-- LÁPIS ÚNICO: edita a PARCELA no modal (fallback = lançamento) -->
        <button class="btn-chip icon-only" title="Editar" aria-label="Editar"
                data-act="edit" data-parc="${row.id}" data-lanc="${row.lancId}">
          <i data-lucide="pencil"></i>
        </button>

        ${btnAnexo}

        <button class="btn-chip icon-only delete" title="Excluir" aria-label="Excluir"
                data-act="del" data-parc="${row.id}" data-lanc="${row.lancId}">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    `;

    // EDITAR: abre o mesmo modal já preenchido
    tr.querySelector('[data-act="edit"]')?.addEventListener('click', () => {
      try { window.FinModal?.ensureModal?.(); } catch {}
      if (window.FinModal?.openEditarParcela) {
        window.FinModal.openEditarParcela(row.id);
      } else if (window.FinModal?.openEditar) {
        window.FinModal.openEditar(row.lancId);
      } else {
        alert('Não foi possível abrir o modal de edição.');
      }
    });

    // EXCLUIR
    tr.querySelector('[data-act="del"]')?.addEventListener('click', () => excluirParcela(row));

    // ABRIR COMPROVANTE
    const btn = tr.querySelector('[data-act="anexo"]');
    if (btn){
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        let src = _extrairSrcAnexo(row._p);
        let filename = `comprovante-parc-${row.id}`;
        if (!src) {
          const alt = _pickComprovanteForLanc(row.lancId);
          if (alt) { src = alt.src; filename = alt.filename || `comprovante-lanc-${row.lancId}`; }
        }
        if (!src) {
          try {
            src = localStorage.getItem(`fg.comp.parc:${row.id}`) || localStorage.getItem(`fg.comp:${row.lancId}`) || '';
            if (src) filename = filename || `comprovante-lanc-${row.lancId}`;
          } catch (e) {}
        }
        if (!src) { alert('Nenhum comprovante anexado para este lançamento/parcela.'); return; }
        if (typeof openAnexoModal === 'function') {
          openAnexoModal(__ensureDataUrl(src), filename || 'comprovante');
        } else {
          __abrirComprovanteSrc(src, filename || 'comprovante');
        }
      });
    }

    tb.appendChild(tr);
  }
  try { window.lucide?.createIcons?.(); } catch (e) {}
}


  // helpers de exibição
  const formatDate = (iso) => {
    if (!iso) return '—';
    const [y,m,d] = String(iso).slice(0,10).split('-');
    if (!y || !m || !d) return String(iso);
    return `${d}/${m}/${y}`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const descShort = (s) => {
    s = String(s || '');
    return s.length > 80 ? s.slice(0,77) + '…' : s;
  };
// === MOTOR DE VARIÁVEIS (compatível com Contratos/Modelos) ===
function __getVarsSeed(){ try{ return JSON.parse(localStorage.getItem('variaveis_modelos')||'[]'); }catch{ return []; } }
function __replaceVars(html, values={}, useExemplos=true){
  const vars = __getVarsSeed();
  const base = useExemplos ? Object.fromEntries(vars.map(v=>[v.chave, v.exemplo || ''])) : {};
  const map = { ...base, ...values };
  // Captura todas as {{chaves}} do template
  const tokens = Array.from(new Set(Array.from(html.matchAll(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g)).map(m=>m[1])));
  const getDeep = (obj, path) => (path||'').split('.').reduce((a,k)=> (a && a[k]!==undefined)?a[k]:undefined, obj||{});
  for (const key of tokens){
    let val = (key in map) ? map[key] : (getDeep(values, key));
    // Formatações automáticas simples (dinheiro)
    if (['valorEntrada','valorParcela','valorTotal','valorContrato'].includes(key)){
      if (typeof val === 'number'){
        val = val.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      } else if (typeof val === 'string' && /^[\d\s.,]+$/.test(val)) {
        const num = Number(val.replace(/\s/g,'').replace(/\./g,'').replace(',','.')) || 0;
        val = num.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      }
    }
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    html = html.replace(new RegExp(`{{\\s*${esc}\\s*}}`,'g'), (val ?? ''));
  }
  return html;
}

// === MAPA UNIFICADO DE VALORES DO EVENTO/EMPRESA ===
function __buildModeloValuesFinanceiro(ev={}, extras={}){
  const pad2 = n => String(n).padStart(2,'0');
  const onlyDigits = s => String(s||'').replace(/\D/g,'');
  const hoje = new Date();
  const dataAtual = `${pad2(hoje.getDate())}/${pad2(hoje.getMonth()+1)}/${hoje.getFullYear()}`;
  const horaAtual = `${pad2(hoje.getHours())}:${pad2(hoje.getMinutes())}`;

  let empresa = {};
  try { empresa = JSON.parse(localStorage.getItem('empresa')||'{}'); } catch (e) {}

  let usuarioAtual = 'Usuário';
  try { usuarioAtual = JSON.parse(localStorage.getItem('usuarioLogado')||'{}')?.nome || 'Usuário';} catch (e) {}

  // — Itens contratados → string amigável
  const toBRL = v => {
    const n = (typeof v==='number') ? v : (Number(String(v||'').replace(/\s/g,'').replace(/\./g,'').replace(',','.'))||0);
    return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  };
  function normalizaItens(evX){
    const cand = []
      .concat(Array.isArray(evX.itensSelecionados) ? evX.itensSelecionados : [])
      .concat(Array.isArray(evX.itensContratados) ? evX.itensContratados : [])
      .concat(Array.isArray(evX.servicosContratados) ? evX.servicosContratados : [])
      .concat(Array.isArray(evX.adicionaisContratados) ? evX.adicionaisContratados : []);
    if (!cand.length) return '';
    const linhas = cand.map(x=>{
      const nome = x?.nome || x?.titulo || x?.item || '';
      const qtd  = x?.qtd ?? x?.quantidade ?? x?.qte ?? '';
      const val  = x?.valor ?? x?.preco ?? x?.preço ?? '';
      const pedacos = [];
      if (nome) pedacos.push(String(nome));
      if (qtd)  pedacos.push(`Qtd: ${qtd}`);
      if (val)  pedacos.push(toBRL(val));
      return pedacos.join(' — ');
    }).filter(Boolean);
    return linhas.join(' • ');
  }

  // — Soma das entradas (para {{valorEntrada}} total)
  function somaEntradas(evX){
    const listas = []
      .concat(Array.isArray(evX.entradas) ? evX.entradas : [])
      .concat(Array.isArray(evX.financeiro?.entradas) ? evX.financeiro.entradas : [])
      .concat(Array.isArray(evX.financeiroEvento?.entradas) ? evX.financeiroEvento.entradas : []);
    if (!listas.length) return 0;
    return listas.reduce((acc, cur)=>{
      const bruto = (cur?.valor != null ? cur.valor : cur?.v);
      const num = (typeof bruto === 'number') ? bruto :
                  (Number(String(bruto||'0').replace(/\s/g,'').replace(/\./g,'').replace(',','.'))||0);
      return acc + num;
    }, 0);
  }

  // — Valor contrato (vários lugares possíveis no seu código atual)
  function pickValorContrato(evX){
    const direto =
      evX?.financeiro?.valorContrato ??
      evX?.valorContrato ??
      evX?.totalContrato ??
      evX?.contratoValor ??
      evX?.financeiro?.contrato?.total ??
      evX?.resumoFinanceiro?.contratoTotal ??
      evX?.totais?.contrato ??
      evX?.financeiro?.resumo?.contrato ?? '';
    if (direto !== '' && direto != null) {
      const n = (typeof direto==='number') ? direto : Number(String(direto).replace(/\./g,'').replace(',','.'))||0;
      return n;
    }
    return 0;
  }

  const values = {
    // — Cliente
    nomeCliente:         ev.nomeCliente || ev.cliente || '',
    enderecoCliente:     ev.enderecoCliente || ev.endereco || ev.logradouroCliente || ev.clienteEndereco || '',
    rgCliente:           ev.rgCliente || ev.rg || '',
    cpfCliente:          ev.cpfCliente || ev.cpf || '',
    whatsappCliente:     onlyDigits(ev.telefoneCliente || ev.whatsappCliente || ev.whatsapp || ''),
    emailCliente:        ev.emailCliente || ev.email || '',

    // — Evento
    nomeEvento:          ev.nomeEvento || ev.titulo || '',
    tipoEvento:          ev.tipoEvento || '',
    dataEvento:          ev.data || ev.dataEvento || ev.dataDoEvento || '',
    horarioInicioEvento: ev.horarioInicio || ev.horaInicio || ev.inicio || '',
    horarioTerminoEvento:ev.horarioTermino || ev.horaTermino || ev.termino || ev.fim || '',
    horaEvento:          ev.horarioEvento || ev.horaEvento || '',
    localEvento:         ev.local || ev.localEvento || '',
    qtdConvidados:       ev.quantidadeConvidados || ev.qtdConvidados || '',

    cardapio:            ev.cardapio || ev.cardapioSelecionado || ev.obsCardapio || '',

    // — Empresa
    empresaNome:         empresa.nomeComercial || empresa.razaoSocial || '',
    empresaEmail:        empresa.email || '',
    empresaWhats:        onlyDigits(empresa.whatsapp || ''),

    // — Sistema
    dataAtual, horaAtual, usuarioAtual,

    // — Financeiro agregados
    valorEntrada:        somaEntradas(ev),
    valorContrato:       pickValorContrato(ev),

    // — Itens
    itensContratados:    normalizaItens(ev),
  };

  return { ...values, ...extras };
}

  // ───── Modal Anexo (opcional – compatível com seu HTML) ─────
  const _anexoRefs = {
    modal:  document.getElementById('anexoModal'),
    viewer: document.getElementById('anexoViewer'),
    fechar: document.getElementById('anexoClose'),
    baixar: document.getElementById('anexoBaixar'),
    imprimir: document.getElementById('anexoImprimir'),
  };
  const _guessExt = (src) => {
    try{
      if (/\.pdf(\?|$)/i.test(src)) return '.pdf';
      if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(src)) return '.' + src.match(/\.(png|jpg|jpeg|webp|gif)/i)[1].toLowerCase();
      if (/^data:image\/png/.test(src)) return '.png';
      if (/^data:image\/jpe?g/.test(src)) return '.jpg';
      if (/^data:image\/webp/.test(src)) return '.webp';
      if (/^data:application\/pdf/.test(src)) return '.pdf';
    }catch{}
    return '.png';
  };
  function openAnexoModal(src, filename='comprovante'){
    if (!_anexoRefs.modal || !_anexoRefs.viewer || !src) return;
    _anexoRefs.viewer.innerHTML = '';
    const isPdf = /\.pdf(\?|$)/i.test(src) || /^data:application\/pdf/i.test(src);
    if (isPdf){
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%'; iframe.style.height = '70vh'; iframe.style.border = '0';
      iframe.src = src; _anexoRefs.viewer.appendChild(iframe);
    } else {
      const img = document.createElement('img');
      img.id = 'anexoImg';
      img.style.maxWidth = '100%'; img.style.maxHeight = '70vh';
      img.src = src; _anexoRefs.viewer.appendChild(img);
    }
    _anexoRefs.baixar.dataset.src = src;
    _anexoRefs.baixar.dataset.filename = filename;
    _anexoRefs.imprimir.dataset.src = src;
    _anexoRefs.modal.hidden = false;
    try { window.lucide?.createIcons?.(); } catch (e) {}
  }
  function closeAnexoModal(){
    if (_anexoRefs.modal){ _anexoRefs.modal.hidden = true; }
    if (_anexoRefs.viewer){ _anexoRefs.viewer.innerHTML = ''; }
  }
  function baixarAnexo(btn){
    const src = btn?.dataset?.src;
    const name = (btn?.dataset?.filename || 'comprovante') + _guessExt(src||'');
    if (!src) return;
    const a = document.createElement('a');
    a.href = src; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function imprimirAnexo(btn){
    const src = btn?.dataset?.src;
    if (!src) return;
    if (_guessExt(src) === '.pdf'){ window.open(src, '_blank', 'noopener'); return; }
    const html = `
<!doctype html><html><head><meta charset="utf-8"><title>Imprimir</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;background:#fff}
img{max-width:100vw;max-height:100vh}</style>
</head><body><img src="${src}" onload="window.print();"></body></html>`;
    const w = window.open('about:blank','_blank');
    if (w && w.document){ w.document.open('text/html'); w.document.write(html); w.document.close(); }
  }
  _anexoRefs.fechar?.addEventListener('click', closeAnexoModal);
  _anexoRefs.modal?.addEventListener('click', (e)=>{ if (e.target === _anexoRefs.modal) closeAnexoModal(); });
  _anexoRefs.baixar?.addEventListener('click', ()=> baixarAnexo(_anexoRefs.baixar));
  _anexoRefs.imprimir?.addEventListener('click', ()=> imprimirAnexo(_anexoRefs.imprimir));

  // Chave onde suas categorias são salvas no localStorage
const CAT_KEY = window.CAT_KEY || 'fin_categorias';

    function prepararCatUI(){
    renderCatTabela();
    const sel = document.getElementById('catTipoFiltro');
    if (sel) sel.onchange = renderCatTabela;
    $('#catNovo')?.addEventListener('click', ()=>{ limparCatForm(); $('#catNome')?.focus(); });
    $('#catForm')?.addEventListener('submit', salvarCatForm);
    $('#catCancelar')?.addEventListener('click', limparCatForm);
  }
  function renderCatTabela() {
    const filtro = document.getElementById('catTipoFiltro')?.value || '';
    let cats = [];
    try { cats = Array.isArray(getCategorias?.(filtro)) ? getCategorias(filtro) : [];} catch (e) { cats = readLS(CAT_KEY, []); }
    const escS = (s) => String(s ?? '').replace(/[&<>"']/g, m =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])
    );
    const tbody = document.querySelector('#catTabela tbody');
    if (!tbody) return;
    if (!cats.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center">Nenhuma categoria</td></tr>`;
    } else {
      tbody.innerHTML = cats.map(c => `
        <tr data-id="${escS(c.id)}">
          <td>${escS(c.nome)}</td>
          <td>${String(c.tipo) === 'entrada' ? 'Entrada' : 'Saída'}</td>
          <td>${c.ativo !== false ? 'Ativa' : 'Inativa'}</td>
          <td>
            <button class="btn btn-ghost" data-edit="${escS(c.id)}" title="Editar">
              <i data-lucide="edit-2"></i> Editar
            </button>
            <button class="btn btn-ghost" data-del="${escS(c.id)}" title="Excluir">
              <i data-lucide="trash-2"></i> Excluir
            </button>
          </td>
        </tr>
      `).join('');
    }
    try { window.lucide?.createIcons?.(); } catch (e) {}
    tbody.onclick = (e) => {
      const btn = e.target.closest && e.target.closest('button');
      if (!btn || !tbody.contains(btn)) return;
      const id = btn.getAttribute('data-edit') || btn.getAttribute('data-del');
      if (!id) return;
      if (btn.hasAttribute('data-edit')) {
        try { editarCategoria?.(id); } catch (e) {}
      } else if (btn.hasAttribute('data-del')) {
        try { excluirCategoria?.(id); } catch (e) {}
      }
    };
  }
  function limparCatForm(){
    $('#catId')?.setAttribute('value','');
    const nm = $('#catNome'); if (nm) nm.value = '';
    const tp = $('#catTipo'); if (tp) tp.value = 'entrada';
    const at = $('#catAtivo'); if (at) at.checked = true;
  }
  function salvarCatForm(e){
    e.preventDefault();
    const id = $('#catId')?.value.trim() || '';
    const nome = $('#catNome')?.value.trim() || '';
    const tipo = $('#catTipo')?.value || 'entrada';
    const ativo = $('#catAtivo')?.checked ?? true;
    if (!nome) { alert('Informe o nome da categoria.'); return; }
    const cats = readLS(CAT_KEY, []);
    if (id){
      const i = cats.findIndex(x => x.id===id);
      if (i>-1) cats[i] = { ...cats[i], nome, tipo, ativo };
    } else {
      const novo = { id: 'cat_'+Date.now(), nome, tipo, ativo };
      cats.push(novo);
    }
    writeLS(CAT_KEY, cats);
    renderCatTabela();
    limparCatForm();
  }
  function editarCategoria(id){
    const c = (readLS(CAT_KEY, [])||[]).find(x => x.id===id); if(!c) return;
    $('#catId')?.setAttribute('value', c.id);
    const nm = $('#catNome'); if (nm) nm.value = c.nome;
    const tp = $('#catTipo'); if (tp) tp.value = c.tipo;
    const at = $('#catAtivo'); if (at) at.checked = !!c.ativo;
  }
  function excluirCategoria(id){
    if (!confirm('Excluir esta categoria?')) return;
    const cats = readLS(CAT_KEY, []).filter(x => x.id!==id);
    writeLS(CAT_KEY, cats);
    renderCatTabela();
  }

  // ───── Ações (novo/editar/excluir) ─────
  const btnNovo = document.getElementById('btnNovo');
  if (btnNovo){
    btnNovo.addEventListener('click', ()=>{
      if (window.FinModal && typeof FinModal.openNovo === 'function') {
        FinModal.openNovo({ eventoId: String(eventoId), preferTipo: 'entrada', escopo: 'empresa' });
      } else {
        alert('Modal financeiro não carregado. Confira se "financeiro-modal.js" está incluído após o menu.');
      }
    });
  }
  async function excluirParcela(row){
    if (!confirm('Excluir este lançamento/parcela?')) return;
    try {
      // Carrega o estado global do financeiro
      const FG = __ensureFG(__fgLoad());

      // 1) Remove a parcela
      FG.parcelas = (FG.parcelas || []).filter(p => String(p.id) !== String(row.id));

      // 2) Se o lançamento ficar sem parcelas, remove o lançamento também
      const hasForLanc = (id) => (FG.parcelas || []).some(p => String(p.lancamentoId) === String(id));
      FG.lancamentos = (FG.lancamentos || []).filter(l => {
        // mantém se for de outro lançamento, ou se ainda houver parcela pra ele
        if (String(l.id) !== String(row.lancId)) return true;
        return hasForLanc(l.id);
      });

      // 3) Remove também o movimento contábil dessa parcela (se existir)
      const refKey = `lanc:${row.lancId}:parc:${row.id}`;
      __removeMovementByRef(refKey);

      // 4) Salva e recalcula saldos
      __fgSave(FG);                     // persiste + emite o ping (financeiroGlobal:ping)
      __recomputeAllAccountBalances();  // recalcula saldoAtual das contas

      // 5) Atualiza a tela
      refresh();

      // === INÍCIO PATCH FF-SYNC · Delete Parcela ===
      try {
        const change = {
          entity: 'parcela',
          action: 'delete',
          payload: { id: String(row.id), eventId: String(row.eventoId || __evId?.() || '') }
        };
        await (window.syncPush?.({ changes: [change] }));
        await (window.syncPull?.());
      } catch (e) {
        console.warn('[sync] parcela delete push falhou:', e);
      }
      // === FIM PATCH FF-SYNC · Delete Parcela ===

    } catch(e) {
      console.error('excluirParcela:', e);
    }
  }

  // ───── Recibo (UI leve que casa com seu HTML) ─────
  function getVariaveisGlobais(){
    return readLS('variaveis_modelos', null) || readLS('modelos_variaveis', null) || {};
  }
  function toBRL(n){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0)); }
  function onlyDigits(s){ return String(s||'').replace(/\D+/g,''); }
  function getModelosPublicados(){ try{ return JSON.parse(localStorage.getItem('modelos_documentos')||'[]') || []; }catch{ return []; } }
  function getModeloHtmlBySlug(slug){ if(!slug) return ''; return localStorage.getItem('modelo_' + slug) || ''; }

  function buildVarsRecibo(ev, par){
    const lanc = par?.lanc || {};
    const cliente = ev?.cliente || ev?.nomeCliente || ev?.contratante || ev?.responsavel || '';
    const telefone = (String(ev?.telefone || ev?.telefoneCliente || ev?.whats || ev?.whatsapp || '').match(/\d+/g)||[]).join('');
    const cpfCnpj = ev?.cpf || ev?.cnpj || ev?.documento || '';
    const valor = (par?.totalPago && Number(par.totalPago) > 0) ? Number(par.totalPago) : Number(par?.valor||0);
    const dataPg  = par?.dataPagamentoISO || par?.dataPagamento || lanc?.dataPagamentoISO || lanc?.data;
    const dataPt  = (s=>{
      if(!s) return '';
      const d = /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s) : new Date(s);
      if(!isFinite(d)) return s;
      const [Y,M,D] = d.toISOString().slice(0,10).split('-');
      return `${D}/${M}/${Y}`;
    })(dataPg);
    const desc = par?.descricao || lanc?.descricao || 'Recibo de pagamento';
    const dataEvento = (()=>{
      const raw = ev?.data || ev?.dataEvento || ev?.dataDoEvento || '';
      const d = raw ? new Date(raw) : null;
      if(d && isFinite(d)){
        const [Y,M,D] = d.toISOString().slice(0,10).split('-');
        return `${D}/${M}/${Y}`;
      }
      return raw || '';
    })();
    const formaConta = (()=>{
      if (par?.meio) return par.meio;
      const forma = par?.formaDescricao || lanc?.formaDescricao || '';
      const conta = par?.contaNome       || lanc?.contaNome       || '';
      return [forma, conta].filter(Boolean).join(' · ');
    })();
    const fmt = (n)=> new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
    const varsRecibo = {
      evento_nome:  ev?.nomeEvento || ev?.titulo || ev?.nome || '',
      evento_data:  dataEvento,
      evento_local: ev?.local || ev?.localEvento || ev?.enderecoEvento || ev?.endereco || '',
      cliente_nome: cliente,
      cliente_documento: cpfCnpj,
      cliente_telefone: telefone,
      recibo_valor_extenso: fmt(valor),
      recibo_valor:        fmt(valor),
      recibo_data: dataPt,
      recibo_descricao: desc,
      forma_conta: formaConta,
      numeroContrato: ev?.numeroContrato || ev?.contratoNumero || ev?.id || ''
    };
    const globais = getVariaveisGlobais();
    const stringMap = (obj)=>Object.fromEntries(Object.entries(obj||{}).map(([k,v])=>[k, v==null?'': (typeof v==='object'? JSON.stringify(v): String(v))]));
    const merged = { ...stringMap(globais), ...stringMap(varsRecibo) };
    const hoje = new Date(); const [Y,M,D] = hoje.toISOString().slice(0,10).split('-');
    const aliases = {
      nomeCliente: merged.cliente_nome,
      cliente:     merged.cliente_nome,
      valorTotal:  merged.recibo_valor,
      valor:       merged.recibo_valor,
      referente:   merged.recibo_descricao,
      dataAtual:   `${D}/${M}/${Y}`,
      nomeEmpresa:     merged.nomeEmpresa     || merged.empresa_nome     || merged.nomeEmpresa,
      cnpjEmpresa:     merged.cnpjEmpresa     || merged.empresa_cnpj     || merged.cnpjEmpresa,
      whatsappEmpresa: merged.whatsappEmpresa || merged.empresa_whatsapp || merged.whatsappEmpresa,
      enderecoEmpresa: merged.enderecoEmpresa || merged.empresa_endereco || merged.enderecoEmpresa,
      logoEmpresa:     merged.logoEmpresa     || merged.empresa_logo     || merged.logoEmpresa,
      nomeEvento: merged.evento_nome,
      dataEvento: merged.evento_data,
      localEvento: merged.evento_local
    };
    return { ...merged, ...aliases };
  }
  function renderReciboPreview(modelSlug, vars){
    const modelosReplace = window.replaceVars || ((html, values)=>{
      if(!html) return '';
      let out = html;
      Object.entries(values||{}).forEach(([k,v])=>{
        const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
        out = out.replace(re, v==null?'':String(v));
      });
      return out;
    });
    const html = getModeloHtmlBySlug(modelSlug) || `<h2>Recibo</h2><p>{{recibo_descricao}}</p><p><b>Valor:</b> {{recibo_valor}}</p>`;
    const final = modelosReplace(html, vars, true);
    const prev = document.getElementById('rbPreview');
    if (prev) prev.innerHTML = final;
  }
  function abrirWhatsAppDoEvento(ev, vars){
    const fone = onlyDigits(vars?.cliente_telefone || '') || onlyDigits(ev?.whats || ev?.whatsapp || ev?.telefone || '');
    const msg = `Olá ${vars?.cliente_nome||''}! Segue o recibo do evento "${vars?.evento_nome||''}" no valor de ${vars?.recibo_valor||''}.`;
    const url = fone ? `https://wa.me/${fone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }
  function imprimirRecibo(){
    const prev = document.getElementById('rbPreview');
    if (!prev) return;
    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>@page { size: A4; margin: 12mm; } body { font-family: Arial, ui-sans-serif; margin: 0; color:#222; } .a4 { width: 210mm; min-height: 297mm; padding: 20px; box-sizing: border-box; }</style>
</head><body><div class="a4">${prev.innerHTML}</div></body></html>`;
    const w = window.open('about:blank', '_blank');
    if (w && w.document) {
      w.document.open('text/html');
      w.document.write(html);
      w.document.close();
      w.onload = () => { try { w.focus(); w.print(); } catch(_){} };
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
    iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow || iframe.contentDocument;
    const idoc = doc.document || doc;
    idoc.open('text/html'); idoc.write(html); idoc.close();
    iframe.onload = () => {
      try { (iframe.contentWindow || iframe).focus(); (iframe.contentWindow || iframe).print(); } catch(_) {}
      setTimeout(() => iframe.remove(), 1000);
    };
  }
  function prepararModalRecibo(){
    const modal = document.getElementById('reciboModal');
    const selPago = document.getElementById('rbSelecaoPago');
    const selModelo = document.getElementById('rbModelo');
    if (!modal || !selPago || !selModelo) return;
    const partes = getParcelasDoEvento();
    const pagos = partes.filter(p => ['pago','recebido'].includes(String(p.status||'').toLowerCase()));
    selPago.innerHTML = pagos.map(p=>{
      const v = (p.totalPago && Number(p.totalPago)>0) ? p.totalPago : p.valor;
      const ven = p.vencimentoISO || p.vencimento || '';
      const desc = p.descricao || p.lanc?.descricao || '(sem descrição)';
      return `<option value="${p.id}">${desc} — ${toBRL(v)} — ${ven}</option>`;
    }).join('') || `<option value="">(nenhum pagamento encontrado)</option>`;
    const modelos = getModelosPublicados();
    const prefer = modelos.find(m => /recibo/i.test(m.nome)) || modelos.find(m=>/recibo/.test(m.slug)) || modelos[0];
    selModelo.innerHTML = modelos.map(m=>`<option value="${m.slug}" ${prefer && m.slug===prefer.slug?'selected':''}>${m.nome}</option>`).join('') || `<option value="">(sem modelos)</option>`;
    $('#rbPreview')?.replaceChildren();
  }
  function abrirModalRecibo(){ prepararModalRecibo(); const m = document.getElementById('reciboModal'); if (m) m.hidden = false; try { window.lucide?.createIcons?.(); } catch (e) {} }
  function fecharModalRecibo(){ const m = document.getElementById('reciboModal'); if (m) m.hidden = true; }
function bindReciboUI(){
  var btnGerar = document.getElementById('btnGerarRecibo');
  if (btnGerar) btnGerar.addEventListener('click', abrirModalRecibo);

  var rbClose = document.getElementById('rbClose');
  if (rbClose) rbClose.addEventListener('click', fecharModalRecibo);

  var rbGerar = document.getElementById('rbGerar');
  if (rbGerar) rbGerar.addEventListener('click', function(){
    var pid  = (document.getElementById('rbSelecaoPago') || {}).value || '';
    var slug = (document.getElementById('rbModelo') || {}).value || '';
    if (!pid || !slug) { alert('Selecione o pagamento e o modelo.'); return; }

    var eventos = readLS('eventos', []);
    var ev = (eventos || []).find(function(e){ return String(e.id) === String(eventoId); }) || {};
    var partes = getParcelasDoEvento();
    var par = partes.find(function(p){ return String(p.id) === String(pid); });
    if (!par) { alert('Pagamento não encontrado.'); return; }

    var vars = buildVarsRecibo(ev, par);
    renderReciboPreview(slug, vars);
  });

  var rbImprimir = document.getElementById('rbImprimir');
  if (rbImprimir) rbImprimir.addEventListener('click', imprimirRecibo);

  var rbWhats = document.getElementById('rbWhats');
  if (rbWhats) rbWhats.addEventListener('click', function(){
    var eventos = readLS('eventos', []);
    var ev = (eventos || []).find(function(e){ return String(e.id) === String(eventoId); }) || {};
    var selPago = document.getElementById('rbSelecaoPago');
    var pid = selPago ? selPago.value : '';
    var partes = getParcelasDoEvento();
    var par = partes.find(function(p){ return String(p.id) === String(pid); });
    if (!par) { alert('Pagamento não encontrado.'); return; }

    var vars = buildVarsRecibo(ev, par);
    abrirWhatsAppDoEvento(ev, vars);
  });
}

   // ───── Botão "Custos Fixos" ─────
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest?.('#btnCustosFixos');
    if (!btn) return;
    const evId =
      (typeof eventoId !== 'undefined' && eventoId) ||
      new URLSearchParams(location.search).get('id') ||
      localStorage.getItem('eventoSelecionado') || '';
    const url = `custos-fixo.html?id=${encodeURIComponent(evId)}`;
    window.location.href = url;
  });

  // ───── Clique global para ver comprovante padrão (se usar data-action="view-comp") ─────
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest?.('[data-action="view-comp"]');
    if (!btn) return;
    const lancId    = btn.dataset?.lancId || btn.getAttribute('data-lanc-id') || btn.getAttribute('data-id') || null;
    const parcelaId = btn.dataset?.parcId || btn.getAttribute('data-parc-id') || null;
    let dataUrl = null;
    try {
      if (lancId && typeof __getComprovanteBase64ByLancId === 'function') {
        dataUrl = __getComprovanteBase64ByLancId(lancId);
      }
      if (!dataUrl && parcelaId && typeof __getComprovanteBase64ByParcelaId === 'function') {
        dataUrl = __getComprovanteBase64ByParcelaId(parcelaId);
      }
    } catch{}
    if (!dataUrl) { alert('Comprovante não encontrado.'); return; }
    if (typeof openAnexoModal === 'function') openAnexoModal(dataUrl, 'comprovante');
    else if (typeof window.__showComprovanteDataUrl === 'function') window.__showComprovanteDataUrl(dataUrl);
    else __abrirComprovanteSrc(dataUrl, 'comprovante');
  });

// ───── Ciclo de refresh ─────
function refresh(){
  // fluxo normal de atualização da tela
  carregarEvento();
  carregarEstimativa();
  atualizarKPIs();
  renderTabela();

  // (se existirem no seu arquivo)
  try { bindReciboUI?.(); } catch(e){}
  try { bindReciboLivePreview?.(); } catch(e){}

  // ícones
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (e) {}

  // >>> NOVO: sincroniza movimentos das contas com base nas parcelas do evento
  try { syncAccountMovementsForEvento?.(); } catch (e) {
    console.warn('syncAccountMovementsForEvento', e);
  }

  // >>> NOVO: publica snapshot no financeiroGlobal (usado por Resumo e Análises)
  try { __publishFGFromEvento?.(); } catch (e) {
    console.warn('__publishFGFromEvento', e);
  }
}


// Atualiza quando o modal salvar/alterar
window.addEventListener('finmodal:confirm', refresh);

// Boot e retomadas
refresh();
window.addEventListener('pageshow', refresh);
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') refresh();
});
/* === INÍCIO PATCH D.3 — Listener qtd convidados === */
(function bindQtdConvidados(){
  const alvo = document.querySelector('#qtdConvidados, [data-bind="qtdConvidados"]');
  if (!alvo) return;
  let t=null;
  alvo.addEventListener('input', ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{
      try{
        if (typeof window.recalcularFinanceiroDoEvento==='function') window.recalcularFinanceiroDoEvento();
        if (typeof window.salvarFinanceiroEvento==='function')      window.salvarFinanceiroEvento(window.eventoAtual);
      }catch(e){ console.warn('Erro recálculo qtdConvidados:', e); }
    }, 150);
  }, {passive:true});
})();
/* === FIM PATCH D.3 === */

/* === INÍCIO PATCH D.3 — Listener qtd convidados === */
(function bindQtdConvidados(){
  const alvo = document.querySelector('#qtdConvidados, [data-bind="qtdConvidados"]');
  if (!alvo) return;
  let t=null;
  alvo.addEventListener('input', ()=>{
    // debounce leve para não disparar a cada tecla
    clearTimeout(t);
    t = setTimeout(()=>{
      try{
        // sua função atual de recálculo + persistência:
        // ex.: recalcularFinanceiroDoEvento(); salvarFinanceiroEvento(eventoAtual);
        // Depois da persistência, a D2 já emite os sinais.
        if (typeof window.recalcularFinanceiroDoEvento==='function') window.recalcularFinanceiroDoEvento();
        if (typeof window.salvarFinanceiroEvento==='function')      window.salvarFinanceiroEvento(window.eventoAtual);
      }catch(e){ console.warn('Erro recálculo qtdConvidados:', e); }
    }, 150);
  }, {passive:true});
})();
/* === FIM PATCH D.3 === */

// === RECIBO: abrir modal, listar pagos, modelos, preview e gerar ===
(function setupRecibo(){
  const $  = (s, el=document) => el.querySelector(s);
  const eventoId = new URLSearchParams(location.search).get('id') || localStorage.getItem('eventoSelecionado') || '';

  const els = {
    btnOpen:   $('#btnGerarRecibo'),
    modal:     $('#reciboModal'),
    close:     $('#rbClose'),
    selPago:   $('#rbSelecaoPago'),
    selModelo: $('#rbModelo'),
    preview:   $('#rbPreview'),
    gerar:     $('#rbGerar'),
    imprimir:  $('#rbImprimir'),
    whats:     $('#rbWhats'),
  };
  if (!els.btnOpen || !els.modal) return;

  // LS local com fallback
  const __readLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };

  function listarPagos(){
    const partes = (typeof getParcelasDoEvento === 'function') ? getParcelasDoEvento() : [];
    const pagos = partes.filter(p=>{
      const st = String(p.status||'').toLowerCase();
      return ['pago','recebido','quitado','baixado','liquidado'].includes(st);
    });
    els.selPago.innerHTML = '';
    if (!pagos.length){
      els.selPago.innerHTML = `<option value="">(Não há parcelas/lançamentos pagos)</option>`;
      return;
    }
    pagos.sort((a,b)=> String(a.dataPagamentoISO||a.vencimentoISO||'').localeCompare(String(b.dataPagamentoISO||b.vencimentoISO||'')));
    for (const p of pagos){
      const lancDesc = (p.lanc?.descricao || p.descricao || 'Pagamento');
      const when = (p.dataPagamentoISO || p.vencimentoISO || p.data || '').toString().slice(0,10);
      const val  = (typeof valorRealDaParcela === 'function') ? valorRealDaParcela(p) : Number(p.valor||0);
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = `${lancDesc} — ${when} — ${val.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`;
      els.selPago.appendChild(opt);
    }
  }

  function listarModelos(){
    const modelos = __readLS('modelos_documentos', []);
    els.selModelo.innerHTML = '';
    if (!Array.isArray(modelos) || !modelos.length){
      els.selModelo.innerHTML = `<option value="">(Nenhum modelo salvo)</option>`;
      return;
    }
    els.selModelo.innerHTML = modelos
      .map(m=>`<option value="${m.slug||''}">${m.nome||m.titulo||m.slug||'(sem nome)'}</option>`)
      .join('');
  }

  function renderReciboPreview(slug, vars){
    try{
      const modelos = __readLS('modelos_documentos', []);
      const mod = (modelos||[]).find(m => String(m.slug)===String(slug));
      if (!mod || !els.preview) return;
      const html = __replaceVars(String(mod.html||mod.conteudo||''), vars, true);
      els.preview.innerHTML = html || '(vazio)';
      try { window.lucide?.createIcons?.(); } catch {}
    }catch{}
  }

  function buildVarsRecibo(ev, par){
    const base = (typeof __buildModeloValuesFinanceiro === 'function')
      ? __buildModeloValuesFinanceiro(ev, { parcela: par })
      : {};
    const valor = (typeof valorRealDaParcela === 'function') ? valorRealDaParcela(par) : Number(par.valor||0);
    return {
      ...base,
      valorParcela: valor,
      valorTotal: valor,
      valorContrato: Number(ev?.contrato?.valor || ev?.valorContrato || 0),
      dataPagamento: (par.dataPagamentoISO || par.data || '').toString().slice(0,10),
      descricao: par.lanc?.descricao || par.descricao || 'Pagamento',
      parcelaNumero: par.parcela || par.seq || '',
    };
  }

  function prepararModalRecibo(){
    listarPagos();
    listarModelos();
    if (els.preview) els.preview.innerHTML = '';
  }

  function abrirModalRecibo(){
    prepararModalRecibo();
    els.modal.hidden = false;
    try { window.lucide?.createIcons?.(); } catch {}
  }
  function fecharModalRecibo(){ els.modal.hidden = true; }

  // Re-render do preview ao mudar seleção/modelo
  function rerenderPreview(){
    const eventos = __readLS('eventos', []);
    const ev = (eventos||[]).find(e => String(e.id)===String(eventoId)) || {};
    const partes = (typeof getParcelasDoEvento === 'function') ? getParcelasDoEvento() : [];
    const par = partes.find(p => String(p.id)===String(els.selPago?.value||''));
    const slug = els.selModelo?.value || '';
    if (!par || !slug) {
      if (els.preview) els.preview.innerHTML = '';
      return;
    }
    const vars = buildVarsRecibo(ev, par);
    renderReciboPreview(slug, vars);
  }

  // Ações dos botões
  els.btnOpen?.addEventListener('click', abrirModalRecibo);
  els.close?.addEventListener('click', fecharModalRecibo);

  els.selPago?.addEventListener('change', rerenderPreview);
  els.selModelo?.addEventListener('change', rerenderPreview);

  els.gerar?.addEventListener('click', function(){
    const pid  = els.selPago?.value || '';
    const slug = els.selModelo?.value || '';
    if (!pid || !slug) { alert('Selecione o pagamento e o modelo.'); return; }

    const eventos = __readLS('eventos', []);
    const ev = (eventos||[]).find(e => String(e.id)===String(eventoId)) || {};
    const partes = (typeof getParcelasDoEvento === 'function') ? getParcelasDoEvento() : [];
    const par = partes.find(p => String(p.id)===String(pid));
    if (!par) { alert('Pagamento não encontrado.'); return; }

    const vars = buildVarsRecibo(ev, par);
    renderReciboPreview(slug, vars);
  });

  })();

(function FE_FIXPACK(){
  'use strict';

  // Helpers seguros
  const $  = (s, el=document) => el?.querySelector?.(s) || null;
  const $$ = (s, el=document) => Array.from(el?.querySelectorAll?.(s) || []);
  const todayISO = () => new Date().toISOString().slice(0,10);
  const BRL = (n)=> Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  // ID do evento (URL ?id= ou fallback LS)
  const _eventoId = (() => {
    try{
      const id = new URLSearchParams(location.search).get('id') || localStorage.getItem('eventoSelecionado') || '';
      if (id) localStorage.setItem('eventoSelecionado', String(id));
      return id;
    }catch{ return ''; }
  })();

  // FG helpers robustos
  function _fgLoad(){
    try { return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}') || {}; }
    catch { return {}; }
  }
  function _fgSave(g){
    try{
      localStorage.setItem('financeiroGlobal', JSON.stringify(g));
      localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
    }catch{}
  }
  function _ensureFG(g){
    g = g && typeof g==='object' ? g : {};
    if (!Array.isArray(g.lancamentos)) g.lancamentos = [];
    if (!Array.isArray(g.parcelas))    g.parcelas    = [];
    if (!Array.isArray(g.contas))      g.contas      = [];
    if (!Array.isArray(g.movimentos))  g.movimentos  = [];
    return g;
  }

  // Valor real da parcela (aceita diferentes formatos)
  function _valorParcela(p){
    if (!p) return 0;
    if (p.totalPago && Number(p.totalPago)>0) return Number(p.totalPago);
    if (p.valor != null) return Number(p.valor)||0;
    if (p.valorParcela != null) return Number(p.valorParcela)||0;
    return 0;
  }
// === Parcial seguro: obtém parcelas do evento atual sem depender de globais ===
function __getParcelasDoEvento(){
  try {
    // se já existir alguma versão global, use-a
    if (typeof window.getParcelasDoEvento === 'function') {
      return window.getParcelasDoEvento();
    }
  } catch {}

  // fallback: monta a lista a partir do Financeiro Global
  const G = _fgLoad() || {};
  const idEvento = _eventoId || '';

  const getLancId = (l) => String(l?.id ?? l?.lancamentoId ?? l?.lancId ?? l?.idLancamento ?? '');
  const getParcLancId = (p) => String(p?.lancamentoId ?? p?.lancId ?? p?.idLancamento ?? '');

  // somente lançamentos deste evento e que não são "ajuste de saldo"
  const lancsEvento = (G.lancamentos || [])
    .filter(l => String(l?.eventoId || l?.evento || l?.idEvento || l?.evento_id || l?.event_id || '') === String(idEvento))
    .filter(l => !(l?.isSaldoAjuste === true || String(l?.categoriaId || '') === '_ajuste_saldo_' || String(l?.origem || '') === 'ajuste_saldo'));

  const porId = new Map(lancsEvento.map(l => [getLancId(l), l]));

  const partes = (G.parcelas || [])
    .filter(p => porId.has(getParcLancId(p)))
    .map(p => {
      const lk = porId.get(getParcLancId(p));
      return { ...p, lanc: lk };
    })
    .sort((a,b) => {
      const da = new Date(a?.vencimento || a?.vencimentoISO || a?.data || 0).getTime() || 0;
      const db = new Date(b?.vencimento || b?.vencimentoISO || b?.data || 0).getTime() || 0;
      return da - db;
    });

  return partes;
}

  

  // Forma/Conta amigável (sem travar)
  function _meioParcela(p){
    const norm = s => String(s??'').trim();
    const j = (a,b)=>[norm(a),norm(b)].filter(Boolean).join(' · ');
    if (norm(p?.meio)) return p.meio;
    return j(p?.formaDescricao || p?.lanc?.formaDescricao, p?.contaNome || p?.lanc?.contaNome) || '-';
  }
// === INÍCIO PATCH FF-1 (Parcelas Admin UI) ================================
// Cola ACIMA de "// ===== Render" em financeiro-evento.js

// helpers seguros
function __apiOn(){ try { return typeof apiFetch === 'function'; } catch { return false; } }
function __evIdAtual(){
  try { return (typeof __getEventoIdAtual==='function' ? __getEventoIdAtual()
        : (new URLSearchParams(location.search).get('id')||null)); } catch { return null; }
}

// 1) Criar/atualizar uma parcela PENDENTE no backend
async function __remoteUpsertParcelaPendente(parc){
  if (!__apiOn()) return false;
  const evId = __evIdAtual();
  if (!evId || !parc?.id) return false;
  try{
    await apiFetch(`/api/admin/eventos/${encodeURIComponent(evId)}/parcelas`, {
      method:'POST',
      headers:{ 'x-tenant-id':'default' },
      body: JSON.stringify({
        id: String(parc.id),
        descricao: parc.descricao || parc.lanc?.descricao || 'Parcela',
        valor: Number(parc.valor ?? parc.totalPago ?? 0),
        vencimentoISO: (parc.vencimentoISO || parc.venc || parc.data || null)
      })
    });
    try { toast?.('Parcela sincronizada na API.', 'success'); } catch {}
    return true;
  } catch(e){
    console.warn('[FF-1] upsert parcela pendente (API) falhou:', e);
    try { toast?.('Não consegui criar/atualizar a parcela na API.', 'warn'); } catch {}
    return false;
  }
}

// 2) Marcar como paga/recebida
async function __remotePagarParcela(parcelaId, pagoEmISO=null, comprovanteUrl=null){
  if (!__apiOn() || !parcelaId) return false;
  try{
    await apiFetch(`/api/admin/parcelas/${encodeURIComponent(parcelaId)}/pagar`, {
      method:'POST',
      headers:{ 'x-tenant-id':'default' },
      body: JSON.stringify({
        pagoEmISO: (pagoEmISO || new Date().toISOString()),
        comprovanteUrl: (comprovanteUrl || null)
      })
    });
    try { toast?.('Baixa registrada na API.', 'success'); } catch {}
    return true;
  } catch(e){
    console.warn('[FF-1] pagar parcela (API) falhou:', e);
    try { toast?.('Não consegui registrar a baixa na API.', 'warn'); } catch {}
    return false;
  }
}

// 3) Excluir parcela
async function __remoteExcluirParcela(parcelaId){
  if (!__apiOn() || !parcelaId) return false;
  try{
    await apiFetch(`/api/admin/parcelas/${encodeURIComponent(parcelaId)}`, {
      method:'DELETE',
      headers:{ 'x-tenant-id':'default' }
    });
    try { toast?.('Parcela excluída na API.', 'success'); } catch {}
    return true;
  } catch(e){
    console.warn('[FF-1] excluir parcela (API) falhou:', e);
    try { toast?.('Não consegui excluir na API.', 'warn'); } catch {}
    return false;
  }
}

/* Hook: quando você salva/edita uma parcela local, também espelha na API.
   A função que dá o "commit" já existe; interceptamos sem mudar seu layout. */
(function(){
  const _origCommit = (typeof __commitParcelaNoEvento === 'function') ? __commitParcelaNoEvento : null;
  if (!_origCommit) return;

  window.__commitParcelaNoEvento = async function(parc){
    const prev = (typeof getParcelasDoEvento==='function')
      ? (getParcelasDoEvento()||[]).find(x=>String(x.id)===String(parc?.id))
      : null;

    // 1) chama o commit original (mantém tudo que você já tem hoje)
    const r = await _origCommit.apply(this, arguments);

    // 2) se ficou/continua PENDENTE → upsert pendente na API
    try{
      const st = String((parc?.status || prev?.status || 'pendente')).toLowerCase();
      const pagoLike = ['pago','recebido','baixado','quitado','liquidado'].includes(st);
      if (!pagoLike) await __remoteUpsertParcelaPendente(parc);
    }catch(e){ console.warn('[FF-1] espelho pendente falhou:', e); }

    // 3) se TRANSITOU para pago/recebido → registrar baixa na API
    try{
      const before = String(prev?.status||'pendente').toLowerCase();
      const after  = String(parc?.status||'pendente').toLowerCase();
      const becamePaid = !['pago','recebido','baixado','quitado','liquidado'].includes(before)
                         && ['pago','recebido','baixado','quitado','liquidado'].includes(after);
      if (becamePaid){
        await __remotePagarParcela(parc.id, (parc.dataPagamentoISO || null),
          (parc.comprovanteUrl || parc.lanc?.comprovanteUrl || null));
      }
    }catch(e){ console.warn('[FF-1] espelho baixa falhou:', e); }

    return r;
  };
})();

/* Hook: quando você APAGA a parcela local, também apaga na API */
(function(){
  const _origExcluir = (typeof excluirParcela === 'function') ? excluirParcela : null;
  if (!_origExcluir) return;

  window.excluirParcela = async function(parcelaId){
    const ok = await _origExcluir.apply(this, arguments);
    try{ await __remoteExcluirParcela(parcelaId); }catch(e){}
    return ok;
  };
})();

// === FIM PATCH FF-1 =======================================================
// === PATCH FF-R2 — imprimir preview SEM 'els' ===
(() => {
  const btn  = document.getElementById('rbImprimir') 
            || document.querySelector('[data-comprovante-imprimir]');
  const prev = document.getElementById('rbPreview') 
            || document.querySelector('[data-comprovante-preview]');
  if (!btn || !prev) return;
  if (btn.__boundPrint) return; btn.__boundPrint = true;

  btn.addEventListener('click', () => {
    const html = String(prev.innerHTML || '').trim();
    if (!html){ alert('Nada para imprimir.'); return; }
    const w = window.open('about:blank','_blank','noopener');
    if (w && w.document){
      w.document.open('text/html');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title>
<style>@page{size:A4;margin:15mm}body{font-family:Inter,Arial,sans-serif}</style>
</head><body>${html}</body></html>`);
      w.document.close();
      // opcional: w.print();
    }
  });
})();

// === PATCH FF-R3 — WhatsApp SEM 'els' (usa abrirWhatsAppDoEvento se existir) ===
(() => {
  const btnWhats = document.getElementById('rbWhats') 
                || document.querySelector('[data-comprovante-whats]');
  if (!btnWhats) return;
  if (btnWhats.__boundWhats) return; btnWhats.__boundWhats = true;

  btnWhats.addEventListener('click', () => {
    try{
      const evId = (typeof __evId==='function') ? __evId()
                  : (new URLSearchParams(location.search).get('id') || window.eventoId || '');
      const eventos = (typeof readLS==='function') ? readLS('eventos',[]) : [];
      const ev = (eventos||[]).find(e => String(e.id)===String(evId)) || {};
      const selPago = document.getElementById('rbSelecaoPago') || document.querySelector('[data-comprovante-parcela]');
      const partes = (typeof getParcelasDoEvento==='function') ? getParcelasDoEvento(evId) : [];
      const par = partes.find(p => String(p.id)===String(selPago?.value||''));
      if (!par){ alert('Pagamento não encontrado.'); return; }
      const vars = (typeof buildVarsRecibo==='function') ? buildVarsRecibo(ev, par) : { evento:ev, parcela:par };
      if (typeof abrirWhatsAppDoEvento==='function') abrirWhatsAppDoEvento(ev, vars);
      else alert('Envio por WhatsApp não configurado.');
    }catch(e){
      console.warn('WhatsApp handler falhou:', e);
      alert('Não foi possível preparar o WhatsApp agora.');
    }
  });
})();

  // ======= RENDER TABELA (override compat) =======
  function renderTabelaFE() {
    const tb = $('#tbLancs');
    if (!tb) return;

    const esc = s => String(s ?? '').replace(/[&<>"']/g, m => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
    ));
    const partes = __getParcelasDoEvento().map(p => { 
      const tipo = String(p?.lanc?.tipo || p?.tipo || 'entrada').toLowerCase();
      const ven  = (p.vencimentoISO || p.vencimento || p.dataVenc || p.data || '')?.toString()?.slice(0,10);
      const desc = (p.descricao && String(p.descricao).trim()!=='') ? p.descricao : (p.lanc?.descricao || '');
      const num  = p.numero || p.parcelaNumero || 1;
      const de   = p.total || p.totalParcelas || p.parcelas || p.qtd || 1;
      const st   = String(p.status||'pendente').toLowerCase();
      return {
        id: p.id,
        lancId: p.lancamentoId,
        tipo, ven, desc,
        valor: _valorParcela(p),
        meio:  _meioParcela(p),
        num, de, st,
        _p: p
      };
    });

    partes.sort((a,b)=> String(a.ven||'').localeCompare(String(b.ven||'')));

    if (!partes.length) {
      tb.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center">Nenhum lançamento deste evento.</td></tr>`;
      try { window.lucide?.createIcons?.(); } catch {}
      return;
    }

    const hoje = todayISO();
    tb.innerHTML = '';

    for (const r of partes) {
      let tagClass, tagLabel;
      if (r.st==='pago' || r.st==='recebido') {
        tagClass='ok';   tagLabel=(r.tipo==='entrada'?'RECEBIDO':'PAGO');
      } else if (r.ven && r.ven < hoje) {
        tagClass='late'; tagLabel='PENDENTE (ATRASO)';
      } else {
        tagClass='wait'; tagLabel=(r.tipo==='entrada'?'RECEBER':'PAGAR');
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.tipo==='entrada'?'Entrada':'Saída'}</td>
        <td>${(function(d){ if(!d) return '—'; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`;
 })(r.ven)}</td>
        <td>${esc(r.desc||'-')}</td>
        <td style="text-align:right">${BRL(r.valor)}</td>
        <td>${r.num}/${r.de}</td>
        <td><span class="tag ${tagClass}">${tagLabel}</span></td>
        <td>${esc(r.meio||'-')}</td>
        <td class="acoes">
          <!-- lápis da PARCELA -->
          <button class="btn-chip icon-only" title="Editar parcela"
                  data-act="edit-parc" data-parc="${r.id}">
            <i data-lucide="pencil"></i>
          </button>

          <!-- (opcional) lápis do LANÇAMENTO inteiro -->
         
          <!-- excluir -->
          <button class="btn-chip icon-only delete" title="Excluir"
                  data-act="del" data-lanc="${r.lancId}" data-parc="${r.id}">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;

      // editar parcela -> FinModal
      tr.querySelector('[data-act="edit-parc"]')?.addEventListener('click', () => {
        try { window.FinModal?.ensureModal?.(); } catch {}
        if (window.FinModal?.openEditarParcela) {
          window.FinModal.openEditarParcela(r.id);
        } else if (window.FinModal?.openEditar) {
          window.FinModal.openEditar(r.lancId);
        }
      });

          // excluir (parcela + limpa movimento + apaga lançamento vazio)
      tr.querySelector('[data-act="del"]')?.addEventListener('click', () => {
        if (!confirm('Excluir este lançamento/parcela?')) return;
        const FG = _ensureFG(_fgLoad());

        // remove parcela
        FG.parcelas = (FG.parcelas||[]).filter(p => String(p.id)!==String(r.id));
        // remove lanc se ficou sem parcela
        const aindaTem = (id)=> (FG.parcelas||[]).some(p => String(p.lancamentoId)===String(id));
        FG.lancamentos = (FG.lancamentos||[]).filter(l => String(l.id)!==String(r.lancId) || aindaTem(l.id));

        // remove movimento contábil
        const refKey = `lanc:${r.lancId}:parc:${r.id}`;
        FG.movimentos = (FG.movimentos||[]).filter(m => String(m.refKey)!==String(refKey));

        _fgSave(FG);
        try { __recomputeAllAccountBalances?.(); } catch {}
        try { window.recomputeAllAccountBalances?.(); } catch {}
// === INÍCIO PATCH FF-1 (espelho delete) ===
try {
  // espelha a exclusão no backend real
  if (typeof __remoteExcluirParcela === 'function') {
    __remoteExcluirParcela(String(r.id));
  }
} catch(e) {
  console.warn('[FF-1] espelho delete (API) falhou:', e);
}
// === FIM PATCH FF-1 ===

        renderTabelaFE();
        try { atualizarKPIs_FE(); } catch {}
      });

      tb.appendChild(tr);
    }

    try { window.lucide?.createIcons?.(); } catch {}
  }

  // ======= KPIs simples (tolerante à ausência de elementos) =======
  function atualizarKPIs_FE(){
    const partes = __getParcelasDoEvento();
    let entPrev=0, entRec=0, saiPrev=0, saiPago=0;
    const isQuit = (s)=>['pago','recebido','baixado','quitado','liquidado','parcial'].includes(String(s||'').toLowerCase());
    for (const p of partes){
      const tipo = String(p?.lanc?.tipo || p?.tipo || 'entrada').toLowerCase();
      const v = _valorParcela(p);
      if (tipo==='entrada'){ entPrev+=v; if (isQuit(p.status)) entRec+=v; }
      else                 { saiPrev+=v; if (isQuit(p.status)) saiPago+=v; }
    }
    const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = BRL(val); };
    set('kEntPrev', entPrev);
    set('kEntRec',  entRec);
    set('kEntFalta', Math.max(0, entPrev-entRec));
    set('kSaiPrev', saiPrev);
    set('kSaiPago', saiPago);
    set('kSaiFalta', Math.max(0, saiPrev-saiPago));
    // Lucros se existirem elementos correspondentes
    const contratoTxt = document.getElementById('kContrato')?.textContent || '0';
    const contratoNum = Number(String(contratoTxt).replace(/[R$\.\s]/g,'').replace(',','.'))||0;
    set('kLucPrev', Math.max(0, contratoNum - saiPrev));
    set('kLucReal', Math.max(0, entRec - saiPago));
  }

  // ======= Refresh geral (coexistindo com funções já existentes) =======
  function refreshFE(){
    // chama suas funções se existirem
    try{ window.carregarEvento?.(); }catch{}
    try{ window.carregarEstimativa?.(); }catch{}
    try{ window.atualizarKPIs?.(); }catch{}
    // garante a nossa renderização estável
    try{ renderTabelaFE(); }catch{}
    try{ atualizarKPIs_FE(); }catch{}
    // publica snapshot p/ outras telas (emite ping)
    try {
      const FG = _ensureFG(_fgLoad());
      _fgSave(FG);
    } catch {}
    try { window.lucide?.createIcons?.(); } catch {}
  }

  // Expor overrides/aglutinadores (força usar as versões estáveis do FE_FIXPACK)
if (typeof window.getParcelasDoEvento !== 'function') {
  window.getParcelasDoEvento = __getParcelasDoEvento;
}
window.renderTabela        = renderTabelaFE;      // garante nossa tabela estável


  // ciclo
  try{ refreshFE(); }catch{}
  window.addEventListener('pageshow', refreshFE);
  document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible') refreshFE(); });
  window.addEventListener('storage', (e)=>{
    if (e.key==='financeiroGlobal' || e.key==='financeiroGlobal:ping') refreshFE();
  });
  window.addEventListener('finmodal:confirm', refreshFE);
})();
/* === HOTFIX: abrir modal "Novo Lançamento" com lazy-load e fallback === */
(() => {
  'use strict';

  // Resolve o ID do evento do mesmo jeito do resto da página
  function __getEvId() {
    try {
      const id = new URLSearchParams(location.search).get('id') ||
                 localStorage.getItem('eventoSelecionado') || '';
      if (id) localStorage.setItem('eventoSelecionado', String(id));
      return id;
    } catch { return ''; }
  }

  // Carrega financeiro-modal.js se ainda não estiver disponível
  function lazyLoadFinModal(src = 'financeiro-modal.js') {
    return new Promise((resolve, reject) => {
      if (window.FinModal) return resolve();
      // já tentando carregar?
      const existing = document.querySelector('script[data-finmodal]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Falha ao carregar o modal')));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      s.dataset.finmodal = '1';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Não foi possível carregar: ' + src));
      document.head.appendChild(s);
    });
  }

  // Abre o modal (com garantias)
  async function abrirNovoLancamento() {
    try {
      await lazyLoadFinModal();                      // garante que o arquivo foi carregado
      try { window.FinModal?.ensureModal?.(); } catch (_) {}  // garante o DOM do modal
      const eventoId = __getEvId();
      if (typeof window.FinModal?.openNovo === 'function') {
        window.FinModal.openNovo({
          eventoId: String(eventoId || ''),
          preferTipo: 'entrada',
          escopo: 'empresa'
        });
      } else if (typeof window.FinModal?.open === 'function') {
        // fallback para implementações antigas
        window.FinModal.open({ modo: 'novo', eventoId: String(eventoId || '') });
      } else {
        alert('Modal financeiro carregado, mas a função openNovo não foi encontrada.');
      }
    } catch (err) {
      console.error('Falha ao abrir o modal de novo lançamento:', err);
      alert('Não consegui abrir o modal de lançamento. Verifique se "financeiro-modal.js" está acessível.');
    }
  }

  // 1) Clique direto no #btnNovo (se existir)
  const btn = document.getElementById('btnNovo');
  if (btn && !btn.__finNovoBound) {
    btn.__finNovoBound = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      abrirNovoLancamento();
    });
  }

  // 2) Delegação global: qualquer elemento com data-open="novo-lanc"
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-open="novo-lanc"]');
    if (!el) return;
    e.preventDefault();
    abrirNovoLancamento();
  });

  // 3) Atalho por teclado (opcional): N abre “Novo Lançamento” se a página estiver focada
  document.addEventListener('keydown', (e) => {
    if (e.key?.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // evita em inputs/textareas
      const t = (e.target && e.target.tagName || '').toLowerCase();
      if (t === 'input' || t === 'textarea' || t === 'select' || e.isComposing) return;
      abrirNovoLancamento();
    }
  });
})();
// === ETAPA B (Financeiro do Evento) — Novo Lançamento + Re-render ===
// Cole NO FINAL de financeiro-evento.js (depois de definir/chamar render())

(function wireNovoLancFinanceiroEvento(){
  if (window.__wiredNovoLancFinanceiroEvento) return;
  window.__wiredNovoLancFinanceiroEvento = true;

  // Garante que o modal esteja disponível (não quebra se não existir)
  try { window.FinModal?.ensureModal?.(); } catch {}

  // Botão "Novo lançamento" dentro do Financeiro do Evento
  const btn = document.getElementById('btnNovo');
  if (btn && !btn.__fin_wired) {
    btn.addEventListener('click', () => {
      const eventoId = new URLSearchParams(location.search).get('id')
                    || localStorage.getItem('eventoSelecionado') || '';
      window.FinModal?.openNovo?.({
        preferTipo: 'entrada',   // ajuste para 'saida' se quiser
        escopo: 'empresa',
        eventoId
      });
    });
    btn.__fin_wired = true;
  }

  // Re-render quando salvar pelo modal / store mudar
  window.addEventListener('finmodal:confirm',  () => { try { render?.(); } catch {} });
  window.addEventListener('fin-store-changed', () => { try { render?.(); } catch {} });
})();
// === ETAPA C2 — editar PARCELA via modal (financeiro do evento) ===
(() => {
  if (window.__wiredEditParcelaEvento) return;
  window.__wiredEditParcelaEvento = true;

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest?.('[data-edit-parcela-id]');
    if (!a) return;
    ev.preventDefault?.();
    const parcelaId = a.getAttribute('data-edit-parcela-id');
    window.FinModal?.openEditarParcela?.(parcelaId);
  });
})();
