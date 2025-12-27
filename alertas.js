// === alertas.js — Painel de Alertas (localStorage) ===
// Fontes: financeiroGlobal (parcelas + lançamentos) e agendaUnified (opcional, para tarefas).
// Janela padrão: 7 dias. Filtros: todos | hoje | vencer | atrasados.

(() => {
  'use strict';

  // ---------- Utils ----------
  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  const fmtBRL = new Intl.NumberFormat('pt-BR',{ style:'currency', currency:'BRL' });
  const money = n => fmtBRL.format(Number(n||0));
 // yyyy-mm-dd (LOCAL) — sem UTC
function ymdLocal(dt){
  const d = (dt instanceof Date) ? dt : new Date(String(dt||''));
  if (isNaN(d)) return '';
  // zera hora local
  d.setHours(0,0,0,0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}
const ymd = (iso) => String(iso||'').slice(0,10);
const today = () => ymdLocal(new Date());

// helpers para destacar linha (LOCAL)
const isoToday = today();
function isToday(iso){ return ymd(iso) === isoToday; }
function isOverdue(iso){ const d = ymd(iso); return d && d < isoToday; }

// Dentro de [hoje .. hoje+7], inclusive
function inProximos7dias(iso){
  const d = ymd(String(iso||''));   // "YYYY-MM-DD" (string)
  if (!d) return false;
  const h = today();                 // hoje (string local)
  const lim = addDays(h, 7);         // h + 7 (string local)
  return d >= h && d <= lim;         // comparação lexicográfica segura
}

// === D-MICRO M26: helper para decorar a linha com animação, tooltip e A11y
function addRowMicroUX(tr, i){
  try{
    // animação de entrada
    tr.classList.add('row-enter');

    // tooltip informativo (data • título • valor)
    const tip = `${(String(i.date||'').split('-').reverse().join('/'))} — ${i.title}${i.valor ? ' • ' + new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(i.valor||0)) : ''}`;
    tr.setAttribute('data-tip', tip);

    // A11y: foco por teclado e rótulo descritivo
    tr.tabIndex = 0;
    tr.setAttribute('role','button');
    tr.setAttribute('aria-label', `Abrir ${i.title} de ${(String(i.date||'').split('-').reverse().join('/'))}`);
  }catch{}
}

  const getLS = (k, fb) => { try{ return JSON.parse(localStorage.getItem(k)) ?? fb; }catch{ return fb; } };
  const setChip = (n) => { const el = $('#chipTotal'); if (el) el.textContent = `${n} alerta(s)`; };

  const isQuitado = (st) => {
    const v = String(st||'').toLowerCase();
    return ['pago','recebido','baixado','quitado','liquidado'].includes(v);
  };
  const normTipoLanc = (t) => {
    const v = String(t||'').toLowerCase();
    if (['entrada','receita','receber'].includes(v)) return 'entrada';
    if (['saida','despesa','pagar'].includes(v))    return 'saida';
    return '';
  };

function addDays(iso, days){
  const [y,m,d] = String(iso||'').slice(0,10).split('-').map(Number);
  const dt = new Date(y, m-1, d);
  dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate() + Number(days||0));
  return ymdLocal(dt); // <<< usa formato LOCAL consistente
}


  // ---------- Coleta: FINANCEIRO ----------
  function coletarFinanceiro() {
    const g = getLS('financeiroGlobal', {}) || {};
    const lancs = Array.isArray(g.lancamentos) ? g.lancamentos : [];
    const parcs = Array.isArray(g.parcelas)    ? g.parcelas    : [];

    const out = [];

    // Parcelas (prioridade)
    for (const p of parcs) {
      const l = lancs.find(x => String(x.id) === String(p.lancamentoId));
      if (!l) continue;

      const status = String(p.status || '').toLowerCase();
      if (isQuitado(status)) continue;

      const vcto = ymd(p.vencimentoISO || p.vencimento || '');
      if (!vcto) continue;

      const valor = Number(p.valor || 0);
      const pago  = Number(p.totalPago || 0);
      const aberto = Math.max(0, valor - pago);
      if (aberto <= 0) continue;

      out.push({
        src: 'fin',
        kind: 'parcela',
        id: String(p.id),
        ref: `parcela:${p.id}`,
        date: vcto,
        title: l?.descricao || '(sem descrição)',
        desc: l?.categoriaNome || '',
        tipo: normTipoLanc(l?.tipo) || 'saida',
        valor: (l?.tipo || '').toLowerCase() === 'entrada' ? +aberto : -aberto
      });
    }

    // Lançamentos sem parcelas
    const parcByLanc = new Set(parcs.map(p => String(p.lancamentoId)));
    for (const l of lancs) {
      if (parcByLanc.has(String(l.id))) continue; // já coberto
      if (isQuitado(l?.status)) continue;

      const data = ymd(l?.vencimentoISO || l?.dataCompetencia || l?.dataISO || l?.data);
      if (!data) continue;

      const tipo = normTipoLanc(l?.tipo);
      const v    = Number(l?.valor ?? l?.valorTotal ?? 0);
      if (!(v > 0)) continue;

      out.push({
        src: 'fin',
        kind: 'lanc',
        id: String(l.id),
        ref: `lanc:${l.id}`,
        date: data,
        title: l.descricao || '(sem descrição)',
        desc: l.categoriaNome || '',
        tipo,
        valor: (tipo==='entrada') ? +v : -v
      });
    }

    return out;
  }

  // ---------- Coleta: Tarefas unificadas (opcional) ----------
  function coletarAgendaUnified() {
    const raw = getLS('agendaUnified', []);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(x => x && x.date && String(x.status||'').toLowerCase() !== 'done')
      .map(x => ({
        src: String(x.src||'interno'),
        kind: 'task',
        id: String(x.id || ''),
        ref: `task:${x.id||''}`,
        date: ymd(x.date),
        title: x.title || '(tarefa)',
        desc: x.desc || '',
        tipo: 'interno',
        valor: 0
      }));
  }
  
  // ---------- Filtro & busca ----------
  function filtrar(arr){
    const tipoSel = $$('input[name="tipo"]').find(r => r.checked)?.value || 'todos';
    const jan = Math.max(1, Number($('#f-janela')?.value || 7));
    const q = String($('#f-busca')?.value || '').trim().toLowerCase();

    const hoje = today();
    const limite = addDays(hoje, jan);

    let base = arr;
    if (tipoSel === 'hoje') {
      base = base.filter(i => i.date === hoje);
    } else if (tipoSel === 'vencer') {
      base = base.filter(i => i.date > hoje && i.date <= limite);
    } else if (tipoSel === 'atrasados') {
      base = base.filter(i => i.date < hoje);
    } // 'todos' mantém tudo

    if (q) {
      base = base.filter(i => {
        const hay = [i.title, i.desc, i.src, i.kind].map(v => String(v||'').toLowerCase()).join(' | ');
        return hay.includes(q);
      });
    }
    return { base, hoje, limite };
  }
// ---------- Utils deeplink ----------
function tipoLancFrom(i){
  // tenta inferir pelo próprio item
  const t = String(i.tipo||i.kind||'').toLowerCase();
  if (['entrada','receber','receita'].includes(t)) return 'entrada';
  if (['saida','pagar','despesa','cartao'].includes(t)) return 'saida';
  // fallback por origem
  const o = String(i.source||i.origem||'').toLowerCase();
  if (o.includes('cartao') || o.includes('cartão')) return 'saida';
  return ''; // deixa em branco se incerto
}
function buildLancamentosURL(i){
  const ym = String(i.date||'').slice(0,7);
  const params = new URLSearchParams();
  if (/^\d{4}-\d{2}$/.test(ym)) params.set('mes', ym);
  // por padrão queremos ver “pendentes” ao abrir
  params.set('status','pendente');
  const tipo = tipoLancFrom(i);
  if (tipo) params.set('tipo', tipo);
  return `financeiro-lancamentos.html?${params.toString()}`;
}
// acessibilidade p/ linha como botão/link
function decorateRowAsLink(tr, url, label){
  tr.classList.add('clickable');
  tr.tabIndex = 0;
  tr.setAttribute('role','button');
  tr.setAttribute('aria-label', label || 'Abrir detalhes');
  tr.addEventListener('click', ()=> window.location.href = url);
  tr.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      window.location.href = url;
    }
  });
}

  // ---------- Render ----------
  function render(){
    // skeleton
    $('#sk1')?.setAttribute('style','display:none');

    const fin = coletarFinanceiro();
    const uni = coletarAgendaUnified(); // pode estar vazio
    const itens = [...fin, ...uni];

    // Atualiza chip total (após filtros de topo)
    const { base, hoje, limite } = filtrar(itens);
    setChip(base.length);

    // separa buckets
    const vencer = base.filter(i => inProximos7dias(i.date));
    const crit   = base.filter(i => i.date <= hoje); // inclui hoje e atrasados para a coluna da direita
    $('#spanVencerDias').textContent = String(Math.max(1, Number($('#f-janela')?.value || 7)));

    // helpers de célula
    const moneyClass = (n) => (Number(n||0) >= 0 ? 'green' : 'red');
    const br = (iso) => iso ? iso.split('-').reverse().join('/') : '—';
    const origem = (i) => (i.src==='fin' ? (i.tipo==='entrada'?'Entrada':'Saída') : 'Tarefa');

    // limpa
    const tbV = $('#tb-vencer'); const tbC = $('#tb-hoje-atrasado');
    tbV.innerHTML = ''; tbC.innerHTML = '';

    // preenche "a vencer"
    if (!vencer.length) {
      tbV.innerHTML = `<tr><td colspan="5" class="sub">Nada a vencer na janela.</td></tr>`;
    } else {
      vencer
        .sort((a,b)=> (a.date===b.date ? String(a.title||'').localeCompare(String(b.title||'')) : a.date.localeCompare(b.date)))
        .forEach(i => {
          const tr = document.createElement('tr');
tr.className = 'fade-in';
const urlVencer = buildLancamentosURL(i);

tr.innerHTML = `
  <td title="Vencimento">${br(i.date)}</td>
  <td title="${i.title}">${i.title}</td>
  <td title="Origem">${origem(i)}</td>
  <td class="num ${moneyClass(i.valor)}" title="Valor">${i.valor ? money(i.valor) : '—'}</td>
  <td class="row-actions"><a href="${urlVencer}" title="Abrir lançamentos">Abrir</a></td>
`;

// destaca hoje/atrasado
if (isOverdue(i.date)) tr.classList.add('atrasado');
else if (isToday(i.date)) tr.classList.add('hoje');

// micro UX + tooltip + A11y
addRowMicroUX(tr, i);

// transforma a linha inteira em link (click, Enter e Espaço)
decorateRowAsLink(tr, urlVencer, `Abrir lançamentos do mês de ${String(i.date||'').slice(0,7)}`);


          tbV.appendChild(tr);
        });
    }

    // preenche "hoje & atrasados"
    if (!crit.length) {
      tbC.innerHTML = `<tr><td colspan="5" class="sub">Nenhum item hoje/atrasado.</td></tr>`;
    } else {
      crit
        .sort((a,b)=> (a.date===b.date ? String(a.title||'').localeCompare(String(b.title||'')) : a.date.localeCompare(b.date)))
        .forEach(i => {
          const tr = document.createElement('tr');
          tr.className = 'fade-in';
const url = buildLancamentosURL(i);

tr.innerHTML = `
  <td title="Vencimento">${br(i.date)}</td>
  <td title="${i.title}">${i.title}</td>
  <td title="Origem">${origem(i)}</td>
  <td class="num ${moneyClass(i.valor)}" title="Valor">${i.valor ? money(i.valor) : '—'}</td>
  <td class="row-actions"><a href="${url}" title="Abrir lançamentos">Abrir</a></td>
`;

// destaca atrasado/hoje ANTES de transformar a linha em "link"
if (isOverdue(i.date)) tr.classList.add('atrasado');
else if (isToday(i.date)) tr.classList.add('hoje');

// mantém a linha clicável como link
decorateRowAsLink(tr, url, `Abrir lançamentos do mês de ${(i.date||'').slice(0,7)}`);

tbC.appendChild(tr);

        });
    }

    try{ window.lucide?.createIcons?.(); }catch{}
  }
// Polling leve enquanto não há Firebase
const POLL_MS = 20000; // 20s
setInterval(() => {
  if (document.visibilityState === 'visible') render();
}, POLL_MS);

  // ---------- Eventos ----------
  function wire(){
    // primeira carga com skeleton
    $('#sk1')?.removeAttribute('style');

    // filtros
    $('#f-busca')?.addEventListener('input', ()=>render());
    $('#f-janela')?.addEventListener('input', ()=>render());
    $$('input[name="tipo"]').forEach(r => r.addEventListener('change', render));

// realtime é gerenciado abaixo por wireAlertasLive() (guard + close)
// nada aqui para evitar listeners duplicados


    // render inicial (com pequeno atraso para dar tempo do menu)
    setTimeout(render, 60);

  }

  document.addEventListener('DOMContentLoaded', wire);
})();

// === Auto-reload: storage + BroadcastChannel (com guard) ===
(function wireAlertasLive(){
  // evita registrar duas vezes se o arquivo for carregado/reinjetado
  if (window.__ALERTAS_LIVE_BOUND__) return;
  window.__ALERTAS_LIVE_BOUND__ = true;

  // tenta chamar a função de render independente do nome
  function safeRender(){
    try {
      if (typeof render === 'function') return render();
      if (typeof renderAlertas === 'function') return renderAlertas();
      if (typeof loadAndRenderAlertas === 'function') return loadAndRenderAlertas();
      if (typeof initAndRenderAlertas === 'function') return initAndRenderAlertas();
    } catch (e) {
      console.warn('[Alertas] render falhou:', e);
    }
  }

  // 1) Mudanças no LocalStorage (mesma ou outra aba)
  window.addEventListener('storage', (ev) => {
    if (!ev || !ev.key) return;
    const k = String(ev.key);
    if (k === 'financeiroGlobal' || k === 'financeiroGlobal:ping' || k === 'agendaUnified') {
      // só re-renderiza se a aba estiver visível (evita trabalho desnecessário)
      if (document.visibilityState === 'visible') safeRender();
    }
  }, { passive: true });

  // 2) BroadcastChannel cross-tabs
  try {
    const bc = new BroadcastChannel('mrubuffet');
    // guarda para possível debug/fechamento
    window.__ALERTAS_BC__ = bc;

    bc.onmessage = (e) => {
      const t = e?.data?.type;
      if (t === 'fin-store-changed' || t === 'agenda-unified-changed') {
        if (document.visibilityState === 'visible') safeRender();
      }
    };

    // fecha o canal ao sair da página (limpa recursos)
    window.addEventListener('beforeunload', () => {
      try { bc.close(); } catch {}
    }, { once: true });
  } catch {}
})();
