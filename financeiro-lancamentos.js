// [C1/C3] Helpers canônicos do financeiro (tipo/BRL)
import { normalizeTipoLanc, toCentsSafe, parseBR } from './financeiro-shared.js';
// ===== Helpers
const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const fmtDateBR = iso => { if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; };

// --- Cartão de crédito (helpers) ---
// (removido o __cfg(); usaremos getCfg() definido mais abaixo)
function moneyBR(v){
  return (Number(v)||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}
// Debounce simples (corrigido)
function __debounce(fn, wait = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

// alias usado no resto do arquivo (filtro de busca)
const debounce = __debounce;

function isLancFeitoNoCartao(lanc){
  const cfg = (typeof getCfg === 'function' ? getCfg() : (()=>{ 
    try { return JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{}; } catch { return {}; } 
  })());

  const nomesCartoes = (Array.isArray(cfg.cartoes) ? cfg.cartoes : [])
    .map(c => String(c.nome||'').toLowerCase())
    .filter(Boolean);

  const forma = String(lanc.formaDescricao || lanc.formaNome || '').toLowerCase();
  const conta = String(lanc.contaNome || '').toLowerCase();

  return nomesCartoes.some(n =>
    forma.includes(n) || conta.includes(n) || forma.includes('cartão') || forma.includes('cartao')
  );
}

// expõe global (sem sobrescrever, se já existir)
if (typeof window !== 'undefined' && !window.isLancFeitoNoCartao) {
  window.isLancFeitoNoCartao = isLancFeitoNoCartao;
}


// “quitado” estrito (sem incluir “parcial”)
const IS_QUITADO_STRICT = s => ['pago','recebido','baixado','quitado','liquidado'].includes(String(s||'').toLowerCase());
// status “parcial” isolado
const IS_PARCIAL        = s => String(s||'').toLowerCase()==='parcial';

// ===== Store
const GKEY='financeiroGlobal';

import { onFinStoreChanged } from './financeiro-shared.js';

/* ==========================
   MOVIMENTOS DE CONTAS (Saldos)
   - Estrutura em localStorage.financeiroGlobal:
     contas: [{ id, nome, saldoInicial=0, saldoAtual=saldoInicial + (créditos - débitos) }]
     movimentos: [{ id, refKey, origem, lancamentoId, parcelaId, contaId, contaNome, tipo:'credito'|'debito', valor:Number, dataISO }]
   ========================== */
function _loadG() {
  try { return JSON.parse(localStorage.getItem(GKEY) || '{}') || {}; }
  catch { return {}; }
}
function _saveG(g) {
  try {
    localStorage.setItem(GKEY, JSON.stringify(g));
    localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
  } catch {}
}
/* ==== M33 · Notifier de parcela (criação/baixa) ==== */
function __m33NotifyParcela(prev, cur, lancamentoOpt){
  try{
    const pagoLike = (s) => ['pago','recebido','baixado','quitado','liquidado','parcial'].includes(String(s||'').toLowerCase());
    const existed  = !!prev;                 // prev = null/undefined => criação
    const prevSt   = String(prev?.status||'').toLowerCase();
    const curSt    = String(cur?.status ||'').toLowerCase();

    // Criação
    if (!existed) {
      notifyParcelaCriada(
        {
          ...cur,
          clienteNome: cur?.clienteNome || '',
          descricao  : cur?.descricao   || ''
        },
        lancamentoOpt || null
      );
    }

    // Baixa (transição para pago/recebido/etc.)
    if (!pagoLike(prevSt) && pagoLike(curSt)) {
      notifyBaixaParcela({
        ...cur,
        clienteNome: cur?.clienteNome || '',
        valor      : Number(cur?.valor||0),
        forma      : cur?.forma || cur?.formaDescricao || ''
      });
    }
  }catch(e){
    console.warn('M33: __m33NotifyParcela falhou', e);
  }
}

// === Mini-log local (opcional / Fase C) ===
function __pushFinLog(entry){
  try{
    const k = 'finLogs';
    const arr = JSON.parse(localStorage.getItem(k) || '[]') || [];
    arr.push({
      ts: new Date().toISOString(),
      ...entry
    });
    localStorage.setItem(k, JSON.stringify(arr));
    localStorage.setItem('finLogs:ping', String(Date.now()));
  }catch(e){ console.warn('finLogs write fail', e); }
}

// Encaixes no notifier existente (seguros mesmo se não houver definição prévia)
const __origNotifyParcela =
  (typeof window !== 'undefined' && typeof window.notifyParcelaCriada === 'function')
    ? window.notifyParcelaCriada
    : null;

window.notifyParcelaCriada = function (p, l) {
  try {
    __pushFinLog({
      kind: 'parcela_criada',
      parcelaId: p?.id,
      lancId: p?.lancamentoId || l?.id || null,
      status: p?.status || 'pendente',
      valor: p?.valor || p?.totalPago || 0
    });
  } catch {}
  return __origNotifyParcela ? __origNotifyParcela(p, l) : null;
};

const __origNotifyBaixa =
  (typeof window !== 'undefined' && typeof window.notifyBaixaParcela === 'function')
    ? window.notifyBaixaParcela
    : null;

window.notifyBaixaParcela = function (p) {
  try {
    __pushFinLog({
      kind: 'parcela_baixa',
      parcelaId: p?.id,
      lancId: p?.lancamentoId || null,
      status: p?.status || 'recebido',
      valor: p?.valor || p?.totalPago || 0,
      forma: p?.forma || ''
    });
  } catch {}
  return __origNotifyBaixa ? __origNotifyBaixa(p) : null;
};

function _ensureArrays(g){
  if (!Array.isArray(g.contas)) g.contas = [];
  if (!Array.isArray(g.movimentos)) g.movimentos = [];
  if (!Array.isArray(g.lancamentos)) g.lancamentos = [];
  if (!Array.isArray(g.parcelas)) g.parcelas = [];
  return g;
}
// ===== Tombstones (evitam reimportar itens apagados) =====
function _ensureDeleted(g){
  g.deleted = g.deleted || {};
  g.deleted.lancs = Array.isArray(g.deleted.lancs) ? g.deleted.lancs : [];
  g.deleted.parcs = Array.isArray(g.deleted.parcs) ? g.deleted.parcs : [];
  return g;
}
function _markDeletedLanc(g, lancId){
  _ensureDeleted(g);
  const k = String(lancId);
  if (!g.deleted.lancs.includes(k)) g.deleted.lancs.push(k);
}
function _markDeletedParc(g, parcId){
  _ensureDeleted(g);
  const k = String(parcId);
  if (!g.deleted.parcs.includes(k)) g.deleted.parcs.push(k);
}
function _isDeletedLanc(g, lancId){
  _ensureDeleted(g);
  return g.deleted.lancs.includes(String(lancId));
}
function _isDeletedParc(g, parcId){
  _ensureDeleted(g);
  return g.deleted.parcs.includes(String(parcId));
}

// Lê config p/ sincronizar contas (saldoInicial, nomes)
function _cfg(){ 
  try{ return JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{}; }catch{ return {}; } 
}
function _syncContasFromConfig(g){
  const cfg = _cfg();
  const cfgContas = Array.isArray(cfg.contas) ? cfg.contas : [];
  const byId = new Map((g.contas||[]).map(c => [String(c.id), c]));
  for (const ct of cfgContas){
    const id = ct.id;
    const nome = ct.nome || '';
    const saldoInicial = Number(ct.saldo || 0); // saldo cadastrado em Categorias → Contas
    const ex = byId.get(String(id));
    if (ex){
      ex.nome = nome;
      ex.saldoInicial = saldoInicial;
    } else {
      (g.contas ||= []).push({ id, nome, saldoInicial, saldoAtual: saldoInicial });
    }
  }
  // opcional: remove contas que saíram do config
  g.contas = (g.contas||[]).filter(c => cfgContas.some(ct => String(ct.id)===String(c.id)));
}
// ==== CSV helpers ====
function __csvEscape(v){
  if (v == null) return '';
  const s = String(v);
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function __downloadCSV(filename, text){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function _uuid(){ return (Date.now().toString(36) + Math.random().toString(36).slice(2,10)); }
function __extractConta(obj){
  if (!obj || typeof obj !== 'object') return { contaId:'', contaNome:'' };

  const read = (o, path) => {
    try {
      return path.split('.').reduce((acc,k)=>acc?.[k], o);
    } catch { return undefined; }
  };
  const firstNonEmpty = (...vals) => {
    for (const v of vals){
      if (v == null) continue;
      const s = String(v).trim();
      if (s !== '') return s;
    }
    return '';
  };

  // Possíveis locais para o ID
  let contaId = firstNonEmpty(
    obj.contaId, obj.conta_id, obj.id_conta,
    read(obj,'contaId'), read(obj,'conta.id'),
    read(obj,'contaSelecionada.id'), read(obj,'pagamento.contaId'),
    read(obj,'pagamento.conta.id'), read(obj,'baixa.contaId'),
    read(obj,'baixa.conta.id'), read(obj,'liquidacao.contaId'),
    read(obj,'liquidacao.conta.id')
  );

  // Possíveis locais para o NOME
  let contaNome = firstNonEmpty(
    obj.contaNome, obj.contaDescricao, obj.conta_nome, obj.conta_name,
    read(obj,'contaNome'), read(obj,'conta.nome'), read(obj,'conta.descricao'),
    read(obj,'contaSelecionada.nome'), read(obj,'contaSelecionada.descricao'),
    read(obj,'pagamento.contaNome'), read(obj,'pagamento.conta.nome'),
    read(obj,'baixa.contaNome'), read(obj,'baixa.conta.nome'),
    read(obj,'liquidacao.contaNome'), read(obj,'liquidacao.conta.nome')
  );

  // Caso `obj.conta` seja uma string (usuário salvou texto), usa como nome
  if (!contaNome && typeof obj.conta === 'string' && isNaN(Number(obj.conta))) {
    contaNome = String(obj.conta).trim();
  }

  return { contaId: String(contaId||'').trim(), contaNome: String(contaNome||'').trim() };
}

// Resolve o ID/nome da conta antes de gravar o movimento (aceita id ou nome)
function __resolveConta(g, contaId, contaNome){
  try{
    const cfg        = (()=>{ try{ return JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{}; }catch{ return {}; } })();
    const contasG    = Array.isArray(g?.contas) ? g.contas : [];
    const contasCfg  = Array.isArray(cfg?.contas) ? cfg.contas : [];

    let id   = (contaId == null ? '' : String(contaId)).trim();
    let nome = (contaNome || '').trim();

    const eq = (a,b) => String(a||'').trim().toLowerCase() === String(b||'').trim().toLowerCase();

    // 1) já há conta com esse ID?
    const hitId = id && (contasG.find(c => eq(c.id,id)) || contasCfg.find(c => eq(c.id,id)));
    if (hitId){
      if (!nome) nome = (hitId.nome || hitId.descricao || '');
      return { id: String(hitId.id), nome: String(nome||'') };
    }

    // 2) tenta casar por nome (case-insensitive)
    const alvo = (nome || id);
    if (alvo){
      const hitNome = contasG.find(c => eq(c.nome, alvo))
                 ||   contasCfg.find(c => eq((c.nome||c.descricao), alvo));
      if (hitNome) return { id: String(hitNome.id), nome: String(hitNome.nome || hitNome.descricao || '') };
    }

    // 3) fallback
    return { id, nome };
  }catch{
    return { id:(contaId==null?'':String(contaId)), nome:(contaNome||'') };
  }
}

function removeMovementsByRef(refKey){
  const g = _ensureArrays(_loadG());
  const before = g.movimentos.length;
  g.movimentos = g.movimentos.filter(m => String(m.refKey) !== String(refKey));
  if (g.movimentos.length !== before){
    _saveG(g);
    try{ recomputeAllAccountBalances(); }catch{}
  }
}

function __upsertMovement(mov){
  // carrega e garante arrays usando os helpers deste arquivo
  const g = _ensureArrays(_loadG());
  _syncContasFromConfig(g);

  // Normalizador canônico (via import do shared) com fallback seguro
  const normFn = (typeof normalizeTipoLanc === 'function')
    ? normalizeTipoLanc
    : (t => String(t || '').toLowerCase());

  // 1) decide tipo do lançamento (entrada|saida) com fallbacks seguros
  let tipoLanc = '';

  if (String(mov?.origem || '') === 'lancamento' && mov?.lancamentoId != null) {
    const lanc = (g.lancamentos || []).find(l => String(l.id) === String(mov.lancamentoId));
    if (lanc) {
      // (a) tenta o campo informado do lançamento
      tipoLanc = normFn(lanc.tipo) || '';

      // (b) deduz pela CATEGORIA (id/sub) se ainda não definido
      if (!tipoLanc && typeof __catTipoById === 'function') {
        tipoLanc = __catTipoById(lanc.categoriaId, lanc.subcategoriaId) || '';
      }

      // (c) último fallback: nome de categoria (texto)
      if (!tipoLanc) {
        const cat = String(lanc.categoriaNome || lanc.categoria || '').toLowerCase();
        if (/despesa|custo|fornecedor|saida/.test(cat))      tipoLanc = 'saida';
        else if (/receita|entrada|venda/.test(cat))          tipoLanc = 'entrada';
      }
    }
  }

  // (d) se ainda não decidiu, tenta o próprio movimento
  if (!tipoLanc) {
    tipoLanc = normFn(mov?.tipo) || '';
  }

  // mapeia só quando sabe; default seguro = 'debito' (evita creditar saída por engano)
  const tipoMov =
    (tipoLanc === 'entrada') ? 'credito' :
    (tipoLanc === 'saida')   ? 'debito'  :
    'debito';

  // 2) resolver conta (aceita id ou nome) antes de gravar
  const resolved = __resolveConta(g, mov?.contaId, mov?.contaNome);

  // 3) upsert por refKey
  const i = (g.movimentos || []).findIndex(m => String(m.refKey) === String(mov.refKey));
  const base = (i >= 0 ? g.movimentos[i] : null);

  const item = {
    id: (base?.id) || mov?.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,8)),
    refKey: String(mov?.refKey || base?.refKey || ''),
    origem: mov?.origem || base?.origem || 'lancamento',
    lancamentoId: (mov?.lancamentoId ?? base?.lancamentoId ?? ''),
    parcelaId:     (mov?.parcelaId    ?? base?.parcelaId    ?? ''),
    contaId:       String(resolved.id || ''),
    contaNome:     String(resolved.nome || ''),
    tipo: tipoMov,                    // crédito/débito correto
    valor: Number(mov?.valor || 0),
    dataISO: String(mov?.dataISO || new Date().toISOString().slice(0,10)).slice(0,10)
  };

  if (i >= 0) g.movimentos[i] = item; else (g.movimentos ||= []).push(item);

  _saveG(g);

  // recalcula saldos usando o helper deste arquivo
  try { recomputeAllAccountBalances(); } catch {}
}

// Util para sincronizar UM lançamento (deleta todos os refs desse lançamento e recria)
function syncAccountMovementsForLancamento(lancId){
  // 0) carrega e garante arrays
  const g = (function(){ try { return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}')||{}; } catch { return {}; } })();
  if (!Array.isArray(g.lancamentos)) g.lancamentos = [];
  if (!Array.isArray(g.parcelas))    g.parcelas    = [];
  if (!Array.isArray(g.movimentos))  g.movimentos  = [];
  if (!Array.isArray(g.contas))      g.contas      = [];

  // 1) encontra o lançamento
  const lanc = g.lancamentos.find(l => String(l.id) === String(lancId));
  if (!lanc) return;

// 2) normaliza tipo (entrada/saida) -> decide CRÉDITO/DÉBITO (sem chutar 'entrada')
let tipoLanc = normalizeTipoLanc?.(lanc.tipo) || '';


// se ainda não deu pra decidir pelo campo "tipo", tenta inferir pela categoria/nome
if (!tipoLanc) {
  if (typeof __catTipoById === 'function') {
    tipoLanc = __catTipoById(lanc.categoriaId, lanc.subcategoriaId) || '';
  }
  if (!tipoLanc) {
    const catTxt = String(lanc.categoriaNome || lanc.categoria || '').toLowerCase();
    if (/despesa|custo|fornecedor|saida/.test(catTxt)) tipoLanc = 'saida';
    else if (/receita|entrada|venda/.test(catTxt)) tipoLanc = 'entrada';
  }
}

const tipoMov = (tipoLanc === 'entrada') ? 'credito' : 'debito';


  // 3) apaga movimentos antigos deste lançamento
  const refPrefix = `lanc:${lancId}:`;
  g.movimentos = g.movimentos.filter(m => !String(m.refKey||'').startsWith(refPrefix));

  // 4) recria pelos status/parcelas quitadas
  const parcelas = g.parcelas.filter(p => String(p.lancamentoId) === String(lancId));
  let created = 0;

  for (const p of parcelas) {
    const st = String(p.status||'').toLowerCase();
    const isQuitada = ['pago','recebido','baixado','quitado','liquidado','parcial'].includes(st);
    if (!isQuitada) continue;

    // conta da parcela → se vazio, usa do lançamento
    let { contaId, contaNome } = __extractConta(p);
    if (!contaId && !contaNome) {
      const fallback = __extractConta(lanc);
      contaId = fallback.contaId; contaNome = fallback.contaNome;
    }

    // valor/data
    const valor = Number((p.totalPago ?? p.valor ?? 0)) || 0;
    const dataISO = String(
      p.dataPagamentoISO || p.vencimentoISO || p.vencimento ||
      lanc.dataPagamentoISO || lanc.dataCompetencia || lanc.dataISO ||
      new Date().toISOString().slice(0,10)
    ).slice(0,10);

    g.movimentos.push({
      id: (Date.now().toString(36) + Math.random().toString(36).slice(2,10)),
      refKey: `lanc:${lancId}:parc:${p.id}`,
      origem: 'lancamento',
      lancamentoId: String(lancId),
      parcelaId: String(p.id),
      contaId: (contaId||'')+'',
      contaNome: contaNome || '',
      tipo: tipoMov,   // <- aqui respeita o tipo do lançamento
      valor,
      dataISO
    });
    created++;
  }

  // 5) fallback: se não há parcelas criadas e o lançamento está quitado “no todo”
  if (created === 0) {
    const stLanc = String(lanc.status||'').toLowerCase();
    const isQuitadoLanc = ['pago','recebido','baixado','quitado','liquidado'].includes(stLanc);
    if (isQuitadoLanc) {
      const base = __extractConta(lanc);
      const valor = Number(lanc.valor ?? lanc.valorTotal ?? 0) || 0;
      const dataISO = String(
        lanc.dataPagamentoISO || lanc.dataCompetencia || lanc.dataISO || new Date().toISOString().slice(0,10)
      ).slice(0,10);

      g.movimentos.push({
        id: (Date.now().toString(36) + Math.random().toString(36).slice(2,10)),
        refKey: `lanc:${lancId}:full`,
        origem: 'lancamento',
        lancamentoId: String(lancId),
        parcelaId: '',
        contaId: (base.contaId||'')+'',
        contaNome: base.contaNome || '',
        tipo: tipoMov, // idem
        valor,
        dataISO
      });
    }
  }

  // 6) salva, recalcula saldos e pinga outras telas
  try {
    localStorage.setItem('financeiroGlobal', JSON.stringify(g));
    recomputeAllAccountBalances(); // saldoInicial + créditos - débitos
    localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
  } catch {}
}


function recomputeAllAccountBalances(){
  const g = _ensureArrays(_loadG());

  // garante que as contas existam com nome/saldoInicial do config
  _syncContasFromConfig(g);

  // zera saldoAtual com base no saldoInicial
  const byId = {};
  for (const c of g.contas){
    c.saldoInicial = Number(c.saldoInicial || 0);
    c.saldoAtual   = Number(c.saldoInicial);
    byId[String(c.id)] = c;
  }

 const norm = s => String(s||'').trim().toLowerCase();
for (const m of (g.movimentos||[])){
  let conta = byId[String(m.contaId)];
  if (!conta && m.contaNome){
    const alvo = norm(m.contaNome);
    const hit = Object.values(byId).find(c => norm(c.nome) === alvo);
    if (hit) conta = hit;
  }
  if (!conta) continue;
  const v = Number(m.valor || 0);
  if (String(m.tipo)==='credito') conta.saldoAtual += v;
  else if (String(m.tipo)==='debito') conta.saldoAtual -= v;
}


  // espelha map usado por Resumo/Widgets (opcional, mas útil)
  g.saldoPorConta = {};
  for (const c of g.contas){ g.saldoPorConta[c.id] = Number(c.saldoAtual||0); }

  _saveG(g); // também emite ping
}

// Use quando uma PARCELA isolada teve alteração de status/conta/valor
function syncAccountMovementForParcela(parcelaId){
  const g = _ensureArrays(_loadG());
  const p = (g.parcelas||[]).find(x => String(x.id)===String(parcelaId));
  if (!p) return;
  const lancId = p.lancamentoId;

  // delega para o lançamento, pois pode haver movimentos “full” a remover
  syncAccountMovementsForLancamento(lancId);
}

// Remover movimentos quando exclui lançamento/parcela
function removeMovementsForLanc(lancId){
  const g = _ensureArrays(_loadG());
  const before = (g.movimentos||[]).length;
  g.movimentos = (g.movimentos||[]).filter(m => String(m.lancamentoId)!==String(lancId));
  if (g.movimentos.length !== before){
    _saveG(g);
    recomputeAllAccountBalances();
  }
}
function removeMovementForParcela(parcelaId){
  const g = _ensureArrays(_loadG());
  const before = (g.movimentos||[]).length;
  g.movimentos = (g.movimentos||[]).filter(m => String(m.parcelaId)!==String(parcelaId));
  if (g.movimentos.length !== before){
    _saveG(g);
    recomputeAllAccountBalances();
  }
}
async function deleteParcela(parcelaId){
  if (!parcelaId) return;

  const idStr = String(parcelaId);
  const ok = confirm('Excluir esta parcela? Movimentos vinculados a ela serão removidos.');
  if (!ok) return;

  try{
    // 1) tenta excluir na API (M36), se disponível
    if (window.apiFinDeleteParcela) {
      try {
        await window.apiFinDeleteParcela(idStr);
      } catch (e) {
        console.warn('[deleteParcela] falha na API:', e);
        alert('Não foi possível excluir a parcela.');
        return;
      }
    }

    // 2) ajusta snapshot local + movimentos + comprovante + notificações
    const g = _ensureArrays(_loadG());
    _ensureDeleted(g);

    // pega a parcela (para limpar anexo e saber lancamentoId)
    const parc = (g.parcelas || []).find(p => String(p.id) === idStr);
    if (!parc) {
      alert('Parcela não encontrada.');
      return;
    }
    const lancId = parc?.lancamentoId;

    // remove parcela
    g.parcelas = (g.parcelas || []).filter(p => String(p.id) !== idStr);

    // tombstone
    _markDeletedParc(g, idStr);

    // remove movimentos desta parcela (já persiste e recalcula)
    try { removeMovementForParcela(idStr); } catch {}

    // limpa comprovante “separado”
    try { localStorage.removeItem(`fg.comp.parc:${idStr}`); } catch {}

    // salva + recalcula + re-render
    _saveG(g);
    try { recomputeAllAccountBalances(); } catch {}
    try { render(); } catch {}

    // re-sincroniza movimentos do lançamento (se existir)
    if (typeof syncAccountMovementsForLancamento === 'function' && lancId != null){
      try { syncAccountMovementsForLancamento(lancId); } catch {}
    }

    // ===== M33 (opcional): marcar card da agenda como concluído + feed =====
    try {
      // fecha (done) o item unificado da parcela
      window.__agendaBridge?.setUnifiedDone?.(`fin:parcela:${idStr}`);

      // feed curto “parcela excluída”
      window.__agendaBridge?.publishNotificationFeed?.({
        id: `notif:fin:parcelaDeleted:${idStr}:${Date.now().toString(36)}`,
        title: 'Parcela excluída',
        level: 'info',
        entity: { type: 'parcela', id: idStr },
        meta: {
          lancamentoId: lancId != null ? String(lancId) : '',
          valor: Number(parc?.valor || 0),
          cliente: parc?.clienteNome || ''
        }
      });
    } catch(e){
      console.warn('M33 deleteParcela feed/done falhou', e);
    }

  } catch(e){
    console.error('[deleteParcela] erro:', e);
    alert('Não foi possível excluir a parcela.');
  }
}

// === Origem amigável para a linha do lançamento ===
function origemLabelLanc(l) {
  // se tem evento vinculado e o nome do evento foi resolvido, exibe-o
  if (l?.eventoId && String(l.eventoId) !== '0' && (l.eventoNome || l.eventoTitulo)) {
    return l.eventoNome || l.eventoTitulo;
  }
  // senão, usa a origem/fonte; por padrão "Dashboard"
  if (l?.origemNome) return l.origemNome;
  if (l?.fonte) return String(l.fonte).toLowerCase().includes('dashboard') ? 'Dashboard' : l.fonte;
  if (l?.origem) return (String(l.origem).toLowerCase()==='dashboard-quick' ? 'Dashboard' : l.origem);
  return 'Dashboard';
}

async function deleteLancamento(lancId){
  if (!lancId) return;

  const idStr = String(lancId);

  const ok = confirm('Excluir este lançamento? Isso também removerá TODAS as parcelas e movimentos relacionados.');
  if (!ok) return;

  try {
    // 1) tenta excluir na API (M36), se disponível
    if (window.apiFinDeleteLancamento) {
      try {
        await window.apiFinDeleteLancamento(idStr);
      } catch (e) {
        console.warn('[deleteLancamento] falha na API:', e);
        alert('Não foi possível excluir o lançamento.');
        return;
      }
    }

    // 2) ajusta snapshot local + movimentos + comprovantes + notificações
    const g = _ensureArrays(_loadG());
    _ensureDeleted(g);

    // 2.1) remove parcelas e anota IDs para limpar comprovantes
    const parcelasRemovidas = (g.parcelas || []).filter(p => String(p.lancamentoId) === idStr);
    g.parcelas    = (g.parcelas || []).filter(p => String(p.lancamentoId) !== idStr);
    g.lancamentos = (g.lancamentos || []).filter(l => String(l.id) !== idStr);

    // 2.2) marca tombstones
    _markDeletedLanc(g, idStr);
    for (const p of parcelasRemovidas){
      _markDeletedParc(g, p.id);
    }

    // 2.3) remove movimentos correlatos (já persiste e recalcula internamente)
    try { removeMovementsForLanc(idStr); } catch {}

    // 2.4) limpa comprovantes salvos em LS (se usados)
    try {
      localStorage.removeItem(`fg.comp:${idStr}`);
      for (const p of parcelasRemovidas) {
        localStorage.removeItem(`fg.comp.parc:${p.id}`);
      }
    } catch {}

    // 2.5) salva + recalcula + pinga outras abas + re-render
    _saveG(g);
    try { recomputeAllAccountBalances(); } catch {}
    try { render(); } catch {}

    // 3) M33 (opcional): concluir cards e publicar feed
    try {
      // conclui os itens unificados das parcelas removidas
      for (const p of parcelasRemovidas) {
        window.__agendaBridge?.setUnifiedDone?.(`fin:parcela:${p.id}`);
      }

      // feed do lançamento removido
      window.__agendaBridge?.publishNotificationFeed?.({
        id: `notif:fin:lancDeleted:${idStr}:${Date.now().toString(36)}`,
        title: 'Lançamento excluído',
        level: 'info',
        entity: { type: 'lancamento', id: idStr },
        meta: {
          qtdParcelas: parcelasRemovidas.length
        }
      });
    } catch(e){
      console.warn('M33 deleteLancamento feed/done falhou', e);
    }

  } catch (e) {
    console.error('[deleteLancamento] erro:', e);
    alert('Não foi possível excluir o lançamento.');
  }
}


const store = {
  all(){
    try{
      const g = JSON.parse(localStorage.getItem(GKEY) || '{}');
      return Array.isArray(g.lancamentos) ? g.lancamentos : [];
    }catch{ return []; }
  },
setAll(arr){
  try{
    // 1) normaliza eventoId/eventoNome em qualquer origem
    const eventos = (function(){
      try { return JSON.parse(localStorage.getItem('eventos')||'[]') || []; } catch { return []; }
    })();
    const evById = new Map(eventos.map(e => [String(e.id), e]));

    const norm = (l) => {
      const evId =
        (l.eventoId ?? l.evId ?? l.idEvento ?? '') + '';
      let eventoId = evId.trim();

      let eventoNome = (l.eventoNome || l.nomeEvento || l.eventoTitulo || l.evento?.nome || l.evento?.titulo || '').trim();

      if (eventoId && !eventoNome) {
        const ev = evById.get(String(eventoId));
        if (ev) eventoNome = (ev.nomeEvento || ev.titulo || ev.nome || '') + '';
      }
      return { ...l, eventoId, eventoNome };
    };

    const arrNorm = Array.isArray(arr) ? arr.map(norm) : [];

    // 2) persiste no FG
    const g = JSON.parse(localStorage.getItem(GKEY) || '{}') || {};
    g.lancamentos = arrNorm;
    localStorage.setItem(GKEY, JSON.stringify(g));

    // 3) ping para outras abas/telas
    localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
  }catch{}
}

};
// ===== Refs/Estado
const refs = {
  origem: document.getElementById('f-origem'),
  tipo: document.getElementById('f-tipo'),
  status: document.getElementById('f-status'),
  mes: document.getElementById('f-mes'),
  busca: document.getElementById('f-busca'),
  clear: document.getElementById('f-clear'),
  tb: document.getElementById('tb'),

  // modal anexo
  anexoModal: document.getElementById('anexoModal'),
  anexoViewer: document.getElementById('anexoViewer'),
  anexoClose: document.getElementById('anexoClose'),
  anexoBaixar: document.getElementById('anexoBaixar'),
  anexoImprimir: document.getElementById('anexoImprimir'),
};

// ---- Estado ÚNICO global (fora do objeto refs)
window.state = window.state || {
  origem: 'todas',
  tipo: 'todos',
  status: 'todos',
  mes: new Date().toISOString().slice(0,7),
  busca: ''
};
if (refs.mes && !refs.mes.value) refs.mes.value = window.state.mes;

// Filtros básicos (sempre atualizam window.state)
refs.origem?.addEventListener('change', () => {
  window.state.origem = refs.origem.value;
  render(); try { updateCardsMes(window.state.mes); } catch {}
});
refs.tipo?.addEventListener('change', () => {
  window.state.tipo = refs.tipo.value;
  render(); try { updateCardsMes(window.state.mes); } catch {}
});
refs.status?.addEventListener('change', () => {
  window.state.status = refs.status.value;
  render(); try { updateCardsMes(window.state.mes); } catch {}
});
refs.mes?.addEventListener('change', () => {
  window.state.mes = refs.mes.value;
  render(); try { updateCardsMes(window.state.mes); } catch {}
});
// Busca com debounce (não "trava" enquanto digita)
refs.busca?.addEventListener('input', __debounce(() => {
  window.state.busca = refs.busca.value;
  render();
}, 180));


refs.clear?.addEventListener('click', () => {
  window.state.origem = 'todas';
  window.state.tipo   = 'todos';
  window.state.status = 'todos';
  window.state.busca  = '';
  if (refs.origem) refs.origem.value = 'todas';
  if (refs.tipo)   refs.tipo.value   = 'todos';
  if (refs.status) refs.status.value = 'todos';
  if (refs.busca)  refs.busca.value  = '';
  render(); try { updateCardsMes(window.state.mes); } catch {}
});


// Atualiza os cards do mês no primeiro render
try { updateCardsMes(window.state.mes); } catch {}


// === Cache de anexos escolhidos na renderização ===
window.__anexosCache = new Map(); // key = String(lancId); value = { src, filename }

window.addEventListener('storage', (e) => {
  if (
    e.key === 'financeiroGlobal' ||
    e.key === 'financeiroGlobal:ping' ||
    e.key === 'fg:ping' ||              // 👈 novo
    e.key === 'configFinanceiro'
  ) {
    try { recomputeAllAccountBalances(); } catch {}
    try { render(); } catch {}
    try { updateCardsMes(state.mes); } catch {}
  }
});



// Qualquer alteração no store financeiro (M14/M36)
window.addEventListener('fin-store-changed', () => {
  try { recomputeAllAccountBalances(); } catch {}
  try { render(); } catch {}
  try { updateCardsMes(state.mes); } catch {}
});

// === Realtime entre abas (BroadcastChannel) ===
(function bindRealtimeLancamentos(){
  // Canal principal usado pelo Dashboard e outras telas
  try {
    const bc = new BroadcastChannel('mrubuffet');
    bc.onmessage = (e) => {
      const t = e?.data?.type || '';
      if (t === 'fin-store-changed' || t === 'fg:changed') {
        try { recomputeAllAccountBalances(); } catch {}
        try { render(); } catch {}
        try { updateCardsMes(state.mes); } catch {}
      }
    };
  } catch {}

  // Canal usado pelo Financeiro do Evento
  try {
    const bc2 = new BroadcastChannel('kgb-sync');
    bc2.onmessage = (e) => {
      const t = e?.data?.type || '';
      if (t === 'fg:changed' || t === 'fin-store-changed') {
        try { recomputeAllAccountBalances(); } catch {}
        try { render(); } catch {}
        try { updateCardsMes(state.mes); } catch {}
      }
    };
  } catch {}
})();

// === APLICA FILTROS A PARTIR DA URL ?mes=&origem=&tipo=&categoria=&status=&eventoId= ===
(function applyURLFilters(){
  try{
    const q = new URLSearchParams(location.search);

    // mes (YYYY-MM)
    const mes = q.get('mes');
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      state.mes = mes;
      if (refs.mes) refs.mes.value = mes;
    }

    // origem -> f-origem (todas/empresa/pessoal/ambas)
    const origem = (q.get('origem')||'').toLowerCase();
    if (['todas','empresa','pessoal','ambas'].includes(origem)) {
      state.origem = (origem==='ambas'?'todas':origem || 'todas');
      if (refs.origem) refs.origem.value = state.origem;
    }

    // tipo -> f-tipo (todos/entrada/saida)
    let tipo = (q.get('tipo')||'').toLowerCase();
    if (tipo==='receita') tipo='entrada';
    if (tipo==='despesa') tipo='saida';
    if (['entrada','saida','todos'].includes(tipo)) {
      state.tipo = tipo;
      if (refs.tipo) refs.tipo.value = tipo;
    }

    // categoria -> usa o campo de busca (como filtro textual)
    const cat = q.get('categoria');
    if (cat) {
      state.busca = cat;
      if (refs.busca) refs.busca.value = cat;
    }

    // status detalhado opcional (?status=entrada_pendente|entrada_paga|saida_pendente|saida_paga)
    const statusURL = (q.get('status') || q.get('statusDetalhado') || '').toLowerCase();
    if (statusURL) {
      try { state.status = statusURL; } catch {}
      const selStatus = document.getElementById('f-status') || (window.refs && window.refs.status);
      if (selStatus) {
        selStatus.value = statusURL;                 // precisa existir <option value="...">
        selStatus.dispatchEvent(new Event('change'));// força re-render com o novo status
      }
    }

    // eventoId -> filtra por lançamentos/parcelas vinculados a um evento
    const evId = q.get('eventoId');
    if (evId) {
      state.eventoId = String(evId);
    }

  } catch (e) {
    console.warn('[applyURLFilters] ignorando erro:', e);
  }
})();


// ==== helpers extras (compat) ====
const _readLocal = (k, d) => {
  try {
    const raw = localStorage.getItem(k);
    const v = JSON.parse(raw ?? (d==null ? 'null' : JSON.stringify(d)));
    return v == null ? d : v;
  } catch { return d; }
};
const getFromLS = (k, d) => (window.readLS ? window.readLS(k, d) : _readLocal(k, d));

function fmtVenc(m){
  const iso = m.vencimentoISO || m.dataVencimento || m.dataCompetencia || m.dataISO || m.data || "";
  if(!iso) return "";
  const [y,mn,d]=iso.slice(0,10).split("-");
  return `${d}/${mn}/${y}`;
}
function getCfg(){ return getFromLS("configFinanceiro", {}); }
// === DETERMINA 'entrada' | 'saida' pela categoria/subcategoria (por ID) ===
function __catTipoById(catId, subId){
  try{
    const cfg = getCfg && typeof getCfg==='function'
      ? getCfg()
      : JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{};

    const cats = Array.isArray(cfg?.categorias) ? cfg.categorias : [];
    const byId = id => cats.find(c => String(c.id)===String(id));

    const cat = byId(catId);
    const sub = byId(subId);

    // tenta campo "tipo" se existir
    const tRaw = String((sub?.tipo ?? cat?.tipo ?? '')).toLowerCase();
    if (tRaw==='saida' || tRaw==='despesa')  return 'saida';
    if (tRaw==='entrada' || tRaw==='receita') return 'entrada';

    // fallback por NOME/descrição da categoria
    const nome = String(sub?.descricao || sub?.nome || cat?.descricao || cat?.nome || '').toLowerCase();
    if (/despesa|custo|fornecedor|saida/.test(nome))  return 'saida';
    if (/receita|entrada|venda/.test(nome))           return 'entrada';
  }catch{}
  return '';
}

function getEventos(){ return getFromLS("eventos", []); }

function catNome(catId, subId){
  if (String(catId)==='_ajuste_saldo_') return 'Atualização de saldo';
  const cfg = getCfg();
  const cats = Array.isArray(cfg?.categorias) ? cfg.categorias : [];
  const cat = cats.find(c => String(c.id)===String(catId));
  const sub = cats.find(s => String(s.id)===String(subId));
  const c = cat ? (cat.descricao || cat.nome) : "";
  const s = sub ? (sub.descricao || sub.nome) : "";
  return (c && s) ? `${c} › ${s}` : (c || s || "-");
}

function origemLabel(m){
  if (m.isSaldoAjuste || String(m.origem||'')==='ajuste_saldo') return 'Atualização de saldo';
  if (m.eventoId){
    const ev = (getEventos()||[]).find(e => String(e.id)===String(m.eventoId));
    return ev ? (ev.titulo || ev.nomeEvento || ev.nome || `Evento ${ev.id}`) : "Evento";
  }
  const o = String(m.origem||"").toLowerCase();
  if (o.includes("dash")) return "Lançamento rápido";
  return "Lançamentos";
}

// Resolve nome da conta e descrição da forma a partir do configFinanceiro
function __resolveContaNomeById(contaId){
  if (contaId == null || contaId === '') return '';
 const cfg = getCfg();
  const c = (cfg.contas||[]).find(x => String(x.id)===String(contaId));
  return c?.nome || c?.descricao || '';
}
function __resolveFormaDescById(formaId){
  if (formaId == null || formaId === '') return '';
 const cfg = getCfg();
  const t = (cfg.tipos||[]).find(x => String(x.id)===String(formaId));
  return t?.descricao || t?.nome || t?.label || '';
}
function __mkMeio({formaDescricao, contaNome, formaId, contaId}){
  const forma = (formaDescricao && String(formaDescricao).trim()) || __resolveFormaDescById(formaId) || '';
  const conta = (contaNome && String(contaNome).trim()) || __resolveContaNomeById(contaId) || '';
  const s = [forma, conta].filter(Boolean).join(' · ');
  return s || '-';
}

function contaFormaLabel(m){
  // 0) Se a linha já trouxe pronto (ex.: da normalização), usa
  if (m?.meio && String(m.meio).trim()) return m.meio;
  if ((m?.formaDescricao && String(m.formaDescricao).trim()) || (m?.contaNome && String(m.contaNome).trim())){
    return __mkMeio({ formaDescricao: m.formaDescricao, contaNome: m.contaNome, formaId: m.formaId, contaId: m.contaId });
  }

  // 1) Tenta pelas PARCELAS do lançamento
  try{
    const g = JSON.parse(localStorage.getItem(GKEY) || '{}') || {};
    const todas = (g.parcelas||[]).filter(p => String(p.lancamentoId) === String(m.id));

    if (todas.length){
      // 1a) Preferir uma parcela quitada para mostrar o "meio"
      const quitadas = todas.filter(p =>
        ['pago','recebido','baixado','quitado','liquidado','parcial'].includes(String(p.status||'').toLowerCase())
      ).sort((a,b)=>(b.dataPagamentoISO||b.vencimentoISO||'').localeCompare(a.dataPagamentoISO||a.vencimentoISO||''));

      const cand = quitadas[0] || todas.slice().sort((a,b)=>(a.vencimentoISO||'').localeCompare(b.vencimentoISO||''))[0];

      if (cand){
        // já vem “meio”? usa; senão resolve por nomes/ids
        if (cand.meio && String(cand.meio).trim()) return cand.meio;
        return __mkMeio({
          formaDescricao: cand.formaDescricao,
          contaNome: cand.contaNome,
          formaId: cand.formaId || cand.formaPagamento, // compat
          contaId: cand.contaId
        });
      }
    }
  }catch{}

  // 2) Por fim, tenta direto no lançamento gravado no FG (pode ter apenas ids)
  try{
    const g = JSON.parse(localStorage.getItem(GKEY) || '{}') || {};
    const L = (g.lancamentos||[]).find(x => String(x.id) === String(m.id));
    if (L){
      if (L.meio && String(L.meio).trim()) return L.meio;
      return __mkMeio({
        formaDescricao: L.formaDescricao,
        contaNome: L.contaNome,
        formaId: L.formaId || L.formaPagamento, // compat
        contaId: L.contaId
      });
    }
  }catch{}

  return '-';
}

function valorLanc(m){ return Number(m.valor ?? m.valorTotal ?? 0); }
function statusView(m){
  const tipo = normalizeTipoLanc(m.tipo);
  const st   = String(m.status||"pendente").toLowerCase();

  // mostrar "Parcial" explicitamente
  if (st === 'parcial') return { text: 'Parcial', cls: 'pendente' };

  if (tipo === "entrada"){
    const ok = ['recebido','pago','baixado','quitado','liquidado'].includes(st);
    return { text: ok ? 'Recebido' : 'Pendente', cls: ok ? 'baixado' : 'pendente' };
  } else {
    const ok = ['pago','baixado','quitado','liquidado'].includes(st);
    return { text: ok ? 'Pago' : 'A pagar', cls: ok ? 'baixado' : 'pendente' };
  }
}

// Lê comprovantes salvos "separados"
function _loadCompLanc(lancId){
  try { return localStorage.getItem(`fg.comp:${lancId}`) || null; } catch { return null; }
}
function _loadCompParc(parcId){
  try { return localStorage.getItem(`fg.comp.parc:${parcId}`) || null; } catch { return null; }
}

// tenta encontrar o anexo num objeto (lançamento/parcela)
function extrairSrcAnexo(obj){
  if (!obj) return '';
  // quando foi “seco” para o LS
  if (String(obj.comprovante) === '[separado]') {
    if (obj.lancamentoId && obj.id) return _loadCompParc(obj.id) || _loadCompLanc(obj.lancamentoId) || '';
    if (obj.id) return _loadCompLanc(obj.id) || '';
  }
  const cand = [
    obj.comprovanteUrl, obj.comprovanteURL, obj.comprovante,
    obj.anexoUrl, obj.anexoURL, obj.anexo,
    obj.arquivoUrl, obj.arquivo, obj.imagem, obj.image
  ].filter(Boolean);
  return cand.length ? String(cand[0]) : '';
}

// pega todas as parcelas de um lançamento
function getParcelas(lancId){
  try{
    const g = JSON.parse(localStorage.getItem(GKEY) || '{}');
    return (g.parcelas||[]).filter(p => String(p.lancamentoId)===String(lancId));
  }catch{ return []; }
}

// escolhe o “melhor” comprovante para o lançamento
function pickComprovanteForLanc(m){
  // 1) do próprio lançamento
  let src = extrairSrcAnexo(m);
  if (src) return { src, filename: `comprovante-lanc-${m.id}` };

  // 2) de alguma parcela (prioriza as mais recentes com status pago/recebido)
  const partes = getParcelas(m.id);
  if (!partes.length) return null;

  partes.sort((a,b)=> (b.dataPagamentoISO||b.vencimentoISO||'').localeCompare(a.dataPagamentoISO||a.vencimentoISO||''));
  for(const p of partes){
    const s = String(p.status||'').toLowerCase();
    const tem = extrairSrcAnexo(p);
    if (tem && (s==='pago' || s==='recebido' || s==='parcial' || s==='baixado' || s==='quitado' || s==='liquidado')) {
      return { src: tem, filename: `comprovante-parc-${p.id}` };
    }
  }
  // se não achou em quitadas, tenta qualquer parcela
  for(const p of partes){
    const tem = extrairSrcAnexo(p);
    if (tem) return { src: tem, filename: `comprovante-parc-${p.id}` };
  }
  // Fallback “seco”
  if (m && (m.hasComprovante === true || String(m.comprovante) === '[separado]')) {
    const b64 = _loadCompLanc(m.id);
    if (b64) return { src: b64, filename: `comprovante-lanc-${m.id}` };
  }
  return null;
}
function hasComprovante(m){
  if (pickComprovanteForLanc(m)) return true;
  if (m && m.hasComprovante === true) return true;
  if (m && _loadCompLanc && _loadCompLanc(m.id)) return true;
  return false;
}

// abre o modal do anexo
function openAnexoModal(src, filename='comprovante'){
  if (!src) return;

  const viewer = document.getElementById('anexoViewer') 
               || document.querySelector('.anexo-body') 
               || document.body;
  viewer.innerHTML = '';

  const isPdf = /\.pdf(\?|$)/i.test(src) || /^data:application\/pdf/i.test(src);
  const isImg = /^data:image\//i.test(src) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(src);

  let el;
  if (isPdf){
    el = document.createElement('iframe');
    el.src = src + '#toolbar=1&navpanes=0';
    el.title = 'Comprovante (PDF)';
  } else if (isImg){
    el = document.createElement('img');
    el.alt = 'Comprovante';
    el.src = src;
    el.style.maxWidth = '100%';
  } else {
    el = document.createElement('div');
    el.innerHTML = `<p>Tipo de arquivo não visualizável aqui.</p>
      <a href="${src}" target="_blank" rel="noopener">Abrir em nova aba</a>`;
  }

  viewer.appendChild(el);

  refs.anexoBaixar.dataset.src = src;
  refs.anexoBaixar.dataset.filename = filename;
  refs.anexoImprimir.dataset.src = src;
  refs.anexoModal.hidden = false;
  window.lucide?.createIcons?.();
}

function closeAnexoModal(){
  refs.anexoModal.hidden = true;
  const v = document.getElementById('anexoViewer');
  if (v) v.innerHTML = '';
}

function baixarAnexo(btn){
  const src = btn?.dataset?.src;
  const name = (btn?.dataset?.filename || 'comprovante') + guessExt(src);
  if (!src) return;
  const a = document.createElement('a');
  a.href = src;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function guessExt(src){
  try{
    if (/\.pdf(\?|$)/i.test(src)) return '.pdf';
    if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(src)) return '.' + src.match(/\.(png|jpg|jpeg|webp|gif)/i)[1].toLowerCase();
    // dataURL
    if (/^data:image\/png/.test(src)) return '.png';
    if (/^data:image\/jpe?g/.test(src)) return '.jpg';
    if (/^data:image\/webp/.test(src)) return '.webp';
    if (/^data:application\/pdf/.test(src)) return '.pdf';
  }catch{}
  return '.png';
}
function imprimirAnexo(btn){
  const src = btn?.dataset?.src;
  if (!src) return;
  // Se for PDF, apenas abre em nova aba para imprimir
  if (guessExt(src)==='.pdf'){
    window.open(src, '_blank', 'noopener');
    return;
  }
  const html = `
<!doctype html><html><head><meta charset="utf-8"><title>Imprimir</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;background:#fff}img{max-width:100vw;max-height:100vh}</style>
</head><body><img src="${src}" onload="window.print();"></body></html>`;
  const w = window.open('about:blank','_blank');
  if(w && w.document){ w.document.open('text/html'); w.document.write(html); w.document.close(); }
}

// ───── PUBLICAÇÃO GLOBAL (Lançamentos → Resumo/Análises) ─────
function __publishFGFromLancamentos(){
  try{
    const g = JSON.parse(localStorage.getItem(GKEY) || '{}') || {};
    const prev = JSON.parse(localStorage.getItem(GKEY) || '{}') || {}; // preserva campos
    const prevDeleted = (prev && prev.deleted) ? prev.deleted : null;

    g.lancamentos = Array.isArray(g.lancamentos) ? g.lancamentos : [];
    g.parcelas    = Array.isArray(g.parcelas)    ? g.parcelas    : [];

    // preserva tombstones
    if (prevDeleted){
      g.deleted = g.deleted || {};
      g.deleted.lancs = Array.isArray(g.deleted?.lancs) ? g.deleted.lancs : [];
      g.deleted.parcs = Array.isArray(g.deleted?.parcs) ? g.deleted.parcs : [];
      for (const id of (prevDeleted.lancs || [])) if (!g.deleted.lancs.includes(id)) g.deleted.lancs.push(id);
      for (const id of (prevDeleted.parcs || [])) if (!g.deleted.parcs.includes(id)) g.deleted.parcs.push(id);
    }

    localStorage.setItem(GKEY, JSON.stringify(g));
    localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
    // === INÍCIO PATCH FF-SYNC · Lancamentos publish ===
try {
  // empurra apenas um recorte (fim dos arrays) para não pesar
  const partial = {
    lancamentos: Array.isArray(g.lancamentos) ? g.lancamentos.slice(-200) : [],
    parcelas   : Array.isArray(g.parcelas)    ? g.parcelas.slice(-400)    : [],
    movimentos : Array.isArray(g.movimentos)  ? g.movimentos.slice(-400)  : []
  };
  window.syncPush?.([{ kind:'fg:partial', data: partial }]).catch(()=>{});
} catch (e) {
  console.warn('[sync] publish lancamentos push falhou', e);
}
// === FIM PATCH FF-SYNC · Lancamentos publish ===

  }catch(e){ console.warn('__publishFGFromLancamentos', e); }
}

// ===== Render
function render(){
  // cache usado para o botão "anexo"
  window.__anexosCache = window.__anexosCache || new Map();

  // garante objetos básicos
  window.state = window.state || { origem:'todas', tipo:'todos', status:'todos', mes:'', busca:'' };
  const state = window.state;
  if (!state.mes) state.mes = new Date().toISOString().slice(0,7); // default seguro

  window.refs = window.refs || {};
  const refs = window.refs;

  // fallback para o corpo da tabela, caso não esteja em refs.tb
  refs.tb =
    refs.tb
    || document.querySelector('#tb-lancamentos tbody, #tb-lancamentos, #tabelaLancamentos tbody, #tabelaLancamentos')
    || document.querySelector('tbody');

  // bind único dos cards "A pagar / A receber (mês)" para filtro rápido
  if (!window.__bindKpiMesClicks) {
    window.__bindKpiMesClicks = true;
    const pagarEl = document.getElementById('cardPagarMes');
    const recvEl  = document.getElementById('cardReceberMes');

    const applyAndRender = (status, tipo) => {
      // selects visíveis
      const selStatus = document.getElementById('f-status');
      const selTipo   = document.getElementById('f-tipo');
      if (selStatus) selStatus.value = status;
      if (selTipo)   selTipo.value   = tipo;

      // espelhos internos (se existirem)
      try { if (window.refs?.status) window.refs.status.value = status; } catch {}
      try { if (window.refs?.tipo)   window.refs.tipo.value   = tipo;   } catch {}

      // estado global usado no render
      state.status = status;
      state.tipo   = tipo;

      // re-render e atualização dos cards do mês
      try { render(); } catch {}
      try {
        const ym = state?.mes || new Date().toISOString().slice(0,7);
        if (typeof updateCardsMes === 'function') updateCardsMes(ym);
      } catch {}
    };

    // Saída pendente
    pagarEl?.addEventListener('click', () => applyAndRender('saida_pendente', 'saida'));
    // Entrada pendente
    recvEl?.addEventListener('click', () => applyAndRender('entrada_pendente', 'entrada'));
  }

  // — 1) carrega FG para “explodir” lançamentos em parcelas
  let g;
  try { g = JSON.parse(localStorage.getItem(GKEY) || '{}') || {}; } catch { g = {}; }

  const deleted   = (g && g.deleted) ? g.deleted : {};
  const delLancs  = new Set((deleted.lancs || []).map(String));
  const delParcs  = new Set((deleted.parcs || []).map(String));

  const lancsRaw    = Array.isArray(g.lancamentos) ? g.lancamentos : [];
  const parcelasRaw = Array.isArray(g.parcelas)    ? g.parcelas    : [];

  // aplica tombstones
  const lancs = lancsRaw.filter(l => !delLancs.has(String(l?.id)));
  const parcelas = parcelasRaw.filter(p => {
    const pid = String(p?.id);
    const lid = String(p?.lancamentoId || '');
    if (delParcs.has(pid)) return false;
    if (lid && delLancs.has(lid)) return false;
    return true;
  });

  // indexa parcelas por lançamento
  const byLanc = new Map();
  for (const p of parcelas){
    const k = String(p.lancamentoId || '');
    if (!k) continue;
    if (!byLanc.has(k)) byLanc.set(k, []);
    byLanc.get(k).push(p);
  }

  // Decide 'entrada' | 'saida' para a linha (parcela ou lançamento)
  const resolveTipoRow = (p, l) => {
    // 1) tenta usar os campos de tipo informados
    const raw =
      (p?.tipo ?? p?.tipoLanc ?? p?.lanc?.tipo) ??
      (l?.tipo ?? l?.natureza ?? l?.kind ?? l?.classificacao ?? l?.categoriaTipo) ?? '';
    let t = normalizeTipoLanc(raw); // 'entrada' | 'saida' | ''

    // 2) se ainda vazio, deduz pela CATEGORIA (id/sub) do lançamento
    if (!t) t = __catTipoById(l?.categoriaId, l?.subcategoriaId);

    // 3) se ainda vazio, tenta por nome da categoria (texto)
    if (!t) {
      const catNomeTxt = String(l?.categoriaNome || l?.categoria || '').toLowerCase();
      if (/despesa|custo|fornecedor|saida/.test(catNomeTxt)) t = 'saida';
      else if (/receita|entrada|venda/.test(catNomeTxt))     t = 'entrada';
    }

    // 4) não force default — deixe vazio se não deduzir
    return t;
  };

  // — 1.1) monta “linhas” (uma por parcela; se não tiver parcela, usa o lançamento inteiro)
  const rows = [];
  for (const l of lancs) {
    const parts = (byLanc.get(String(l.id)) || []).slice().sort((a,b)=>(Number(a.numero||0)-Number(b.numero||0)));

    if (parts.length){
      for (const p of parts){
        const tipoRow =
          resolveTipoRow(p, l)
          || __catTipoById(l?.categoriaId, l?.subcategoriaId)
          || (function(){
               const cat = String(l?.categoriaNome || l?.categoria || '').toLowerCase();
               if (/despesa|custo|fornecedor|saida/.test(cat)) return 'saida';
               if (/receita|entrada|venda/.test(cat))          return 'entrada';
               return '';
             })();

        rows.push({
          ...l,
          _isParcela: true,
          tipo: tipoRow,
          parcelaId: p.id,
          numero: Number(p.numero ?? 1),
          totalParcelas: Number(p.de ?? p.totalParcelas ?? parts.length),
          vencimentoISO: p.vencimentoISO || p.vencimento || l.vencimentoISO || l.dataCompetencia || l.dataISO || l.data || '',
          valor: Number(p.valor || 0),
          status: (p.status || l.status || 'pendente'),
          contaId: (p.contaId ?? l.contaId) || null,
          contaNome: (p.contaNome ?? l.contaNome) || null,
          formaDescricao: (p.formaDescricao ?? l.formaDescricao) || null,
          meio: (p.meio ?? l.meio) || [p.formaDescricao ?? l.formaDescricao, p.contaNome ?? l.contaNome].filter(Boolean).join(' · ')
        });
      }
    } else {
      const tipoRow =
        resolveTipoRow(null, l)
        || __catTipoById(l?.categoriaId, l?.subcategoriaId)
        || (function(){
             const cat = String(l?.categoriaNome || l?.categoria || '').toLowerCase();
             if (/despesa|custo|fornecedor|saida/.test(cat)) return 'saida';
             if (/receita|entrada|venda/.test(cat))          return 'entrada';
             return '';
           })();

      rows.push({
        ...l,
        _isParcela: false,
        tipo: tipoRow,                              // <<< carimbado na row
        parcelaId: '',
        vencimentoISO: l.vencimentoISO || l.dataCompetencia || l.dataISO || l.data || '',
        valor: Number(l.valorTotal ?? l.valor ?? 0),
        status: l.status || 'pendente'
      });
    }
  }

  // — 2) aplica filtros na coleção “rows”
  const all = rows
// Origem (Empresa / Pessoal) – usa ESCOP0, não a origem textual "dashboard/evento"
.filter(m => {
  if (state.origem === 'todas') return true;

  // escopo vem do lançamento/parcela: 'empresa' | 'pessoal' | 'ambas'
  const esc = String(m.escopo || 'ambas').toLowerCase();

  if (state.origem === 'empresa') return esc === 'empresa' || esc === 'ambas';
  if (state.origem === 'pessoal') return esc === 'pessoal' || esc === 'ambas';

  // se algum dia tiver "ambas" como opção explícita
  if (state.origem === 'ambas') return esc === 'ambas';

  return true;
})

    // Tipo (entrada/saida)
    .filter(m => {
      const t = normalizeTipoLanc(m?.tipo);
      return state.tipo === 'todos' ? true : t === state.tipo;
    })
    // Status detalhado
    .filter(m => {
      const tipo = normalizeTipoLanc(m?.tipo);
      const st   = String(m.status || 'pendente').toLowerCase();
      switch (state.status) {
        case 'entrada_paga':     return (tipo === 'entrada') && IS_QUITADO_STRICT(st);
        case 'saida_paga':       return (tipo === 'saida')   && IS_QUITADO_STRICT(st);
        case 'entrada_pendente': return (tipo === 'entrada') && !IS_QUITADO_STRICT(st);
        case 'saida_pendente':   return (tipo === 'saida')   && !IS_QUITADO_STRICT(st);
        case 'todos':
        default: return true;
      }
    })
    // Mês/período (usa o vencimento da PARCELA)
    .filter(m => {
      if (!state.mes) return true;
      const base = String(m.vencimentoISO || m.dataVencimento || m.dataCompetencia || m.dataISO || m.data || '').slice(0,7);
      return base === state.mes;
    })
    // Evento (se vier por URL ?eventoId=...)
// Observação: o objeto 'm' pode ter 'eventoId' em lançamentos ou em parcelas "explodidas".
.filter(m => {
  if (!state.eventoId) return true;
  const ev = String(m.eventoId || m.evId || m.idEvento || '').trim();
  return ev === String(state.eventoId).trim();
})

    // Busca livre
    .filter(m => {
      if (!state.busca) return true;
      const s = String(state.busca).toLowerCase();
      return [m?.descricao, m?.categoria, m?.conta, m?.fornecedor]
        .some(x => String(x || '').toLowerCase().includes(s));
    })
    // Ordenação (data desc)
    .sort((a,b) => {
      const A = (a.vencimentoISO || a.dataVencimento || a.dataCompetencia || a.dataISO || a.data || '');
      const B = (b.vencimentoISO || b.dataVencimento || b.dataCompetencia || b.dataISO || b.data || '');
      return String(B).localeCompare(String(A));
    });

  // — 3) KPIs (com base na lista filtrada)
  let ent = 0, sai = 0;
  for (const m of all){
    const v = Number(m.valor ?? m.valorTotal ?? 0) || 0;
    const t = normalizeTipoLanc(m?.tipo);
    if (t === 'entrada') ent += v;
    else if (t === 'saida') sai += v;
  }
  const kEnt = document.getElementById('kpiEntradasPrev');
  if (kEnt) kEnt.textContent = money(ent);
  const kSai = document.getElementById('kpiSaidasPrev');
  if (kSai) kSai.textContent = money(sai);
  const kSal = document.getElementById('kpiSaldo');
  if (kSal) kSal.textContent = money(ent - sai);

  // — 3.1) Atualiza os novos KPIs de “A pagar / A receber (mês)”
  try { updateCardsMes(state.mes); } catch {}

  // — 4) Tabela
  if (!refs.tb){
    console.warn('[render] tbody não encontrado.');
    return;
  }
  refs.tb.innerHTML = '';
  if (!all.length){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 10;
    td.innerHTML = '<div class="empty"><i data-lucide="inbox"></i> Nenhum lançamento encontrado com os filtros atuais.</div>';
    tr.appendChild(td);
    refs.tb.appendChild(tr);
    window.lucide?.createIcons?.();
    try { __publishFGFromLancamentos?.(); } catch(e){}
    try { recomputeAllAccountBalances?.(); } catch(e){}
    try { updateCardsMes(state.mes); } catch {}
    return;
  }

  // usa fragment para desempenho
  const frag = document.createDocumentFragment();

  for (const m of all){
    const st = statusView(m);
    const tr = document.createElement('tr');

    // escolhe o comprovante (cache por lançamento)
    const pk = pickComprovanteForLanc({ id: m.id, ...m });
    if (pk) window.__anexosCache.set(String(m.id), pk);

    // === Coluna de ações (editar + comprovante + lixeira)
    const acoes = [];

   if (m._isParcela && m.parcelaId) {
  acoes.push(
    '<button type="button" class="btn-chip icon-only" ' +
      'data-act="edit-parcela" ' +                                   // padrão novo (data-act)
      'data-parcela="' + String(m.parcelaId) + '" ' +
      'data-edit-parcela-id="' + String(m.parcelaId) + '" ' +        // compat com listener antigo
      'title="Editar parcela" aria-label="Editar parcela">' +
      '<i data-lucide="pencil"></i></button>'
  );
  acoes.push(
    '<button type="button" class="btn-chip icon-only warn" ' +
      'data-act="delete-parcela" ' +
      'data-parcela="' + String(m.parcelaId) + '" ' +
      'title="Excluir parcela" aria-label="Excluir parcela">' +
      '<i data-lucide="trash-2"></i></button>'
  );
} else {
  acoes.push(
    '<button type="button" class="btn-chip icon-only" ' +
      'data-act="edit-lanc" ' +                                       // padrão novo (data-act)
      'data-lanc="' + String(m.id) + '" ' +
      'data-edit-lanc-id="' + String(m.id) + '" ' +                   // compat com listener antigo
      'title="Editar lançamento" aria-label="Editar lançamento">' +
      '<i data-lucide="pencil"></i></button>'
  );
  acoes.push(
    '<button type="button" class="btn-chip icon-only warn" ' +
      'data-act="delete-lanc" ' +
      'data-lanc="' + String(m.id) + '" ' +
      'title="Excluir lançamento" aria-label="Excluir lançamento">' +
      '<i data-lucide="trash-2"></i></button>'
  );
}


    if (pk) {
      acoes.push(
        '<button class="btn-chip icon-only" data-act="anexo" data-id="'+ String(m.id) +'" ' +
        'title="Ver comprovante" aria-label="Ver comprovante"><i data-lucide="paperclip"></i></button>'
      );
    }

    const tdAcoes =
      '<td class="acoes" style="text-align:right">' +
      (acoes.length ? acoes.join(' ') : '—') +
      '</td>';

    const __esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
    const nomeEvento = __esc(
      m.eventoNome || m.eventoTitulo || (m.evento && (m.evento.nome || m.evento.titulo)) || ''
    );

    const tipoNormRaw = normalizeTipoLanc(m?.tipo);
    let tipoNorm = tipoNormRaw
      || __catTipoById(m?.categoriaId, m?.subcategoriaId)
      || (function(){
           const cat = String(m?.categoriaNome || m?.categoria || '').toLowerCase();
           if (/despesa|custo|fornecedor|saida/.test(cat)) return 'saida';
           if (/receita|entrada|venda/.test(cat))          return 'entrada';
           return '';
         })();

    // texto da categoria ANTES do innerHTML
    const categoriaTxt = (catNome(m.categoriaId, m.subcategoriaId) || (m.categoriaNome || m.categoria || '-'));

    tr.innerHTML =
      '<td>' + fmtVenc(m) + '</td>' +
      '<td>' + (tipoNorm === 'saida' ? 'Saída' : (tipoNorm === 'entrada' ? 'Entrada' : '—')) + '</td>' +
      '<td>' +
        (m.descricao || '-') +
        (m._isParcela
          ? ` <small>(${Number(m.numero ?? 1)}/${Number(m.totalParcelas ?? 1)})</small>`
          : ''
        ) +
      '</td>' +
      '<td>' + categoriaTxt + '</td>' +
      '<td>' + origemLabel(m) + (nomeEvento ? ` <small class="muted">• ${nomeEvento}</small>` : '') + '</td>' +
      '<td>' + contaFormaLabel(m) + '</td>' +
      '<td>' + money(Number(m.valor ?? m.valorTotal ?? 0) || 0) + '</td>' +
      '<td><span class="status ' + st.cls + '">' + st.text + '</span></td>' +
      tdAcoes;

    frag.appendChild(tr);
  }

  refs.tb.appendChild(frag);

// === Rodapé de totais do filtro atual ===
(() => {
  try {
    // garante <tfoot id="tfootLanc">
    const table = (refs.tb && refs.tb.closest('table')) || document.querySelector('.table-fin, table');
    if (!table) return;
    let tf = table.querySelector('tfoot#tfootLanc');
    if (!tf) {
      tf = document.createElement('tfoot');
      tf.id = 'tfootLanc';
      table.appendChild(tf);
    }

    // usa os valores já calculados (ent, sai)
    const entradas = Number(ent) || 0;
    const saidas   = Number(sai) || 0;
    const saldo    = entradas - saidas;

    // largura de colunas: ajuste conforme seu head (8 dados + 1 ações = 9)
    const colSpanLeft  = 6; // até a coluna 'Origem'
    const colSpanRight = 2; // rótulos à esquerda dos números

    tf.innerHTML = `
      <tr>
        <td colspan="${colSpanLeft}"><strong>Total do filtro</strong></td>
        <td colspan="${colSpanRight}">
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <span class="chip">Entradas: <b>${money(entradas)}</b></span>
            <span class="chip">Saídas: <b>${money(saidas)}</b></span>
            <span class="chip"><strong>Saldo: ${money(saldo)}</strong></span>
          </div>
        </td>
        <td></td>
      </tr>
    `;
  } catch (e) { console.warn('[tfoot totais] erro', e); }
})();

  // --- ativa ícones e sincronizações finais do render
  try { window.lucide?.createIcons?.(); } catch {}
  try { window.__publishFGFromLancamentos?.(); } catch {}
  try { recomputeAllAccountBalances?.(); } catch {}

  // --- mantém os cards do mês alinhados ao filtro atual
  try {
    const ym = (state && state.mes) ? state.mes : new Date().toISOString().slice(0, 7);
    if (typeof updateCardsMes === 'function') updateCardsMes(ym);
  } catch {}

  // --- atualiza também o quadro de pendências (se existir)
  try { (typeof updateCardPendentesMes === 'function') && updateCardPendentesMes(); } catch {}
}
function imprimirListaAtual(){
  try {
    // Coleta título/infos do filtro
    const mes = (document.getElementById('f-mes')?.value || '').slice(0,7);
    const origem = document.getElementById('f-origem')?.value || 'todas';
    const tipo   = document.getElementById('f-tipo')?.value   || 'todos';
    const status = document.getElementById('f-status')?.value || 'todos';
    const busca  = document.getElementById('f-busca')?.value  || '';

    // Captura a tabela renderizada
    const tb = document.querySelector('#tb-lancamentos') || document.querySelector('table');
    if (!tb) { alert('Tabela não encontrada para impressão.'); return; }

    // Clona só o corpo renderizado, pra evitar interações
    const tbClone = tb.cloneNode(true);

    // HTML de impressão
    const titulo = 'Lançamentos — Lista atual';
    const subtitulo = [
      mes ? `Período: ${mes}` : '',
      origem && origem!=='todas' ? `Origem: ${origem}` : '',
      tipo   && tipo  !=='todos' ? `Tipo: ${tipo}`     : '',
      status && status!=='todos' ? `Status: ${status}` : '',
      busca  ? `Busca: "${busca}"` : ''
    ].filter(Boolean).join(' · ');

    const now = new Date();
    const emissao = now.toLocaleString('pt-BR');

    const styles = `
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        *{ box-sizing: border-box; }
        body{ font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif; }
        h1{ margin:0 0 4px; font-size:18px; }
        .muted{ color:#6b5a4a; font-size:12px; }
        .meta{ display:flex; justify-content:space-between; align-items:center; margin: 4px 0 12px; font-size:11px; color:#6b5a4a; }
        table{ width:100%; border-collapse: collapse; }
        thead th{ text-align:left; font-weight:600; font-size:12px; padding:8px; background:#f3ece2; border-bottom:1px solid #e6dacb; }
        tbody td{ font-size:12px; padding:8px; border-bottom:1px solid #eee4d6; vertical-align:top; }
        td.acoes{ display:none; } /* oculta col de ações na impressão */
        .status{ padding:2px 8px; border-radius:999px; font-size:11px; }
        .status.baixado{ background:#e6f4ea; }
        .status.pendente{ background:#fff3cd; }
        @media print {
          .no-print{ display:none !important; }
          a[href]:after{ content:'' !important; }
        }
      </style>
    `;

    // Limpa ícones SVG para não travar impressão (opcional)
    tbClone.querySelectorAll('[data-lucide]').forEach(el => el.remove());

    // Abre janela de impressão
    const w = window.open('', '_blank', 'noopener');
    if (!w) { alert('Bloqueador abriu. Permita pop-ups para imprimir.'); return; }

    w.document.open('text/html');
    w.document.write(`
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8"/>
        <title>${titulo}</title>
        ${styles}
      </head>
      <body>
        <h1>${titulo}</h1>
        ${subtitulo ? `<div class="muted">${subtitulo}</div>` : ''}
        <div class="meta">
          <div class="muted">Emitido em: ${emissao}</div>
          <div class="muted">KGB Buffet — Financeiro</div>
        </div>
        ${tbClone.outerHTML}
        <script>window.onload = () => window.print();<\/script>
      </body>
      </html>
    `);
    w.document.close();
  } catch (e) {
    console.error('[imprimirListaAtual] erro:', e);
    alert('Não foi possível preparar a impressão.');
  }
}
// Imprimir a lista atual
document.getElementById('btnImprimir')?.addEventListener('click', imprimirListaAtual);

// === ETAPA C2 — editar PARCELA via modal (lista global) ===
// (fora do render; com guard para não duplicar)
(() => {
  if (window.__wiredEditParcelaGlobal) return;
  window.__wiredEditParcelaGlobal = true;

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest?.('[data-edit-parcela-id]');
    if (!a) return;
    ev.preventDefault?.();
    const parcelaId = a.getAttribute('data-edit-parcela-id');
    window.FinModal?.openEditarParcela?.(parcelaId);
  });
})();

// após definir render(), updateCardsMes() e state
try {
  if (typeof onFinStoreChanged === 'function') {
    onFinStoreChanged(() => {
      try { recomputeAllAccountBalances(); } catch {}
      try { render(); } catch {}
      try { updateCardsMes(window.state.mes); } catch {}
    });
  }
} catch {}
// --- helpers seguros (uma vez só) ---
function __ensureDataUrl(s){ try{ return String(s||''); }catch{ return ''; } }

// Mini-viewer fallback: cria UMA janelinha simples se o global não existir.
// Usa mesmo estilo do evento: overlay pequeno com X para fechar.
if (typeof window.__openComprovantePreview !== 'function') {
  window.__openComprovantePreview = function(dataUrl){
    try{
      const old = document.getElementById('compMini');
      if (old) old.remove();

      const wrap = document.createElement('div');
      wrap.id = 'compMini';
      wrap.style.position = 'fixed';
      wrap.style.top = '20px';
      wrap.style.right = '20px';
      wrap.style.width = '360px';
      wrap.style.maxWidth = '90vw';
      wrap.style.maxHeight = '80vh';
      wrap.style.background = '#fff';
      wrap.style.border = '1px solid #e5e5e5';
      wrap.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
      wrap.style.borderRadius = '12px';
      wrap.style.overflow = 'hidden';
      wrap.style.zIndex = '99999';

      const top = document.createElement('div');
      top.style.display = 'flex';
      top.style.alignItems = 'center';
      top.style.justifyContent = 'space-between';
      top.style.gap = '8px';
      top.style.padding = '10px 12px';
      top.style.borderBottom = '1px solid #eee';
      top.style.background = '#fafafa';

      const title = document.createElement('div');
      title.textContent = 'Comprovante';
      title.style.font = '600 14px/1.2 Inter, system-ui, Arial';

      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '✕';
      close.style.border = '0';
      close.style.background = 'transparent';
      close.style.fontSize = '16px';
      close.style.cursor = 'pointer';
      close.setAttribute('aria-label','Fechar');
      close.onclick = () => wrap.remove();

      top.appendChild(title);
      top.appendChild(close);

      const body = document.createElement('div');
      body.style.padding = '8px';
      body.style.background = '#fff';
      body.style.maxHeight = 'calc(80vh - 44px)';
      body.style.overflow = 'auto';

      const isPdf = /\.pdf(\?|$)/i.test(dataUrl) || /^data:application\/pdf/i.test(dataUrl);
      let el;
      if (isPdf) {
        el = document.createElement('iframe');
        el.src = dataUrl;
        el.style.width = '100%';
        el.style.height = '70vh';
        el.style.border = '0';
      } else {
        el = document.createElement('img');
        el.src = dataUrl;
        el.alt = 'comprovante';
        el.style.maxWidth = '100%';
        el.style.height = 'auto';
        el.style.display = 'block';
      }

      body.appendChild(el);
      wrap.appendChild(top);
      wrap.appendChild(body);
      document.body.appendChild(wrap);
    } catch (e) {
      // último recurso se der algo errado: abre em nova aba
      try { window.open(dataUrl, '_blank'); } catch {}
    }
  };
}

// ===== Clique: visualizar comprovante + editar (parcela/lançamento) + excluir
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act], [data-act]');
  if (!btn) return;

  const act = btn.dataset.act;

  // ---- Ver comprovante (anexo)
  if (act === 'anexo') {
    const id = btn.dataset.id;
    let pk = window.__anexosCache?.get(String(id));
    if (!pk) {
      try {
        const lanc = window.store?.all?.().find?.(l => String(l.id) === String(id));
        pk = lanc ? pickComprovanteForLanc(lanc) : null;
      } catch (err) {
        console.error('[anexo] erro ao buscar lançamento:', err);
      }
    }
    if (!pk || !pk.src) {
      alert('Nenhum comprovante encontrado para este lançamento.');
      return;
    }
      // 1º tenta a janelinha compacta (se existir)
    const src = __ensureDataUrl(pk.src);
    if (typeof window.__openComprovantePreview === 'function') {
      window.__openComprovantePreview(src);
    } else if (typeof openAnexoModal === 'function') {
      // fallback: usa seu modal grande existente
      openAnexoModal(src, pk.filename || 'comprovante');
    } else {
      // fallback definitivo: abre em nova aba
      __abrirComprovanteSrc?.(src, pk.filename || 'comprovante');
    }
    return;

  }

  // ---- Editar PARCELA (lápis quando a linha é parcela)
  if (act === 'edit-parcela') {
    const parcelaId = btn.dataset.parcela || btn.getAttribute('data-parcela');
    if (!parcelaId) { alert('Parcela não identificada.'); return; }

    const tryOpen = () => {
      if (window.FinModal?.openEditarParcela) {
        try { window.FinModal.openEditarParcela(parcelaId); return true; } catch {}
      }
      return false;
    };

    if (tryOpen()) return;

    try {
      await import('./financeiro-modal.js');
      if (!tryOpen()) alert('Modal financeiro não pôde ser inicializado.');
    } catch (err) {
      console.error('[edit-parcela] lazy-load do modal falhou:', err);
      alert('Modal financeiro não pôde ser carregado.');
    }
    return;
  }

  // ---- Editar LANÇAMENTO inteiro (para linhas sem parcela)
  if (act === 'edit-lanc') {
    const lancId = btn.dataset.lanc || btn.getAttribute('data-lanc') || btn.dataset.id;
    if (!lancId) { alert('Lançamento não identificado.'); return; }

    const tryOpen = () => {
      const openLanc =
        window.FinModal?.openEditar ||
        window.FinModal?.openEditarLancamento ||
        window.FinModal?.openCriarEditar;
      if (openLanc) {
        try { openLanc(lancId); return true; } catch {}
      }
      return false;
    };

    if (tryOpen()) return;

    try {
      await import('./financeiro-modal.js');
      if (!tryOpen()) alert('Modal financeiro não pôde ser inicializado.');
    } catch (err) {
      console.error('[edit-lanc] lazy-load do modal falhou:', err);
      alert('Modal financeiro não pôde ser carregado.');
    }
    return;
  }

  // ---- Excluir LANCAMENTO (lixeira)
  if (act === 'delete-lanc') {
    const lancId = String(
      btn.dataset.lanc || btn.getAttribute('data-lanc') || btn.dataset.id || ''
    ).trim();

    if (!lancId) { alert('Lançamento não identificado.'); return; }

    // evita duplo clique enquanto executa
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';

    // feedback visual leve durante o processamento
    const prevHTML = btn.innerHTML;
    btn.setAttribute('aria-disabled', 'true');
    btn.classList.add('is-busy');
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';

    try {
      if (typeof deleteLancamento !== 'function') {
        throw new Error('deleteLancamento() não disponível');
      }
      await deleteLancamento(lancId);
    } catch (err) {
      console.error('[delete-lanc] falhou:', err);
      alert('Não foi possível excluir o lançamento.');
    } finally {
      // restaura o botão (a linha pode ser re-renderizada, mas garantimos fallback)
      btn.dataset.busy = '0';
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('is-busy');
      btn.innerHTML = prevHTML;
      window.lucide?.createIcons?.();
    }
    return;
  }

  // ---- Excluir PARCELA (lixeira da parcela)
  if (act === 'delete-parcela') {
    const parcelaId = String(
      btn.dataset.parcela || btn.getAttribute('data-parcela') || btn.dataset.id || ''
    ).trim();

    if (!parcelaId) { alert('Parcela não identificada.'); return; }

    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';

    const prevHTML = btn.innerHTML;
    btn.setAttribute('aria-disabled', 'true');
    btn.classList.add('is-busy');
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';

    try {
      if (typeof deleteParcela !== 'function') {
        throw new Error('deleteParcela() não disponível');
      }
      await deleteParcela(parcelaId);
    } catch (err) {
      console.error('[delete-parcela] falhou:', err);
      alert('Não foi possível excluir a parcela.');
    } finally {
      btn.dataset.busy = '0';
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('is-busy');
      btn.innerHTML = prevHTML;
      window.lucide?.createIcons?.();
    }
    return;
  }
});

// Modal anexo: binds (fora do render)
(() => {
  const refsLocal = window.refs || {};
  refsLocal.anexoClose?.addEventListener('click', closeAnexoModal);
  refsLocal.anexoModal?.addEventListener('click', (e)=>{ if (e.target===refsLocal.anexoModal) closeAnexoModal(); });
  refsLocal.anexoBaixar?.addEventListener('click', ()=> baixarAnexo(refsLocal.anexoBaixar));
  refsLocal.anexoImprimir?.addEventListener('click', ()=> imprimirAnexo(refsLocal.anexoImprimir));
})();

// Inicial (sincroniza com backend antes de renderizar)
(async () => {
  try {
    if (window.finSyncFromApi) {
      await window.finSyncFromApi();
    }
  } catch (e) {
    console.warn('[financeiro-lancamentos] erro ao sincronizar financeiro:', e);
  }

  try {
    render();
  } catch (e) {
    console.error('[financeiro-lancamentos] erro no render inicial:', e);
  }
})();


// === Atualizações vindas do modal (se aberto em outra aba) ===
window.addEventListener('finmodal:confirm', (ev) => {
  try {
    const lancId = ev?.detail?.lancId || ev?.detail?.id || null;

    if (lancId && typeof syncAccountMovementsForLancamento === 'function') {
      syncAccountMovementsForLancamento(lancId);
    } else if (typeof syncAccountMovementsForLancamento === 'function') {
      const g = JSON.parse(localStorage.getItem('financeiroGlobal') || '{}') || {};
      const lista = Array.isArray(g.lancamentos) ? g.lancamentos : [];
      for (const l of lista) { try { syncAccountMovementsForLancamento(l.id); } catch {} }
    }

    if (typeof recomputeAllAccountBalances === 'function') {
      recomputeAllAccountBalances();
    }

    try { __publishFGFromLancamentos?.(); } catch {}
    localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
  } catch {}
  try { render(); } catch {}
});

// === Deep link: abrir Painel (analítico) com filtros da tela ===
(function bindPainelAnalitico(){
  const btn = document.getElementById('btnPainelAnalitico');
  if (!btn) return;

  // mapeia o status detalhado desta tela -> status do painel
  const mapStatus = (stDetalhado) => {
    const s = String(stDetalhado || 'todos').toLowerCase();
    // painel aceita: todos | pago | aberto | atraso
    if (s === 'entrada_paga' || s === 'saida_paga') return 'pago';
    if (s === 'entrada_pendente' || s === 'saida_pendente') return 'aberto';
    return 'todos';
  };

  btn.addEventListener('click', ()=>{
    const mes = (document.getElementById('f-mes')?.value || '').slice(0,7);
    const stDetalhado = document.getElementById('f-status')?.value || 'todos';
    const statusPainel = mapStatus(stDetalhado);

    const params = new URLSearchParams();
    if (mes) params.set('mes', mes);
    if (statusPainel && statusPainel !== 'todos') params.set('status', statusPainel);

    // futuro: clienteId/eventoId quando estes selects existirem nesta tela
    // const clienteId = document.getElementById('f-cliente')?.value;
    // const eventoId  = document.getElementById('f-evento')?.value;
    // if (clienteId) params.set('clienteId', clienteId);
    // if (eventoId)  params.set('eventoId',  eventoId);

    const url = `painel-cobrancas.html${params.toString() ? ('?' + params.toString()) : ''}`;
    window.location.href = url;
  });
})();
// [C3] — Atualiza os títulos dos cards "A pagar (mês)" e "A receber (mês)" com o PENDENTE do mês
function updateCardPendentesMes() {
  // 1) leitura segura do FG
  const GKEY = 'financeiroGlobal';
  const g = (function(){ try { return JSON.parse(localStorage.getItem(GKEY)||'{}')||{}; } catch { return {}; } })();
  const lancs = Array.isArray(g.lancamentos) ? g.lancamentos : [];
  const parcs = Array.isArray(g.parcelas)    ? g.parcelas    : [];

  // 2) limites do mês atual (YYYY-MM-01 .. YYYY-MM-último)
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth(); // 0..11
  const firstISO = new Date(y, m, 1).toISOString().slice(0,10);
  const lastISO  = new Date(y, m+1, 0).toISOString().slice(0,10);

  const isQuitado = (st) => {
    const v = String(st||'').toLowerCase();
    return ['pago','recebido','baixado','quitado','liquidado'].includes(v);
  };

  // 3) índice rápido de parcelas por lançamento
  const byLanc = new Map();
  for (const p of parcs){
    const lid = String(p.lancamentoId || '');
    if (!byLanc.has(lid)) byLanc.set(lid, []);
    byLanc.get(lid).push(p);
  }

  // 4) varre lançamentos e parcela o "pendente do mês"
  let pendEnt = 0; // entradas a receber
  let pendSai = 0; // saídas a pagar

  for (const l of lancs) {
    const tipo = (typeof normalizeTipoLanc === 'function') ? normalizeTipoLanc(l?.tipo) : String(l?.tipo||'').toLowerCase();

    // pega parcelas do lançamento (se tiver)
    const partes = byLanc.get(String(l.id)) || [];

    if (partes.length > 0) {
      // Existe parcelamento → considerar parcelas do mês atual
      for (const p of partes) {
        // datas de referência para o mês
        const vencISO = String(p.vencimentoISO || p.vencimento || '').slice(0,10);
        if (!vencISO || vencISO < firstISO || vencISO > lastISO) continue;

        const st = String(p.status||'').toLowerCase();
        if (isQuitado(st)) continue;

        const valor = Number(p.valor || 0);
        const pago  = Number(p.totalPago || 0);
        const resto = Math.max(0, valor - pago);

        if (resto <= 0) continue; // já liquidada/parcial sem saldo

        if (tipo === 'entrada') pendEnt += resto;
        else if (tipo === 'saida') pendSai += resto;
      }
    } else {
      // Sem parcelas → considerar o lançamento em si se cair no mês
      // data de competência / data base
      const dataISO = String(
        l.dataCompetencia || l.data || l.dataISO || ''
      ).slice(0,10);
      if (!dataISO || dataISO < firstISO || dataISO > lastISO) continue;

      const stL = String(l.status||'').toLowerCase();
      if (isQuitado(stL)) continue;

      const v = Number(l.valor ?? l.valorTotal ?? 0) || 0;
      if (v <= 0) continue;

      if (tipo === 'entrada') pendEnt += v;
      else if (tipo === 'saida') pendSai += v;
    }
  }

  // 5) injeta nos títulos dos cards (se existirem)
  const fmt = (n) => (window.fmtBRL ? window.fmtBRL.format(n) : (n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));

  const cardReceber = document.getElementById('cardReceberMes');
  const cardPagar   = document.getElementById('cardPagarMes');

  // Forma de injeção: adiciona sufixo " — Pendente: R$ X" apenas uma vez
  function setPend(el, valor){
    if (!el) return;
    // tenta achar um elemento de título comum
    const h = el.querySelector('h3, h4, .kpi-title, .card-title') || el;
    const markSel = '.pendente-mes';
    let span = h.querySelector(markSel);
    if (!span) {
      span = document.createElement('span');
      span.className = 'pendente-mes';
      span.style.fontWeight = '500';
      span.style.marginLeft = '8px';
      h.appendChild(span);
    }
    span.textContent = `— Pendente: ${fmt(valor)}`;
  }

  setPend(cardReceber, pendEnt);
  setPend(cardPagar,   pendSai);
}

// [C3] reexecuta ao abrir e quando mudar o storage (ping)
(function bindC3(){
  try {
    updateCardPendentesMes();
  } catch {}

  try {
    window.addEventListener('storage', (e) => {
      if (e && e.key && e.key.startsWith('financeiroGlobal')) {
        try { updateCardPendentesMes(); } catch {}
      }
    });
  } catch {}
})();

// === ETAPA C1 — integrações com o modal (lista global) ===
(function wireListaGlobalFinanceiro(){
  if (window.__wiredListaGlobalFinanceiro) return;
  window.__wiredListaGlobalFinanceiro = true;

  // 1) re-render ao salvar pelo modal / store mudar
  window.addEventListener('finmodal:confirm',  () => { try { render?.(); } catch {} });
  window.addEventListener('fin-store-changed', () => { try { render?.(); } catch {} });

  // 2) ocultar botão "Novo" nesta tela (decisão de produto)
  const btnNovoGlobal = document.getElementById('btnNovoLancGlobal') 
                     || document.querySelector('[data-action="novo-lancamento-global"]');
  if (btnNovoGlobal) btnNovoGlobal.style.display = 'none';

  // 3) garantir que cliques de "editar" desta lista usem o mesmo modal
  //    -> se você já tem bind, apenas garanta que chame FinModal.openEditar(id)
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest?.('[data-edit-lanc-id]');
    if (!a) return;
    ev.preventDefault?.();
    const lancId = a.getAttribute('data-edit-lanc-id');
    window.FinModal?.openEditar?.(lancId);
  });
})();

// ========= [FASE C] KPIs do mês: A Pagar / A Receber (pendentes) =========

// Fallbacks leves (não quebram se já existirem em outro arquivo)
const __fgRead = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)||'null'); return v ?? fb; } catch { return fb; } };
const __getFG  = () => __fgRead('financeiroGlobal', {});
const __ISO    = () => new Date().toISOString().slice(0,10);
const __ym     = (d) => String(d||'').slice(0,7);
const __isQuit = (st) => ['pago','recebido','baixado','quitado','liquidado'].includes(String(st||'').toLowerCase());
const __isParc = (st) => String(st||'').toLowerCase()==='parcial';

function __normTipoLancSafe(t){
  try {
    if (typeof window.normalizeTipoLanc === 'function') return window.normalizeTipoLanc(t);
  } catch {}
  t = String(t||'').toLowerCase();
  if (t==='receita') t='entrada';
  if (t==='despesa') t='saida';
  return (t==='entrada' || t==='saida') ? t : '';
}

// calcula pendente de uma linha (valor − totalPago) nunca negativo
function __pendente(valor, totalPago){
  const v = Number(valor||0), p = Number(totalPago||0);
  return Math.max(0, v - p);
}

// Verifica se a linha cai no mês-alvo (YYYY-MM) olhando data de vencimento
function __rowInMonth(ymTarget, dataVenc){
  const k = __ym(dataVenc || '');
  if (!ymTarget) return true; // sem filtro específico
  return (k === ymTarget);
}

function __sumPendentesDoMes(ymTarget){
  const g = __getFG();
  const L = Array.isArray(g.lancamentos) ? g.lancamentos : [];
  const P = Array.isArray(g.parcelas)    ? g.parcelas    : [];

  const byLanc = new Map();
  for (const p of P){
    const k = String(p.lancamentoId||'');
    if (!k) continue;
    (byLanc.get(k) || byLanc.set(k, []).get(k)).push(p);
  }

  let pendEntradas = 0, qtdEntradas = 0;
  let pendSaidas   = 0, qtdSaidas   = 0;

  for (const l of L){
    const tipo = __normTipoLancSafe(l?.tipo) || (()=>{
      const nm = String(l?.categoriaNome || l?.categoria || '').toLowerCase();
      if (/despesa|custo|fornecedor|saida/.test(nm)) return 'saida';
      if (/receita|entrada|venda/.test(nm))          return 'entrada';
      return '';
    })();
    if (!tipo) continue;

    const partes = byLanc.get(String(l.id)) || [];

    if (partes.length){
      for (const p of partes){
        const venc = p.vencimentoISO || p.vencimento || l.vencimentoISO || l.dataCompetencia || l.dataISO || l.data || __ISO();
        if (!__rowInMonth(ymTarget, venc)) continue;

        const st = String(p.status || l.status || 'pendente').toLowerCase();
        let pend = 0;

        if (__isQuit(st)) {
          pend = 0;
        } else if (__isParc(st)) {
          pend = __pendente(p.valor, p.totalPago);
        } else {
          pend = Number(p.valor||0);
        }

        if (pend > 0){
          if (tipo === 'entrada') { pendEntradas += pend; qtdEntradas++; }
          else if (tipo === 'saida') { pendSaidas += pend; qtdSaidas++; }
        }
      }
    } else {
      const venc = l.vencimentoISO || l.dataCompetencia || l.dataISO || l.data || __ISO();
      if (!__rowInMonth(ymTarget, venc)) continue;

      const st  = String(l.status || 'pendente').toLowerCase();
      const val = Number(l.valorTotal ?? l.valor ?? 0);
      const tp  = Number(l.totalPago || 0);
      let pend  = 0;

      if (__isQuit(st)) {
        pend = 0;
      } else if (__isParc(st)) {
        pend = __pendente(val, tp);
      } else {
        pend = val;
      }

      if (pend > 0){
        if (tipo === 'entrada') { pendEntradas += pend; qtdEntradas++; }
        else if (tipo === 'saida') { pendSaidas += pend; qtdSaidas++; }
      }
    }
  }

  return { pendEntradas, pendSaidas, qtdEntradas, qtdSaidas };
}


// Formata BRL
function __fmtBRL(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

window.updateCardsMes = function(ymTarget){
  try {
    ymTarget = String(ymTarget || '').slice(0,7) || __ym(__ISO());
    const { pendEntradas, pendSaidas, qtdEntradas, qtdSaidas } = __sumPendentesDoMes(ymTarget);

    // ===== KPI numérico (valor grande)
    const elReceberVal = document.getElementById('cardReceberMesValor');
    if (elReceberVal) elReceberVal.textContent = __fmtBRL(pendEntradas);
    const elPagarVal   = document.getElementById('cardPagarMesValor');
    if (elPagarVal)   elPagarVal.textContent   = __fmtBRL(pendSaidas);

    // ===== Título (chips no <h3>)
    const ttlIn  = document.getElementById('ttlReceberMesValor');
    const qtdIn  = document.getElementById('ttlReceberMesQtd');
    if (ttlIn) ttlIn.textContent = __fmtBRL(pendEntradas);
    if (qtdIn) qtdIn.textContent = qtdEntradas ? `— ${qtdEntradas} pendentes` : '• sem pendências';

    const ttlOut = document.getElementById('ttlPagarMesValor');
    const qtdOut = document.getElementById('ttlPagarMesQtd');
    if (ttlOut) ttlOut.textContent = __fmtBRL(pendSaidas);
    if (qtdOut) qtdOut.textContent = qtdSaidas ? `— ${qtdSaidas} pendentes` : '• sem pendências';
  } catch (e) {
    console.warn('[updateCardsMes] falhou:', e);
  }
};


// Atualiza somente o “PENDENTES (mês)” resumido (se você tiver um badge separado)
window.updateCardPendentesMes = function(){
  try {
    const ymTarget = (window.state?.mes) || __ym(__ISO());
    const { pendEntradas, pendSaidas } = __sumPendentesDoMes(ymTarget);
    // Exemplo: atualiza um badge agregado (se existir)
    const badge = document.getElementById('badgePendMes');
    if (badge) badge.textContent = __fmtBRL(pendEntradas + pendSaidas);
  } catch {}
};

window.__dumpFinLogs = function(limit=50){
  try{
    const arr = JSON.parse(localStorage.getItem('finLogs')||'[]')||[];
    console.table(arr.slice(-limit));
  }catch(e){ console.warn(e); }
};
// === PATCH FINAL: garantir saldos consistentes no primeiro carregamento ===
document.addEventListener('DOMContentLoaded', () => {
  try { recomputeAllAccountBalances(); } catch {}
  try { updateCardsMes?.(new Date().toISOString().slice(0,7)); } catch {}
});
// === Pós-render: força subtítulos por origem quando não há evento ===
(function wireFixSubtitulos(){
  function fix() {
    // carrega FG para pegarmos os lançamentos com os ids
    const g = (function(){ try{ return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}')||{}; }catch{ return {}; } })();
    const map = new Map((g.lancamentos||[]).map(l => [String(l.id), l]));

    // percorre as linhas que tenham data-id do lançamento
    document.querySelectorAll('tr[data-lanc-id]').forEach(tr => {
      const id = tr.getAttribute('data-lanc-id');
      const l  = map.get(String(id));
      if (!l) return;

      // se NÃO tem evento vinculado, substitui subtítulo
      if (!l.eventoId || String(l.eventoId) === '0') {
        const alvo = tr.querySelector('.desc small, .l-sub, .subtitulo, .muted');
        if (alvo) alvo.textContent = origemLabelLanc(l);
      }
    });
  }

  // roda agora e ao detectar mudanças de store
  try { fix(); } catch {}
  window.addEventListener('fin-store-changed', fix);
  window.addEventListener('storage', (e) => {
    if (e && e.key && e.key.startsWith('financeiroGlobal')) fix();
  });
})();
// ======================
// DETECTOR AUTOMÁTICO DE PARCELAS ATRASADAS
// ======================

// Executa a cada vez que a tela carregar
document.addEventListener('DOMContentLoaded', () => {
  try {
    const API_BASE = window.__API_BASE__ || localStorage.getItem('API_BASE');
    if (!API_BASE) return; // se não tiver API configurada, não faz nada

    // Lê o objeto completo salvo em "financeiroGlobal"
    let fg;
    try {
      const raw = localStorage.getItem('financeiroGlobal') || '{}';
      fg = JSON.parse(raw) || {};
    } catch {
      fg = {};
    }

    // Aqui pegamos APENAS o array de parcelas
    const lista = Array.isArray(fg.parcelas) ? fg.parcelas : [];

    const hoje = new Date().toISOString().slice(0, 10);

    lista.forEach((parc) => {
      // datas possíveis da parcela
      const venc = String(parc.vencimentoISO || parc.vencimento || '').slice(0, 10);
      const status = String(parc.status || '').toLowerCase();

      // sem vencimento ou ainda não venceu → ignora
      if (!venc || venc >= hoje) return;

      // já quitada? (pago/recebido/etc.) → ignora
      if (['pago', 'recebido', 'baixado', 'quitado', 'liquidado'].includes(status)) return;

      const id = parc.id || parc.parcelaId;
      if (!id) return;

      // evita enviar notificação duplicada
      const notifKey = `notif_sent_${id}`;
      if (localStorage.getItem(notifKey)) return;

      fetch(`${API_BASE}/notificacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `notif:parcela:${id}`,
          kind: 'financeiro_atraso',
          title: 'Parcela atrasada',
          message: `A parcela "${parc.descricao || ''}" venceu em ${venc}.`,
          audience: 'financeiro',
          level: 'warning',
          entityType: 'parcela',
          entityId: id,
        }),
      })
        .then((r) => r.json().catch(() => null))
        .then(() => {
          try {
            localStorage.setItem(notifKey, '1');
          } catch {}
        })
        .catch((err) => console.warn('Erro ao enviar notificação:', err));
    });
  } catch (e) {
    console.warn('Erro no detector de parcelas atrasadas:', e);
  }
});

