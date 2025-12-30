// === FG Store Helpers (únicos) ===
// Coloque este bloco uma única vez no projeto.
// Ele padroniza leitura/gravação e o broadcast de mudanças do FG.

if (!window.readFG || !window.writeFG) {
  window.readFG = function(){
    try { return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}')||{}; } catch { return {}; }
  };
  window.writeFG = function(g){
    try{
      localStorage.setItem('financeiroGlobal', JSON.stringify(g));
      localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
    }catch{}
    window.emitFGChange('writeFG');
  };
  window.emitFGChange = function(from=''){
    try { window.dispatchEvent(new CustomEvent('fin-store-changed',{detail:{from}})); } catch {}
    try { const bc = new BroadcastChannel('mrubuffet'); bc.postMessage({type:'fin-store-changed',from,ts:Date.now()}); bc.close?.(); } catch {}
  };
  window.onFGChange = function(cb){
    window.addEventListener('fin-store-changed', cb);
    window.addEventListener('storage', (ev)=>{
      if (ev.key==='financeiroGlobal' || ev.key==='financeiroGlobal:ping') cb(ev);
    });
    try {
      const bc = new BroadcastChannel('mrubuffet');
      bc.onmessage = (msg)=>{ if (msg?.data?.type==='fin-store-changed') cb(msg); };
    } catch {}
  };
}
// === ONLINE SYNC: carregar financeiroGlobal a partir da API (M36) ===
// Esta função será o "ponto único" para puxar dados do backend
// e atualizar o snapshot financeiroGlobal no navegador.
export async function finSyncFromApi(){
  // Se não tiver handleRequest disponível, mantém modo antigo (100% local)
  if (typeof window === 'undefined' || typeof window.handleRequest !== 'function') {
    try { return window.readFG(); } catch { return {}; }
  }

  try {
    // 1) Buscar lançamentos no backend (/fin/lancamentos)
    const respLanc = await window.handleRequest('/fin/lancamentos', {
      method: 'GET'
    });

    const lancs = Array.isArray(respLanc?.data)
      ? respLanc.data
      : [];

    // 2) Buscar parcelas no backend (/fin/parcelas)
    const respParc = await window.handleRequest('/fin/parcelas', {
      method: 'GET'
    });

    const parcs = Array.isArray(respParc?.data)
      ? respParc.data
      : [];

    // 3) Montar novo snapshot financeiroGlobal
    const atual = (typeof window.readFG === 'function') ? (window.readFG() || {}) : {};
    const novoFG = {
      ...atual,
      lancamentos: lancs,
      parcelas: parcs
    };

   // Dentro de finSyncFromApi, na parte que grava o snapshot:
if (typeof window.writeFG === 'function') {
  // marca que esta gravação veio da API, para não disparar sync de volta
  window.__finSyncingFromApi = true;
  try {
    window.writeFG(novoFG);
  } finally {
    window.__finSyncingFromApi = false;
  }
} else {
  try { localStorage.setItem('financeiroGlobal', JSON.stringify(novoFG)); } catch {}
}


    return novoFG;
  } catch (e) {
    console.warn('[finSyncFromApi] erro ao sincronizar com backend:', e);
    try { return window.readFG(); } catch { return {}; }
  }
}

// (Opcionalmente expomos no window para telas não-modulares)
try {
  window.finSyncFromApi = window.finSyncFromApi || finSyncFromApi;
} catch {}

/* ====== [C1 BLOCK] Helpers unificados de FIN (moeda + tipo) ====== */
/* Não remova: usado por modal, lançamentos, evento e relatórios.    */

// 1) Formatação BRL única (exibir)
(function ensureFmtBRL(){
  try {
    if (!window.fmtBRL) {
      window.fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    }
  } catch {
    window.fmtBRL = { format(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); } };
  }
})();

// 2) Parse seguro BR/PT → Number (reais) e → centavos (inteiro)
export function parseBR(v){
  if (v == null) return 0;
  let s = String(v).trim().replace(/[\sR$\u00A0]/gi, '');
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
export function toCentsSafe(v){
  const n = Number(parseBR(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

// 3) Normalização canônica de tipo (aceita variações)
export function normalizeTipoLanc(t){
  const v = String(t || '').trim().toLowerCase();
  if (v === 'receita' || v === 'entrada' || v === 'receber') return 'entrada';
  if (v === 'despesa' || v === 'saida'   || v === 'pagar')   return 'saida';
    return ''; // não adivinhar “entrada” se não reconheceu

}

// 4) Bridge no window para telas antigas (sem import)
(function bridgeWindow(){
  try { if (!window.normalizeTipoLanc) window.normalizeTipoLanc = normalizeTipoLanc; } catch {}
  try { if (!window.toCentsSafe)       window.toCentsSafe       = toCentsSafe; } catch {}
  try { if (!window.parseBR)           window.parseBR           = parseBR; } catch {}
})();
/* =================== FINANCEIRO SHARED (M14/M36) =================== */
/* Cole este arquivo inteiro (substitui tudo).                          */

/* ========= Chaves do "banco" local (legado/eventos) ========= */
export const FIN_EVENTOS_KEY     = 'fin_eventos';
export const FIN_LANCAMENTOS_KEY = 'fin_lancamentos';

/* ========= IO helpers (genéricos) ========= */
export function readLS(key){
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}
export function writeLS(key, val){
  localStorage.setItem(key, JSON.stringify(val || []));
}

/* ========= Normalização de moeda → centavos (inteiro) ========= */
export function toCents(v){
  try {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return Math.round(v * 100);
    // string com vírgula/ponto
    const s = String(v).replace(/[^\d,.-]/g,'').replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n*100) : 0;
  } catch { return 0; }
}

/* ========= Status canônicos (legado) ========= */
export const STATUS_LANC = {
  PENDENTE: 'pendente',
  BAIXADO:  'baixado',
  CANCEL:   'cancelado'
};

/* ========= Monta lançamento (legado, a partir de parcela de evento) ========= */
export function buildLancamentoFromParcela(evento, parcela){
  // tipo: 'receber' (cliente paga) | 'pagar' (custo/fornecedor)
  const tipo = (String(parcela?.tipo || 'receber').toLowerCase() === 'pagar') ? 'pagar' : 'receber';
  const valorCentavos = toCents(parcela?.valor);
  const status = parcela?.baixada ? STATUS_LANC.BAIXADO : STATUS_LANC.PENDENTE;

  return {
    // IDs e rastros
    id: parcela?.lancamentoId || (crypto.randomUUID?.() || String(Date.now()+Math.random())),
    parcelaId: String(parcela?.id || ''),
    idEvento:  String(evento?.id || ''),
    nomeEvento: String(evento?.nome || evento?.titulo || evento?.nomeEvento || ''),

    // dados financeiros
    tipo,                               // 'receber'|'pagar'
    valorCentavos,                      // inteiro (centavos)
    categoria: String(parcela?.categoria || ''), // opcional
    status,                             // 'pendente'|'baixado'|'cancelado'
    vencimento: String(parcela?.vencimento || ''), // 'AAAA-MM-DD'
    baixaTs: parcela?.baixada ? (parcela?.baixaTs || Date.now()) : null,

    // anexos/comprovantes
    anexos: Array.isArray(parcela?.anexos) ? parcela.anexos : []
  };
}

/* ========= Evento global de sincronização entre telas ========= */
const FIN_EVENT = 'fin-store-changed';
export function emitFinStoreChanged(reason, payload = {}){
  try {
    window.dispatchEvent(new CustomEvent(FIN_EVENT, { detail: { reason, ...payload }}));
  } catch {}
  try {
    const bc = new BroadcastChannel('fin-bus');
    bc.postMessage({ reason, ...payload, ts: Date.now() });
    bc.close();
  } catch {}
}
export function onFinStoreChanged(fn){
  window.addEventListener(FIN_EVENT, (ev)=> fn(ev.detail||{}));
}

/* ========= Camada única para Lançamentos (chave LC_KEY) =========
   TODAS as telas que usam este storage devem importar estes métodos.
*/
const LC_KEY = 'financeiro.lancamentos';

// Utilitários
const moneyToNumber = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
};
const uuid = () => crypto.randomUUID?.() || ('id_'+Math.random().toString(36).slice(2,10));

const normalize = (l) => {
  // Campos mínimos padronizados
  const out = {
    id: l.id || uuid(),
    tipo: l.tipo === 'receita' ? 'receita' : 'despesa', // receita|despesa
    descricao: l.descricao?.trim() || '',
    categoria: l.categoria?.trim() || '',
    origem: (l.origem === 'pessoal' ? 'pessoal' : (l.origem === 'empresa' ? 'empresa' : 'empresa')),
    conta: l.conta || l.fornecedor || '',
    fornecedor: l.fornecedor || '',
    valor: moneyToNumber(l.valor),
    status: l.status === 'baixado' ? 'baixado' : 'pendente', // pendente|baixado
    data: (l.data || new Date().toISOString().slice(0,10)), // vencimento/competência
    dataCompetencia: l.dataCompetencia || l.data || new Date().toISOString().slice(0,10),
    dataBaixa: l.status === 'baixado' ? (l.dataBaixa || new Date().toISOString().slice(0,10)) : null,
    idEvento: l.idEvento || null,
    nomeEvento: l.nomeEvento || null,
    createdAt: l.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return out;
};

// Storage (LC_KEY)
function getAll() {
  try { return JSON.parse(localStorage.getItem(LC_KEY) || '[]'); }
  catch { return []; }
}
function setAll(list) {
  localStorage.setItem(LC_KEY, JSON.stringify(list || []));
  // dispara eventos de sync
  try { window.dispatchEvent(new CustomEvent('fin-store-changed')); } catch {}
}
function upsert(l) {
  const arr = getAll();
  const item = normalize(l);
  const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = { ...arr[i], ...item, updatedAt: new Date().toISOString() };
  else arr.push(item);
  setAll(arr);
  return item;
}
function removeById(id) {
  const arr = getAll().filter(x => x.id !== id);
  setAll(arr);
}
function setStatus(id, status) {
  const arr = getAll();
  const i = arr.findIndex(x => x.id === id);
  if (i < 0) return;
  arr[i].status = (status === 'baixado' ? 'baixado' : 'pendente');
  arr[i].dataBaixa = arr[i].status === 'baixado' ? (arr[i].dataBaixa || new Date().toISOString().slice(0,10)) : null;
  arr[i].updatedAt = new Date().toISOString();
  setAll(arr);
}
function byMonth(yyyy_mm) {
  return getAll().filter(m => (m.dataCompetencia || m.data || '').slice(0,7) === yyyy_mm);
}
function byEvento(idEvento) {
  return getAll().filter(m => m.idEvento === idEvento);
}

// Subscribe (render em outras telas quando algo muda)
function onChange(cb){
  window.addEventListener('fin-store-changed', cb);
  window.addEventListener('storage', (e)=>{ if (e.key === LC_KEY) cb(e); });
}

export {
  LC_KEY,
  getAll, setAll, upsert, removeById, setStatus,
  byMonth, byEvento,
  moneyToNumber, uuid, onChange
};
// ======================================================================
//  API Financeira (M36) – Escrita padrão (lançamentos e parcelas)
//  Objetivo: ter um único lugar para falar com /fin/lancamentos e
//  /fin/parcelas (POST/PUT/DELETE) e manter o financeiroGlobal em cache.
// ======================================================================

// helper simples para ler/escrever o FG local aqui dentro
function __finReadFGLocal(){
  try {
    if (typeof window !== 'undefined' && typeof window.readFG === 'function') {
      return window.readFG() || {};
    }
    return JSON.parse(localStorage.getItem('financeiroGlobal') || '{}') || {};
  } catch {
    return {};
  }
}

function __finWriteFGLocal(novo){
  try {
    if (typeof window !== 'undefined' && typeof window.writeFG === 'function') {
      // marca como “vindo da API” para o writeFG não disparar diff de novo
      window.__finSyncingFromApi = true;
      try {
        window.writeFG(novo);
      } finally {
        window.__finSyncingFromApi = false;
      }
    } else {
      localStorage.setItem('financeiroGlobal', JSON.stringify(novo || {}));
      localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
      try {
        window.dispatchEvent(new CustomEvent('fin-store-changed',{detail:{reason:'api-sync'}}));
      } catch {}
    }
  } catch (e) {
    console.warn('[apiFin] erro ao salvar FG local', e);
  }
}

// =========================== Lançamentos ===============================

async function apiFinUpsertLancamento(lanc){
  if (!lanc || typeof lanc !== 'object') {
    throw new Error('Lançamento inválido para apiFinUpsertLancamento');
  }

  let salvo = { ...lanc };

  // 1) Tenta salvar na API, se existir handleRequest
  if (typeof window !== 'undefined' && typeof window.handleRequest === 'function') {
    try {
      const temId  = !!salvo.id;
      const path   = temId
        ? `/fin/lancamentos/${encodeURIComponent(String(salvo.id))}`
        : `/fin/lancamentos`;
      const method = temId ? 'PUT' : 'POST';

      const resp = await window.handleRequest(path, {
        method,
        body: salvo
      });

      // ⚠️ Só usa resp.data se for OBJETO (JSON).
      // Se vier HTML/erro (string), ignora e mantém "salvo" como está.
      if (resp && resp.data && typeof resp.data === 'object') {
        salvo = resp.data;
      }
    } catch (e) {
      console.warn('[apiFinUpsertLancamento] falha na API, usando só local:', e);
    }
  }

  // 2) Espelha no financeiroGlobal local (cache)
  try {
    const fg    = __finReadFGLocal();
    const lista = Array.isArray(fg.lancamentos) ? [...fg.lancamentos] : [];
    const idStr = salvo.id != null ? String(salvo.id) : null;

    if (idStr) {
      const idx = lista.findIndex(x => String(x.id) === idStr);
      if (idx >= 0) {
        lista[idx] = { ...lista[idx], ...salvo };
      } else {
        lista.push(salvo);
      }
    } else {
      // se não tiver id, gera um fake local só pra manter coerência
      salvo.id = salvo.id || ('l_' + Math.random().toString(36).slice(2,10));
      lista.push(salvo);
    }

    const novoFG = { ...fg, lancamentos: lista };
    __finWriteFGLocal(novoFG);
  } catch (e) {
    console.warn('[apiFinUpsertLancamento] erro ao espelhar local:', e);
  }

  return salvo;
}

async function apiFinDeleteLancamento(lancId){
  if (!lancId) return false;
  const idStr = String(lancId);

  // 1) Tenta apagar na API
  if (typeof window !== 'undefined' && typeof window.handleRequest === 'function') {
    try {
      await window.handleRequest(`/fin/lancamentos/${encodeURIComponent(idStr)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('[apiFinDeleteLancamento] falha na API (seguindo com local):', e);
    }
  }

  // 2) Remove do FG local
  try {
    const fg    = __finReadFGLocal();
    const lista = Array.isArray(fg.lancamentos) ? fg.lancamentos : [];
    const nova  = lista.filter(x => String(x.id) !== idStr);
    const novoFG = { ...fg, lancamentos: nova };
    __finWriteFGLocal(novoFG);
  } catch (e) {
    console.warn('[apiFinDeleteLancamento] erro ao remover local:', e);
  }

  return true;
}

// ============================= Parcelas ================================

async function apiFinUpsertParcela(parc){
  if (!parc || typeof parc !== 'object') {
    throw new Error('Parcela inválida para apiFinUpsertParcela');
  }

  let salva = { ...parc };

  // 1) Tenta salvar na API
  if (typeof window !== 'undefined' && typeof window.handleRequest === 'function') {
    try {
      const temId  = !!salva.id;
      const path   = temId
        ? `/fin/parcelas/${encodeURIComponent(String(salva.id))}`
        : `/fin/parcelas`;
      const method = temId ? 'PUT' : 'POST';

      const resp = await window.handleRequest(path, {
        method,
        body: salva
      });

      // ⚠️ Só usa resp.data se for OBJETO.
      // Se vier HTML/erro (string), ignora e continua com "salva".
      if (resp && resp.data && typeof resp.data === 'object') {
        salva = resp.data;
      }
    } catch (e) {
      console.warn('[apiFinUpsertParcela] falha na API, usando só local:', e);
    }
  }

  // 2) Espelha no FG local
  try {
    const fg    = __finReadFGLocal();
    const lista = Array.isArray(fg.parcelas) ? [...fg.parcelas] : [];
    const idStr = salva.id != null ? String(salva.id) : null;

    if (idStr) {
      const idx = lista.findIndex(x => String(x.id) === idStr);
      if (idx >= 0) {
        lista[idx] = { ...lista[idx], ...salva };
      } else {
        lista.push(salva);
      }
    } else {
      salva.id = salva.id || ('p_' + Math.random().toString(36).slice(2,10));
      lista.push(salva);
    }

    const novoFG = { ...fg, parcelas: lista };
    __finWriteFGLocal(novoFG);
  } catch (e) {
    console.warn('[apiFinUpsertParcela] erro ao espelhar local:', e);
  }

  return salva;
}

async function apiFinDeleteParcela(parcelaId){
  if (!parcelaId) return false;
  const idStr = String(parcelaId);

  // 1) Tenta apagar na API
  if (typeof window !== 'undefined' && typeof window.handleRequest === 'function') {
    try {
      await window.handleRequest(`/fin/parcelas/${encodeURIComponent(idStr)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('[apiFinDeleteParcela] falha na API (seguindo com local):', e);
    }
  }

  // 2) Remove do FG local
  try {
    const fg    = __finReadFGLocal();
    const lista = Array.isArray(fg.parcelas) ? fg.parcelas : [];
    const nova  = lista.filter(x => String(x.id) !== idStr);
    const novoFG = { ...fg, parcelas: nova };
    __finWriteFGLocal(novoFG);
  } catch (e) {
    console.warn('[apiFinDeleteParcela] erro ao remover local:', e);
  }

  return true;
}
// Expor helpers financeiros no window para telas não-modulares
try {
  window.apiFinUpsertLancamento = apiFinUpsertLancamento;
  window.apiFinDeleteLancamento = apiFinDeleteLancamento;
  window.apiFinUpsertParcela    = apiFinUpsertParcela;
  window.apiFinDeleteParcela    = apiFinDeleteParcela;
} catch (e) {
  console.warn('[apiFin] não foi possível expor no window:', e);
}

/* ====================================================================
   ==================  HELPERS DE CARTÃO (ETAPA 3-A)  ==================
   ====================================================================

   Objetivo: padronizar a lógica de cartão de crédito:
   - identificar se uma conta é cartão
   - calcular 1º vencimento pela regra FECHAMENTO/VENCIMENTO
   - criar N parcelas PENDENTES de um lançamento no cartão
   - ler/gravar o "financeiroGlobal" (FG) que consolida lanc/parcelas/movimentos

   Esses helpers são exportados e também expostos em window.finCartao
   para uso em telas que não estejam rodando como ES Module.
-------------------------------------------------------------------- */

// --- Leitura/Gravação do Financeiro Global (FG) ---
function finCartaoReadFG(){
  try { return JSON.parse(localStorage.getItem('financeiroGlobal') || '{}') || {}; }
  catch { return {}; }
}
function finCartaoWriteFG(g){
  try {
    localStorage.setItem('financeiroGlobal', JSON.stringify(g || {}));
    // ping para re-render em outras abas / listeners
    localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
    try { window.dispatchEvent(new CustomEvent('fin-store-changed', { detail:{ reason:'fg-write' } })); } catch {}
  } catch {}
}

// --- Ler config (cartões/contas) ---
function finCartaoReadCfg(){
  try { return JSON.parse(localStorage.getItem('configFinanceiro') || '{}') || {}; }
  catch { return {}; }
}

// --- Conta é cartão? (usa configFinanceiro.contas[].tipo === 'cartao_credito') ---
function finCartaoIsContaCartao(contaId){
  const cfg = finCartaoReadCfg();
  const conta = (cfg.contas || []).find(c => String(c.id) === String(contaId));
  return !!(conta && String(conta.tipo || '') === 'cartao_credito');
}

// --- Clamp de data (31 → último dia do mês, etc.) ---
function __finCartaoSafeDate(y, m /*1-12*/, d){
  const last = new Date(y, m, 0).getDate();
  return new Date(y, m-1, Math.min(d, last));
}

// --- Primeiro vencimento conforme FECHAMENTO/VENCIMENTO ---
function finCartaoCalcPrimeiroVencimento(cartaoCfg, dataCompraISO){
  const isoBase = (dataCompraISO || new Date().toISOString().slice(0,10)) + 'T00:00:00';
  const dt = new Date(isoBase);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;

  const fechamento = Number(cartaoCfg?.fechamento || 0) || 0;
  const vencimento = Number(cartaoCfg?.vencimento || 0) || 0;

  let mesFatura = m, anoFatura = y;
  const dtFechEste = __finCartaoSafeDate(y, m, fechamento || 0);

  if (fechamento > 0 && dt > dtFechEste){
    // compra após o fechamento → vai pra próxima fatura
    const next = new Date(y, m, 1);
    anoFatura = next.getFullYear();
    mesFatura = next.getMonth() + 1;
  }

  const dtVenc = __finCartaoSafeDate(anoFatura, mesFatura, vencimento > 0 ? vencimento : 1);
  return dtVenc.toISOString().slice(0,10);
}

// --- Cria N parcelas PENDENTES para um lançamento no cartão ---
function finCartaoCriarParcelasDeCartao({ g, lanc, cartaoCfg, valorTotal, nParcelas = 1, dataCompraISO }){
  if (!g) g = finCartaoReadFG();

  // garante arrays-base
  g.lancamentos = Array.isArray(g.lancamentos) ? g.lancamentos : [];
  g.parcelas    = Array.isArray(g.parcelas)    ? g.parcelas    : [];
  g.movimentos  = Array.isArray(g.movimentos)  ? g.movimentos  : [];

  const baseVenc = finCartaoCalcPrimeiroVencimento(cartaoCfg || {}, dataCompraISO);
  const idLanc   = String(lanc.id || (crypto.randomUUID?.() || ('l_'+Math.random().toString(36).slice(2))));
  const vParc    = Math.round((Number(valorTotal || 0) / Math.max(1, nParcelas)) * 100) / 100;

  for (let i = 0; i < nParcelas; i++){
    const d = new Date(baseVenc + 'T00:00:00');
    d.setMonth(d.getMonth() + i);
    const vencISO = d.toISOString().slice(0,10);

    g.parcelas.push({
      id: (window.uid?.('p_') || ('p_'+Math.random().toString(36).slice(2))),
      lancamentoId: idLanc,
      contaId: String(lanc.contaId || ''),   // mantém o cartão no nível da parcela
      valor: vParc,
      vencimentoISO: vencISO,
      status: 'pendente',
      totalPago: 0
    });
  }

  return g;
}

/* ========= Exports dos helpers de Cartão ========= */
export {
  finCartaoReadFG,
  finCartaoWriteFG,
  finCartaoReadCfg,
  finCartaoIsContaCartao,
  finCartaoCalcPrimeiroVencimento,
  finCartaoCriarParcelasDeCartao
};

/* ========= also expose on window (para telas não-modulares) ========= */
try {
  window.finCartao = window.finCartao || {};
  window.finCartao.__fgLoad               = finCartaoReadFG;
  window.finCartao.__fgSave               = finCartaoWriteFG;
  window.finCartao.__cfg                  = finCartaoReadCfg;
  window.finCartao.isContaCartao          = finCartaoIsContaCartao;
  window.finCartao.calcPrimeiroVencimento = finCartaoCalcPrimeiroVencimento;
  window.finCartao.criarParcelasDeCartao  = finCartaoCriarParcelasDeCartao;
} catch {}
