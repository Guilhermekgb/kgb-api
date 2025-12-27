// ==== Compat sem ES Modules (evita "Cannot use import outside a module") ====
// Normalizador de tipo (se já existir global, mantém)
window.normalizeTipoLanc = window.normalizeTipoLanc || function (t) {
  let s = (t == null ? '' : String(t)).trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch {}
  if (s === 'receita') s = 'entrada';
  if (s === 'despesa') s = 'saida';
  if (s === 'e' || s === 'r') s = 'entrada';
  if (s === 's') s = 'saida';
  return (s === 'entrada' || s === 'saida') ? s : '';
};

// Parse "R$ 1.234,56" -> 1234.56
window.toCentsSafe = window.toCentsSafe || function (val) {
  if (val == null) return 0;
  let s = String(val).trim().replace(/[^\d.,-]/g, '');
  const hasComma = s.includes(','), hasDot = s.includes('.');
  let n = 0;
  if (hasComma && hasDot) {
    const decPos = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    const intPart = s.slice(0, decPos).replace(/[.,]/g, '');
    const decPart = s.slice(decPos + 1).replace(/[^\d]/g, '');
    n = Number(intPart + '.' + decPart) || 0;
  } else if (hasComma) {
    n = Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  } else {
    n = Number(s.replace(/,/g, '')) || 0;
  }
  return Math.round(n * 100); // em centavos
};

// Parse rápido BR -> número (ex.: "1.234,56")
window.parseBR = window.parseBR || function (s) {
  if (s == null) return 0;
  return (function (x) {
    x = String(x).trim().replace(/[^\d.,-]/g, '');
    if (x.includes(',') && x.includes('.')) {
      const decPos = Math.max(x.lastIndexOf(','), x.lastIndexOf('.'));
      const intPart = x.slice(0, decPos).replace(/[.,]/g, '');
      const decPart = x.slice(decPos + 1).replace(/[^\d]/g, '');
      return Number(intPart + '.' + decPart) || 0;
    }
    if (x.includes(',')) return Number(x.replace(/\./g, '').replace(',', '.')) || 0;
    return Number(x.replace(/,/g, '')) || 0;
  })(s);
};

// === financeiro-modal.js (c/ cobrança + regras de atraso + prévia + enviar ao salvar) ===

// Storage keys
// Storage keys
// --- Chave padrão do banco financeiro no localStorage ---
// Se outra página já exportou window.FG_KEY, reutiliza.
// Caso contrário, usa o padrão 'financeiroGlobal'.
const FG_KEY = (typeof window !== 'undefined' && typeof window.FG_KEY === 'string')
  ? window.FG_KEY
  : 'financeiroGlobal';

// (Opcional) expõe no window para padronizar entre páginas
try { if (typeof window !== 'undefined') window.FG_KEY = FG_KEY; } catch {}

const CFG_KEY = 'configFinanceiro';
const ATRASO_KEY = 'fin.cobranca.regras';


// helpers
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const uid = (p='id_') => (crypto.randomUUID?.() || (p + Math.random().toString(36).slice(2,10)));
const ISO = (d=new Date()) => new Date(d).toISOString().slice(0,10);


// Mostra "(n/de)" só quando AMBOS existem e são > 0
function formatParcelaBadge(p) {
  const n  = Number(p?.numero || p?.n || 0);
  const de = Number(p?.de || p?.totalParcelas || 0);
  return (n > 0 && de > 0) ? ` (${n}/${de})` : '';
}

// >>> cole abaixo de: const ISO = (d=new Date()) => ...
function fromISOlocal(s){
  const [Y,M,D] = String(s || '').split('-').map(Number);
  return new Date(Y, (M||1)-1, D||1);
}

const onlyDigits = (s='') => String(s).replace(/\D+/g,'');
const fmtBR = (v) => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2});

// === Helpers para categorias do formulário (modal) ===
function __getCFG(){ try{ return JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{}; }catch{ return {}; } }
function __popularCategoriasDoForm(tipoSel, escopoSel, root=document) {
const tRaw  = String(tipoSel || '').toLowerCase();
// [C1] usar normalizador canônico importado
const tNorm = normalizeTipoLanc(tRaw);
const t = tNorm || (tRaw.includes('sai') ? 'saida' : 'entrada');


   fillSelects({
    tipo:   t,
    escopo: escopoSel || 'empresa',
    root
  });
}
function getUsuariosVendedores() {
  try {
    const arr = JSON.parse(localStorage.getItem('usuarios') || '[]') || [];
    return arr.filter(u => String(u.perfil || '').toLowerCase() === 'vendedor');
  } catch {
    return [];
  }
}

// chama ao abrir o modal e sempre que Tipo/Escopo mudarem:
function __wireTipoEscopoDoForm(root=document){
  const elTipo   = root.querySelector('#f-tipo, [name="tipo"]');
  const elEscopo = root.querySelector('#f-escopo, [name="escopo"]');

  const apply = () => __popularCategoriasDoForm(
    elTipo?.value || 'entrada',
    elEscopo?.value || 'empresa',
    root
  );

  if (elTipo && !elTipo.__fin_wired)   { elTipo.addEventListener('change', apply);   elTipo.__fin_wired   = true; }
  if (elEscopo && !elEscopo.__fin_wired){ elEscopo.addEventListener('change', apply); elEscopo.__fin_wired = true; }

  apply();
}

// Lê o valor do select unificado de categoria ("cat:<id>" | "sub:<id>" | "")
function readCatSelection(){
  const v = document.getElementById('f-cat')?.value || '';
  if (!v) return { categoriaId: null, subcategoriaId: null };
  if (v.startsWith('sub:')) return { categoriaId: null, subcategoriaId: v.slice(4) };
  if (v.startsWith('cat:')) return { categoriaId: v.slice(4), subcategoriaId: null };
  return { categoriaId: v, subcategoriaId: null };
}

function toNumberInput(v){
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v || '').trim();

  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? (n / 100) : 0;
  }

  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function readLS(k, fb){ try{ return JSON.parse(localStorage.getItem(k)) ?? fb; }catch{ return fb; } }
function writeLS(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
function ping(){ try{ localStorage.setItem('financeiroGlobal:ping', String(Date.now())); }catch{} }

// Aviso padrão quando a conta (e/ou forma) está vazia.
function __maybeContaWarning({ exigeForma=false, onProceed, bypass=false } = {}){
  if (bypass) return false;

  const msgBase = exigeForma
    ? 'Este pagamento está marcado como "Pago", mas a CONTA e/ou a FORMA não foram informadas.\nDeseja salvar assim mesmo?'
    : 'Nenhuma CONTA foi informada para este lançamento.\nDeseja salvar assim mesmo?';

  if (typeof window.__openAvisoSemContaEvt === 'function'){
    window.__openAvisoSemContaEvt()
      .ok(() => { try{ onProceed?.(); }catch{} })
      .cancel(() => {});
    return true;
  }

  const ok = window.confirm(msgBase);
  if (ok) { try{ onProceed?.(); }catch{}; return true; }
  return true;
}

// banco principal
function readFG(){
  const g = readLS(FG_KEY, {});
  return { contas: [], lancamentos: [], parcelas: [], saldoPorConta: {}, ...g };
}

function writeFG(g){
  // snapshot ANTES da mudança (para comparar depois)
  let oldFG = {};
  try {
    oldFG = readFG() || {};
  } catch {
    oldFG = {};
  }

  let leve = stripComprovantes(g);
  // ...


  // --- NORMALIZA 'tipo' de todos os lançamentos ANTES de gerar movimentos
  try {
    (leve.lancamentos || []).forEach(l => {
    const norm = (typeof normalizeTipoLanc === 'function')
  ? normalizeTipoLanc(l?.tipo)
  : String(l?.tipo ?? '').toLowerCase();


      if (norm) {
        l.tipo = norm;
      } else {
        const cat = String(l?.categoriaNome || l?.categoria || '').toLowerCase();
        if (/despesa|custo|fornecedor|saida/.test(cat))      l.tipo = 'saida';
        else if (/receita|entrada|venda/.test(cat))          l.tipo = 'entrada';
        else                                                 l.tipo = '';
      }
    });
  } catch {}

  // salva (leve) já normalizado
  try {
    localStorage.setItem(FG_KEY, JSON.stringify(leve));
  } catch (e) {
    try {
      (leve.lancamentos || []).forEach(l => {
        if (l && l.comprovante && l.comprovante !== "[separado]") {
          saveComprovanteSeparado(l.id, String(l.comprovante));
          l.comprovante = "[separado]";
          l.hasComprovante = true;
        }
      });
      localStorage.setItem(FG_KEY, JSON.stringify(leve));
    } catch (e2) {
      alert("Seu histórico financeiro ficou muito grande para o navegador. Remova anexos grandes ou limpe lançamentos antigos.");
      console.error("QuotaExceeded ao salvar FG:", e2);
      return;
    }
  }

  // ping + espelho
  try { ping(); mirrorToM14(leve); } catch {}

   // === Rebuild de movimentos + saldos, SEM depender de outras páginas ===
  try {
    // 1) garantir arrays + merge de contas do config
    const cfg = (function(){ try{ return JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{}; }catch{return {}} })();
    leve.contas     = Array.isArray(leve.contas)     ? leve.contas     : [];
    leve.lancamentos= Array.isArray(leve.lancamentos)? leve.lancamentos: [];
    leve.parcelas   = Array.isArray(leve.parcelas)   ? leve.parcelas   : [];
    leve.movimentos = Array.isArray(leve.movimentos) ? leve.movimentos : [];

    const mapContas = new Map();
    // contas já existentes no FG
    for (const c of leve.contas) {
      const id = String(c.id);
      mapContas.set(id, { id, nome: c.nome||'', saldoInicial: Number(c.saldoInicial||0), saldoAtual: Number(c.saldoInicial||0) });
    }
    // contas do config (caso não estejam no FG)
    const cfgContas = Array.isArray(cfg.contas) ? cfg.contas : [];
    for (const c of cfgContas) {
      const id = String(c.id);
      if (!mapContas.has(id)) {
        mapContas.set(id, { id, nome: (c.nome||c.descricao||''), saldoInicial: Number(c.saldoInicial||c.saldo||0), saldoAtual: Number(c.saldoInicial||c.saldo||0) });
      }
    }

    // 2) (re)gerar movimentos a partir do estado atual:
    //    - parcelas quitadas (pago/recebido/baixado/quitado/liquidado/parcial)
    //    - lançamentos "full" quitados sem parcelas
    const quitados = new Set(['pago','recebido','baixado','quitado','liquidado','parcial']);
    const byLanc = new Map(leve.lancamentos.map(l => [String(l.id), l]));
    const novosMovs = [];

    // 2a) parcelas → movimentos
    for (const p of leve.parcelas) {
      const l = byLanc.get(String(p.lancamentoId));
      if (!l) continue;
      const st = String(p.status||'').toLowerCase();
      if (!quitados.has(st)) continue;

      const contaId = String(p.contaId ?? l.contaId ?? '');
      if (!contaId) continue;

      const valorPago = Number(p.totalPago ?? p.valor ?? 0);
      if (!valorPago) continue;

      const tipoMov = (String(l.tipo||'').toLowerCase() === 'entrada') ? 'credito' : 'debito';
      const dataISO = String(p.dataPagamentoISO || l.dataPagamentoISO || p.vencimentoISO || l.dataISO || new Date().toISOString().slice(0,10)).slice(0,10);

      novosMovs.push({
        id: (Date.now().toString(36) + Math.random().toString(36).slice(2,10)),
        refKey: `parc:${p.id}`,
        origem: 'parcela',
        lancamentoId: String(l.id),
        parcelaId: String(p.id),
        contaId,
        contaNome: String(p.contaNome || l.contaNome || ''),
        tipo: tipoMov,
        valor: valorPago,
        dataISO
      });
    }

    // 2b) lançamentos "full" quitados sem parcelas → um movimento único
    for (const l of leve.lancamentos) {
      const st = String(l.status||'').toLowerCase();
      const hasParcelas = leve.parcelas.some(pp => String(pp.lancamentoId) === String(l.id));
      if (hasParcelas) continue; // já cobrimos acima
      if (!quitados.has(st)) continue;

      const contaId = String(l.contaId || '');
      if (!contaId) continue;

      const valor = Number(l.valorTotal ?? l.valor ?? 0);
      if (!valor) continue;

      const tipoMov = (String(l.tipo||'').toLowerCase() === 'entrada') ? 'credito' : 'debito';
      const dataISO = String(l.dataPagamentoISO || l.dataCompetencia || l.dataISO || new Date().toISOString().slice(0,10)).slice(0,10);

      novosMovs.push({
        id: (Date.now().toString(36) + Math.random().toString(36).slice(2,10)),
        refKey: `lanc:${l.id}:full`,
        origem: 'lancamento',
        lancamentoId: String(l.id),
        parcelaId: '',
        contaId,
        contaNome: String(l.contaNome || ''),
        tipo: tipoMov,
        valor,
        dataISO
      });
    }

    // mantém apenas 1 movimento por refKey (evita duplicar em edições)
    const movPorRef = new Map();
    for (const m of novosMovs) movPorRef.set(m.refKey, m);
    leve.movimentos = Array.from(movPorRef.values());

    // 3) recomputar saldos: saldoInicial + (créditos - débitos)
    // zera saldoAtual e re-soma pelos movimentos
    for (const c of mapContas.values()) c.saldoAtual = Number(c.saldoInicial||0);

    for (const m of leve.movimentos) {
      const c = mapContas.get(String(m.contaId));
      if (!c) continue;
      const v = Number(m.valor||0);
      if (String(m.tipo) === 'credito') c.saldoAtual += v;
      else if (String(m.tipo) === 'debito') c.saldoAtual -= v;
    }

    // salvar contas consolidadas + espelho saldoPorConta
    leve.contas = Array.from(mapContas.values());
    leve.saldoPorConta = {};
    for (const c of leve.contas) leve.saldoPorConta[c.id] = Number(c.saldoAtual||0);

    // persistir resultado + ping + broadcast
    try {
      localStorage.setItem(FG_KEY, JSON.stringify(leve));
      localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
    } catch {}

    try {
      // evento interno + BroadcastChannel já são escutados pelo Resumo
      window.dispatchEvent(new CustomEvent('fin-store-changed'));
      const bc = new BroadcastChannel('mrubuffet');
      bc.postMessage({ type: 'fin-store-changed', at: Date.now() });
      bc.close?.();
    } catch {}

  } catch(e) {
    console.warn('[FG] Rebuild de movimentos/saldos falhou, mas o lançamento foi salvo:', e);
  }
    // === NOVO: sincronizar diferenças com o backend (M36) ===
  try {
    // se a gravação veio de finSyncFromApi, não manda de volta pra API
    if (!window.__finSyncingFromApi) {
      syncFGDiffToApi(oldFG, leve);
    }
  } catch (e) {
    console.warn('[FG] Falha ao sincronizar com API:', e);
  }
}
// === NOVO: faz diff entre oldFG e newFG e chama a API (/fin/lancamentos e /fin/parcelas)
async function syncFGDiffToApi(oldFG, newFG){
  if (typeof window === 'undefined' || typeof window.handleRequest !== 'function') {
    // se ainda não estiver no modo online, não faz nada
    return;
  }

  const oldL = Array.isArray(oldFG?.lancamentos) ? oldFG.lancamentos : [];
  const newL = Array.isArray(newFG?.lancamentos) ? newFG.lancamentos : [];

  const oldP = Array.isArray(oldFG?.parcelas) ? oldFG.parcelas : [];
  const newP = Array.isArray(newFG?.parcelas) ? newFG.parcelas : [];

  const oldLById = new Map(oldL.map(l => [String(l.id), l]));
  const newLById = new Map(newL.map(l => [String(l.id), l]));

  const oldPById = new Map(oldP.map(p => [String(p.id), p]));
  const newPById = new Map(newP.map(p => [String(p.id), p]));

  const ops = [];

  // --- Lançamentos: creates/updates ---
  for (const [id, novo] of newLById.entries()){
    const prev = oldLById.get(id);
    if (!prev) {
      // criação
      ops.push({ entity:'lanc', method:'POST', id, body: novo });
    } else {
      // mudança de conteúdo?
      const prevStr = JSON.stringify(prev);
      const novoStr = JSON.stringify(novo);
      if (prevStr !== novoStr) {
        ops.push({ entity:'lanc', method:'PUT', id, body: novo });
      }
    }
  }

  // --- Lançamentos: deletes ---
  for (const [id, prev] of oldLById.entries()){
    if (!newLById.has(id)) {
      ops.push({ entity:'lanc', method:'DELETE', id });
    }
  }

  // --- Parcelas: creates/updates ---
  for (const [id, novo] of newPById.entries()){
    const prev = oldPById.get(id);
    if (!prev) {
      ops.push({ entity:'parc', method:'POST', id, body: novo });
    } else {
      const prevStr = JSON.stringify(prev);
      const novoStr = JSON.stringify(novo);
      if (prevStr !== novoStr) {
        ops.push({ entity:'parc', method:'PUT', id, body: novo });
      }
    }
  }

  // --- Parcelas: deletes ---
  for (const [id, prev] of oldPById.entries()){
    if (!newPById.has(id)) {
      ops.push({ entity:'parc', method:'DELETE', id });
    }
  }

  // Nada pra fazer?
  if (!ops.length) return;

  // === Dispara as operações na API, uma a uma (simples) ===
  for (const op of ops){
    const base = (op.entity === 'lanc') ? '/fin/lancamentos' : '/fin/parcelas';
    const url  = (op.method === 'POST')
      ? base
      : `${base}/${encodeURIComponent(op.id)}`;

    const req = {
      method: op.method
    };

    if (op.method !== 'DELETE') {
      req.body = op.body;
    }

    try {
      await window.handleRequest(url, req);
    } catch (e) {
      console.warn('[syncFGDiffToApi] erro em', op.method, url, e);
      // aqui eu não dou throw pra não travar a tela; só loga
    }
  }
}

function mirrorToM14(g){
  try{
    localStorage.setItem('m14.lancs', JSON.stringify(g.lancamentos||[]));
    localStorage.setItem('m14.parcelas', JSON.stringify(g.parcelas||[]));
  }catch{}
}
function recalcSaldos(g){
  const cfg = getCfg();
  const idsCfg = new Set((cfg.contas||[]).map(c=>String(c.id)));
  const map = new Map((g.contas||[]).map(c=>[String(c.id), c]));
  (cfg.contas||[]).forEach(ct=>{
    const id = String(ct.id);
    const cur = map.get(id) || { id, nome: ct.nome };
    cur.nome = ct.nome;
    cur.saldoInicial = Number(ct.saldo ?? cur.saldoInicial ?? 0) || 0;
    map.set(id, cur);
  });
  g.contas = Array.from(map.values()).filter(c=> idsCfg.has(String(c.id)));

  const base = {};
  (g.contas||[]).forEach(c=> base[String(c.id)] = Number(c.saldoInicial || 0));
  (g.movimentos||[]).forEach(m=>{
    const id = String(m.contaId||"");
    if (!id || !(id in base)) return;
    const v = Number(m.valor||0);
    if (String(m.tipo)==='credito') base[id] += v;
    else if (String(m.tipo)==='debito') base[id] -= v;
  });

  g.saldoPorConta = base;
}

// === garante que FG.contas espelha o config (nome + saldoInicial) ===
function ensureFgContasBaseline(g){
  if (!g || typeof g !== 'object') return;
  g.contas = Array.isArray(g.contas) ? g.contas : [];
  const cfg = (typeof getCfg === 'function') ? getCfg() : (function(){
    try{ return JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{}; }catch{ return {}; }
  })();

  const cfgContas = Array.isArray(cfg.contas) ? cfg.contas : [];
  const byId = new Map(g.contas.map(c => [String(c.id), c]));

  for (const ct of cfgContas){
    const id   = String(ct.id);
    const nome = String(ct.nome||'');
    const saldoInicial = Number(ct.saldo||0);
    if (byId.has(id)){
      const c = byId.get(id);
      c.nome = nome || c.nome || '';
      c.saldoInicial = saldoInicial;
      if (typeof c.saldoAtual !== 'number') c.saldoAtual = saldoInicial;
    } else {
      g.contas.push({ id, nome, saldoInicial, saldoAtual: saldoInicial });
    }
  }

  g.contas = g.contas.filter(c => cfgContas.some(ct => String(ct.id)===String(c.id)));
  g.saldoPorConta = {};
  for (const c of g.contas){ g.saldoPorConta[c.id] = Number(c.saldoAtual||c.saldoInicial||0); }
}

// config
function getCfg(){
  let cfg = readLS(CFG_KEY, null);
  if (!cfg || typeof cfg!=='object') cfg = { categorias:[], contas:[], cartoes:[], tipos:[] };
  cfg.categorias = Array.isArray(cfg.categorias) ? cfg.categorias : [];
  cfg.contas     = Array.isArray(cfg.contas)     ? cfg.contas     : [];
  cfg.cartoes    = Array.isArray(cfg.cartoes)    ? cfg.cartoes    : [];
  cfg.tipos      = Array.isArray(cfg.tipos)      ? cfg.tipos      : [];
  return cfg;
}
function getContas(){
  const cfg = getCfg();

  const bancos = (cfg.contas || []).map(c => ({
    id: c.id,
    nome: c.nome,
    tipo: 'conta_corrente',
    diaFechamento: null,
    diaVencimento: null
  }));

  const cartoes = (cfg.cartoes || []).map(k => ({
    id: k.id,
    nome: k.nome,
    tipo: 'cartao_credito',
    diaFechamento: (k.fechamento ?? null),
    diaVencimento: (k.vencimento ?? null)
  }));

 const map = new Map(); 
  [...bancos, ...cartoes].forEach(c => {
    if (c && c.id != null) map.set(String(c.id), c);
  });

  return Array.from(map.values())
    .sort((a, b) => String(a?.nome || "").localeCompare(String(b?.nome || "")));
}

function getFornecedores(){
  const keys = ['fornecedores','fornecedores.data',' fornecedores '];
  for (const k of keys){
    const v = readLS(k, null);
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.items)) return v.items;
  }
  return [];
}

// ===== Validators (CPF/CNPJ) =====
function validarCPF(cpfRaw){
  const cpf = onlyDigits(cpfRaw);
  if (!cpf || cpf.length!==11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum=0; for(let i=0;i<9;i++) sum+=parseInt(cpf[i])*(10-i);
  let d1=11-(sum%11); if(d1>=10) d1=0; if(d1!==parseInt(cpf[9])) return false;
  sum=0; for(let i=0;i<10;i++) sum+=parseInt(cpf[i])*(11-i);
  let d2=11-(sum%11); if(d2>=10) d2=0; return d2===parseInt(cpf[10]);
}
function validarCNPJ(cnpjRaw){
  const cnpj = onlyDigits(cnpjRaw);
  if (!cnpj || cnpj.length!==14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc=(base)=>{ let b=base.split('').map(Number); let w=[5,4,3,2,9,8,7,6,5,4,3,2]; if(b.length===13) w=[6,...w]; let s=0; for(let i=0;i<b.length;i++) s+=b[i]*w[i]; let r=s%11; return (r<2)?0:11-r; };
  const d1 = calc(cnpj.slice(0,12));
  const d2 = calc(cnpj.slice(0,12)+d1);
  return String(d1)===cnpj[12] && String(d2)===cnpj[13];
}
function tipoDocumento(doc){
  const d = onlyDigits(doc);
  if (d.length===11) return 'CPF';
  if (d.length===14) return 'CNPJ';
  return null;
}

// ===== Regras de atraso (carregar/salvar + cálculo) =====
function regrasDefault(){
  return {
    habilitado: true,
    toleranciaDias: 0,
    multaPercent: 2.0,
    jurosPercent: 1.0,
    jurosTipo: 'am',
    proRata: true
  };
}

function loadRegrasAtraso(){
  const r = readLS(ATRASO_KEY, {});
  return { 
    ...regrasDefault(), 
    ...(r || {}) 
  };
}

function saveRegrasAtraso(r){
  writeLS(ATRASO_KEY, { 
    ...loadRegrasAtraso(), 
    ...(r || {}) 
  });
}



// === Gerador de ID padronizado para lançamentos ===
function genLancId(eventoId) {
  const base = (typeof uid === "function") ? uid('l_') : ('l_' + Math.random().toString(36).slice(2,10));
  return eventoId ? `evt_${eventoId}_lanc_${base}` : base;
}

// ==== comprovantes separados (leve) ====
function saveComprovanteSeparado(lancId, base64) { if (!lancId || !base64) return; try { localStorage.setItem(`fg.comp:${lancId}`, base64); } catch {} }
function loadComprovanteSeparado(lancId) { try { return localStorage.getItem(`fg.comp:${lancId}`) || null; } catch { return null; } }
function saveParcelaComprovanteSeparado(parcelaId, base64) { if (!parcelaId || !base64) return; try { localStorage.setItem(`fg.comp.parc:${parcelaId}`, base64); } catch {} }
function loadParcelaComprovanteSeparado(parcelaId) { try { return localStorage.getItem(`fg.comp.parc:${parcelaId}`) || null; } catch { return null; } }
// ==== NOVO: helpers para enviar/remover comprovante de PARCELA no backend ====
// Usa a mesma window.handleRequest que o resto do sistema está usando.

window.apiFinUploadParcelaComprovante = async function (parcelaId, file) {
  try {
    if (!parcelaId || !file) return null;
    if (typeof window.handleRequest !== 'function') return null;

    const fd = new FormData();
    fd.append('file', file);

    const url = `/fin/parcelas/${encodeURIComponent(parcelaId)}/comprovante`;

    // IMPORTANTE: não definir manualmente o header "Content-Type".
    const resp = await window.handleRequest(url, {
      method: 'POST',
      body: fd
    });

    // backend retorna: { ok, url, tipo, dataUpload, userId, parcelaId }
    return resp || null;
  } catch (e) {
    console.warn('[apiFinUploadParcelaComprovante] erro:', e);
    return null;
  }
};

window.apiFinDeleteParcelaComprovante = async function (parcelaId) {
  try {
    if (!parcelaId) return null;
    if (typeof window.handleRequest !== 'function') return null;

    const url = `/fin/parcelas/${encodeURIComponent(parcelaId)}/comprovante`;
    const resp = await window.handleRequest(url, {
      method: 'DELETE'
    });
    return resp || null;
  } catch (e) {
    console.warn('[apiFinDeleteParcelaComprovante] erro:', e);
    return null;
  }
};

function stripComprovantes(g) {
  const G = g || {};
  const isB64 = (s) => typeof s === "string" && /^data:(image|application)\/[a-zA-Z0-9.+-]+;base64,/.test(s);

  function secarLanc(l) {
    if (!l) return;
    const campos = ["comprovante","comprovanteUrl","comprovanteURL","anexo","anexoUrl","anexoURL","arquivo","arquivoUrl","imagem","image"];
    for (const k of campos) {
      const v = l[k];
      if (isB64(v)) {
        try { saveComprovanteSeparado(l.id, v); } catch {}
        l.comprovante = "[separado]";
        l.hasComprovante = true;
        if (k !== "comprovante") delete l[k];
      } else if (!v) {
        try {
          if (loadComprovanteSeparado(l.id)) {
            l.comprovante = "[separado]";
            l.hasComprovante = true;
          }
        } catch {}
      }
    }
  }

  function secarParc(p) {
    if (!p) return;
    const campos = ["comprovante","comprovanteUrl","comprovanteURL","anexo","anexoUrl","anexoURL","arquivo","arquivoUrl","imagem","image"];
    for (const k of campos) {
      const v = p[k];
      if (isB64(v)) {
        try { saveParcelaComprovanteSeparado(p.id, v); } catch {}
        p.comprovante = "[separado]";
        p.hasComprovante = true;
        if (k !== "comprovante") delete p[k];
      } else if (!v) {
        try {
          if (loadParcelaComprovanteSeparado(p.id)) {
            p.comprovante = "[separado]";
            p.hasComprovante = true;
          }
        } catch {}
      }
    }
  }

  (G.lancamentos || []).forEach(secarLanc);
  (G.parcelas || []).forEach(secarParc);
  return G;
}

// ——— util de leitura de comprovantes ———
function __getComprovanteBase64ByLancId(lancId){
  try {
    const fg = (typeof readLS === 'function') ? readLS('financeiroGlobal', {}) : {};
    const l  = (fg.lancamentos || []).find(x => String(x.id) === String(lancId));
    if (!l) return null;
    const emb = (typeof l.comprovante === 'string' && l.comprovante && l.comprovante !== '[separado]') ? l.comprovante : null;
    if (emb) return emb;
    const sep = loadComprovanteSeparado(l.id);
    if (sep) return sep;
    const alt = [l.comprovanteUrl,l.comprovanteURL,l.anexo,l.anexoUrl,l.arquivo,l.arquivoUrl,l.imagem,l.image].filter(Boolean)[0];
    return alt || null;
  } catch { return null; }
}
function __getComprovanteBase64ByParcelaId(parcelaId){
  try {
    const fg = (typeof readLS === 'function') ? readLS('financeiroGlobal', {}) : {};
    const p  = (fg.parcelas || []).find(x => String(x.id) === String(parcelaId));
    if (!p) return null;

    const emb = (typeof p.comprovante === 'string' && p.comprovante && p.comprovante !== '[separado]') ? p.comprovante : null;
    if (emb) return emb;

    const sep = loadParcelaComprovanteSeparado(p.id);
    if (sep) return sep;

    const alt = [p.comprovanteUrl,p.comprovanteURL,p.anexo,p.anexoUrl,p.arquivo,p.arquivoUrl,p.imagem,p.image].filter(Boolean)[0];
    if (alt) return alt;

    return __getComprovanteBase64ByLancId(p.lancamentoId);
  } catch { return null; }
}

function calcEncargosAtraso(base, diasAtraso, R){
  const valor = Number(base||0);
  if (!R?.habilitado || !valor || diasAtraso<=0) return { multa:0, juros:0, total:valor };
  const multa = valor * (Number(R.multaPercent||0)/100);
  let juros = 0;
  if (String(R.jurosTipo||'am')==='ad'){
    juros = valor * (Number(R.jurosPercent||0)/100) * diasAtraso;
  } else {
    const diaria = (Number(R.jurosPercent||0)/100) / 30;
    juros = valor * diaria * diasAtraso;
  }
  const total = Math.round((valor + multa + juros)*100)/100;
  return { multa, juros, total };
}
function diffDias(aISO, bISO){
  const a = new Date(aISO+'T00:00:00'); const b = new Date(bISO+'T00:00:00');
  return Math.round((a - b) / 86400000);
}

// CSS inline do dialog (REPLACE COMPLETELY)
function injectModalCSS(){
  if (document.getElementById('finmodal-css')) return;

  const css = `
:root{
  --fin-bg: #ffffff;
  --fin-text: #1f2937;         /* slate-800 */
  --fin-muted: #6b7280;        /* slate-500 */
  --fin-border: #e5e7eb;       /* gray-200 */
  --fin-accent: #2563eb;       /* blue-600 */
  --fin-accent-600: #1d4ed8;   /* blue-700 */
  --fin-accent-50: #eff6ff;    /* blue-50 */
  --fin-warning: #d97706;      /* amber-600 */
}

#dlg-lanc::backdrop{
  background: rgba(15, 23, 42, 0.45);      /* slate-900/45 */
  backdrop-filter: blur(2px);
}

#dlg-lanc, #dlg-lanc * { box-sizing: border-box; }

#dlg-lanc{
  width: min(920px, 96vw);
  margin: 0 auto;
  padding: 0;
  border: none;
  border-radius: 16px;
  overflow: hidden;
  background: var(--fin-bg);
  color: var(--fin-text);
  box-shadow:
    0 30px 90px rgba(2, 6, 23, .25),
    0 8px 24px rgba(2, 6, 23, .15);
  transform: translateY(6px) scale(.985);
  opacity: 0;
  transition: transform .25s ease, opacity .25s ease;
}

#dlg-lanc[open]{
  transform: translateY(0) scale(1);
  opacity: 1;
}

#dlg-form{
  max-height: 85vh;
  overflow: auto;
  padding: 18px 18px 16px;
}

/* Header */
#dlg-form .fin-header{
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding: 10px 4px 14px;
  border-bottom: 1px solid var(--fin-border);
}
#dlg-form .fin-title{
  font-size: clamp(18px, 2.4vw, 22px);
  font-weight: 700; letter-spacing: .2px;
}
#dlg-close{
  inline-size: 36px; block-size: 36px;
  border-radius: 10px; border: 1px solid var(--fin-border);
  background: #fff; color: var(--fin-text);
  cursor: pointer;
}
#dlg-close:hover{ background:#f8fafc; }

/* Grid */
#dlg-form .grid{
  display:grid; gap: 12px;
  grid-template-columns: repeat(12, minmax(0,1fr));
}
#dlg-form .col{ min-width:0; }
#dlg-form .col.span-1{grid-column:span 1}
#dlg-form .col.span-2{grid-column:span 2}
#dlg-form .col.span-3{grid-column:span 3}
#dlg-form .col.span-4{grid-column:span 4}
#dlg-form .col.span-6{grid-column:span 6}
#dlg-form .col.span-9{grid-column:span 9}
#dlg-form .col.span-12{grid-column:span 12}
@media (max-width: 900px){
  #dlg-form .grid{ grid-template-columns: repeat(6, minmax(0,1fr)); }
}
@media (max-width: 640px){
  #dlg-form .grid{ grid-template-columns: repeat(1, minmax(0,1fr)); }
}

/* Labels + inputs */
#dlg-form label{
  display:block; font-size: 12px; color: var(--fin-muted);
  margin: 2px 0 6px;
}
#dlg-form input,
#dlg-form select,
#dlg-form textarea{
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--fin-border);
  border-radius: 10px;
  background: #fff;
  color: var(--fin-text);
  font: 500 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s;
  outline: none;
}
#dlg-form input::placeholder{ color:#94a3b8; }
#dlg-form textarea{ resize: vertical; }

#dlg-form input:focus,
#dlg-form select:focus,
#dlg-form textarea:focus{
  border-color: var(--fin-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--fin-accent) 20%, transparent);
}

/* Hint abaixo do status */
#baixa-info{ margin-top: 4px; font-size:12px; color:#8a6a52; }

/* Parcelas strip */
#f-parc-modos{
  display:flex; flex-wrap:wrap; gap:16px; align-items:center;
  margin-top: 2px;
  padding: 10px 12px;
  border: 1px dashed var(--fin-border);
  border-radius: 12px;
  background: #fafafa;
}
#f-parc-prev{
  margin-top: 6px;
  font-size: 12px; color: var(--fin-muted);
}

/* Seção de cobrança */
#sect-cobranca{
  border: 1px solid var(--fin-border);
  border-radius: 14px;
  padding: 12px;
  background: linear-gradient(0deg, #fff, var(--fin-accent-50));
}
#sect-cobranca strong{ font-size: 14px; }

/* Botões */
#btn-save, #btn-cobranca{
  appearance: none;
  border: none; cursor: pointer;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  font-size: 14px;
}
#btn-save{
  background: var(--fin-accent); color: #fff;
  box-shadow: 0 8px 16px rgba(37, 99, 235, .18);
}
#btn-save:hover{ background: var(--fin-accent-600); }
#btn-cobranca{
  background: #f1f5f9; color: var(--fin-text);
  border: 1px solid var(--fin-border);
}
#btn-cobranca:hover{ background:#e2e8f0; }
/* Bloco genérico (comissão) */
#dlg-form .fin-form-row{
  display:flex;
  flex-wrap:wrap;
  gap: 12px;
  margin-top: 8px;
  align-items:flex-end;
}

#dlg-form .fin-field{
  flex:1 1 0;
  min-width: 140px;
}

/* Linha de ações */
.fin-actions{
  display:flex; gap:10px; justify-content:flex-end; align-items:center;
  padding-top: 8px; margin-top: 6px;
  border-top: 1px solid var(--fin-border);
}
`.trim();

  const s = document.createElement('style');
  s.id = 'finmodal-css';
  s.textContent = css;
  document.head.appendChild(s);
}


// eventos (select)
function fillEventosSelect(sel, escopo){
  if (!sel) return;
  const getEv = (typeof window.getEventosAtivos === "function") ? window.getEventosAtivos : null;
  const lab   = (typeof window.labelEvento === "function") ? window.labelEvento : (ev)=>ev.nomeEvento||ev.nome||`Evento ${ev.id}`;
  let evs = [];
  if (escopo==="empresa") evs = (getEv ? (getEv()||[]) : readLS("eventos", [])) || [];
  sel.innerHTML = `<option value="">(Sem vínculo)</option>` + evs.map(ev=>`<option value="${ev.id}">${lab(ev)}</option>`).join("");
}

// Migra o FG já existente, removendo base64 gigantes e regravando leve
function migrarDadosAntigos(){
  try{
    const raw = localStorage.getItem(FG_KEY);
    if (!raw) return;
    if (raw.length < 4_500_000) return;
    let fg = JSON.parse(raw);
    const leve = stripComprovantes(fg);
    try {
      localStorage.setItem(FG_KEY, JSON.stringify(leve));
      console.info("FG migrado para formato leve (comprovantes separados).");
    } catch(e){
      (leve.lancamentos||[]).forEach(l=>{
        if (l && l.comprovante && l.comprovante !== "[separado]"){
          saveComprovanteSeparado(l.id, String(l.comprovante));
          l.comprovante = "[separado]";
          l.hasComprovante = true;
        }
      });
      localStorage.setItem(FG_KEY, JSON.stringify(leve));
    }
  }catch(e){
    console.warn("Falha ao migrar FG:", e);
  }
}
function ensureModal(){
  if (document.getElementById('dlg-lanc')) return;
  try { migrarDadosAntigos?.(); } catch {}
  try { injectModalCSS?.(); } catch {}

  const html = `
<dialog id="dlg-lanc" style="padding:0;border:none;">
  <form id="dlg-form" method="dialog" style="padding:16px;min-width:320px;">
    <div class="grid">
      <div class="col span-12" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <h3 style="margin:0">Lançamento</h3>
        <button type="button" id="dlg-close" title="Fechar" style="padding:6px 10px;">✕</button>
      </div>

      <!-- Linha 1 -->
      <div class="col span-6">
        <label>Descrição
          <input id="f-desc" type="text" autocomplete="off" />
        </label>
      </div>
      <div class="col span-3">
        <label>Valor
          <input id="f-valor" type="text" inputmode="decimal" placeholder="0,00" />
        </label>
      </div>
      <div class="col span-3">
        <label>Data
          <input id="f-data" type="date" />
        </label>
      </div>

      <!-- Linha 2 -->
      <div class="col span-3">
        <label>Tipo
          <select id="f-tipo">
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </label>
      </div>
      <div class="col span-3">
        <label>Status
          <select id="f-status2">
            <option value="pendente">Pendente</option>
            <option value="pago">Pago/Recebido</option>
          </select>
        </label>
        <div id="baixa-info"></div>
      </div>
      <div class="col span-3">
        <label>Escopo
          <select id="f-escopo">
            <option value="empresa">Empresa</option>
            <option value="pessoal">Pessoal</option>
          </select>
        </label>
      </div>

      <!-- Linha 3 -->
      <div class="col span-6">
        <label>Categoria / Subcategoria
          <select id="f-cat"></select>
        </label>
      </div>
      <div class="col span-6" style="display:none;">
        <label>Subcategoria (legado)
          <select id="f-sub"></select>
        </label>
      </div>

      <!-- Linha 4 -->
      <div class="col span-6" data-form-row="conta">
        <label>Conta
          <select id="f-conta"></select>
        </label>
      </div>
      <div class="col span-6" data-form-row="forma">
        <label>Forma de pagamento
          <select id="f-forma"></select>
        </label>
      </div>

           <!-- Linha 5: Fornecedor -->
      <div class="col span-6">
        <label>Fornecedor
          <input id="f-forn" list="lst-forn" placeholder="(opcional)" />
          <datalist id="lst-forn"></datalist>
        </label>
      </div>

      <!-- Linha 5.1: Comissão de vendedor (opcional) -->
      <div class="col span-12" style="margin-top:4px;">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="f-comissao-flag" />
          Lançamento de comissão de vendedor
        </label>
      </div>

      <div class="col span-12" id="row-comissao-detalhes" style="display:none;">
        <div class="grid" style="gap:8px;">
          <div class="col span-4">
            <label for="f-comissao-vendedor">Vendedor
              <select id="f-comissao-vendedor">
                <option value="">Selecione o vendedor</option>
              </select>
            </label>
          </div>

          <div class="col span-4">
            <label for="f-comissao-tipo">Tipo de comissão
              <select id="f-comissao-tipo">
                <option value="">Selecione</option>
                <option value="percentual">% sobre valor</option>
                <option value="valor">Valor fixo</option>
              </select>
            </label>
          </div>

          <div class="col span-4">
            <label for="f-comissao-valor">Valor da comissão
              <input type="text" id="f-comissao-valor" placeholder="ex: 300,00" />
            </label>
          </div>
        </div>
      </div>


      <!-- Linha 6: Evento (aparece só escopo=empresa) -->
      <div class="col span-6" id="f-evento-wrap">
        <label>Vínculo com evento
          <select id="f-evento"></select>
        </label>
      </div>

      <!-- Linha 7: Parcelamento -->
      <div class="col span-12">
        <div id="f-parc-modos">
          <label>Parcelas:
            <input id="f-parcelas" type="number" min="1" value="1" style="width:90px" />
          </label>
          <label>
            <input type="radio" name="f-parc-modo" value="dividir" checked />
            Dividir o valor
          </label>
          <label>
            <input type="radio" name="f-parc-modo" value="repetir" />
            Repetir o valor
          </label>
          <label style="margin-left:8px;">Começar em
            <input id="f-parc-inicio" type="number" min="0" value="0" style="width:80px" /> mês(es)
          </label>
        </div>
        <div id="f-parc-prev" style="margin-top:6px;font-size:12px;color:#444;"></div>
      </div>

      <!-- Linha 8: Seção de cobrança (aparece tipo=entrada & status=pendente) -->
      <div class="col span-12" id="sect-cobranca" style="display:none;border:1px dashed #bbb;padding:10px;border-radius:8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <strong>Cobrança</strong>
          <label style="margin-left:12px;"><input type="checkbox" id="cb-enable" /> habilitar cobrança integrada</label>
        </div>

        <div id="cb-fields" style="display:none;">
          <div class="grid">
            <div class="col span-4">
              <label>Nome do cliente
                <input id="cb-nome" type="text" />
              </label>
            </div>
            <div class="col span-3">
              <label>CPF/CNPJ
                <input id="cb-doc" type="text" inputmode="numeric" />
              </label>
            </div>
            <div class="col span-3">
              <label>Método
                <select id="cb-metodo">
                  <option value="">(Selecione)</option>
                  <option value="boleto">Boleto</option>
                  <option value="pix">PIX</option>
                  <option value="cartao">Cartão</option>
                </select>
              </label>
            </div>
            <div class="col span-6">
              <label>E-mail
                <input id="cb-email" type="email" />
              </label>
            </div>
            <div class="col span-6">
              <label>Telefone (WhatsApp)
                <input id="cb-tel" type="tel" />
              </label>
            </div>
            <div class="col span-12">
              <label>Observações
                <textarea id="cb-obs" rows="2"></textarea>
              </label>
            </div>

            <div class="col span-12" style="margin-top:6px;">
              <label><input type="checkbox" id="cb-atraso-on" /> Aplicar regras de atraso</label>
              <div id="cb-atraso-fields" style="display:none;margin-top:6px;">
                <div class="grid">
                  <div class="col span-3">
                    <label>Tolerância (dias)
                      <input id="cb-tolerancia" type="number" min="0" value="0" />
                    </label>
                  </div>
                  <div class="col span-3">
                    <label>Multa (%)
                      <input id="cb-multa" type="number" min="0" step="0.01" value="2" />
                    </label>
                  </div>
                  <div class="col span-3">
                    <label>Juros (%)
                      <input id="cb-juros" type="number" min="0" step="0.01" value="1" />
                    </label>
                  </div>
                  <div class="col span-3">
                    <label>Juros tipo
                      <select id="cb-juros-tipo">
                        <option value="am">a.m.</option>
                        <option value="ad">a.d.</option>
                      </select>
                    </label>
                  </div>
                  <div class="col span-12">
                    <label><input id="cb-prorata" type="checkbox" checked /> Pró-rata (mês base 30)</label>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- Linha 8.5: Comprovante (opcional) -->
      <div class="col span-12" id="sect-comp">
        <label>Comprovante (opcional)</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="f-comp-file" type="file" accept="image/*,.pdf" style="display:none"/>
          <button type="button" id="btn-comp-select">Selecionar arquivo</button>
          <span id="comp-status" style="font-size:12px;color:#6b7280;"></span>
          <button type="button" id="btn-comp-view" style="display:none">Ver</button>
          <button type="button" id="btn-comp-remove" style="display:none">Remover</button>
        </div>
      </div>

      <!-- Linha 9: Ações -->
      <div class="col span-12" style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button type="button" id="btn-cobranca">Gerar cobrança</button>
        <button type="submit" id="btn-save">Salvar</button>
      </div>
    </div>
  </form>
</dialog>`.trim();

  document.body.insertAdjacentHTML('beforeend', html);

  // === Comprovante: wire da UI (selecionar, ver, remover) ===
  (function wireComprovanteUI(){
    const dlg   = document.getElementById('dlg-lanc');
    const file  = document.getElementById('f-comp-file');
    const btnS  = document.getElementById('btn-comp-select');
    const btnV  = document.getElementById('btn-comp-view');
    const btnR  = document.getElementById('btn-comp-remove');
    const stat  = document.getElementById('comp-status');

    // memória temporária deste modal
    window.__finCompB64    = null;   // dataURL pronto para salvar
    window.__finCompFile   = null;   // arquivo original para API
    window.__finCompRemove = false;  // sinaliza remoção no submit

    const setState = ({has, name}={})=>{
      if (!stat) return;
      if (has) {
        stat.textContent = name ? `(${name})` : '(arquivo anexado)';
        btnV && (btnV.style.display = '');
        btnR && (btnR.style.display = '');
      } else {
        stat.textContent = '';
        btnV && (btnV.style.display = 'none');
        btnR && (btnR.style.display = 'none');
      }
    };

    btnS?.addEventListener('click', ()=> file?.click());

    file?.addEventListener('change', ()=>{
      const f = file.files && file.files[0];
      if (!f) return;

      window.__finCompFile = f;

      const rd = new FileReader();
      rd.onload = ()=>{
        window.__finCompB64 = String(rd.result || '');
        window.__finCompRemove = false;
        setState({ has: true, name: f.name });
      };
      rd.readAsDataURL(f);
    });

    btnV?.addEventListener('click', ()=>{
      const b64 = window.__finCompB64;
      if (b64) {
        if (typeof window.__openComprovanteMini === 'function') {
          window.__openComprovanteMini(b64, 'Comprovante');
        } else {
          window.open(b64, '_blank');
        }
        return;
      }

      try{
        const ctx = window.__finEditCtx;
        const lancId = ctx?.lancId || null;
        let saved = null;
        if (lancId) {
          if (typeof loadComprovanteSeparado === 'function') {
            saved = loadComprovanteSeparado(lancId);
          } else if (typeof __getComprovanteBase64ByLancId === 'function') {
            saved = __getComprovanteBase64ByLancId(lancId);
          }
        }

        if (saved) {
          if (typeof window.__openComprovanteMini === 'function') {
            window.__openComprovanteMini(saved, 'Comprovante');
          } else {
            window.open(saved, '_blank');
          }
          return;
        }

        alert('Nenhum comprovante disponível.');
      } catch {
        alert('Nenhum comprovante disponível.');
      }
    });

    btnR?.addEventListener('click', ()=>{
      window.__finCompB64 = null;
      window.__finCompFile = null;
      window.__finCompRemove = true;
      if (file) file.value = '';
      setState({ has: false });
    });

    dlg?.addEventListener('close', ()=>{
      window.__finCompB64 = null;
      window.__finCompFile = null;
      window.__finCompRemove = false;
      setState({ has: false });
    });
  })();

  // === Comissão: preenchimento e exibição da área de comissão ===
  (function wireComissaoUI(){
    const chk  = document.getElementById('f-comissao-flag');
    const row  = document.getElementById('row-comissao-detalhes');
    const vend = document.getElementById('f-comissao-vendedor');

    if (!chk || !row || !vend) return;

    if (!vend.__filled) {
      vend.__filled = true;
      let usuarios = [];
      try {
        usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
      } catch(e) {
        usuarios = [];
      }

      const vendedores = usuarios.filter(u => {
        const p = String(u?.perfil || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
        return p === 'vendedor';
      });

      vendedores.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id || v.email || v.nome || '';
        opt.textContent = v.nome || v.email || ('Vendedor ' + (v.id || ''));
        opt.dataset.id = v.id || '';
        opt.dataset.email = v.email || '';
        vend.appendChild(opt);
      });
    }

    const apply = () => {
      row.style.display = chk.checked ? 'flex' : 'none';
    };

    chk.addEventListener('change', apply);
    apply();
  })();

  // === SALVAR: cria/atualiza no Financeiro Global e notifica a tela ===
  (function setupSaveHandler(){
    const form = document.getElementById('dlg-form');
    if (!form) return;

    window.__finEditCtx = window.__finEditCtx || null;

    const parseValorBR = (s) => {
      if (typeof s === 'number') return s;
      const n = parseFloat(String(s||'').replace(/\./g,'').replace(',', '.'));
      return isNaN(n) ? 0 : n;
    };
    const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
    const uid = (p='') => (p||'') + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(4);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();

      const get = (sel) => (document.querySelector(sel)?.value ?? '').trim();
      const desc     = get('#f-desc');
      const valor    = parseValorBR(get('#f-valor'));
      const dataISO  = (get('#f-data') || hojeISO()).slice(0,10);
      const tipo     = (window.normalizeTipoLanc?.(get('#f-tipo')) || 'entrada');
      let   status   = (get('#f-status2') || 'pendente').toLowerCase();

      if (tipo === 'entrada' && status === 'pago') status = 'recebido';

      const catSel   = get('#f-cat');
      const contaId  = get('#f-conta') || '';
      const formaId  = get('#f-forma') || '';
      const escopo   = get('#f-escopo') || 'empresa';

      let eventoId = '';
      if (escopo === 'empresa') {
        const fromSelect = get('#f-evento');
        const ctxOrigem = String(window.__lancOrigem || '');

        if (fromSelect !== '') {
          eventoId = fromSelect;
        } else if (ctxOrigem !== 'dashboard-quick') {
          eventoId =
            (new URLSearchParams(location.search).get('id') ||
             localStorage.getItem('eventoSelecionado') ||
             '');
        }
      }

      const quitados = ['pago','recebido','baixado','quitado','liquidado','parcial'];
      if (quitados.includes(status) && !contaId) {
        const prosseguir = window.confirm('Este lançamento está como quitado, mas nenhuma CONTA foi selecionada. Salvar assim mesmo?');
        if (!prosseguir) return;
      }

      let categoriaId = '', subcategoriaId = '';
      if (/^cat:/.test(catSel)) categoriaId = catSel.split(':')[1] || '';
      if (/^sub:/.test(catSel)) subcategoriaId = catSel.split(':')[1] || '';

      const FG = (function(){
        try { return JSON.parse(localStorage.getItem('financeiroGlobal')) || {lancamentos:[], parcelas:[]}; }
        catch { return {lancamentos:[], parcelas:[]}; }
      })();

      const ctx = window.__finEditCtx;
      const editingParcela = ctx && ctx.mode === 'parcela' && ctx.parcelaId;
      const editingLanc    = ctx && ctx.mode === 'lanc'    && ctx.lancId;

      // ===== monta/atualiza Lançamento =====
      let lancId = editingLanc ? String(ctx.lancId)
                 : editingParcela ? String(ctx.lancId)
                 : ('L' + uid());

      let lanc = FG.lancamentos.find(l => String(l.id) === String(lancId));
      if (!lanc) {
        lanc = { id: lancId };
        FG.lancamentos.push(lanc);
      }

      let tipoNorm = (typeof window.normalizeTipoLanc === 'function')
        ? window.normalizeTipoLanc(tipo)
        : String(tipo || '').toLowerCase()
            .replace('receita','entrada')
            .replace('despesa','saida');

      lanc.tipo = tipoNorm || String(lanc.tipo || '');

      lanc.descricao = desc;

      lanc.eventoId = String(eventoId || lanc.eventoId || '');
      (function ensureEventoOnLanc(){
        const selEv = document.getElementById('f-evento');
        let evNome = String(lanc.eventoNome || '');
        if (!evNome && selEv) {
          const opt = selEv.options[selEv.selectedIndex];
          if (opt) evNome = String(opt.textContent || '').trim();
        }
        lanc.eventoNome = evNome || '';
      })();

      lanc.escopo         = String(escopo || lanc.escopo || 'empresa');
      lanc.categoriaId    = (categoriaId ?? lanc.categoriaId) ?? undefined;
      lanc.subcategoriaId = (subcategoriaId ?? lanc.subcategoriaId) ?? undefined;
      lanc.contaId        = (contaId ?? lanc.contaId) ?? undefined;
      lanc.formaId        = (formaId ?? lanc.formaId) ?? undefined;

      lanc.status = String(status || lanc.status || 'pendente').toLowerCase();
      lanc.valor  = Number(valor || lanc.valor || 0);
      lanc.data   = String(dataISO || lanc.data || new Date().toISOString().slice(0,10)).slice(0,10);
    // --- Comissão de vendedor (campos extras) ---
    (function applyComissaoFields(){
      const root = document.getElementById('dlg-lanc');
      if (!root) return;

      const chkComissao = root.querySelector('#f-comissao-flag');
      const selVend     = root.querySelector('#f-comissao-vendedor');
      const selTipo     = root.querySelector('#f-comissao-tipo');
      const inpVal      = root.querySelector('#f-comissao-valor');

      if (chkComissao && chkComissao.checked) {
        const optSel = selVend && selVend.options[selVend.selectedIndex];
        const valorComissao = toNumberInput(inpVal?.value || 0); // usa helper já existente

        lanc.isComissao           = true;
        lanc.comissaoVendedorId   = (optSel?.dataset?.id || selVend?.value || '');
        lanc.comissaoVendedorNome = (optSel?.textContent || '');
        lanc.comissaoVendedorEmail= (optSel?.dataset?.email || '');
        lanc.comissaoTipo         = (selTipo?.value || '');
        lanc.comissaoValor        = valorComissao || 0;

      } else {
        // limpa campos de comissão se não estiver marcado
        delete lanc.isComissao;
        delete lanc.comissaoVendedorId;
        delete lanc.comissaoVendedorNome;
        delete lanc.comissaoVendedorEmail;
        delete lanc.comissaoTipo;
        delete lanc.comissaoValor;
        delete lanc.comissaoPerc;
      }
    })();

      // --- Comissão (opcional) ---
      try {
        const elFlag  = document.getElementById('f-comissao-flag');
        const elVend  = document.getElementById('f-comissao-vendedor');
        const elTipoC = document.getElementById('f-comissao-tipo');
        const elValC  = document.getElementById('f-comissao-valor');

        if (elFlag && elFlag.checked) {
          const optSel = elVend?.options?.[elVend.selectedIndex] || null;
          const valorCom = parseValorBR(elValC?.value || 0);

          lanc.isComissao             = true;
          lanc.comissaoVendedorId     = optSel?.dataset?.id || (elVend?.value || '');
          lanc.comissaoVendedorNome   = optSel?.textContent || '';
          lanc.comissaoVendedorEmail  = optSel?.dataset?.email || '';
          lanc.comissaoTipo           = elTipoC?.value || '';
          lanc.comissaoValor          = valorCom || 0;
        } else {
          delete lanc.isComissao;
          delete lanc.comissaoVendedorId;
          delete lanc.comissaoVendedorNome;
          delete lanc.comissaoVendedorEmail;
          delete lanc.comissaoTipo;
          delete lanc.comissaoValor;
          delete lanc.comissaoPerc;
        }
      } catch(e) {
        console.warn('[finmodal] falha ao aplicar dados de comissão:', e);
      }

      // ====== ETAPA 3-B — Regras de CARTÃO (no modal) ======
      try{
        const cfg = (window.finCartao?.__cfg?.() || {});
        const g   = (window.finCartao?.__fgLoad?.() || {});

        g.lancamentos = Array.isArray(g.lancamentos) ? g.lancamentos : [];
        g.parcelas    = Array.isArray(g.parcelas)    ? g.parcelas    : [];
        g.movimentos  = Array.isArray(g.movimentos)  ? g.movimentos  : [];

        const contaIdCartao = String(lanc.contaId || '');
        const ehContaCartao = !!window.finCartao?.isContaCartao?.(contaIdCartao);
        const ehCartao = ehContaCartao;

        if (String(lanc.tipo||'').toLowerCase()==='saida' && ehCartao){
          lanc.status = 'pendente';

          g.lancamentos.push({ ...lanc });

          const cartaoCfg = (cfg.cartoes||[]).find(c => String(c.id)===contaIdCartao);

          const nParcelas = Math.max(1, parseInt(
            document.getElementById('f-parcelas')?.value
            || document.getElementById('fQtd')?.value
            || document.getElementById('fm-qtd')?.value
            || document.getElementById('parcelas')?.value
            || '1', 10
          ));

          const dataCompraISO = (dataISO || lanc.data || new Date().toISOString().slice(0,10));

          window.finCartao?.criarParcelasDeCartao?.({
            g,
            lanc,
            cartaoCfg: cartaoCfg || { fechamento: 0, vencimento: 1 },
            valorTotal: Number(lanc.valor || lanc.valorTotal || 0),
            nParcelas,
            dataCompraISO
          });

          window.finCartao?.__fgSave?.(g);

          try{ window.dispatchEvent(new CustomEvent('fin-store-changed', { detail:{ reason:'lanc_cartao' }})); }catch{}
          try{ window.dispatchEvent(new CustomEvent('finmodal:confirm',   { detail:{ lancId: lanc.id }})); }catch{}
          try{ if (typeof toast==='function') toast('Lançamento no cartão salvo!'); }catch{}
          try{ document.getElementById('dlg-lanc')?.close?.(); }catch{}

          return;
        }
      } catch(e){
        console.warn('[Modal cartão] Falha na regra de cartão:', e);
      }

      // ===== monta/atualiza Parcela =====
      let parcelaId = editingParcela ? String(ctx.parcelaId) : ('P' + uid());
      let parc = FG.parcelas.find(p => String(p.id) === String(parcelaId));
      if (!parc) {
        parc = { id: parcelaId, lancamentoId: lancId };
        FG.parcelas.push(parc);
      }

      parc.lancamentoId      = lancId;
      parc.descricao         = desc;
      parc.valor             = valor;
      parc.totalPago         = quitados.includes(status) ? valor : 0;
      parc.vencimentoISO     = dataISO;
      parc.dataPagamentoISO  = quitados.includes(status) ? dataISO : '';
      parc.status            = status;
      parc.contaId           = contaId || undefined;
      parc.formaId           = formaId || undefined;

      try {
        const ctxMode = (window.__finEditCtx && window.__finEditCtx.mode) || 'lanc';

        if (ctxMode === 'parc') {
          if (window.__finCompRemove === true) {
            if (typeof window.apiFinDeleteParcelaComprovante === 'function') {
              window.apiFinDeleteParcelaComprovante(parcelaId);
            }
            try { localStorage.removeItem(`fg.comp.parc:${parcelaId}`); } catch {}
            parc.comprovanteUrl  = null;
            parc.comprovanteTipo = null;
          }
          else if (window.__finCompFile) {
            if (typeof window.apiFinUploadParcelaComprovante === 'function') {
              window.apiFinUploadParcelaComprovante(parcelaId, window.__finCompFile);
            }
          }

        } else {
          if (window.__finCompRemove === true) {
            localStorage.removeItem(`fg.comp:${lanc.id}`);
            lanc.hasComprovante = false;
            lanc.comprovante = '';
          } else if (window.__finCompB64) {
            saveComprovanteSeparado(lanc.id, window.__finCompB64);
            lanc.hasComprovante = true;
            lanc.comprovante = "[separado]";
          }
        }
      } catch (e) {
        console.warn('[finmodal] erro ao tratar comprovante:', e);
      }

      try {
        if (window.apiFinUpsertLancamento && window.apiFinUpsertParcela) {
          const lancSalvo = await window.apiFinUpsertLancamento(lanc);

          if (lancSalvo && lancSalvo.id && lancSalvo.id !== lanc.id) {
            const oldId = String(lanc.id);
            const newId = String(lancSalvo.id);

            lanc.id = newId;
            lancId  = newId;

            if (parc) {
              parc.lancamentoId = newId;
            }

            if (FG && Array.isArray(FG.parcelas)) {
              FG.parcelas.forEach(p => {
                if (String(p.lancamentoId) === oldId) {
                  p.lancamentoId = newId;
                }
              });
            }
          }

          if (parc) {
            await window.apiFinUpsertParcela(parc);
          }

          try {
            window.dispatchEvent(
              new CustomEvent('finmodal:confirm', { detail:{ reason:'api-save' } })
            );
          } catch {}

        } else if (typeof writeFG === 'function') {
          writeFG(FG);
        } else {
          localStorage.setItem('financeiroGlobal', JSON.stringify(FG));
          try {
            window.dispatchEvent(
              new CustomEvent('finmodal:confirm', { detail:{ reason:'writeFG' } })
            );
          } catch {}
        }
      } catch(e){
        console.error('Salvar via API falhou:', e);
        alert('Não foi possível salvar no financeiro agora. Tente novamente em instantes.');
        return;
      }

      document.getElementById('dlg-lanc')?.close?.();
      window.__finEditCtx = null;
    });
  })();

  try { window.lucide?.createIcons?.(); } catch {}

  const fData = document.querySelector('#f-data');
  if (fData && !fData.value) {
    const d = new Date(), pad = n => String(n).padStart(2,'0');
    fData.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  const fSub = document.getElementById('f-sub');
  if (fSub) {
    fSub.innerHTML = '<option value="">(use o campo Categoria)</option>';
    fSub.style.display = 'none';
    const wrap = fSub.closest('label') || fSub.parentElement;
    if (wrap) wrap.style.display = 'none';
  }

  try {
    const escopoIni = document.getElementById('f-escopo')?.value || 'empresa';
    const tipoIni   = document.getElementById('f-tipo')?.value   || 'entrada';
    fillSelects({ escopo: escopoIni, tipo: tipoIni });
    fillFornecedorDatalist?.();
  } catch {}

  const selTipo    = document.getElementById('f-tipo');
  const selEscopo  = document.getElementById('f-escopo');
  const selStatus  = document.getElementById('f-status2');

  const refreshTipoEscopo = () => {
    try { fillSelects({ escopo: selEscopo?.value, tipo: selTipo?.value }); } catch {}
    if (event?.target === selTipo) {
      const catSel = document.getElementById('f-cat');
      if (catSel) catSel.value='';
    }
    const evWrap = document.getElementById('f-evento-wrap');
    if (evWrap) evWrap.hidden = (String(selEscopo?.value || 'empresa') !== 'empresa');
    try { toggleUIcobranca?.(); } catch {}
  };

  selTipo?.addEventListener('change', refreshTipoEscopo);
  selEscopo?.addEventListener('change', refreshTipoEscopo);
  selStatus?.addEventListener('change', () => { try { toggleCamposPorStatus?.(); toggleUIcobranca?.(); } catch {} });

  document.getElementById('dlg-close')?.addEventListener('click', () => {
    document.getElementById('dlg-lanc')?.close?.();
  });

  const cbEnable = document.getElementById('cb-enable');
  const cbFields = document.getElementById('cb-fields');
  if (cbEnable && cbFields){
    cbEnable.addEventListener('change', ()=>{
      const on = cbEnable.checked;
      cbFields.style.display = on ? '' : 'none';
      const setReq = (id, req) => { const el = document.getElementById(id); if (el) el.required = req; };
      setReq('cb-nome', on); setReq('cb-doc', on); setReq('cb-metodo', on);

      let R = {};
      try { R = loadRegrasAtraso?.() || {}; } catch {}
      const onAtraso = document.getElementById('cb-atraso-on');
      const boxAtr   = document.getElementById('cb-atraso-fields');
      if (onAtraso) onAtraso.checked = !!R.habilitado;
      if (boxAtr) boxAtr.style.display = R.habilitado ? '' : 'none';
      const setVal = (id, v) => { const el = document.getElementById(id); if (el!=null) el.value = v; };
      const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
      setVal('cb-tolerancia', R.toleranciaDias ?? 0);
      setVal('cb-multa',      R.multaPercent   ?? 2.0);
      setVal('cb-juros',      R.jurosPercent   ?? 1.0);
      setVal('cb-juros-tipo', R.jurosTipo      ?? 'am');
      setChk('cb-prorata',    R.proRata);
    });
  }

  const cbAtrasoOn = document.getElementById('cb-atraso-on');
  if (cbAtrasoOn){
    cbAtrasoOn.addEventListener('change', ()=>{
      const box = document.getElementById('cb-atraso-fields');
      if (box) box.style.display = cbAtrasoOn.checked ? '' : 'none';
      try { saveRegrasAtraso?.({ habilitado: cbAtrasoOn.checked }); } catch {}
    });
  }
  {
    const save = ()=> {
      try {
        saveRegrasAtraso?.({
          toleranciaDias: Number(document.getElementById('cb-tolerancia')?.value||0),
          multaPercent:   Number(document.getElementById('cb-multa')?.value||0),
          jurosPercent:   Number(document.getElementById('cb-juros')?.value||0),
          jurosTipo:      document.getElementById('cb-juros-tipo')?.value || 'am',
          proRata:        !!document.getElementById('cb-prorata')?.checked
        });
      } catch {}
    };
    ['cb-tolerancia','cb-multa','cb-juros','cb-juros-tipo','cb-prorata'].forEach(id=>{
      document.getElementById(id)?.addEventListener('input', save);
    });
    document.getElementById('cb-juros-tipo')?.addEventListener('change', save);
  }

  const prevInputs = ['#f-valor', '#f-parcelas', '#f-parc-inicio', '#f-data'];
  prevInputs.forEach(s => document.querySelector(s)?.addEventListener('input', renderParcelasPreview));
  document.querySelectorAll('input[name="f-parc-modo"]').forEach(r => r.addEventListener('change', renderParcelasPreview));
  try { renderParcelasPreview(); } catch {}

try { toggleCamposPorStatus?.(); toggleUIcobranca?.(); } catch {}

const bindBtnCobranca = () => {
  const btn = document.getElementById('btn-cobranca');
  if (!btn) return;
  // evita prender mais de um listener
  if (btn.__kgbCobrancaBound) return;
  btn.__kgbCobrancaBound = true;

btn.addEventListener('click', () => {
  // 1ª tentativa: usar a API oficial do modal
  if (window.FinModal && typeof window.FinModal.handleGerarCobranca === 'function') {
    window.FinModal.handleGerarCobranca(false);
    return;
  }

  // 2ª tentativa: função global (se você ainda tiver ela declarada em window)
  if (typeof window.handleGerarCobranca === 'function') {
    window.handleGerarCobranca(false);
    return;
  }

  // Se nada existir, avisa
  alert('Função de cobrança não disponível (nenhuma função encontrada).');
});

};

// tenta ligar o botão agora…
bindBtnCobranca();
// …e também quando o modal avisar que está pronto
window.addEventListener('finmodal:ready', bindBtnCobranca);

 }


// === helpers de preenchimento ===
function __fillFormFromLanc(l) {
  const dlg = document.getElementById('dlg-lanc');
  if (!dlg) { alert('Estrutura do modal não encontrada.'); return false; }

  // garante selects populados de acordo com tipo/escopo
  try {
    const tipo = (window.normalizeTipoLanc?.(l?.tipo) || 'entrada');
    const escopo = (l?.escopo || 'empresa');
    fillSelects({ tipo, escopo, root: dlg });
  } catch {}

  const set = (sel, val) => {
    const el = dlg.querySelector(sel);
    if (el) el.value = val ?? '';
  };

  set('#f-desc',
    l?.descricao ||
    l?.desc ||
    ''
  );

  set(
    '#f-valor',
    (Number(l?.valor ?? l?.valorTotal ?? 0))
      .toFixed(2)
      .replace('.', ',')
  );

  set(
    '#f-data',
    (l?.data || l?.dataCompetencia || new Date().toISOString().slice(0, 10))
      .slice(0, 10)
  );

  set('#f-tipo', window.normalizeTipoLanc?.(l?.tipo) || 'entrada');

  set(
    '#f-status2',
    (String(l?.status || 'pendente')).toLowerCase().includes('pago') ||
    String(l?.status || '').toLowerCase().includes('recebido')
      ? 'pago'
      : 'pendente'
  );

  // categoria unificada (se tiver)
  if (l?.subcategoriaId) {
    set('#f-cat', `sub:${l.subcategoriaId}`);
  } else if (l?.categoriaId) {
    set('#f-cat', `cat:${l.categoriaId}`);
  }

  // conta/forma se existirem
  set('#f-conta', l?.contaId || '');
  set('#f-forma', l?.formaId || l?.tipoPagamento || '');

  // evento (se houver)
  const escopo = l?.escopo || 'empresa';
  set('#f-escopo', escopo);
  try {
    fillEventosSelect?.(dlg.querySelector('#f-evento'), escopo);
  } catch {}
  set('#f-evento', l?.eventoId || '');

  // === COMISSÃO: preenche campos quando o lançamento É comissão ===
  const chkComissao = dlg.querySelector('#f-comissao-flag');
  const rowDet      = dlg.querySelector('#row-comissao-detalhes');
  const selVend     = dlg.querySelector('#f-comissao-vendedor');
  const selTipo     = dlg.querySelector('#f-comissao-tipo');
  const inpVal      = dlg.querySelector('#f-comissao-valor');

  // 1) Popular o select de vendedores (só 1x)
  if (selVend && !selVend.__filled && typeof getUsuariosVendedores === 'function') {
    selVend.__filled = true;
    const vendedores = getUsuariosVendedores();
    vendedores.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id || v.email || v.nome;
      opt.textContent = v.nome || v.email || ('Vendedor ' + (v.id || ''));
      opt.dataset.email = v.email || '';
      opt.dataset.id = v.id || '';
      selVend.appendChild(opt);
    });
  }

  // 2) Deixar o checkbox ligado/desligado e mostrar/esconder a linha
  if (chkComissao && rowDet) {
    const isCom = !!l?.isComissao;

    chkComissao.checked = isCom;
    rowDet.style.display = isCom ? 'flex' : 'none';

    if (isCom) {
      // tipo (% ou R$)
      if (selTipo) {
        selTipo.value = l?.comissaoTipo || '';
      }

      // valor (em dinheiro ou % — você decide como vai usar)
      if (inpVal) {
        const v = Number(l?.comissaoValor || l?.comissaoPerc || 0);
        inpVal.value = v ? v.toFixed(2).replace('.', ',') : '';
      }

      // vendedor selecionado
      if (selVend && (l?.comissaoVendedorId || l?.comissaoVendedorEmail)) {
        const alvoId    = String(l?.comissaoVendedorId || '');
        const alvoEmail = String(l?.comissaoVendedorEmail || '').toLowerCase();

        for (let i = 0; i < selVend.options.length; i++) {
          const opt = selVend.options[i];
          const idOpt    = String(opt.dataset.id || opt.value || '');
          const emailOpt = String(opt.dataset.email || '').toLowerCase();
          if ((alvoId && idOpt === alvoId) || (alvoEmail && emailOpt === alvoEmail)) {
            selVend.selectedIndex = i;
            break;
          }
        }
      }
    } else {
      // se NÃO for comissão, limpa campos
      if (selTipo) selTipo.value = '';
      if (inpVal)  inpVal.value  = '';
      if (selVend) selVend.selectedIndex = 0;
    }

    // 3) Liga o evento de mostrar/esconder os detalhes quando clicar no checkbox
    if (!chkComissao.__wired) {
      chkComissao.__wired = true;
      chkComissao.addEventListener('change', () => {
        rowDet.style.display = chkComissao.checked ? 'flex' : 'none';
      });
    }
  }

  // Estado visual do comprovante ao abrir edição
  try {
    const stat = document.getElementById('comp-status');
    const btnV = document.getElementById('btn-comp-view');
    const btnR = document.getElementById('btn-comp-remove');

    let has = false;
    // 1) se estiver embedado (raro, mas pode)
    if (typeof l?.comprovante === 'string' && l.comprovante && l.comprovante !== '[separado]') has = true;
    // 2) se já foi salvo separado
    if (!has) {
      const saved = (typeof __getComprovanteBase64ByLancId === 'function')
        ? __getComprovanteBase64ByLancId(l.id)
        : null;
      has = !!saved;
    }
    if (stat) stat.textContent = has ? '(arquivo anexado)' : '';
    if (btnV) btnV.style.display = has ? '' : 'none';
    if (btnR) btnR.style.display = has ? '' : 'none';
  } catch {}

  const d = document.getElementById('dlg-lanc');
  if (d?.showModal) d.showModal();
  else d?.removeAttribute('hidden');

  return true;
}

// ===== Guardião de criação: só Dashboard e Financeiro do Evento podem abrir "novo" =====
function __canCreateLancHere(){
  const p = (location.pathname || '').toLowerCase();
  // ajuste os nomes caso seus arquivos tenham outros nomes
  const ok = p.includes('dashboard') || p.includes('financeiro-evento');
  // fallback: se quiser liberar explicitamente via query (?allowCreate=1)
  const allowParam = new URLSearchParams(location.search).get('allowCreate') === '1';
  return ok || allowParam;
}

// === NOVO LANÇAMENTO (API chamada pela tela) — VERSÃO RESTRITA ===
function openNovo(opts = {}) {
  try {
    // Permite criação apenas no Dashboard e no Financeiro do Evento
    const path = (location.pathname || '').toLowerCase();
    const allowParam = new URLSearchParams(location.search).get('allowCreate') === '1'; // escape manual, se precisar
    const allowed = allowParam || path.includes('dashboard') || path.includes('financeiro-evento');
    if (!allowed) {
      alert('Criação de lançamento disponível apenas no Dashboard e no Financeiro do Evento.');
      return false;
    }

    // Garante estrutura do modal
    if (typeof ensureModal === 'function') ensureModal();

    // zera o contexto de edição (novo registro)
    window.__finEditCtx = null;

    // Datas e normalizações
    const hojeISO = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);

  const preferTipo = (opts.preferTipo ?? 'entrada');
const tipo = normalizeTipoLanc(preferTipo);


    const escopo = String(opts.escopo || 'empresa');

   // Respeita "eventoId" mesmo que seja string vazia (intencional).
// Só usa URL/LS se o chamador NÃO informou a propriedade.
let eventoId;
if (Object.prototype.hasOwnProperty.call(opts, 'eventoId')) {
  eventoId = String(opts.eventoId ?? '');
} else {
  const urlEv = (()=>{ try { return new URL(location.href).searchParams.get('eventoId'); } catch { return ''; } })() || '';
  const lsEv  = (()=>{ try { return localStorage.getItem('eventoSelecionado') || ''; } catch { return ''; } })() || '';
  eventoId = urlEv || lsEv || '';
}


    // Objeto base só para preencher o formulário
    const lanc = {
      id: null,                // novo
      descricao: '',
      valor: 0,
      data: hojeISO,
      tipo,                    // 'entrada' | 'saida'
      status: 'pendente',      // 'pendente' | 'pago/recebido' (definido no modal)
      escopo,                  // 'empresa' | 'pessoal'
      eventoId,                // usado para filtrar na tela
      contaId: '',
      formaId: '',
      categoriaId: '',
      subcategoriaId: ''
    };

    // Preenche o formulário do modal e exibe
    __fillFormFromLanc(lanc);

    // Garante que os selects do modal reflitam tipo/escopo atuais (idempotente)
    try { __wireTipoEscopoDoForm?.(document.getElementById('dlg-lanc')); } catch {}

    return true;
  } catch (e) {
    console.error('openNovo erro:', e);
    alert('Não foi possível abrir o modal de novo lançamento.');
    return false;
  }
}


// === API esperada pela tela de lançamentos (editar Lançamento) ===
// === API esperada pela tela de lançamentos (editar Lançamento) ===
function openEditar(lancId){
  try {
    ensureModal?.();

    const fg = readLS('financeiroGlobal', {});
    const l  = (fg.lancamentos||[]).find(x => String(x.id) === String(lancId));
    if (!l) { alert('Lançamento não encontrado.'); return; }

    // Deixa claro para o submit que é EDIÇÃO de lançamento
    window.__finEditCtx = { mode: 'lanc', lancId: String(lancId) };

    // Evento: NÃO use "opts" aqui (não existe neste escopo).
    // Respeita URL/LS para manter o mesmo comportamento do evento atual.
    const urlEv = (()=>{ try { return new URL(location.href).searchParams.get('eventoId'); } catch { return ''; } })() || '';
    const lsEv  = (()=>{ try { return localStorage.getItem('eventoSelecionado') || ''; } catch { return ''; } })() || '';
    const eventoId = urlEv || lsEv || '';

    __fillFormFromLanc({
      ...l,
      tipo   : l.tipo   || 'entrada',
      escopo : l.escopo || 'empresa',
      eventoId
    });
  } catch (e) {
    console.error('openEditar erro:', e);
    alert('Não foi possível abrir o modal para este lançamento.');
  }
}


// === Editar PARCELA (abre o mesmo modal já preenchido) ===
function openEditarParcela(parcelaId){
  try {
    ensureModal?.();

    const fg = readLS('financeiroGlobal', {});
    const p  = (fg.parcelas||[]).find(x => String(x.id) === String(parcelaId));
    if (!p) { alert('Parcela não encontrada.'); return; }

    const l  = (fg.lancamentos||[]).find(x => String(x.id) === String(p.lancamentoId)) || {};

    // seta contexto p/ o submit saber que é EDIÇÃO de parcela
    window.__finEditCtx = {
      mode: 'parcela',
      parcelaId: String(parcelaId),
      lancId: String(p.lancamentoId)
    };

const eventoId = (Object.prototype.hasOwnProperty.call(l, 'eventoId'))
  ? String(l.eventoId ?? '')
  : ( (()=>{ try { return new URL(location.href).searchParams.get('eventoId'); } catch { return ''; } })()
    || (()=>{ try { return localStorage.getItem('eventoSelecionado') || ''; } catch { return ''; } })()
    || '' );


    // mescla dados do lançamento com os da parcela
    const merged = {
      ...l,
      // ids/escopo/evento para consistência
      id      : l.id ?? p.lancamentoId,
      eventoId: eventoId,
      escopo  : l.escopo || 'empresa',
      tipo    : l.tipo   || 'entrada',

      // campos editáveis vindos da parcela
      valor   : (p.totalPago ?? p.valor ?? l?.valor ?? 0),
      data    : (p.vencimentoISO || p.dataPagamentoISO || l?.data),
      status  : (p.status || l?.status || 'pendente'),
      contaId : (p.contaId || l?.contaId || ''),
      formaId : (p.formaId || l?.formaId || ''),

      // mantém categoria se houver
      categoriaId    : l.categoriaId    || '',
      subcategoriaId : l.subcategoriaId || ''
    };

    __fillFormFromLanc(merged);
  } catch (e) {
    console.error('openEditarParcela erro:', e);
    alert('Não foi possível abrir o modal para esta parcela.');
  }
}


// --- REGISTRO GLOBAL ÚNICO (mantenha só este bloco) ---
(function (global) {
  // Garante que o HTML/CSS do modal exista
  try { if (typeof ensureModal === 'function') ensureModal(); } catch {}

  // Monta a API com apenas as funções que existem (evita ReferenceError)
  const api = global.FinModal || {};
  if (typeof openNovo === 'function')          api.openNovo = openNovo;
  if (typeof openEditar === 'function')        api.openEditar = openEditar;
  if (typeof openEditarParcela === 'function') api.openEditarParcela = openEditarParcela;
  if (typeof ensureModal === 'function')       api.ensureModal = ensureModal;

  // (Opcional) expor utilitários úteis para outras telas
  if (typeof fillSelects === 'function')        api.fillSelects = fillSelects;
  if (typeof handleGerarCobranca === 'function') api.handleGerarCobranca = handleGerarCobranca;

  global.FinModal = api;

  // Modal pronto
  try { global.dispatchEvent(new Event('finmodal:ready')); } catch {}
})(window);

// --- SUBSTITUIR TODA A FUNÇÃO fillSelects POR ESTA VERSÃO ---
function fillSelects({ escopo, tipo, root } = {}) {
  root = root || document.getElementById('dlg-lanc') || document;
  const $ = (s) => root.querySelector(s);

const normTipo = (t) => normalizeTipoLanc(t || 'entrada');

  // 1) CATEGORIAS
  const catSel = $('#f-cat');
  const subSel = $('#f-sub');

  if (catSel) {
    const prev = catSel.value;
    let cats = (typeof __readFinCatsLS === 'function') ? __readFinCatsLS() : [];

    if (!cats || !cats.length) {
      if (typeof getCategoriasUnificadas === 'function') {
        cats = getCategoriasUnificadas();
      } else {
        try {
          const cfg = JSON.parse(localStorage.getItem('configFinanceiro') || '{}') || {};
          cats = Array.isArray(cfg.categorias) ? cfg.categorias : [];
        } catch { cats = []; }
      }
      cats = (cats || []).map(c => ({
        id: c.id ?? c.value,
        nome: String(c.nome ?? c.descricao ?? '').trim(),
        descricao: String(c.descricao ?? c.nome ?? '').trim(),
        tipo: normTipo(c.tipo),
        escopo: String(c.escopo || 'ambas'),
        ativo: c.ativo !== false,
        paiId: c.paiId ?? c.parentId ?? null
      })).filter(c => c.id && c.ativo);
    }

    const tipoFiltro = normTipo(tipo || $('#f-tipo')?.value || 'entrada');
    const escFiltro = String(escopo || $('#f-escopo')?.value || 'empresa');
    const matchEsc = (cEsc) => {
      if (escFiltro === 'empresa') return cEsc === 'empresa' || cEsc === 'ambas';
      if (escFiltro === 'pessoal') return cEsc === 'pessoal' || cEsc === 'ambas';
      return true;
    };
    cats = (cats || []).filter(c =>
      String(c.tipo) === tipoFiltro && matchEsc(String(c.escopo || 'ambas'))
    );

    if (typeof __buildCatOptionsJoin === 'function') {
      catSel.innerHTML = __buildCatOptionsJoin(cats);
    } else {
      const roots = cats.filter(c => c.paiId == null);
      const subsOf = id => cats.filter(s => s.paiId != null && String(s.paiId) === String(id));
      let html = `<option value="">(Sem categoria/subcategoria)</option>`;
      for (const c of roots) {
        html += `<option value="cat:${c.id}" data-kind="cat" data-cat="${c.id}">${(c.descricao||c.nome||'').replace(/</g,'&lt;')}</option>`;
        for (const s of subsOf(c.id)) {
          html += `<option value="sub:${s.id}" data-kind="sub" data-cat="${c.id}" data-sub="${s.id}">&nbsp;&nbsp;↳ ${(s.descricao||s.nome||'').replace(/</g,'&lt;')}</option>`;
        }
      }
      catSel.innerHTML = html;
    }

    if (prev && [...catSel.options].some(o => o.value === prev)) catSel.value = prev;
    if (!catSel.options.length) catSel.innerHTML = `<option value="">(Sem categoria/subcategoria)</option>`;
  }

  if (subSel) {
    subSel.innerHTML = '<option value="">(use o campo Categoria)</option>';
    subSel.style.display = 'none';
    const wrap = subSel.closest('label') || subSel.parentElement;
    if (wrap) wrap.style.display = 'none';
  }

  // 3) FORMAS
  const formasSel = $('#f-forma');
  if (formasSel) {
    const cfg = (typeof getCfg === 'function' ? getCfg() : {}) || {};
    const tipos = Array.isArray(cfg.tipos) ? cfg.tipos : [];
    const prev = formasSel.value;
    formasSel.innerHTML =
      '<option value="">(Selecione)</option>' +
      tipos.map(t => `<option value="${t.id}">${t.descricao || t.nome || t.label || t.id}</option>`).join('');
    if (prev && tipos.some(t => String(t.id) === String(prev))) formasSel.value = prev;
  }

  // 4) CONTAS
  const contaSel = $('#f-conta');
  if (contaSel) {
    const contas = (typeof getContas === 'function') ? (getContas() || []) : [];
    const prev = contaSel.value;
    contaSel.innerHTML =
      '<option value="">(Selecione)</option>' +
      contas.map(c => {
        const badge = c.tipo === 'cartao_credito' ? ' (Cartão)' : ' (Banco)';
        return `<option value="${c.id}" data-tipo="${c.tipo}" data-fech="${c.diaFechamento||''}" data-venc="${c.diaVencimento||''}">${c.nome}${badge}</option>`;
      }).join('');
    if (prev && contas.some(c => String(c.id) === String(prev))) contaSel.value = prev;
  }

  // 5) FORNECEDORES (select OU datalist)
  {
    const fornSel  = $('#f-forn');
    const fornList = $('#lst-forn');
    const dados    = (typeof getFornecedores === 'function') ? (getFornecedores() || []) : [];

    const arr = Array.isArray(dados)
      ? dados.slice().sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||'')))
      : [];

    if (fornSel && fornSel.tagName === 'SELECT') {
      const prev = fornSel.value;
      fornSel.innerHTML =
        '<option value="">(Selecione)</option>' +
        arr.map(f => {
          const nome  = String(f.nome || f.razao || f.fantasia || '').trim();
          const whats = String(f.whats || '').trim();
          const segs  = Array.isArray(f.segmentos) ? f.segmentos.join('/') : '';
          const label = [nome, segs && `– ${segs}`, whats && `– ${whats}`].filter(Boolean).join(' ');
          return `<option value="${nome}">${label}</option>`;
        }).join('');
      if (prev && [...fornSel.options].some(o => o.value === prev)) fornSel.value = prev;
    } else if (fornList) {
      fornList.innerHTML = arr.map(f => {
        const nome  = String(f.nome || '').trim();
        const whats = String(f.whats || '').trim();
        const segs  = Array.isArray(f.segmentos) ? f.segmentos.join('/') : '';
        return `<option value="${nome}" label="${segs ? segs+' – ' : ''}${whats}"></option>`;
      }).join('');
    }
  }

  // 6) EVENTO (só no escopo empresa)
  const evWrap = $('#f-evento-wrap');
  if (evWrap) evWrap.hidden = (String(escopo || $('#f-escopo')?.value || 'empresa') !== 'empresa');
  if (typeof fillEventosSelect === 'function') {
    fillEventosSelect($('#f-evento'), (escopo || $('#f-escopo')?.value || 'empresa'));
  }
}

// === NOVO: lista de fornecedores no modal (usa a key 'fornecedores' do localStorage) ===
function fillFornecedorDatalist(root = document) {
  const dl  = root.querySelector('#lst-forn');
  const inp = root.querySelector('#f-forn');
  if (!dl) return;

  let arr = [];
  try {
    if (typeof getFornecedores === 'function') {
      arr = getFornecedores() || [];
    } else {
      arr = JSON.parse(localStorage.getItem('fornecedores') || '[]') || [];
      if (arr && arr.items) arr = arr.items;
    }
  } catch { arr = []; }

  arr = Array.isArray(arr) ? arr.slice().sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''))) : [];
  dl.innerHTML = arr.map(f => {
    const nome   = String(f.nome || '').trim();
    const whats  = String(f.whats || '').trim();
    const segs   = Array.isArray(f.segmentos) ? f.segmentos.join('/') : '';
    return `<option value="${nome}" label="${segs ? segs+' – ' : ''}${whats}"></option>`;
  }).join('');

  if (inp) {
    inp.setAttribute('autocomplete', 'off');
  }
}

// esconde/mostra Conta/Forma se pendente/pago
function toggleCamposPorStatus(){
  const st = ($('#f-status2')?.value || 'pendente').toLowerCase();
  const exige = st === 'pago';

  const elConta = $('#f-conta');
  const elForma = $('#f-forma');
  if (elConta) elConta.required = exige;
  if (elForma) elForma.required = exige;

  const rowConta = document.querySelector('[data-form-row="conta"]');
  const rowForma = document.querySelector('[data-form-row="forma"]');
  if (rowConta) rowConta.style.display = '';
  if (rowForma) rowForma.style.display = '';

  const rowParcial = document.querySelector('#row-parcial');
  if (rowParcial) rowParcial.style.display = (st === 'pago') ? '' : 'none';
}

/* ===== Visibilidade do botão/box de cobrança ===== */
function toggleUIcobranca(){
  const tipo   = ($('#f-tipo')?.value || 'entrada').toLowerCase();
  const status = ($('#f-status2')?.value || 'pendente').toLowerCase();
  const allow  = (tipo==='entrada' && status==='pendente');
  const sect   = $('#sect-cobranca');
  const btn    = $('#btn-cobranca');
  if (sect) sect.style.display = allow ? '' : 'none';
  if (btn)  btn.style.display  = allow ? '' : 'none';
}

function clampVencimento(dtBase, offsetMeses, preferDay){
  const d = new Date(dtBase.getFullYear(), dtBase.getMonth(), 1);
  d.setMonth(d.getMonth() + offsetMeses + 1, 0);
  const last = d.getDate();
  const dia  = Math.min(preferDay, last);
  d.setDate(dia);
  d.setMonth(d.getMonth(), dia);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth()+1).padStart(2,'0');
  const dd   = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

// Lê valor de um input/selector/texto em pt-BR
function parseValorBR(input){
  let raw = '';

  if (input && typeof input === 'object' && 'value' in input) {
    raw = String(input.value || '');
  } else if (typeof input === 'string') {
    if (/^[#.\[]/.test(input)) {
      const el = document.querySelector(input);
      raw = el ? String(el.value || '') : '';
    } else {
      raw = input;
    }
  } else {
    raw = String(input ?? '');
  }

  raw = raw.trim();
  if (!raw) return 0;

  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n / 100 : 0;
  }

  const norm = raw.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const f = parseFloat(norm);
  return Number.isFinite(f) ? Math.round(f * 100) / 100 : 0;
}

/* ===== Cálculo/Prévia de parcelas ===== */
function calcParcelasParaCobranca(){
  const data   = $('#f-data')?.value || ISO();
  const valor = parseValorBR('#f-valor');
  const nParc  = Math.max(1, parseInt($('#f-parcelas')?.value || '1', 10));
  const modo   = (document.querySelector('input[name="f-parc-modo"]:checked')?.value) || 'dividir';
  const inicio = Math.max(0, parseInt($('#f-parc-inicio')?.value || '0', 10));
  const [Y,M,D] = String(data).split('-').map(Number);
  const dt = new Date(Y, (M||1)-1, D||1);
  const preferDay = D || dt.getDate();

  let total = valor;
  let valorParc = valor;
  if (modo === 'dividir'){
    valorParc = Math.round((valor / nParc) * 100) / 100;
    total     = valor;
  } else {
    valorParc = valor;
    total     = Math.round((valor * nParc) * 100) / 100;
  }

  const parcelas = Array.from({length:nParc}, (_,i) => {
    const iso = clampVencimento(dt, inicio + i, preferDay);
    const [y,m,d] = iso.split('-');
    return {
      numero: i+1,
      vencimentoISO: iso,
      vencimentoBR: `${d}/${m}/${y}`,
      valor: valorParc
    };
  });
  return { total, valorParc, parcelas, nParc, data };
}
function renderParcelasPreview(){
  const prev = $('#f-parc-prev');
  if (!prev) return;
  const { total, valorParc, parcelas, nParc } = calcParcelasParaCobranca();
  if (!nParc || !parcelas?.length) { prev.textContent = ''; return; }
  const datas = parcelas.map(p=>p.vencimentoBR).join(' • ');
  prev.textContent = nParc===1
    ? `Prévia: 1x de R$ ${fmtBR(valorParc)} — vencimento ${parcelas[0].vencimentoBR}`
    : `Prévia: ${nParc}x de R$ ${fmtBR(valorParc)} (Total R$ ${fmtBR(total)}) — vencimentos: ${datas}`;
}

/* ===== Cobrança ===== */
function gerarCobrancaBancaria(payloadBase, { silent = false } = {}) {
  const nome   = ($('#cb-nome')?.value || '').trim();
  const doc    = ($('#cb-doc')?.value  || '').trim();
  const email  = ($('#cb-email')?.value|| '').trim() || null;
  const tel    = ($('#cb-tel')?.value  || '').trim() || null;
  const metodo = ($('#cb-metodo')?.value||'').trim();
  const obs    = ($('#cb-obs')?.value  || '').trim() || null;

  if (!nome)  { if (!silent) alert('Informe o nome do cliente.'); return false; }
  if (!doc)   { if (!silent) alert('Informe CPF ou CNPJ.'); return false; }

  const tdoc  = tipoDocumento(doc);
  const okDoc = tdoc === 'CPF'
    ? validarCPF(doc)
    : (tdoc === 'CNPJ' ? validarCNPJ(doc) : false);

  if (!okDoc) {
    if (!silent) alert('Documento inválido. Confira o CPF/CNPJ.');
    $('#cb-doc')?.focus();
    return false;
  }

  if (!metodo) {
    if (!silent) alert('Selecione o método de pagamento (boleto/PIX/cartão).');
    return false;
  }

  const R = loadRegrasAtraso();
  const atrasoOn = $('#cb-atraso-on')?.checked ?? R.habilitado;

  const regrasAtraso = atrasoOn ? {
    habilitado:      true,
    toleranciaDias: Number($('#cb-tolerancia')?.value || R.toleranciaDias || 0),
    multaPercent:   Number($('#cb-multa')?.value      || R.multaPercent   || 0),
    jurosPercent:   Number($('#cb-juros')?.value      || R.jurosPercent   || 0),
    jurosTipo:      ($('#cb-juros-tipo')?.value       || R.jurosTipo      || 'am'),
    proRata:        !!($('#cb-prorata')?.checked      ?? R.proRata)
  } : { habilitado: false };

  // persiste as regras
  saveRegrasAtraso(regrasAtraso);

  const eventoId = $('#f-evento')?.value
    || (typeof __ctx !== 'undefined' ? (__ctx.eventoId || null) : null);

  const payload = {
    ...payloadBase,
    cobranca: {
      nome,
      documento: { tipo: tdoc, numero: onlyDigits(doc) },
      email,
      telefone: tel,
      metodo,
      observacoes: obs
    },
    regrasAtraso,
    eventoId
  };

  // === 1ª tentativa: usar alguma integração externa, se existir ===
  const fnIntegracao =
    window.finCobrancaEnviar ||
    window.enviarCobrancaBancaria ||
    window.gerarCobrancaBancariaIntegrada ||
    null;

  if (typeof fnIntegracao === 'function') {
    try {
      fnIntegracao(payload);   // a integração cuida dos alerts/redirect
      return true;
    } catch (e) {
      console.error('[cobranca] erro na integração externa:', e);
      if (!silent) alert('Falha ao enviar a cobrança para a integração.');
      // em caso de erro, cai pro fallback textual abaixo
    }
  }

  // === Sem integração (ou falhou) → usa texto / WhatsApp ===
  return gerarCobrancaFallback(payloadBase, { silent });
}

/* ===== Fallback (texto + WhatsApp) ===== */
function gerarCobrancaFallback(payloadBase, { silent = false } = {}) {
  const { parcelas, nParc, total, valorParc } = payloadBase;
  const desc = ($('#f-desc')?.value || 'Lançamento').trim();

  const R = loadRegrasAtraso();
  const linhaRegras = R.habilitado
    ? `Após vencimento: multa ${fmtBR(R.multaPercent)}% + juros ${fmtBR(R.jurosPercent)}% ${R.jurosTipo === 'ad' ? 'a.d.' : 'a.m.'}${R.jurosTipo === 'am' && R.proRata ? ' (pró-rata)' : ''} • tolerância ${R.toleranciaDias || 0} dia(s).`
    : `(sem multa/juros por atraso configurados).`;

  const linhas = parcelas
    .map(p => `Parcela ${p.numero} — ${p.vencimentoBR} — R$ ${fmtBR(p.valor)}`)
    .join('\n');

  const msg =
`Olá! Seguem os dados da cobrança:

Descrição: ${desc}
Total: R$ ${fmtBR(total)}
${nParc > 1
  ? `Parcelas (${nParc}x de R$ ${fmtBR(valorParc)}):\n${linhas}`
  : `Vencimento: ${parcelas[0].vencimentoBR}`}

${linhaRegras}

*Obs.:* Esta é uma cobrança gerada pelo sistema.`;

  // copia o texto
  try { navigator.clipboard?.writeText(msg); } catch {}

  if (!silent) {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const base = isMobile ? 'whatsapp://send?text=' : 'https://wa.me/?text=';

    // tenta abrir o WhatsApp
    try { window.open(base + encodeURIComponent(msg), '_blank', 'noopener'); } catch {}

    alert(
      'Cobrança montada e copiada para a área de transferência.\n\n' +
      'Se o WhatsApp não abrir automaticamente, é só abrir o WhatsApp/Web e colar a mensagem na conversa com o cliente.'
    );
  }

  return true;
}

/* ===== Botão "Gerar cobrança" ===== */
window.handleGerarCobranca = function handleGerarCobranca(silent = false) {
  // Usa o mesmo normalizador que o resto do sistema para o tipo
  const tipoRaw  = $('#f-tipo')?.value || 'entrada';
  const tipoNorm = (window.normalizeTipoLanc?.(tipoRaw) || String(tipoRaw)).toLowerCase();

  const statusRaw = $('#f-status2')?.value || 'pendente';
  const status    = String(statusRaw).toLowerCase();

  // Só permite cobrança para ENTRADA PENDENTE
  if (!(tipoNorm === 'entrada' && status === 'pendente')) {
    if (!silent) {
      alert('Só é possível gerar cobrança para lançamentos de ENTRADA com status PENDENTE.');
    }
    return false;
  }

  const desc  = ($('#f-desc')?.value || 'Lançamento').trim();
  const valor = toNumberInput($('#f-valor')?.value);

  if (!desc || !valor) {
    if (!silent) alert('Preencha descrição e valor para gerar a cobrança.');
    return false;
  }

  const base = calcParcelasParaCobranca();
  const cobrancaAtiva = $('#cb-enable')?.checked;

  if (cobrancaAtiva) {
    // tenta integração; se não tiver, já cai no fallback interno
    return gerarCobrancaBancaria(base, { silent });
  }

  // cobrança desativada → sempre fallback texto/WhatsApp
  return gerarCobrancaFallback(base, { silent });
};

// Garante que o FinModal conheça a função de cobrança,
// mesmo que ela tenha sido declarada depois.
try {
  window.FinModal = window.FinModal || {};
  window.FinModal.handleGerarCobranca = handleGerarCobranca;
} catch (e) {
  console.error('Erro ao anexar handleGerarCobranca ao FinModal', e);
}

// === Mini Viewer de Comprovante (overlay leve) ===
(function(){
  if (window.__openComprovanteMini) return; // evita duplicar
  window.__openComprovanteMini = function(src, title='Comprovante'){
    try{
      // remove anteriores
      document.querySelectorAll('.comp-mini-overlay').forEach(el => el.remove());

      const isPdf = /^data:application\/pdf/i.test(src) || /\.pdf(\?|#|$)/i.test(String(src||''));

      const wrap = document.createElement('div');
      wrap.className = 'comp-mini-overlay';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,.45);
        display:flex; align-items:center; justify-content:center;
        z-index:99999; padding:20px;
      `;

      const box = document.createElement('div');
      box.className = 'comp-mini-box';
      box.style.cssText = `
        width:min(92vw, 720px); max-height:90vh; background:#fff; border-radius:14px;
        box-shadow:0 12px 40px rgba(0,0,0,.25); overflow:hidden; display:flex; flex-direction:column;
      `;

      const head = document.createElement('div');
      head.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        padding:10px 12px; background:#5a3e2b; color:#fff; font-weight:700;
      `;
      head.innerHTML = `<span style="padding-right:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</span>
                        <button type="button" aria-label="Fechar" style="background:#fff;color:#5a3e2b;border:0;border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:800;">×</button>`;

      const closeBtn = head.querySelector('button');

      const body = document.createElement('div');
      body.style.cssText = `padding:10px; background:#fff; display:flex; align-items:center; justify-content:center;`;
      if (isPdf) {
        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.style.cssText = 'width:100%; height:70vh; border:0;';
        body.appendChild(iframe);
      } else {
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Comprovante';
        img.style.cssText = 'max-width:100%; max-height:70vh; display:block;';
        body.appendChild(img);
      }

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:8px; padding:10px; justify-content:flex-end; background:#fff;';
      const fechar = document.createElement('button');
      fechar.textContent = 'Fechar';
      fechar.type = 'button';
      fechar.style.cssText = 'background:#5a3e2b;color:#fff;border:0;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;';
      actions.appendChild(fechar);

      const kill = () => wrap.remove();
      closeBtn.addEventListener('click', kill);
      fechar.addEventListener('click', kill);
      wrap.addEventListener('click', (e)=>{ if (e.target === wrap) kill(); });
      document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ kill(); document.removeEventListener('keydown', esc); } });

      box.appendChild(head); box.appendChild(body); box.appendChild(actions);
      wrap.appendChild(box);
      document.body.appendChild(wrap);
    }catch(e){ console.warn('Mini viewer falhou:', e); }
  };
})();
// === Mini Viewer de Comprovante (overlay leve com X) ===
(function(){
  if (window.__openComprovanteMini) return; // evita duplicar

  window.__openComprovanteMini = function(src, title='Comprovante'){
    try{
      // remove overlays anteriores
      document.querySelectorAll('.comp-mini-overlay').forEach(el => el.remove());

      const isPdf = /^data:application\/pdf/i.test(src) || /\.pdf(\?|#|$)/i.test(String(src||''));

      const wrap = document.createElement('div');
      wrap.className = 'comp-mini-overlay';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,.45);
        display:flex; align-items:center; justify-content:center;
        z-index:99999; padding:20px;
      `;

      const box = document.createElement('div');
      box.className = 'comp-mini-box';
      box.style.cssText = `
        width:min(92vw, 720px); max-height:90vh; background:#fff;
        border-radius:14px; box-shadow:0 12px 40px rgba(0,0,0,.25);
        overflow:hidden; display:flex; flex-direction:column;
      `;

      const head = document.createElement('div');
      head.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        padding:10px 12px; background:#5a3e2b; color:#fff; font-weight:700;
      `;
      head.innerHTML = `
        <span style="padding-right:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${title}
        </span>
        <button type="button" aria-label="Fechar"
          style="background:#fff;color:#5a3e2b;border:0;border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:800;">
          ×
        </button>`;

      const closeBtn = head.querySelector('button');

      const body = document.createElement('div');
      body.style.cssText = `padding:10px; background:#fff; display:flex; align-items:center; justify-content:center;`;

      if (isPdf) {
        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.style.cssText = 'width:100%; height:70vh; border:0;';
        body.appendChild(iframe);
      } else {
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Comprovante';
        img.style.cssText = 'max-width:100%; max-height:70vh; display:block;';
        body.appendChild(img);
      }

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:8px; padding:10px; justify-content:flex-end; background:#fff;';

      const fechar = document.createElement('button');
      fechar.textContent = 'Fechar';
      fechar.type = 'button';
      fechar.style.cssText = 'background:#5a3e2b;color:#fff;border:0;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;';
      actions.appendChild(fechar);

      const kill = () => wrap.remove();
      closeBtn.addEventListener('click', kill);
      fechar.addEventListener('click', kill);
      wrap.addEventListener('click', (e)=>{ if (e.target === wrap) kill(); });
      document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ kill(); document.removeEventListener('keydown', esc); } });

      box.appendChild(head);
      box.appendChild(body);
      box.appendChild(actions);
      wrap.appendChild(box);
      document.body.appendChild(wrap);
    }catch(e){
      console.warn('Mini viewer falhou:', e);
      try { window.open(src, '_blank'); } catch {}
    }
  };
})();
   