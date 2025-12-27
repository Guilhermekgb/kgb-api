// ==== Helpers base ====
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const $  = (s, el=document) => el.querySelector(s);
const BRL = (n)=> new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const ISO = (d=new Date()) => new Date(d).toISOString().slice(0,10);
const toDate = (v)=>{ const d=new Date(v); return Number.isFinite(+d)?d:null; };
const today = (()=>{ const d=new Date(); d.setHours(0,0,0,0); return d; })();
const CHART = (typeof window!=='undefined' && window.Chart) ? window.Chart : undefined;

const IS_PAGO = (st) => ['pago','recebido','baixado','quitado','liquidado','parcial']
  .includes(String(st||'').toLowerCase());
const NORM_TIPO = (t)=>{ t=String(t||'entrada').toLowerCase(); if(t==='receita') t='entrada'; if(t==='despesa') t='saida'; return t; };
import { onFinStoreChanged } from './financeiro-shared.js';


// ===== Helpers de QueryString e datas (rolling 7 dias) =====
function getQS() {
  const p = new URLSearchParams(location.search);
  const val = k => (p.get(k) || '').trim();
  return {
    status:  val('status') || 'todos',
    de:      val('de'),
    ate:     val('ate'),
    mes:     val('mes'),       // fallback legado (AAAA-MM)
    cliente: val('cliente') || val('clienteId') || '',
    evento:  val('evento')  || val('eventoId')  || ''
  };
}

// ISO local YYYY-MM-DD
function hojeISO() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset()*60000);
  return d.toISOString().slice(0,10);
}
function isISODate(s){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
}

function readLS(k, fb){ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v??fb; }catch{ return fb; } }
function writeLS(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
function getFG(){ return readLS('financeiroGlobal', {}); }
function getEventos(){ return readLS('eventos', []); }

// === Filtros: salvar/restaurar ===
const FILTER_KEY = 'painelCobrancas:filtros';
function saveFilters(){
  const obj = {
    mes: $('#f-mes')?.value || '',
    clienteId: $('#f-cliente')?.value || '',
    eventoId:  $('#f-evento')?.value  || '',
    status:    $('#f-status')?.value  || 'todos'
  };
  writeLS(FILTER_KEY, obj);
}
function restoreFilters(){
  const f = readLS(FILTER_KEY, null);
  if (!f) return;
  if (f.mes) $('#f-mes').value = f.mes;
  if (f.clienteId) $('#f-cliente').value = String(f.clienteId);
  if (f.eventoId)  $('#f-evento').value  = String(f.eventoId);
  if (f.status)    $('#f-status').value  = f.status;
}

// === Filtros via URL (?de, ?ate, ?mes, ?cliente|clienteId, ?evento|eventoId, ?status) — prioridade ===
function applyURLFilters(){
  try{
    const q = getQS();

    // Cliente/Evento por id
    if (q.cliente) $('#f-cliente').value = String(q.cliente);
    if (q.evento)  $('#f-evento').value  = String(q.evento);

    // Status
    if (q.status && ['todos','pago','aberto','atraso'].includes(q.status))
      $('#f-status').value = q.status;

    // Range explícito tem prioridade sobre mês
    if (isISODate(q.de) && isISODate(q.ate)){
      // guarda o range numa variável global simples
      window.__rangeFilter = { de: q.de, ate: q.ate };
      // limpamos o <input type="month"> para não confundir visualmente
      const m = $('#f-mes'); if (m) m.value = '';
      return;
    }

    // fallback: mês (legado)
    if (q.mes && /^\d{4}-\d{2}$/.test(q.mes)) $('#f-mes').value = q.mes;

  }catch{}
}

// ==== Dados (flatten de cobranças/entradas) ====
function buildCobrancas({ ym, de, ate, clienteId, eventoId, status }){
  const g = getFG();
  const lancs = Array.isArray(g.lancamentos) ? g.lancamentos : [];
  const partes = Array.isArray(g.parcelas)    ? g.parcelas    : [];

  const byLanc = new Map();
  for (const p of partes){
    const k=String(p.lancamentoId||''); if(!k) continue;
    (byLanc.get(k) || byLanc.set(k,[]).get(k)).push(p);
  }

  const evs = getEventos();
  const evById = new Map(evs.map(e=>[String(e?.id ?? e?.eventoId ?? ''), e]));

  // Helpers de filtro por período
  const hasRange = isISODate(de) && isISODate(ate);
  const dateInRange = (iso) => {
    if (!hasRange) return true;
    const s = String(iso||'').slice(0,10);
    return s && s >= de && s <= ate;
  };

  const rows=[];
  for (const l of lancs){
    if (NORM_TIPO(l?.tipo) !== 'entrada') continue; // painel = ENTRADAS

    const parts = (byLanc.get(String(l.id))||[]);
    const baseCliente = (l.clienteId || l.clientId || l.cliente?.id || l.client?.id || '');
    const baseEvento  = (l.eventoId  || l.event?.id  || '');

    const pushRow = (obj)=>{
      // 1) Filtro por RANGE (se houver) — vence sobre "mes"
      if (hasRange){
        const iso = String(
          obj.vencimentoISO || obj.dataVencimentoISO || obj.dataVencimento ||
          obj.dataVenc || obj.dataCompetencia || obj.dataISO || ''
        ).slice(0,10);
        if (!dateInRange(iso)) return;
      } else if (ym){ // 2) Filtro por MÊS (legado)
        const ymDoc = String(
          obj.vencimentoISO || obj.dataVencimentoISO || obj.dataVencimento ||
          obj.dataVenc || obj.dataCompetencia || obj.dataISO || ''
        ).slice(0,7);
        if (ymDoc !== ym) return;
      }

      if (clienteId && String(obj.clienteId||'') !== String(clienteId)) return;
      if (eventoId  && String(obj.eventoId||'')  !== String(eventoId))  return;

      const pago = IS_PAGO(obj.status) || !!obj.dataPagamentoISO;
      const venc = toDate(
        obj.vencimentoISO || obj.dataVencimentoISO || obj.dataVencimento ||
        obj.dataVenc || obj.dataCompetencia || obj.dataISO
      );
      const atrasado = !pago && venc && venc < today;
      if (status === 'pago'   && !pago) return;
      if (status === 'aberto' &&  (pago || atrasado)) return;
      if (status === 'atraso' && !atrasado) return;

      rows.push(obj);
    };

    if (parts.length){
      for (const p of parts){
        const ev = evById.get(String(p.eventoId||l.eventoId||''));
        pushRow({
          id: p.id, lancamentoId: l.id,
          clienteId: p.clienteId || l.clienteId || baseCliente,
          clienteNome: p.clienteNome || l.clienteNome || l.cliente?.nome || ev?.cliente?.nome || '',
          eventoId: p.eventoId || l.eventoId || baseEvento,
          eventoNome: p.eventoNome || l.eventoNome || ev?.nomeEvento || ev?.nome || ev?.titulo || '',
          descricao: p.descricao || l.descricao || 'Parcela',
          valor: Number(p.valor||0),
          status: p.status || l.status || 'pendente',
          vencimentoISO: p.vencimentoISO || p.dataVencimentoISO || p.dataVencimento || p.vencimento ||
                         l.vencimentoISO || l.dataCompetencia || l.dataISO,
          dataPagamentoISO: p.dataPagamentoISO || null,
          forma: p.meio || p.formaDescricao || p.contaNome || l.formaDescricao || l.contaNome || '-',
        });
      }
    } else {
      const ev = evById.get(String(l.eventoId||''));
      pushRow({
        id: l.id,
        clienteId: l.clienteId || baseCliente,
        clienteNome: l.clienteNome || l.cliente?.nome || ev?.cliente?.nome || '',
        eventoId:  l.eventoId || baseEvento,
        eventoNome: l.eventoNome || ev?.nomeEvento || ev?.nome || ev?.titulo || '',
        descricao: l.descricao || 'Recebimento',
        valor: Number(l.valorTotal ?? l.valor ?? 0),
        status: l.status || 'pendente',
        vencimentoISO: l.vencimentoISO || l.dataVencimentoISO || l.dataVencimento ||
                       l.dataCompetencia || l.dataISO || l.data || null,
        dataPagamentoISO: l.dataPagamentoISO || null,
        forma: l.meio || l.formaDescricao || l.contaNome || '-',
      });
    }
  }

  // Ordena por data (desc)
  rows.sort((a,b)=>{
    const B = String(b?.dataPagamentoISO || b?.vencimentoISO || '');
    const A = String(a?.dataPagamentoISO || a?.vencimentoISO || '');
    return B.localeCompare(A);
  });
  return rows;
}

// ==== KPIs e agregações ====
function computeKPIs(rows){
  let faturado=0, recebido=0, aberto=0, inad=0;
  for (const r of rows){
    const pago = IS_PAGO(r.status) || !!r.dataPagamentoISO;
    const venc = toDate(r.vencimentoISO);
    const valor = Number(r.valor||0);

    faturado += valor;

    if (pago){
      if (String(r.status||'').toLowerCase()==='parcial'){
        const g = getFG();
        const p = (g.parcelas||[]).find(x => String(x.id)===String(r.id));
        const pagoParcial = Number(p?.totalPago||0);
        recebido += Math.min(valor, pagoParcial || valor);
        const restante = Math.max(0, valor - (pagoParcial||0));
        if (restante>0){
          if (venc && venc < today) inad += restante; else aberto += restante;
        }
      } else {
        recebido += valor;
      }
    } else {
      if (venc && venc < today) inad += valor; else aberto += valor;
    }
  }
  return { faturado, recebido, aberto, inad };
}

function meanPaymentDays(rows){
  const diffs=[];
  for (const r of rows){
    const pago = IS_PAGO(r.status) || !!r.dataPagamentoISO;
    if (!pago) continue;
    const dPay = toDate(r.dataPagamentoISO);
    const dRef = toDate(r.vencimentoISO) || toDate(r.dataISO) || toDate(r.dataCompetencia);
    if (!dPay || !dRef) continue;
    const days = Math.round((dPay - dRef) / 86400000); // negativo se pagou antes
    diffs.push(days);
  }
  if (!diffs.length) return null;
  const media = diffs.reduce((a,b)=>a+b,0)/diffs.length;
  return Math.round(media);
}

function groupByForma(rows){
  const map=new Map();
  for (const r of rows){
    const pago = IS_PAGO(r.status) || !!r.dataPagamentoISO; // somente RECEBIDOS
    if (!pago) continue;
    const key = String(r.forma||'-');
    map.set(key, (map.get(key)||0) + Number(r.valor||0));
  }
  return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,8);
}

function groupRecebidosPorMes(rows){
  const map=new Map();
  for (const r of rows){
    const pago = IS_PAGO(r.status) || !!r.dataPagamentoISO;
    if (!pago) continue;
    const ym = String((r.dataPagamentoISO||'').slice(0,7));
    if (!ym) continue;
    map.set(ym, (map.get(ym)||0) + Number(r.valor||0));
  }
  return Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0])).slice(-6);
}

function buildRankingInad(rows){
  const keyOf = (r)=> [r.clienteNome||'—', r.eventoNome||'—'].join('||');
  const map = new Map();
  const count = new Map();
  for (const r of rows){
    const venc = toDate(r.vencimentoISO);
    const pago = IS_PAGO(r.status) || !!r.dataPagamentoISO;
    if (pago || !venc || venc >= today) continue; // só atrasados
    const k = keyOf(r);
    map.set(k, (map.get(k)||0) + Number(r.valor||0));
    count.set(k, (count.get(k)||0) + 1);
  }
  return Array.from(map.entries()).map(([k,v])=>{
    const [cliente, evento] = k.split('||');
    return { cliente, evento, qtd: count.get(k)||0, total:v };
  }).sort((a,b)=> b.total - a.total).slice(0,10);
}

// ==== CSV utils ====
function toCSV(rows, headers){
  const esc = (v)=>`"${String(v??'').replace(/"/g,'""')}"`;
  const lines=[headers.map(esc).join(',')];
  for (const r of rows){ lines.push(headers.map(h=>esc(r[h])).join(',')); }
  return lines.join('\n');
}
function downloadCSV(filename, csv){
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
}

// ==== Render ====
let chStatus, chForma, chRecebidos;

function renderAll(){
  // modo e período
  const range = window.__rangeFilter || null;
  const hasRange = !!(range && isISODate(range.de) && isISODate(range.ate));
  const ym = hasRange ? '' : ($('#f-mes')?.value || '');

  const clienteId = $('#f-cliente')?.value || '';
  const eventoId  = $('#f-evento')?.value || '';
  const status    = $('#f-status')?.value || 'todos';

  // salva filtros (apenas os da UI; range é transitório via link)
  saveFilters();

  const rows = buildCobrancas({
    ym,
    de: hasRange ? range.de : undefined,
    ate: hasRange ? range.ate : undefined,
    clienteId, eventoId, status
  });
  const kpis = computeKPIs(rows);

  // KPIs
  $('#kpiFaturado') && ($('#kpiFaturado').textContent = BRL(kpis.faturado));
  $('#kpiRecebido') && ($('#kpiRecebido').textContent = BRL(kpis.recebido));
  $('#kpiAberto')   && ($('#kpiAberto').textContent   = BRL(kpis.aberto));
  $('#kpiInad')     && ($('#kpiInad').textContent     = BRL(kpis.inad));

  // Tempo médio
  const avg = meanPaymentDays(rows);
  const elTempo = $('#kpiTempo');
  if (elTempo) {
    if (avg === null) elTempo.textContent = '—';
    else if (avg < 0) elTempo.textContent = `${Math.abs(avg)} dia${Math.abs(avg)===1?'':'s'} antes`;
    else elTempo.textContent = `${avg} dia${avg===1?'':'s'}`;
  }

  // ===== Charts =====
  // Status
  const elStatus = document.getElementById('chartStatus');
  const emptyStatus = document.getElementById('emptyStatus');
  if (CHART && elStatus){
    const stCounts = (()=>{ let pago=0, aberto=0, atraso=0;
      for (const r of rows){
        const isPago = IS_PAGO(r.status) || !!r.dataPagamentoISO;
        const v = Number(r.valor||0);
        const venc = toDate(r.vencimentoISO);
        if (isPago) pago += v; else if (venc && venc < today) atraso += v; else aberto += v;
      }
      return { pago, aberto, atraso };
    })();
    if (emptyStatus) emptyStatus.hidden = (stCounts.pago + stCounts.aberto + stCounts.atraso) > 0;
    if (chStatus) chStatus.destroy();
    chStatus = new CHART(elStatus, {
      type:'doughnut',
      data:{ labels:['Recebido','Em aberto','Inadimplente'], datasets:[{ data:[stCounts.pago, stCounts.aberto, stCounts.atraso] }] },
      options:{
        maintainAspectRatio:false,
        plugins:{ legend:{ position:'bottom' }, title:{ display:true, text:'Situação das cobranças' } }
      }
    });
  }

  // Forma de pagamento
  const elForma = document.getElementById('chartForma');
  const emptyForma = document.getElementById('emptyForma');
  if (CHART && elForma){
    const byForma = groupByForma(rows);
    if (emptyForma) emptyForma.hidden = byForma.length>0;
    if (chForma) chForma.destroy();
    chForma = new CHART(elForma, {
      type:'bar',
      data:{ labels: byForma.map(x=>x[0]||'-'), datasets:[{ label:'Recebido por forma', data: byForma.map(x=>x[1]) }] },
      options:{
        maintainAspectRatio:false,
        indexAxis:'y',
        plugins:{ legend:{ display:false }, title:{ display:true, text:'Recebido por forma de pagamento' } },
        scales:{ x:{ ticks:{ callback:(v)=>BRL(v) } } }
      }
    });
  }

  // Recebidos por mês
  const elRec = document.getElementById('chartRecebidosMes');
  const emptyRec = document.getElementById('emptyRecMes');
  if (CHART && elRec){
    const porMes = groupRecebidosPorMes(rows);
    if (emptyRec) emptyRec.hidden = porMes.length>0;
    if (chRecebidos) chRecebidos.destroy();
    chRecebidos = new CHART(elRec, {
      type:'line',
      data:{ labels: porMes.map(x=>x[0]), datasets:[{ label:'Recebido por mês', data: porMes.map(x=>x[1]), tension:.25 }] },
      options:{
        maintainAspectRatio:false,
        plugins:{ legend:{ position:'bottom' }, title:{ display:true, text:'Recebimentos nos últimos meses' } },
        scales:{ y:{ ticks:{ callback:(v)=>BRL(v) } } }
      }
    });
  }

  // Ranking inadimplência
  const rank = buildRankingInad(rows);
  const tbInad = $('#tbInad');
  if (tbInad){
    tbInad.innerHTML = rank.length
      ? rank.map(r=>`<tr>
          <td>${r.cliente||'—'}</td>
          <td>${r.evento||'—'}</td>
          <td>${r.qtd}</td>
          <td>${BRL(r.total)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="sub">Sem atrasos no filtro atual.</td></tr>';
  }

  // CSV ranking (opcional)
  const btnInad = $('#btnCSVInad');
  if (btnInad){
    btnInad.onclick = ()=>{
      const base = hasRange ? `${range.de}_a_${range.ate}` : (ym || 'all');
      const csv = toCSV(rank.map(r=>({cliente:r.cliente, evento:r.evento, vencidas:r.qtd, total:r.total})), ['cliente','evento','vencidas','total']);
      downloadCSV(`inadimplencia_${base}.csv`, csv);
    };
  }

  // Últimas cobranças (10)
  const tbUlt = $('#tbUltimos');
  const last = rows.slice(0,10);
  if (tbUlt){
    tbUlt.innerHTML = last.length
      ? last.map(r=>{
          const stRaw = String(r.status||'').toLowerCase();
          const pago = IS_PAGO(stRaw) || !!r.dataPagamentoISO;
          const venc = r.vencimentoISO ? r.vencimentoISO.split('-').reverse().join('/') : '-';
          let cls, stTxt;
          if (stRaw === 'parcial') { cls='warn'; stTxt='Parcial'; }
          else if (pago)           { cls='ok';   stTxt='Pago'; }
          else {
            const d = toDate(r.vencimentoISO);
            const isLate = d && d < today;
            cls = isLate ? 'late' : 'warn';
            stTxt = isLate ? 'Atrasado' : 'Em aberto';
          }
          return `<tr>
            <td>${venc}</td>
            <td>${r.clienteNome||'—'}</td>
            <td>${r.eventoNome||'—'}</td>
            <td>${r.descricao||'-'}</td>
            <td>${BRL(r.valor)}</td>
            <td><span class="badge ${cls}">${stTxt}</span></td>
            <td>${r.forma||'-'}</td>
          </tr>`; }).join('')
      : '<tr><td colspan="7" class="sub">Sem registros no filtro atual.</td></tr>';
  }

  // CSV últimas (opcional)
  const btnUlt = $('#btnCSVUltimos');
  if (btnUlt){
    btnUlt.onclick = ()=>{
      const prep = last.map(r=>({
        data_venc: r.vencimentoISO || '',
        cliente: r.clienteNome||'',
        evento: r.eventoNome||'',
        descricao: r.descricao||'',
        valor: r.valor||0,
        status: r.status||'',
        forma: r.forma||''
      }));
      const base = hasRange ? `${range.de}_a_${range.ate}` : (ym || 'all');
      const csv = toCSV(prep, ['data_venc','cliente','evento','descricao','valor','status','forma']);
      downloadCSV(`ultimas_cobrancas_${base}.csv`, csv);
    };
  }

  try{ if (window.lucide?.createIcons) window.lucide.createIcons(); }catch{}
}

// ==== Filtros e combos ====
function populateCombos(){
  const evs = getEventos();
  const sCli = document.getElementById('f-cliente');
  const sEv  = document.getElementById('f-evento');
  if (sCli && sCli.options.length===1){
    const seen=new Set();
    evs.forEach(ev=>{
      const nome = ev?.cliente?.nome || ev?.clienteNome || '';
      const id   = ev?.cliente?.id   || ev?.clienteId   || '';
      if (!nome || !id || seen.has(String(id))) return;
      seen.add(String(id));
      const opt=document.createElement('option');
      opt.value=String(id); opt.textContent=nome; sCli.appendChild(opt);
    });
  }
  if (sEv && sEv.options.length===1){
    evs.forEach(ev=>{
      const opt=document.createElement('option');
      opt.value=String(ev.id ?? ev.eventoId ?? ''); 
      opt.textContent=ev.nomeEvento||ev.nome||ev.titulo||(`Evento ${ev.id ?? ev.eventoId ?? ''}`);
      sEv.appendChild(opt);
    });
  }
}

// ==== Inicialização ====
(function init(){
  const elMes = document.getElementById('f-mes');
 if (elMes && !elMes.value) elMes.value = hojeISO().slice(0,7);
  populateCombos();
  restoreFilters();   // reabre com último filtro usado
  applyURLFilters();  // se vier por deep link, usa o da URL (pode setar __rangeFilter)
  renderAll();

  // binds filtros
  ['f-mes','f-cliente','f-evento','f-status'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.addEventListener('change', ()=>{
      // ao mexer no mês/status/combos manualmente, desliga o range do deep link
      if (id === 'f-mes' || id === 'f-status' || id === 'f-cliente' || id === 'f-evento'){
        delete window.__rangeFilter;
        // limpa a querystring para refletir o novo estado manual
        history.replaceState(null, '', location.pathname);
      }
      renderAll();
    });
  });

  const btn = document.getElementById('btnLimpar');
  btn?.addEventListener('click', ()=>{
    if (elMes) elMes.value='';
    const sCli = document.getElementById('f-cliente'); if (sCli) sCli.value='';
    const sEv  = document.getElementById('f-evento');  if (sEv)  sEv.value='';
    const st   = document.getElementById('f-status');  if (st)   st.value='todos';
    // remove QS e range
    delete window.__rangeFilter;
    history.replaceState(null, '', location.pathname);
    renderAll();
  });

  // atualiza se outra aba alterar o financeiro
  window.addEventListener('storage', (e)=>{
    const k=String(e.key||'');
    if (k==='financeiroGlobal' || k==='financeiroGlobal:ping') renderAll();
  });
})();

// Atualiza o painel sempre que o financeiroGlobal mudar (mesma aba ou outras telas)
try {
  if (typeof onFinStoreChanged === 'function') {
    onFinStoreChanged(() => {
      try {
        renderAll();
      } catch (e) {
        console.error('[painel-cobrancas] erro ao re-renderizar após fin-store-changed:', e);
      }
    });
  }
} catch (e) {
  console.warn('[painel-cobrancas] não foi possível registrar onFinStoreChanged:', e);
}

// Sincroniza com a API assim que o Painel abrir (modo nuvem)
(async () => {
  try {
    if (window.finSyncFromApi) {
      await window.finSyncFromApi();
      // quando finSyncFromApi terminar, ele atualiza o financeiroGlobal
      // e dispara o evento que o onFinStoreChanged escuta → renderAll()
    }
  } catch (e) {
    console.warn('[painel-cobrancas] erro ao sincronizar com backend:', e);
  }
})();
