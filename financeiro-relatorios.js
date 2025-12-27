// ================== financeiro-relatorios.js ==================
(() => { 'use strict';

/* ====== Helpers base ====== */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const BRL = n => (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const ISO = (d=new Date()) => new Date(d).toISOString().slice(0,10);
const ym = d => String(d||'').slice(0,7);
const toDate = v => { const d=new Date(v); return Number.isFinite(+d)?d:null; };

// ---- Compat de seletores (aceita id antigo/novo) ----
const elEvento = () => document.getElementById('f-evento') || document.getElementById('selEvento');
const elDe     = () => document.getElementById('f-de')     || document.getElementById('fDe');
const elAte    = () => document.getElementById('f-ate')    || document.getElementById('fAte');

function readLS(k, fb){ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v??fb; }catch{ return fb; } }
function getFG(){ return readLS('financeiroGlobal', {}); }                // M14 base
function getEventos(){ return readLS('eventos', []); }                    // eventos
function getEventoNome(id){
  const ev = (getEventos()||[]).find(e => String(e.id)===String(id));
  return ev ? (ev.titulo || ev.nome || ev.nomeEvento || `Evento ${id}`) : `Evento ${id}`;
}

// normalizador único (mesmo do modal/lançamentos)
const normalizeTipoLanc = (typeof window !== 'undefined' && window.normalizeTipoLanc)
  ? window.normalizeTipoLanc
  : (t=>{
      t = (t==null?'':String(t)).trim().toLowerCase();
      try{ t = t.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }catch{}
      if (t==='saida' || t==='despesa' || t==='s') return 'saida';
      if (t==='entrada' || t==='receita' || t==='e' || t==='r') return 'entrada';
      return '';
    });

// ---- Resolutor de nomes de categoria/subcategoria (a partir do config) ----
function __readFinCatsLS(){
  try {
    const cfg = JSON.parse(localStorage.getItem('configFinanceiro') || '{}') || {};
    const arr = Array.isArray(cfg.categorias) ? cfg.categorias : [];
    return arr.map(c => ({
      id: c.id ?? c.value,
      nome: String(c.nome ?? c.descricao ?? '').trim(),
      tipo: (typeof normalizeTipoLanc === 'function') ? normalizeTipoLanc(c.tipo) : String(c.tipo||'').toLowerCase(),
      escopo: String(c.escopo || 'ambas'),
      ativo: c.ativo !== false,
      paiId: c.paiId ?? c.parentId ?? null
    })).filter(c => c.id && c.ativo);
  } catch { return []; }
}

// Retorna o melhor nome de categoria para um lançamento (prioriza subcategoria)
function __catNomeByLanc(l){
  const cats = __readFinCatsLS();
  if (!cats.length) {
    // tenta ao menos devolver o que já veio no lançamento
    return (l?.categoriaNome || l?.categoria || '—');
  }
  const byId = new Map(cats.map(c => [String(c.id), c]));
  // se tiver subcategoria, prioriza
  const subId = l?.subcategoriaId ?? l?.subCatId ?? l?.subId ?? null;
  if (subId != null && byId.has(String(subId))) return byId.get(String(subId)).nome || '—';
  // senão, usa a raiz (categoria)
  const catId = l?.categoriaId ?? l?.catId ?? l?.categoria ?? null;
  if (catId != null && byId.has(String(catId))) return byId.get(String(catId)).nome || '—';
  // fallback para o que já veio como texto
  return (l?.categoriaNome || l?.categoria || '—');
}

// pago/parcial
const IS_PAGO = (st)=>['pago','recebido','baixado','quitado','liquidado'].includes(String(st||'').toLowerCase());
const IS_PARTIAL = (st)=>String(st||'').toLowerCase()==='parcial';

// filtros/estado
const state = {
  eventoId: '',
  deMes: '',
  ateMes: '',
  view: 'extrato' // 'extrato' | 'lucratividade' | 'contratado'
};

// === URL (?eventoId, ?de, ?ate, ?view)
function applyURL(){
  try{
    const q = new URLSearchParams(location.search);
    const ev = q.get('eventoId') || q.get('id') || '';
    const de = q.get('de') || '';
    const ate= q.get('ate') || '';
    const vw = q.get('view') || '';
    if (ev)  state.eventoId = String(ev);
    if (de && /^\d{4}-\d{2}$/.test(de))  state.deMes  = de;
    if (ate && /^\d{4}-\d{2}$/.test(ate)) state.ateMes = ate;
    if (['extrato','lucratividade','contratado'].includes(vw)) state.view = vw;
  }catch{}
}

// === período: checagem de intervalo (YYYY-MM inclusivo)
function inRange(iso, deYM, ateYM){
  const k = String(iso||'').slice(0,7);
  if (deYM && k < deYM)  return false;
  if (ateYM && k > ateYM) return false;
  return true;
}

// deep link para Lançamentos (leva mês aproximado + eventoId)
function linkLancamentos({ ymHint, eventoId, statusDetalhado }){
  const usp = new URLSearchParams();
  if (ymHint) usp.set('mes', ymHint);
  if (eventoId) usp.set('eventoId', String(eventoId)); // requer suporte no financeiro-lancamentos.js
  if (statusDetalhado) usp.set('status', statusDetalhado); // ex.: entrada_pendente | saida_pendente
  return `financeiro-lancamentos.html?${usp.toString()}`;
}

// ======= Core: coleta dados só do evento filtrado e período =======
function collectForEvento(evId, deYM, ateYM){
  const g      = getFG();
  const lancs  = Array.isArray(g.lancamentos) ? g.lancamentos : [];
  const partes = Array.isArray(g.parcelas)    ? g.parcelas    : [];

  // index de parcelas por lançamento
  const byLanc = new Map();
  for (const p of partes){
    const k = String(p.lancamentoId || '');
    if (!k) continue;
    (byLanc.get(k) || byLanc.set(k, []).get(k)).push(p);
  }

  const out = {
    extrato: [],                 // linhas (parcelas e/ou sem parcela)
    contratado: 0,               // entradas contratadas (total)
    recebido: 0,                 // entradas pagas (inclui parciais até o pago)
    custos: 0,                   // saídas pagas (inclui parciais até o pago)
    comissoes: 0,                // saídas de comissão (pagas + parcela paga)
    totalSaidasContratadas: 0    // soma de TODAS as saídas (indep. do status)
  };

  for (const l of lancs){
    if (String(l.eventoId || '') !== String(evId)) continue;

    const tipo =
      (typeof normalizeTipoLanc === 'function'
        ? normalizeTipoLanc(l?.tipo)
        : String(l?.tipo || '').toLowerCase())
      || (function(){
           const nm = String(l?.categoriaNome || l?.categoria || '').toLowerCase();
           if (/despesa|custo|fornecedor|saida/.test(nm)) return 'saida';
           if (/receita|entrada|venda/.test(nm))          return 'entrada';
           return '';
         })();

    const parts      = byLanc.get(String(l.id)) || [];
    const ymVencLanc = String(l.vencimentoISO || l.dataCompetencia || l.dataISO || l.data || '').slice(0,7);
    const catNome    = (typeof __catNomeByLanc === 'function')
      ? __catNomeByLanc(l)
      : (l.categoriaNome || l.categoria || '—');

    // === 1) Extrato (linhas)
    if (parts.length){
      for (const p of parts){
        const venYM = String(p.vencimentoISO || p.vencimento || ymVencLanc).slice(0,7);
        if (!inRange(venYM, deYM, ateYM)) continue;

        const valor    = Number(p.valor || 0);
        const pago     = Number(p.totalPago || 0);
        const st       = String(p.status || l.status || 'pendente').toLowerCase();
        const restante = Math.max(0, valor - pago);

        out.extrato.push({
          tipo,
          descricao : l.descricao || '-',
          categoria : catNome,
          vencimento: (p.vencimentoISO || p.vencimento || l.vencimentoISO || l.dataCompetencia || l.dataISO || l.data || '').slice(0,10),
          // usa data de pagamento quando houver; senão, vencimento
          dataPago  : (IS_PAGO(st) || st === 'parcial')
                        ? String(p.dataPagamentoISO || l.dataPagamentoISO || p.vencimentoISO || p.vencimento || '').slice(0,10)
                        : '',
          valor,
          status   : st,
          parcial  : (st === 'parcial'),
          restante,
          link     : linkLancamentos({
            ymHint: venYM || ymVencLanc,
            eventoId: evId,
            statusDetalhado: (tipo === 'entrada'
              ? (IS_PAGO(st) ? 'entrada_paga' : 'entrada_pendente')
              : (IS_PAGO(st) ? 'saida_paga'   : 'saida_pendente'))
          })
        });

        // === 2) Acumuladores por visão
        if (tipo === 'entrada'){
          out.contratado += valor;
          if (IS_PAGO(st)) out.recebido += valor;
          else if (st === 'parcial') out.recebido += Math.min(valor, pago);
        } else if (tipo === 'saida'){
          out.totalSaidasContratadas += valor;                  // todas as saídas
          if (IS_PAGO(st)) out.custos += valor;
          else if (st === 'parcial') out.custos += Math.min(valor, pago);
        }

        // estimativa de comissão: categoria/descrição contém "comiss"
        if (tipo === 'saida'){
          const txt = String(l.categoriaNome || l.categoria || l.descricao || '').toLowerCase();
          if (/(comiss)/.test(txt)) {
            if (IS_PAGO(st)) out.comissoes += valor;
            else if (st === 'parcial') out.comissoes += Math.min(valor, pago);
          }
        }
      }
    } else {
      const venYM = ymVencLanc;
      if (!inRange(venYM, deYM, ateYM)) continue;

      const valor    = Number(l.valorTotal ?? l.valor ?? 0);
      const st       = String(l.status || 'pendente').toLowerCase();
      const pago     = Number(l.totalPago || 0);
      const restante = Math.max(0, valor - pago);

      out.extrato.push({
        tipo,
        descricao : l.descricao || '-',
        categoria : catNome,
        vencimento: (l.vencimentoISO || l.dataCompetencia || l.dataISO || l.data || '').slice(0,10),
        dataPago  : (IS_PAGO(st) || st === 'parcial')
                      ? String(l.dataPagamentoISO || l.vencimentoISO || l.dataCompetencia || l.dataISO || l.data || '').slice(0,10)
                      : '',
        valor,
        status   : st,
        parcial  : (st === 'parcial'),
        restante,
        link     : linkLancamentos({
          ymHint: venYM,
          eventoId: evId,
          statusDetalhado: (tipo === 'entrada'
            ? (IS_PAGO(st) ? 'entrada_paga' : 'entrada_pendente')
            : (IS_PAGO(st) ? 'saida_paga'   : 'saida_pendente'))
        })
      });

      if (tipo === 'entrada'){
        out.contratado += valor;
        if (IS_PAGO(st)) out.recebido += valor;
        else if (st === 'parcial') out.recebido += Math.min(valor, pago);
      } else if (tipo === 'saida'){
        out.totalSaidasContratadas += valor;                    // todas as saídas
        if (IS_PAGO(st)) out.custos += valor;
        else if (st === 'parcial') out.custos += Math.min(valor, pago);
      }

      const txt = String(l.categoriaNome || l.categoria || l.descricao || '').toLowerCase();
      if (tipo === 'saida' && /(comiss)/.test(txt)) {
        if (IS_PAGO(st)) out.comissoes += valor;
        else if (st === 'parcial') out.comissoes += Math.min(valor, pago);
      }
    }
  } // for lancamentos

  return out;
} // collectForEvento


// Monta série diária só com valores pagos (entrada e saída)
function buildFluxoSeries(out, deYM, ateYM){
  // cria um mapa AAAA-MM-DD -> {entradas:0, saidas:0}
  const days = new Map();
  function ensure(dISO){
    const k = String(dISO||'').slice(0,10);
    if (!k) return null;
    if (!days.has(k)) days.set(k, {entradas:0, saidas:0});
    return days.get(k);
  }

  for (const row of out.extrato){
    const st = String(row.status||'pendente').toLowerCase();
    const isQuitado = ['pago','recebido','baixado','quitado','liquidado'].includes(st);
    const isParcial = (st==='parcial');
    const data = row.dataPago || row.vencimento || '';
    if (!data) continue;

    // respeita janela de mês (deYM..ateYM)
    const ymK = String(data).slice(0,7);
    const ok = (!deYM || ymK>=deYM) && (!ateYM || ymK<=ateYM);
    if (!ok) continue;

    const bucket = ensure(data);
    if (!bucket) continue;

    const v = Number(row.valor||0);
    const pago = isParcial ? Math.max(0, v - Number(row.restante||0)) : v;
    if (isQuitado || isParcial){
      if (row.tipo === 'entrada') bucket.entradas += pago;
      else if (row.tipo === 'saida') bucket.saidas += pago;
    }
  }

  // ordena por data
  const sorted = Array.from(days.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  return {
    labels: sorted.map(([d])=>d),
    entradas: sorted.map(([,o])=>o.entradas),
    saidas:   sorted.map(([,o])=>o.saidas)
  };
}

// Desenha o gráfico no <canvas id="chartFluxo">
function renderFluxoPagos(out, deYM, ateYM){
  const cv = document.getElementById('chartFluxo');
  const ph = document.getElementById('chartFluxoPlaceholder');
  if (!cv || !(cv.getContext)) {
    if (ph) ph.textContent = 'Sem dados pagos para plotar.';
    return;
  }

  const series = buildFluxoSeries(out, deYM, ateYM);
  const hasData = (series.entradas.some(v=>v>0) || series.saidas.some(v=>v>0));
  if (!hasData){
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,cv.width,cv.height);
    if (ph) ph.textContent = 'Sem dados pagos para plotar.';
    return;
  } else if (ph) {
    ph.textContent = '';
  }

  // tamanho base
  cv.width  = cv.clientWidth  || 600;
  cv.height = cv.clientHeight || 220;

  const ctx = cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);

  // margens
  const pad = {l:40, r:10, t:10, b:24};
  const W = cv.width  - pad.l - pad.r;
  const H = cv.height - pad.t - pad.b;

  const allVals = series.entradas.concat(series.saidas);
  const maxV = Math.max(1, ...allVals);
  const xStep = (series.labels.length>1) ? (W/(series.labels.length-1)) : W;

  function y(v){ return pad.t + (H - (v/maxV)*H); }
  function x(i){ return pad.l + i*xStep; }

  // grade simples
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  for (let i=0; i<=4; i++){
    const yy = pad.t + (H*i/4);
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(pad.l+W, yy); ctx.stroke();
  }

  // eixos
  ctx.strokeStyle = '#ccc';
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t+H); ctx.lineTo(pad.l+W, pad.t+H); ctx.stroke();

  // linhas: entradas (↑) e saídas (↓)
  function plotLine(vals){
    ctx.beginPath();
    vals.forEach((v,i)=>{
      const xx=x(i), yy=y(v);
      if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
    });
    ctx.stroke();
  }

  // Entradas
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#2e7d32'; // verde padrão (sem tema)
  plotLine(series.entradas);

  // Saídas
  ctx.strokeStyle = '#c62828'; // vermelho padrão (sem tema)
  plotLine(series.saidas);

  // labels x (apenas 1 a cada N para não poluir)
  ctx.fillStyle = '#7b6a5e';
  ctx.font = '11px Inter, system-ui, Arial';
  const skip = Math.ceil(series.labels.length / 6) || 1;
  series.labels.forEach((d,i)=>{
    if (i%skip!==0 && i!==series.labels.length-1) return;
    const xx = x(i);
    ctx.fillText(String(d).slice(5), xx-12, pad.t+H+16);
  });
}

// ======= Render das 3 visões =======
function renderExtrato(list){
  const tbody = $('#tb-extrato tbody');
  tbody.innerHTML = '';
  if (!list.length){
    tbody.innerHTML = '<tr><td colspan="5">Nenhum lançamento no período.</td></tr>';
    return;
  }
  for (const r of list.sort((a,b)=>(a.vencimento||'').localeCompare(b.vencimento||''))){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(r.vencimento||'').split('-').reverse().join('/')}</td>
      <td>${r.tipo==='entrada'?'Entrada':'Saída'}</td>
      <td>${r.descricao || '-'}</td>
      <td class="num">${BRL(r.valor)}</td>
      <td>
        <span class="status ${IS_PAGO(r.status)?'baixado':(r.parcial?'pendente':'pendente')}">
          ${r.parcial?'Parcial':(IS_PAGO(r.status)?'Baixado':'Pendente')}
        </span>
        <a href="${r.link}" class="mini">ver no Lançamentos</a>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function renderLucratividade({ contratado, recebido, custos, comissoes }){
  const elContr = $('#k-contratado'); elContr.textContent = BRL(contratado);
  const elRecv  = $('#k-recebido');   elRecv.textContent  = BRL(recebido);
  const elCust  = $('#k-custos');     elCust.textContent  = BRL(custos);
  const elCom   = $('#k-comissoes');  elCom.textContent   = BRL(comissoes);

  const lucroPrev = contratado - custos - comissoes;
  const lucroReal = recebido   - custos - comissoes;
  $('#k-lucro-prev').textContent = BRL(lucroPrev);
  $('#k-lucro-real').textContent = BRL(lucroReal);
}

function renderContratadoVsRecebido({ contratado, recebido }){
  const base = Math.max(contratado, recebido, 1); // evita div/0
  const pendente = Math.max(0, contratado - recebido);

  const wContr = Math.min(100, (contratado / base) * 100);
  const wRecv  = Math.min(100, (recebido   / base) * 100);
  const wPend  = Math.min(100, (pendente   / base) * 100);

  const set = (id, w, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    // ✅ Só controla o preenchimento pelo ::before via --w
    el.style.setProperty('--w', w.toFixed(2) + '%');
    // ❌ REMOVIDO: não reduza a largura do contêiner
    // el.style.width = w.toFixed(2) + '%';
    const slot = el.querySelector('[data-v]');
    if (slot) slot.textContent = BRL(val);
  };

  set('bar-contr', wContr, contratado);
  set('bar-recv',  wRecv,  recebido);
  set('bar-pend',  wPend,  pendente);
}


/* ====== KPIs/Totais do topo (derivado do extrato) ====== */
function computeTopTotalsFromExtrato(rows){
  let inPagas=0, inPend=0, outPagas=0, outPend=0;

  for (const r of rows){
    const valor = Number(r.valor||0);
    const pago = (IS_PAGO(r.status) ? valor : (r.parcial ? Math.max(0, valor - Number(r.restante||0)) : 0));
    const pend = (IS_PAGO(r.status) ? 0 : (r.parcial ? Math.max(0, Number(r.restante||0)) : valor));

    if (r.tipo === 'entrada'){ inPagas += pago; inPend += pend; }
    else if (r.tipo === 'saida'){ outPagas += pago; outPend += pend; }
  }

  const saldoPago  = inPagas - outPagas;
  const saldoGeral = (inPagas + inPend) - (outPagas + outPend);

  return { inPagas, inPend, outPagas, outPend, saldoPago, saldoGeral };
}

function renderTopTotals(t){
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = BRL(v); };
  // KPIs
  set('kEntradasPagas', t.inPagas);
  set('kEntradasPend',  t.inPend);
  set('kSaidasPagas',   t.outPagas);
  set('kSaidasPend',    t.outPend);
  set('kSaldoPago',     t.saldoPago);
  // Tabela “Totais do Evento”
  set('tInPagas',   t.inPagas);
  set('tInPend',    t.inPend);
  set('tOutPagas',  t.outPagas);
  set('tOutPend',   t.outPend);
  set('tSaldoPago', t.saldoPago);
  set('tSaldoGeral',t.saldoGeral);
}

// ===== Resumos por categoria (Pago) =====
function sumByCategoriaPago(extrato){
  const accIn  = new Map();  // categoria -> total pago (entradas)
  const accOut = new Map();  // categoria -> total pago (saídas)

  const IS_Q = (s)=>['pago','recebido','baixado','quitado','liquidado'].includes(String(s||'').toLowerCase());
  for (const row of extrato){
    const tipo = String(row.tipo||'').toLowerCase();
    const st   = String(row.status||'pendente').toLowerCase();
    const v    = Number(row.valor||0);
    const rest = Number(row.restante||0);
    const pago = (st==='parcial') ? Math.max(0, v - rest) : (IS_Q(st) ? v : 0);
    if (!pago) continue;

    const nome = (row.categoria || '—').trim() || '—';
    if (tipo === 'entrada'){
      accIn.set(nome, (accIn.get(nome)||0) + pago);
    } else if (tipo === 'saida'){
      accOut.set(nome, (accOut.get(nome)||0) + pago);
    }
  }

  // retorna arrays ordenados por valor desc
  const ord = (m)=> [...m.entries()].sort((a,b)=> b[1]-a[1]).map(([categoria,total])=>({categoria,total}));
  return { inPaid: ord(accIn), outPaid: ord(accOut) };
}

function renderCategorySummaries(extrato){
  const fmt = (n)=> (Number(n)||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

  // Suporta dois padrões de IDs:
  // 1) Meu padrão: <tbody id="tblCatEntradas"> / <tbody id="tblCatSaidas">
  // 2) Seu padrão: <table id="tbCatEntradas"><tbody>...</tbody><tfoot>...</tfoot></table> + #ttlCatEntradas/#ttlCatSaidas
  const TIN  = document.getElementById('tblCatEntradas') || document.querySelector('#tbCatEntradas tbody');
  const TOUT = document.getElementById('tblCatSaidas')   || document.querySelector('#tbCatSaidas tbody');
  const TTIN = document.getElementById('ttlCatEntradas') || null;
  const TTOU = document.getElementById('ttlCatSaidas')   || null;

  if (!TIN && !TOUT) return;

  const { inPaid, outPaid } = sumByCategoriaPago(extrato);

  // ENTRADAS
  if (TIN){
    TIN.innerHTML = '';
    if (!inPaid.length){
      TIN.innerHTML = `<tr><td colspan="2" class="muted">Sem entradas pagas neste período.</td></tr>`;
    } else {
      for (const it of inPaid){
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${String(it.categoria||'—').replace(/</g,'&lt;')}</td><td class="num">${fmt(it.total)}</td>`;
        TIN.appendChild(tr);
      }
    }
    if (TTIN){
      const totalIn = inPaid.reduce((s,i)=>s+Number(i.total||0),0);
      TTIN.textContent = fmt(totalIn);
    }
  }

  // SAÍDAS
  if (TOUT){
    TOUT.innerHTML = '';
    if (!outPaid.length){
      TOUT.innerHTML = `<tr><td colspan="2" class="muted">Sem saídas pagas neste período.</td></tr>`;
    } else {
      for (const it of outPaid){
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${String(it.categoria||'—').replace(/</g,'&lt;')}</td><td class="num">${fmt(it.total)}</td>`;
        TOUT.appendChild(tr);
      }
    }
    if (TTOU){
      const totalOut = outPaid.reduce((s,i)=>s+Number(i.total||0),0);
      TTOU.textContent = fmt(totalOut);
    }
  }
}

// ===== Mini-gráfico (LEGADO com Chart.js — mantido para compat) =====
let __relEvtChart = null;
function renderMiniFluxo(rows){
  const ctx = document.getElementById('miniFluxo');
  const empty = document.getElementById('chartEmpty');
  if (!ctx) return;

  const pagoDe = (r) => {
    const v = Number(r.valor||0);
    if (IS_PAGO(r.status)) return v;
    if (r.parcial) return Math.max(0, v - Number(r.restante||0));
    return 0;
  };

  const byDay = new Map(); // 'YYYY-MM-DD' -> total pago
  for (const r of rows){
    const paid = pagoDe(r);
    if (!paid) continue;
    const dia = String(r.dataPago || r.vencimento || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    byDay.set(dia, (byDay.get(dia)||0) + paid);
  }

  const labels = [...byDay.keys()].sort();
  const data   = labels.map(k => byDay.get(k));
  const hasData = labels.length > 0;
  if (empty) empty.hidden = hasData;

  try { __relEvtChart?.destroy?.(); } catch {}
  if (!hasData) return;

  if (typeof Chart === 'undefined') return; // se não tiver Chart.js carregado

  __relEvtChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Pagos por dia', data }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { autoSkip: true, maxRotation: 0 } },
        y: { beginAtZero: true }
      }
    }
  });
}

// ===== CSV simples por aba atual (compat) =====
function downloadCSV(filename, rows){
  if (!rows || !rows.length) return;
  const escapeCSV = s => `"${String(s??'').replace(/"/g,'""')}"`;
  const header = Object.keys(rows[0]||{});
  const csv = [header.join(',')]
    .concat(rows.map(r => header.map(k => escapeCSV(r[k])).join(',')))
    .join('\n');

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// Agora refresh é assíncrona, pois tenta usar a API primeiro
async function refresh(){
  const evId  = elEvento()?.value || state.eventoId;
  const deYM  = elDe()?.value     || state.deMes;
  const ateYM = elAte()?.value    || state.ateMes;
  if (!evId){
    $('#evtNome').textContent = '—';
    return;
  }

  $('#evtNome').textContent = getEventoNome(evId);

  // Tenta buscar do backend (/fin/relatorios/extrato); se falhar, cai pro cálculo local
  const data = await loadRelatorioFromApi(evId, deYM, ateYM);

  // Mantém exatamente os mesmos renders de antes
  renderExtrato(data.extrato || []);
  renderLucratividade(data);
  renderContratadoVsRecebido(data);

  // KPIs/Totais do topo
  const tops = computeTopTotalsFromExtrato(data.extrato || []);
  renderTopTotals(tops);

  // Resumos por categoria (Pago)
  renderCategorySummaries(data.extrato || []);

  // Gráfico de fluxo diário (Pago)
  try {
    renderFluxoPagos(data, deYM, ateYM);
  } catch (e) {
    console.warn('renderFluxoPagos falhou:', e);
  }

  // armazena para CSV
  window.__relEvtLast = { evId, deYM, ateYM, data };

  // Ajusta tamanhos dos KPIs após render
  try { fitKPIValues(); } catch {}
}


function exportCurrentCSV(){
  const ctx = window.__relEvtLast;
  if (!ctx) return;
  const { evId, deYM, ateYM, data } = ctx;
  const nomeBase = `relatorio-evento_${evId}_${deYM||'inicio'}_${ateYM||'fim'}`;

  const tab = $('button[data-view].active')?.dataset.view || state.view;
  if (tab === 'extrato'){
    const rows = data.extrato.map(x => ({
      vencimento: (x.vencimento||'').split('-').reverse().join('/'),
      tipo: x.tipo,
      descricao: x.descricao,
      valor: x.valor,
      status: x.parcial ? 'parcial' : (IS_PAGO(x.status) ? 'baixado' : 'pendente')
    }));
    downloadCSV(`${nomeBase}_extrato.csv`, rows);
  } else if (tab === 'lucratividade'){
    const rows = [{
      contratado: data.contratado,
      recebido: data.recebido,
      custos: data.custos,
      comissoes: data.comissoes,
      lucro_previsto: data.contratado - data.custos - data.comissoes,
      lucro_real:     data.recebido   - data.custos - data.comissoes
    }];
    downloadCSV(`${nomeBase}_lucratividade.csv`, rows);
  } else {
    const pend = Math.max(0, data.contratado - data.recebido);
    const rows = [{ contratado: data.contratado, recebido: data.recebido, pendente: pend }];
    downloadCSV(`${nomeBase}_contratado_vs_recebido.csv`, rows);
  }
}

// ====== Wire ======
function fillEventosSelect(){
  const sel = elEvento(); if (!sel) return;
  const evs = getEventos();
  sel.innerHTML = '<option value="">Selecione...</option>' +
    evs.map(e => `<option value="${e.id}">${e.titulo || e.nome || e.nomeEvento || ('Evento '+e.id)}</option>`).join('');
  if (state.eventoId){ sel.value = String(state.eventoId); }
}

function wire(){
  // ===== Tabs (com ARIA básica)
  $$('button[data-view]').forEach(b => {
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', b.classList.contains('active') ? 'true' : 'false');
    b.addEventListener('click', () => {
      $$('button[data-view]').forEach(x => {
        x.classList.remove('active');
        x.setAttribute('aria-selected', 'false');
      });
      b.classList.add('active');
      b.setAttribute('aria-selected', 'true');
      state.view = b.dataset.view;

      // mostra/esconde painéis e ajusta ARIA
      $$('.view').forEach(x => {
        x.classList.add('hidden');
        x.setAttribute('aria-hidden','true');
      });
      const panel = document.querySelector(`#view-${state.view}`);
      if (panel){
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden','false');
      }

      // re-render rápido se necessário
      try { refresh(); } catch {}
    });
  });

  // ===== Filtros (evento / período)
  elEvento()?.addEventListener('change', () => { try { refresh(); } catch {} });
  elDe()?.addEventListener('change',     ()  => { try { refresh(); } catch {} });
  elAte()?.addEventListener('change',    ()  => { try { refresh(); } catch {} });

  // ===== Imprimir (substitui Exportar CSV)
  // Dica: se ainda existir um botão antigo de CSV na página, ele será ignorado.
  document.getElementById('btnPrint')?.addEventListener('click', () => {
    try { window.lucide?.createIcons?.(); } catch {}
    // pequeno delay para garantir repaint antes da impressão
    setTimeout(() => window.print(), 50);
  });

 // “Ver Lançamentos” — já leva mês (dica) e eventoId
document.getElementById('btnVerLanc')?.addEventListener('click', () => {
  try {
    const evSel = elEvento()?.value;
    const evId  = String(evSel ?? state.eventoId ?? '').trim();
    const deYM  = String(elDe()?.value || state.deMes || ym(ISO())).slice(0, 7);

    if (!evId) { alert('Selecione um evento para abrir os Lançamentos.'); return; }

    const url = linkLancamentos({ ymHint: deYM, eventoId: evId /*, statusDetalhado: 'entrada_pendente'*/ });
    window.location.assign(url);
  } catch (e) {
    console.warn('Falha ao abrir Lançamentos:', e);
    alert('Não foi possível abrir a tela de Lançamentos.');
  }
});

// === Atalhos pelos KPIs: abrem Lançamentos já filtrado por status ===
(function wireKpiDeepLinks(){
  function go(statusDetalhado){
    try {
      const evSel = elEvento()?.value;
      const evId  = String(evSel ?? state.eventoId ?? '').trim();
      const deYM  = String(elDe()?.value || state.deMes || ym(ISO())).slice(0,7);
      if (!evId) { alert('Selecione um evento para abrir os Lançamentos.'); return; }
      const url = linkLancamentos({ ymHint: deYM, eventoId: evId, statusDetalhado });
      window.location.assign(url);
    } catch (e) {
      console.warn('Deep-link KPI → Lançamentos falhou:', e);
      alert('Não foi possível abrir a tela de Lançamentos.');
    }
  }

  // IDs dos KPIs (presentes no relatorio-evento.html)
  // Entradas
  document.getElementById('kEntradasPend')?.closest('.kpi')?.addEventListener('click', ()=>go('entrada_pendente'));
  document.getElementById('kEntradasPagas')?.closest('.kpi')?.addEventListener('click', ()=>go('entrada_paga'));

  // Saídas
  document.getElementById('kSaidasPend')?.closest('.kpi')?.addEventListener('click', ()=>go('saida_pendente'));
  document.getElementById('kSaidasPagas')?.closest('.kpi')?.addEventListener('click', ()=>go('saida_paga'));
})();

  // ===== Reatividade global (M14/M36)
  try {
    const handler = () => { try { refresh(); } catch {} };
    window.addEventListener('fin-store-changed', handler);
    window.addEventListener('storage', (e) => {
      if (['financeiroGlobal','financeiroGlobal:ping','configFinanceiro'].includes(e.key)) {
        try { refresh(); } catch {}
      }
    });
  } catch {}
}


document.addEventListener('DOMContentLoaded', async ()=>{
  // 1) Tenta sincronizar o financeiro com o backend (M36)
  try {
    if (window.finSyncFromApi) {
      await window.finSyncFromApi();
    }
  } catch (e) {
    console.warn('[financeiro-relatorios] erro ao sincronizar financeiro:', e);
  }

  // 2) Depois de sincronizar, continua o fluxo normal da tela
  applyURL();
  fillEventosSelect();
  wire();

  // tab inicial
  const btn = document.querySelector(`button[data-view="${state.view}"]`) || $('button[data-view]');
  btn?.click();

  // monta os relatórios com base no snapshot atualizado
  refresh();
});


})();

// ====== Auto-shrink dos valores de KPI ======
function fitKPIValues(){
  const MIN_PX = 10;
  const ITER   = 8;

  document.querySelectorAll('.kpi .kpi-value b').forEach(b=>{
    if (!b.dataset.fszOrig){
      const cs = getComputedStyle(b);
      b.dataset.fszOrig = cs.fontSize;
    }
    b.style.fontSize = b.dataset.fszOrig;

    if (b.scrollWidth <= b.clientWidth) return;

    let hi = parseFloat(b.dataset.fszOrig) || 16;
    let lo = MIN_PX;
    if (hi < lo) { hi = lo; }

    for (let i = 0; i < ITER; i++){
      const mid = (hi + lo) / 2;
      b.style.fontSize = mid + 'px';
      // força reflow
      // eslint-disable-next-line no-unused-expressions
      b.offsetWidth;

      if (b.scrollWidth > b.clientWidth) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    b.style.fontSize = Math.max(lo, MIN_PX) + 'px';
  });
}

// reaplicar em redimensionamentos
window.addEventListener('resize', () => {
  try { fitKPIValues(); } catch {}
});
