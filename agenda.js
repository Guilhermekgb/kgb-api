/* ===== Agenda v3.3 (corrigida fuso/weekday + robustez GCal) =====
   - Robustece a leitura de dados: eventos, agendaIndex e eventoTemp
   - Mostra "Fonte de dados" com contagens (debug) e botão Recarregar
   - Abas: geral | eventos | financeiro | checklists | degustacoes
   - Lista/Calendário, Google TEMPLATE, Itens passados
*/

/* ===== Utils ===== */
const getLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const getSS = (k, fb) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? fb; } catch { return fb; } };
const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const fmtBR = (n) => (Number(n || 0)).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

// >>> CORREÇÃO: hoje em horário LOCAL (evita UTC virar o dia)
const pad = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

const norm = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const pick = (obj, keys) => { if (!obj) return ""; for (const k of keys){ const v=obj[k]; if (v!=null && String(v).trim()!=="") return v; } return ""; };

function getAppConfig(){ try{ return JSON.parse(localStorage.getItem('app_config')||'{}'); }catch{ return {}; } }
function defaultHour(){ return (getAppConfig().msgHoraPadrao || '08:00'); }

/* ===== Datas ===== */
function toISO(s){
  const v = String(s||"").trim();
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/aaaa
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}
function toHora(h){
  const v = String(h||"").trim(); if(!v) return "";
  if(/^\d{1,2}$/.test(v)) return `${pad(Math.min(23,parseInt(v,10)||0))}:00`;
  const m = v.match(/(\d{1,2})\D?(\d{2})/); if(!m) return v;
  const H = pad(Math.min(23, Math.max(0, parseInt(m[1],10)||0)));
  const M = pad(Math.min(59, Math.max(0, parseInt(m[2],10)||0)));
  return `${H}:${M}`;
}

/* ===== Fontes de dados ===== */
function getEventos(){
  let eventos = getLS("eventos", []);
  // fallback: se veio da tela de evento e ainda não persistiu, pega "eventoTemp"
  const temp = getSS("eventoTemp", null) || getLS("eventoTemp", null);
  if (temp && temp.id && !Array.isArray(eventos)) eventos = [];
  if (temp && temp.id && !eventos.some(e => String(e.id)===String(temp.id))){
    eventos.push({
      id: temp.id,
      nomeEvento: temp.nomeEvento || temp.nome || temp.titulo || "Evento",
      data: toISO(temp.data || temp.dataEvento || temp.dataDoEvento || todayISO()),
      horarioEvento: toHora(temp.horarioEvento || temp.horarioCerimonia || ""),
      quantidadeConvidados: Number(temp.quantidadeConvidados||0)||0,
      local: temp.local || "",
      financeiro: temp.financeiro || {},
      checklistsPorTipo: temp.checklistsPorTipo || {},
    });
  }
  if (!Array.isArray(eventos)) eventos = [];
  return eventos;
}
function getIdx(){
  const v = getLS("agendaIndex", []);
  return Array.isArray(v) ? v : [];
}
function getDegustacoes(){
  const v = getLS('degustacoesDisponiveis', []);
  return Array.isArray(v) ? v : [];
}

/* ===== Mapas ===== */
function mapEventoFromEv(ev){
  const dataISO = toISO(ev.data || ev.dataEvento || ev.dataDoEvento || "");
  const hora = toHora(ev.horarioEvento || ev.horaEvento || ev.horarioCerimonia || ev.horaCerimonia || "");
  return { tipo:"evento", dataISO, hora, eventoId: ev.id,
    eventoNome: pick(ev,["nomeEvento","nome","titulo"]) || "Evento",
    convidados: parseInt(ev.quantidadeConvidados || ev.qtdConvidados || 0,10) || 0,
    local: (ev.local && (ev.local.nome||ev.local.descricao)) ? (ev.local.nome||ev.local.descricao) : (ev.local || "") };
}
function mapEventoFromIdx(it){
  return { tipo:"evento", dataISO: toISO(it.dataEvento || it.dataISO || ""), hora:"",
    eventoId: it.eventoId || null, eventoNome: it.eventoNome || "Evento", convidados: 0, local: "" };
}
function extractFinanceiro(ev){
  const out = []; const nome = pick(ev,["nomeEvento","nome","titulo"]) || "Evento"; const fin = ev.financeiro || {};
  (fin.parcelas||[]).forEach(p=>{
    out.push({
      tipo:"entrada",
      dataISO: p.vencimentoISO || toISO(p.vencimento) || ev.data || "",
      valor:Number(p.valor)||0,
      status:p.status||"pendente",
      eventoId:ev.id, eventoNome:nome, descricao:p.descricao||"Parcela"
    });
  });
  (fin.lancamentos||[]).forEach(l=>{
    const raw=String(l.tipo||'').toLowerCase();
    const tipo=(raw.includes('saida')||raw==='pagar')?'saida':'entrada';
    out.push({
      tipo, dataISO:l.dataISO||toISO(l.data)||ev.data||"",
      valor:Number(l.valor)||0, status:l.status||"pendente",
      eventoId:ev.id, eventoNome:nome, descricao:l.descricao||(tipo==='entrada'?'Entrada':'Saída')
    });
  });
  return out;
}
function mapFinanceiroFromIdx(it){
  return {
    tipo: it.tipo==='saida'? 'saida':'entrada',
    dataISO: toISO(it.dataISO || it.vencimento || ""),
    valor:Number(it.valor)||0,
    status: it.status||"pendente",
    eventoId: it.eventoId||null,
    eventoNome: it.eventoNome||"",
    descricao: it.descricao||""
  };
}
function extractChecklists(ev){
  const arr=[]; const tipos=ev.checklistsPorTipo||{};
  const dataISO=toISO(ev.data||ev.dataEvento||ev.dataDoEvento||'');
  Object.keys(tipos).forEach(tp=>{
    (tipos[tp]||[]).forEach(it=>{
      arr.push({
        tipo:"check", dataISO, descricao: it.item||it.descricao||tp,
        eventoId: ev.id, eventoNome: pick(ev,["nomeEvento","nome","titulo"])||"Evento"
      });
    });
  });
  return arr;
}
function mapDegustacoes(){
  return getDegustacoes().map(d=>({
    tipo:'degusta',
    dataISO: toISO(d.data),
    hora: toHora(d.hora||''),
    local: d.local||'',
    cardapio: d.cardapio||''
  }));
}

/* ===== Índice por aba ===== */
function buildIndex(){
  const eventos = getEventos();
  const idx = getIdx();
  const out = { geral: [], eventos: [], financeiro: [], checklists: [], degustacoes: [] };

  if (eventos.length){
    eventos.forEach(ev => {
      const e = mapEventoFromEv(ev);
      if (e.dataISO){
        out.eventos.push(e);
        out.geral.push({ dataISO:e.dataISO, descricao:`${e.eventoNome} — ${e.local||""}`, _ref:e });
      }
      extractFinanceiro(ev).forEach(x=>{
        if (x.dataISO){
          out.financeiro.push(x);
          out.geral.push({ dataISO:x.dataISO, descricao:`${x.tipo==='entrada'?'Receber':'Pagar'} — ${x.eventoNome}: ${x.descricao}`, _ref:x });
        }
      });
      extractChecklists(ev).forEach(x=>{
        if (x.dataISO){
          out.checklists.push(x);
          out.geral.push({ dataISO:x.dataISO, descricao:`Checklist — ${x.eventoNome}: ${x.descricao}`, _ref:x });
        }
      });
    });
  }
  if (!out.eventos.length && idx.length){ // fallback
    const seen = new Set();
    idx.forEach(it=>{
      if ((it.tipo==='entrada'||it.tipo==='saida') && it.dataISO){
        const fin=mapFinanceiroFromIdx(it);
        out.financeiro.push(fin);
        out.geral.push({ dataISO:fin.dataISO, descricao:`${fin.tipo==='entrada'?'Receber':'Pagar'} — ${fin.eventoNome}: ${fin.descricao}`, _ref:fin });
      }
      if (it.eventoId && it.dataEvento && !seen.has(it.eventoId)){
        const e = mapEventoFromIdx(it);
        if(e.dataISO){
          out.eventos.push(e);
          out.geral.push({ dataISO:e.dataISO, descricao:`${e.eventoNome}`, _ref:e });
        }
        seen.add(it.eventoId);
      }
    });
  }

  mapDegustacoes().forEach(x=>{
    if (x.dataISO){
      out.degustacoes.push(x);
      out.geral.push({ dataISO:x.dataISO, descricao:`Degustação — ${x.local||''} ${x.hora?('às '+x.hora):''}`, _ref:x });
    }
  });

  Object.keys(out).forEach(k => out[k].sort((a,b)=> String(a.dataISO||"").localeCompare(String(b.dataISO||""))));
  return out;
}

/* ===== Render ===== */
const EL = {
  head: document.getElementById('agHead'),
  tbody: document.getElementById('agLista'),
  hint: document.getElementById('agHint'),
  mes: document.getElementById('agMes'),
  showE: document.getElementById('agShowEntradas'),
  showS: document.getElementById('agShowSaidas'),
  busca: document.getElementById('agBusca'),
  status: document.getElementById('agStatus'),
  passados: document.getElementById('agPassados'),
  btnICS: document.getElementById('btnICS'),
  bLista: document.getElementById('blocoLista'),
  bCal: document.getElementById('blocoCalendario'),
  btnViewLista: document.getElementById('btnViewLista'),
  btnViewCal: document.getElementById('btnViewCal'),
  fonte: document.getElementById('agFonte'),
  btnReload: document.getElementById('agRecarregar')
};

let STATE = { tab: 'geral', view: 'lista', index: buildIndex() };

function setTab(tab){
  STATE.tab = tab;
  document.querySelectorAll('.aba').forEach(b=> b.classList.toggle('ativa', b.dataset.tab===tab));
  render();
}
function setView(v){
  STATE.view=v;
  EL.btnViewLista?.classList.toggle('ativa', v==='lista');
  EL.btnViewCal?.classList.toggle('ativa', v==='cal');
  if (EL.bLista) EL.bLista.hidden = (v!=='lista');
  if (EL.bCal)   EL.bCal.hidden   = (v!=='cal');
  render();
}

function headerFor(tab){
  switch(tab){
    case 'eventos':     return ['Data','Evento','Convidados','Local',''];
    case 'financeiro':  return ['Data','Evento','Valor',''];
    case 'checklists':  return ['Data','Evento','Descrição',''];
    case 'degustacoes': return ['Data','Local','Horário',''];
    default:            return ['Data','Descrição',''];
  }
}
function monthStrToRange(ym){
  if(!ym){ const d=new Date(); ym=`${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
  const [y,m]=ym.split('-').map(Number);
  const start=`${y}-${pad(m)}-01`;
  const end=`${y}-${pad(m)}-${pad(new Date(y,m,0).getDate())}`;
  return {start,end};
}
function badgeToneByDate(iso){
  const hoje=todayISO();
  if(!iso) return 'tone-future';
  if(iso<hoje) return 'tone-overdue';
  if(iso===hoje) return 'tone-today';
  return 'tone-future';
}

function filterItems(tab){
  const ym = EL.mes?.value || '';
  const {start,end} = monthStrToRange(ym);
  const q = norm(EL.busca?.value||'');
  const status=(EL.status?.value||'').toLowerCase();
  const showE= !!EL.showE?.checked, showS= !!EL.showS?.checked;

  let arr = (STATE.index[tab] || []).slice();
  arr = arr.filter(it => (it.dataISO||'') >= start && (it.dataISO||'') <= end);

  if (tab==='financeiro'){
    arr = arr.filter(it => (it.tipo==='entrada' ? showE : showS));
    if (status){ arr=arr.filter(it=> String(it.status||'')===status); }
  }
  if (q){
    arr = arr.filter(it => norm([it.descricao, it.eventoNome, it.local].join(' ')).includes(q));
  }

  const mode = EL.passados?.value || 'show';
  const hoje = todayISO();
  if (mode==='hide') arr = arr.filter(it => (it.dataISO||hoje) >= hoje);
  if (mode==='end')  arr.sort((a,b)=>{
    const pa=(a.dataISO||'')<hoje?1:0; const pb=(b.dataISO||'')<hoje?1:0;
    if (pa!==pb) return pa-pb;
    return String(a.dataISO||'').localeCompare(String(b.dataISO||''));
  });
  return arr;
}

function renderHead(){
  if (!EL.head) return;
  EL.head.innerHTML = headerFor(STATE.tab).map(h=>`<th>${h}</th>`).join('');
}
function gBtn(it, label='Google'){
  return `<button class="btn-mini gcal" data-gcal='${JSON.stringify({ref:it}).replace(/'/g,"&apos;")}'><i data-lucide="calendar-plus"></i> ${label}</button>`;
}

function renderLista(){
  const items = filterItems(STATE.tab);
  if (EL.tbody) EL.tbody.innerHTML='';
  if (EL.hint)  EL.hint.style.display = items.length ? 'none' : 'block';

  items.forEach(it=>{
    const tr=document.createElement('tr');
    const data = it.dataISO ? it.dataISO.split('-').reverse().join('/') : '—';
    const tone = badgeToneByDate(it.dataISO);
    let html='';
    switch(STATE.tab){
      case 'eventos':
        html = `<td><span class="badge ${tone}">${data}</span></td><td>${it.eventoNome||'—'}</td><td>${it.convidados||0}</td><td>${it.local||'—'}</td><td style="text-align:right">${gBtn(it,'Google')}</td>`;
        break;
      case 'financeiro':
        html = `<td><span class="badge ${tone}">${data}</span></td><td>${it.eventoNome||'—'}</td><td>${fmtBR(it.valor)}</td><td style="text-align:right">${gBtn(it,'Google')}</td>`;
        break;
      case 'checklists':
        html = `<td><span class="badge ${tone}">${data}</span></td><td>${it.eventoNome||'—'}</td><td>${it.descricao||'—'}</td><td style="text-align:right">${gBtn(it,'Google')}</td>`;
        break;
      case 'degustacoes':
        html = `<td><span class="badge ${tone}">${data}</span></td><td>${it.local||'—'}</td><td>${it.hora||'—'}</td><td style="text-align:right">${gBtn(it,'Google')}</td>`;
        break;
      default:
        html = `<td><span class="badge ${tone}">${data}</span></td><td>${it.descricao||'—'}</td><td style="text-align:right">${gBtn(it,'Google')}</td>`;
    }
    tr.innerHTML = html;
    EL.tbody?.appendChild(tr);
  });

  try{ window.lucide?.createIcons?.(); }catch{}
  document.querySelectorAll('[data-gcal]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      try{
        const raw = btn.getAttribute('data-gcal') || '{}';
        const payload = JSON.parse(raw.replace(/&apos;/g,"'"));
        const it = payload.ref || payload;
        openInGoogle(it);
      } catch (e) { console.warn('[Agenda] falha ao abrir GCal template:', e); }
    });
  });
}

/* Helper local: montar parâmetro dates do Template do Google Calendar sem depender de GCal */
function __makeDatesParamLocal(startISO, endISO){
  // Espera "YYYY-MM-DDTHH:MM:SS"
  const to = (s) => String(s||'').replace(/[-:]/g,'').replace('.000','');
  return `${to(startISO)}/${to(endISO)}`;
}

function openInGoogle(it){
  let title='Agenda', startISO, endISO, location='', details='';
  const hBase = toHora(defaultHour()) || '08:00';

  if (it.tipo === 'evento' || it.eventoNome){
    const ev = (getEventos().find(e => String(e.id) === String(it.eventoId)) || {});
    const hora = toHora(it.hora || ev.horarioEvento || ev.horarioCerimonia || hBase) || hBase;
    const d = new Date((it.dataISO||todayISO())+'T'+hora+':00');
    const d2 = new Date(d.getTime()+120*60000);
    startISO = `${it.dataISO}T${hora}:00`;
    endISO   = `${it.dataISO}T${pad(d2.getHours())}:${pad(d2.getMinutes())}:00`;
    title    = it.eventoNome || ev.nomeEvento || 'Evento';
    location = (ev.local && (ev.local.nome||ev.local.descricao)) ? (ev.local.nome||ev.local.descricao) : (ev.local || it.local || '');
    details  = `Convidados: ${it.convidados || ev.quantidadeConvidados || 0}.`;
  }
  else if (it.tipo === 'entrada' || it.tipo === 'saida'){
    const t = it.tipo==='entrada' ? 'Receber' : 'Pagar';
    title   = `${t}: ${it.eventoNome||''}`.trim();
    startISO= `${it.dataISO}T${hBase}:00`;
    const d2 = new Date(it.dataISO+'T'+hBase+':00');
    d2.setHours(d2.getHours()+1);
    endISO  = `${it.dataISO}T${pad(d2.getHours())}:${pad(d2.getMinutes())}:00`;
    details = `${t} ${fmtBR(it.valor)}${it.descricao?` — ${it.descricao}`:''}`;
  }
  else if (it.tipo === 'check'){
    title   = `Checklist — ${it.descricao||''}`;
    startISO= `${it.dataISO}T${hBase}:00`;
    const d2 = new Date(it.dataISO+'T'+hBase+':00');
    d2.setHours(d2.getHours()+1);
    endISO  = `${it.dataISO}T${pad(d2.getHours())}:${pad(d2.getMinutes())}:00`;
    details = `Evento: ${it.eventoNome||''}`;
  }
  else if (it.tipo === 'degusta'){
    title   = `Degustação${it.cardapio?`: ${it.cardapio}`:''}`;
    const hora = toHora(it.hora || hBase) || hBase;
    startISO= `${it.dataISO}T${hora}:00`;
    const d2=new Date(it.dataISO+'T'+hora+':00');
    d2.setHours(d2.getHours()+1);
    endISO  = `${it.dataISO}T${pad(d2.getHours())}:${pad(d2.getMinutes())}:00`;
    location = it.local || '';
  }
  else {
    startISO = `${it.dataISO||todayISO()}T${hBase}:00`;
    const d2 = new Date((it.dataISO||todayISO())+'T'+hBase+':00');
    d2.setHours(d2.getHours()+1);
    endISO   = `${it.dataISO||todayISO()}T${pad(d2.getHours())}:${pad(d2.getMinutes())}:00`;
  }

  // Usa GCal.openTemplate se existir; senão, gera a URL com função local
  if (window.GCal && typeof GCal.openTemplate === 'function'){
    GCal.openTemplate({ title, startISO, endISO, location, details });
  } else {
    const datesParam = (window.GCal && typeof GCal.makeDatesParam === 'function')
      ? GCal.makeDatesParam(startISO,endISO)
      : __makeDatesParamLocal(startISO,endISO);
    const url =
      `https://calendar.google.com/calendar/render?action=TEMPLATE`+
      `&text=${encodeURIComponent(title)}`+
      `&dates=${datesParam}`+
      `&details=${encodeURIComponent(details||'')}`+
      `&location=${encodeURIComponent(location||'')}`+
      `&ctz=America/Sao_Paulo`;
    window.open(url, '_blank');
  }
}

/* ===== Calendário ===== */
function renderCalendario(){
  const wrap = document.getElementById('calWrap'); if (!wrap) return;
  wrap.innerHTML='';

  const ym = EL.mes?.value || '';
  const {start} = monthStrToRange(ym);
  const [y,m] = start.split('-').map(Number);

  const head = document.createElement('div'); head.className='cal-head';
  'DOM SEG TER QUA QUI SEX SÁB'.split(' ').forEach(d=>{
    const s=document.createElement('div'); s.className='dow'; s.textContent=d; head.appendChild(s);
  });
  wrap.appendChild(head);

  const grid=document.createElement('div'); grid.className='cal-grid';

  // >>> CORREÇÃO: offset compatível com cabeçalho que começa em DOMINGO
  const firstDay = new Date(y, m-1, 1); // local
  const offset   = firstDay.getDay();   // 0=DOM,1=SEG,...,6=SÁB

  const daysInMonth=new Date(y,m,0).getDate();
  const items=filterItems(STATE.tab);
  const byDay={};
  items.forEach(it=>{
    const d=Number((it.dataISO||'').split('-')[2]);
    if(!byDay[d]) byDay[d]=[];
    byDay[d].push(it);
  });

  for(let i=0;i<offset;i++){
    const ph=document.createElement('div');
    ph.className='day'; ph.style.visibility='hidden';
    grid.appendChild(ph);
  }

  for(let d=1; d<=daysInMonth; d++){
    const cell=document.createElement('div'); cell.className='day';
    const dd=`${y}-${pad(m)}-${pad(d)}`;
    const tone=badgeToneByDate(dd);
    cell.innerHTML=`<div class="d"><span>${pad(d)}/${pad(m)}</span><span class="badge ${tone}" style="margin-left:auto"></span></div><div class="items"></div>`;
    const list=cell.querySelector('.items');

    (byDay[d]||[]).forEach(it=>{
      const el=document.createElement('div');
      el.className='cal-item';
      el.innerHTML = `<span class="dot"></span><span>${
        STATE.tab==='eventos'    ? (it.eventoNome + (it.hora?` (${it.hora})`:'')) :
        STATE.tab==='financeiro' ? `${it.tipo==='entrada'?'Receber':'Pagar'} — ${fmtBR(it.valor)}` :
        STATE.tab==='checklists' ? `${it.eventoNome}: ${it.descricao}` :
        STATE.tab==='degustacoes'? `${it.local||''}${it.hora?` (${it.hora})`:''}` :
                                   (it.descricao||'')
      }</span>`;
      const btn=document.createElement('button'); btn.className='gcal act';
      btn.innerHTML='<i data-lucide="calendar-plus"></i>';
      btn.addEventListener('click',()=> openInGoogle(it));
      el.appendChild(btn);
      list.appendChild(el);
    });

    grid.appendChild(cell);
  }

  wrap.appendChild(grid);
  try{ window.lucide?.createIcons?.(); }catch{}
}

/* ===== Export .ICS ===== */
function exportICS(){
  const arr = filterItems(STATE.tab);

  // Escapar campos para iCalendar (RFC 5545)
  const esc = (s) => String(s||'')
    .replace(/\r?\n/g, ' ')
    .replace(/([,;])/g, '\\$1');

  // Soma 1 dia (para DTEND exclusivo em all-day)
  const plus1day = (yyyymmdd) => {
    const y = Number(yyyymmdd.slice(0,4));
    const m = Number(yyyymmdd.slice(4,6));
    const d = Number(yyyymmdd.slice(6,8));
    const dt = new Date(y, m-1, d);
    dt.setDate(dt.getDate()+1);
    const pad2 = (n)=>String(n).padStart(2,'0');
    return `${dt.getFullYear()}${pad2(dt.getMonth()+1)}${pad2(dt.getDate())}`;
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Buffet//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  arr.forEach(it=>{
    const uid = `ag_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const dISO = String(it.dataISO||'').replace(/-/g,'');
    if (!dISO) return; // sem data, pula

    let summary = 'Agenda';
    let desc = '';

    if (STATE.tab==='eventos'){ summary = it.eventoNome || 'Evento'; desc = `Local: ${it.local||''}`; }
    else if (STATE.tab==='financeiro'){ summary = `${it.tipo==='entrada'?'Receber':'Pagar'} — ${it.eventoNome||''}`; desc = it.descricao||''; }
    else if (STATE.tab==='checklists'){ summary = `Checklist — ${it.eventoNome||''}`; desc = it.descricao||''; }
    else if (STATE.tab==='degustacoes'){ summary = `Degustação — ${it.local||''}`; desc = it.hora ? `Horário: ${it.hora}` : ''; }
    else { summary = it.descricao || 'Agenda'; }

    const dStart = dISO;
    const dEnd   = plus1day(dISO);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${dStart}`,
      `DTEND;VALUE=DATE:${dEnd}`,
      `SUMMARY:${esc(summary)}`
    );
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\n')], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `agenda-${STATE.tab}.ics`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}


function reportFonte(){
  const eventos = getEventos();
  const idx = getIdx();
  const deg = getDegustacoes();
  const msg = `Fonte de dados — eventos: ${eventos.length} | agendaIndex: ${idx.length} | degustações: ${deg.length}`;
  if (EL.fonte) EL.fonte.textContent = msg;
  console.info('[Agenda]', msg, { eventos, idx, deg });
}

function render(){
  renderHead();
  if (STATE.view==='lista') renderLista(); else renderCalendario();
  reportFonte();
}
/* ===== Live updates (entre abas e mesma aba) ===== */
(function setupLiveUpdates(){
  // storage (entre abas)
  window.addEventListener('storage', (e) => {
    const k = e?.key || '';
    if (['eventos', 'agendaIndex', 'degustacoesDisponiveis'].includes(k)) {
      try { STATE.index = buildIndex(); render(); } catch {}
    }
  });

  // BroadcastChannel (entre abas) — reaproveita o canal do sistema de notificações, se existir
  try {
    const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('mrubuffet') : null;
    bc?.addEventListener('message', (ev) => {
      const t = ev?.data?.type;
      // Se outras telas mexerem nesses dados, repinta
      if (t === 'eventos:ping' || t === 'agendaIndex:ping' || t === 'degustacoes:ping') {
        try { STATE.index = buildIndex(); render(); } catch {}
      }
      // Opcional: se quiser repintar quando chegarem notificações (agenda/feeds)
      if (t === 'agendaUnified:ping') {
        try { /* STATE.index = buildIndex(); */ render(); } catch {}
      }
    });
  } catch {}
})();

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {
  const d = new Date();
  const mesEl = document.getElementById('agMes');
  if (mesEl) mesEl.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}`;

  document.querySelectorAll('.abas .aba').forEach(b =>
    b.addEventListener('click', () => setTab(b.dataset.tab))
  );

  ['agMes','agShowEntradas','agShowSaidas','agBusca','agStatus','agPassados']
    .forEach(id=> document.getElementById(id)?.addEventListener('input', render));

  document.getElementById('btnICS')?.addEventListener('click', exportICS);
  document.getElementById('btnViewLista')?.addEventListener('click', ()=> setView('lista'));
  document.getElementById('btnViewCal')?.addEventListener('click',   ()=> setView('cal'));

  if (EL.btnReload){
    EL.btnReload.addEventListener('click', ()=>{
      STATE.index = buildIndex();
      render();
    });
  }

  STATE.index = buildIndex();
  render();
});
