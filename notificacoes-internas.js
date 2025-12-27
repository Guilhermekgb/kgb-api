import { apiUrl, getAuthHeaders } from './api-config.js'; // se apiUrl não estiver exportado, depois ajustamos
// notificacoes-internas.js
// Painel operacional (Checklist + Fontes unificadas).
// - Checklist: lê localStorage.agenda (tipo: "checklist")
// - Demais fontes: lê localStorage.agendaUnified (src: 'fin'|'lead'|'funil'|'evento'|'interno')

/* ===== Utils de LS e datas ===== */
const getLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const setLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
// ===== Base da API (nuvem) =====
const API_BASE = window.__API_BASE__ || localStorage.getItem('API_BASE') || "";
// Marca uma notificação como lida diretamente no backend
async function marcarNotificacaoLidaNoBackend(id) {
  if (!API_BASE || !id) return;
  try {
    await fetch(`${API_BASE}/notificacoes/${encodeURIComponent(id)}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.warn('[notificacoes-internas] falha ao marcar notificação como lida na API:', e);
  }
}

// Sincroniza agendaUnified + notificationsFeed da nuvem para o espelho local
async function syncFromCloud(){
  if (!API_BASE) return;
  try {
    const [agendaRes, notifRes] = await Promise.all([
      fetch(`${API_BASE}/agenda/unified`),
      fetch(`${API_BASE}/notificacoes`)
    ]);

    const agendaJson = await agendaRes.json();
    const notifJson  = await notifRes.json();

    const agendaItems = Array.isArray(agendaJson.items) ? agendaJson.items
                      : Array.isArray(agendaJson)       ? agendaJson
                      : [];
    const notifs      = Array.isArray(notifJson.items)  ? notifJson.items
                      : Array.isArray(notifJson)        ? notifJson
                      : [];

    // Grava no espelho local para o resto do código usar
    localStorage.setItem('agendaUnified', JSON.stringify(agendaItems));
    localStorage.setItem('notificationsFeed', JSON.stringify(notifs));
    localStorage.setItem('agendaUnified:ping', String(Date.now()));
    localStorage.setItem('notificationsFeed:ping', String(Date.now()));
  } catch (err) {
    console.warn('[notificacoes-internas] falha ao sincronizar da nuvem:', err);
  }
}

// hoje em horário LOCAL (evita -1 dia por causa do UTC)
const todayISO = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};
const formatarData = (iso) => {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return '—';
  const [y,m,d] = iso.slice(0,10).split('-');
  return `${d}/${m}/${y}`;
};

/* ===== Estado global do painel ===== */
let STATE = {
  fonte: 'check',          // 'check' | 'fin' | 'lead' | 'funil' | 'evento' | 'interno'
  filtro: 'atrasados',     // 'todos' | 'hoje' | 'atrasados'
  busca: ''
};

// === Helper local: mapear entity -> href (fallback se agenda-bridge não estiver presente)
function mapEntityToHref(ent){
  if(!ent || !ent.type) return null;
  const id = encodeURIComponent(ent.id || '');
  switch(String(ent.type)){
    case 'lead':        return `orcamento-detalhado.html?id=${id}`;
    case 'evento':      return `evento-detalhado.html?id=${id}`;
    case 'degustacao':  return `degustacoes-disponiveis.html`; // sem detalhamento por id
    default: return null;
  }
}

/* ===== Helpers visuais ===== */
function setChipTotal(qtd){
  const chip = document.getElementById("chipTotal");
  if (!chip) return;
  const mapa = {
    todos: `${qtd} registro(s)`,
    hoje: `${qtd} item(ns) de hoje`,
    atrasados: `${qtd} pendência(s) atrasada(s)`
  };
  chip.textContent = mapa[STATE.filtro] || `${qtd} registro(s)`;
}

function toggleSkeleton(show){
  const sk = document.getElementById('skeletonBox');
  if (!sk) return;
  sk.style.display = show ? '' : 'none';
}

function toggleContainers(){
  const lstCheck = document.getElementById('lista');
  const lstUni   = document.getElementById('lista-internas');
  const vazio    = document.getElementById('vazio');
  if (!lstCheck || !lstUni || !vazio) return;

  // Esconde todos; o render liga depois o que for preciso
  lstCheck.style.display = 'none';
  lstUni.style.display   = 'none';
  vazio.style.display    = 'none';
}

/* ====== Data loading – Checklist (agenda) ====== */
function carregarAgendaFiltradaChecklist(){
  const agenda = getLS("agenda", []);
  let lista = agenda.filter(a => a && a.tipo === "checklist" && a.dataISO); // só checklist com data

  if (STATE.filtro === 'atrasados') {
    lista = lista.filter(a => a.status !== "ok" && String(a.dataISO) < todayISO());
  } else if (STATE.filtro === 'hoje') {
    const hoje = todayISO();
    lista = lista.filter(a => a.status !== "ok" && String(a.dataISO) === hoje);
  } // 'todos' mantém tudo (ok/pendente)

  if (STATE.busca) {
    const q = STATE.busca.toLowerCase();
    const eventos = getLS("eventos", []);
    lista = lista.filter(a=>{
      const ev = eventos.find(e => String(e.id) === String(a.eventoId));
      const tituloEv = (ev?.titulo || ev?.nomeEvento || "").toLowerCase();
      const tt = String(a.titulo||"").toLowerCase();
      return tituloEv.includes(q) || tt.includes(q);
    });
  }

  return lista;
}

function agruparPorEvento(itens){
  const byEvt = {};
  itens.forEach(a => { (byEvt[a.eventoId] ||= []).push(a); });
  Object.values(byEvt).forEach(arr => arr.sort((a,b)=> (a.dataISO > b.dataISO ? 1 : -1)));
  return byEvt;
}

/* ====== Data loading – Fontes Unificadas (agendaUnified) ====== */
function carregarUnifiedFiltrada(tipoSrc){
  // helpers locais
  const toISO = (d) => {
    const s = String(d || '');
    return s.length >= 10 ? s.slice(0, 10) : s;         // garante YYYY-MM-DD
  };
  // normaliza horas soltas para HH:MM (ex.: "8" -> "08:00", "8:5" -> "08:05")
  const pad5 = (t) => {
    const s = String(t || '').trim();
    const m = s.match(/^(\d{1,2})(?::?(\d{1,2}))?$/);
    if (!m) return s.padStart(5, '0');
    const H = String(Math.min(23, +m[1]||0)).padStart(2,'0');
    const M = String(Math.min(59, +(m[2]||0))).padStart(2,'0');
    return `${H}:${M}`;
  };

  // fonte
  const raw = getLS('agendaUnified', []);
  let base = Array.isArray(raw) ? raw.filter(x => x && x.date) : [];

// filtro por origem (src) se solicitado
if (tipoSrc) {
  const srcNorm = String(tipoSrc).toLowerCase();
  base = base.filter(x => {
    const s = String(x.src || '').toLowerCase();
    // aceita tanto 'lead' quanto 'leads'
    if (srcNorm === 'lead') return s === 'lead' || s === 'leads';
    return s === srcNorm;
  });
}


  // filtro por público (audience) – usa o <select id="fAudience"> quando presente
  const fa = (document.getElementById('fAudience')?.value || (STATE?.audience || 'todos')).toLowerCase();
  if (fa !== 'todos') {
    base = base.filter(x => String(x.audience || '').toLowerCase() === fa);
  }

  // filtro por período (todos | hoje | atrasados) — 'done' sai de hoje/atrasados
  const hoje = todayISO();
  if (STATE?.filtro === 'hoje') {
    base = base.filter(x => toISO(x.date) === hoje && String(x.status || '') !== 'done');
  } else if (STATE?.filtro === 'atrasados') {
    base = base.filter(x => toISO(x.date) < hoje && String(x.status || '') !== 'done');
  }
  // 'todos' mantém tudo

  // busca textual (title/desc/src/audience/status)
  const q = String(STATE?.busca || '').trim().toLowerCase();
  if (q) {
    base = base.filter(x => {
      const hay = [
        x.title, x.desc, x.src, x.audience, x.status
      ].map(v => String(v || '').toLowerCase()).join(' | ');
      return hay.includes(q);
    });
  }

  // ordenação: data asc, depois hora asc (timeStart); por fim, título
  base.sort((a, b) => {
    const ad = toISO(a.date), bd = toISO(b.date);
    if (ad !== bd) return ad.localeCompare(bd);
    const at = pad5(a.timeStart), bt = pad5(b.timeStart);
    if (at !== bt) return at.localeCompare(bt);
    return String(a.title || '').localeCompare(String(b.title || ''));
  });

  return base;
}


/* ===== Render – Checklist ===== */
function renderChecklist(){
  const eventos = getLS("eventos", []);
  const itens = carregarAgendaFiltradaChecklist();
  const byEvt = agruparPorEvento(itens);
  const lista = document.getElementById("lista");
  const vazio = document.getElementById("vazio");
  if (!lista || !vazio) return;

  setChipTotal(itens.length);
  lista.innerHTML = "";

  if (!Object.keys(byEvt).length) {
    vazio.style.display = '';
    return;
  }

  Object.entries(byEvt).forEach(([eid, arr])=>{
    const ev = eventos.find(e => String(e.id) === String(eid)) || {};
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title">${ev.titulo || ev.nomeEvento || ("Evento #"+eid)}</div>
          <div class="card-sub">Data: ${ev.data ? formatarData(ev.data) : "—"} · Local: ${ev.local || ev.localEvento || "—"}</div>
        </div>
        <a class="btn-ghost" href="checklist.html?id=${encodeURIComponent(eid)}">
          <i data-lucide="check-square"></i> Abrir checklist
        </a>
      </div>
      <div class="lista-tarefas"></div>
    `;

    const zona = card.querySelector(".lista-tarefas");
    arr.forEach(t=>{
      const atrasada = (t.status!=="ok" && String(t.dataISO) < todayISO());
      const ln = document.createElement("div");
      ln.className = "task" + (atrasada ? " atrasada" : "");
      ln.innerHTML = `
        <span class="task-date">${formatarData(t.dataISO)}</span>
        <span class="task-title">${t.titulo}</span>
        <button class="btn-ghost marcar" data-id="${t.id}">
          <i data-lucide="check"></i> Marcar ok
        </button>
      `;
      zona.appendChild(ln);
    });

    lista.appendChild(card);
  });
}

/* ===== Render – Fontes Unificadas ===== */
function cardUnified(it){
  const hm = it.timeStart ? `${it.timeStart}${it.timeEnd? '–'+it.timeEnd:''}` : 'Dia todo';
  const dt = String(it.date || '').slice(0,10);
  const cls = (it.status==='done' ? '' : (dt < todayISO() ? 'atrasada' : ''));
  return `
    <div class="card ${cls}" style="cursor:pointer" tabindex="0" data-open="${String(it.id)}" role="button" aria-label="Abrir origem">
      <div class="card-head">
        <div>
          <div class="card-title">${it.title || '(sem título)'}</div>
          <div class="card-sub">${formatarData(dt)} • ${hm} • ${it.status||'scheduled'}</div>
       </div>
         <div class="btn-row">
          <button class="btn-ghost" data-open="${String(it.id)}">
            <i data-lucide="external-link"></i> Abrir origem
          </button>${it.status!=='done' ? `
          <button class="btn-ghost" data-done="${String(it.id)}" title="Marcar como feito">
            <i data-lucide="check"></i> Concluir
          </button>` : ''}
        </div>
      </div>
      ${it.desc ? `<div class="card-sub" style="margin-top:6px">${it.desc}</div>` : ''}
    </div>
  `;
}

function renderFonte(tipoSrc){
  const wrap = document.getElementById('lista-internas');
  const vazio = document.getElementById('vazio');
  if (!wrap || !vazio) return;

  const arr = carregarUnifiedFiltrada(tipoSrc);

  // Contagem conforme filtro
  const hoje = todayISO();
  const count = (STATE.filtro==='hoje') ? arr.filter(x=>String(x.date).slice(0,10)===hoje && x.status!=='done').length
               : (STATE.filtro==='atrasados') ? arr.filter(x=>String(x.date).slice(0,10)<hoje && x.status!=='done').length
               : arr.length;
  setChipTotal(count);

  if (!arr.length) {
    wrap.innerHTML = '';
    vazio.style.display = '';
    return;
  }

  // Quebra por Hoje / Atrasadas / Próximas (melhor leitura)
  const hojeArr = arr.filter(x => String(x.date).slice(0,10) === hoje);
  const atras   = arr.filter(x => String(x.date).slice(0,10) <  hoje && x.status!=='done');
  const prox    = arr.filter(x => String(x.date).slice(0,10) >  hoje);

  const sec = (titulo, itens) => `
    <h3 style="margin:10px 0 6px">${titulo}</h3>
    ${itens.map(cardUnified).join('') || '<div class="card-sub muted">—</div>'}
  `;

  wrap.innerHTML = `
    ${sec('Hoje', hojeArr)}
    ${sec('Atrasadas', atras)}
    ${sec('Próximas', prox)}
  `;

  // Abrir origem (depende do agenda-bridge)
  const goTo = (id) => {
    const item = arr.find(x => String(x.id) === String(id));
    if (!item || !item.entity) return;

    const url =
      (window.__agendaBridge?.buildEntityUrl?.(item.entity)) ||
      (typeof mapEntityToHref === 'function' ? mapEntityToHref(item.entity) : '') ||
      '';

    if (url && url !== 'javascript:void(0)') {
      window.location.href = url;
    }
  };

  wrap.querySelectorAll('[data-open]').forEach(el => {
    el.addEventListener('click', () => goTo(el.getAttribute('data-open')));
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        goTo(el.getAttribute('data-open'));
      }
    });
  });
  // Concluir (marca como done via bridge)
  wrap.querySelectorAll('[data-done]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = el.getAttribute('data-done');
      try { window.__agendaBridge?.setUnifiedDone?.(id); } catch {}
      // força repaint local e cross-aba
      try { new BroadcastChannel('mrubuffet').postMessage({ type:'agendaUnified:ping', at: Date.now() }); } catch {}
      render();
    });
  });

}

/* ===== Marcar OK – checklist ===== */
function marcarOk(agendaId){
  const agenda = getLS("agenda", []);
  const a = agenda.find(x => String(x.id) === String(agendaId));
  if (!a) return;                // blindagem

  a.status = "ok";
  setLS("agenda", agenda);

  // Espelha no unificado (evt:...:task:...)
  try {
    const eventoId = a?.eventoId;
    const taskId   = a?.id;
    if (eventoId && taskId) {
      window.__agendaBridge?.setUnifiedDone(`evt:${eventoId}:task:${taskId}`);
    }
  } catch {}

  // Atualiza contador salvo no evento também
  try {
    const eventos = getLS("eventos", []);
    const ev = eventos.find(e => String(e.id) === String(a?.eventoId));
    if (ev) {
      const today = todayISO();
      const total = Object.values(ev.checklistsPorTipo||{})
        .flat()
        .filter(it => it && it.status!=="ok" && it.prazoISO && String(it.prazoISO) < today)
        .length;
      ev.__checklistAtrasadosTotal = total;
      setLS("eventos", eventos);
    }
  } catch {}

  render();
}

/* ===== Eventos/Bindings ===== */
function wire(){
  // evita binds duplicados se wire() for chamado mais de uma vez
  if (wire._bound) return;
  wire._bound = true;

  // --- Filtros (Todos/Hoje/Atrasados)
  document.getElementById('filtroTodos')?.addEventListener('click', ()=>{
    STATE.filtro = 'todos';
    render();
  });
  document.getElementById('filtroHoje')?.addEventListener('click', ()=>{
    STATE.filtro = 'hoje';
    render();
  });
  document.getElementById('filtroAtrasados')?.addEventListener('click', ()=>{
    STATE.filtro = 'atrasados';
    render();
  });

  // --- Filtro por audiência (select)
  document.getElementById('fAudience')?.addEventListener('change', (e)=>{
    STATE.audience = (e.target.value || 'todos').toLowerCase();
    render();
  });

  // --- Busca (com debounce)
  document.getElementById('busca')?.addEventListener('input', (e)=>{
    STATE.busca = (e.target.value || '').trim();
    clearTimeout(wire._t);
    wire._t = setTimeout(render, 180);
  });

  // --- Botão "Atualizar" (recarrega/repinta)
  document.getElementById('btnAtualizar')?.addEventListener('click', ()=>{
    render();
  });

  // --- Botão global "Marcar ok de hoje" (apenas checklist)
  document.getElementById("btnMarcarHoje")?.addEventListener("click", ()=>{
    if (STATE.fonte !== 'check') return;
    const agenda = getLS("agenda", []);
    const hoje = todayISO();
    agenda.forEach(a=>{
      if (a.tipo === "checklist" && a.dataISO === hoje) a.status = "ok";
    });
    setLS("agenda", agenda);
    render();
  });

  // --- Delegação: clique dos botões "Marcar ok" por item (lista checklist)
  document.getElementById("lista")?.addEventListener("click", (e)=>{
    const btn = e.target.closest("button.marcar");
    if (!btn) return;
    marcarOk(btn.dataset.id);
  });

  // --- Abas/Fontes (chips)
  document.querySelectorAll('input[name="fonteNI"]')?.forEach(inp => {
    inp.addEventListener('change', ()=>{
      if (!inp.checked) return;
      STATE.fonte = inp.value || 'check';
      render();
    });
  });

   // --- Botão "Marcar tudo como lido" (feed curto) — agora usando a API
  document.getElementById('btnMarkAll')?.addEventListener('click', async () => {
    try {
      // Se tivermos API configurada, pede para o backend marcar tudo como lido
      if (API_BASE) {
        // Opcional: você pode, no futuro, mandar o "audience" do usuário logado
        // Exemplo:
        // const u = JSON.parse(localStorage.getItem('userProfile') || '{}');
        // const audience = u?.area || '';
        await fetch(`${API_BASE}/notificacoes/marcar-todas-lidas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}) // por enquanto, marca tudo
        });

        // Re-sincroniza espelho local com o backend
        await syncFromCloud();
      } else {
        // Fallback: se não houver API_BASE, só marca localmente
        const feed = __NI.read('notificationsFeed', []) || [];
        const atualizado = feed.map(ev => ({ ...ev, read: 1 }));
        localStorage.setItem('notificationsFeed', JSON.stringify(atualizado));
      }
    } catch (e) {
      console.warn('[notificacoes-internas] falha ao marcar tudo como lido na API:', e);
    }

    // Ping para outras abas/telas
    localStorage.setItem('notificationsFeed:ping', String(Date.now()));
    try {
      const bc = new BroadcastChannel('mrubuffet');
      bc.postMessage({ type: 'notificationsFeed:ping', at: Date.now() });
    } catch {}

    // Re-render geral
    render();
  });


  // --- storage ping cross-aba
  window.addEventListener("storage", (e)=>{
    if (["agendaUnified","agendaUnified:ping"].includes(e.key)) {
      if (STATE.fonte !== 'check') render();
    }
    if (["notificationsFeed","notificationsFeed:ping"].includes(e.key)) {
      render();
    }
  });

  // === BroadcastChannel: re-render via canal local ===
  try{
    const bc = new BroadcastChannel('mrubuffet');
    bc.addEventListener('message', (ev)=>{
      if (!ev?.data?.type) return;
      if (ev.data.type === 'agendaUnified:ping') { render?.(); }
      if (ev.data.type === 'notificationsFeed:ping') { render?.(); }
    });
  }catch{}
}


/* ===== Render raiz (decide qual visão) ===== */
function render(){
  toggleSkeleton(true);
  toggleContainers(); // apaga visuais e deixa o render escolher

  const listaCheck = document.getElementById('lista');
  const listaUni   = document.getElementById('lista-internas');
  const vazio      = document.getElementById('vazio');
  if (!listaCheck || !listaUni || !vazio) { toggleSkeleton(false); return; }

  if (STATE.fonte === 'check') {
    // Checklist
    renderChecklist();
    // decide vazio / container
    const itens = carregarAgendaFiltradaChecklist();
    if (itens.length === 0) {
      vazio.style.display = '';
      listaCheck.style.display = 'none';
    } else {
      listaCheck.style.display = '';
      vazio.style.display = 'none';
    }
  } else {
    // Fontes unificadas
    renderFonte(STATE.fonte);
    // avalia vazio baseado no filtro atual
    const arr = carregarUnifiedFiltrada(STATE.fonte);
    const hoje = todayISO();
    const count = (STATE.filtro==='hoje') ? arr.filter(x=>String(x.date).slice(0,10)===hoje && x.status!=='done').length
                 : (STATE.filtro==='atrasados') ? arr.filter(x=>String(x.date).slice(0,10)<hoje && x.status!=='done').length
                 : arr.length;
    if (count === 0) {
      vazio.style.display = '';
      listaUni.style.display = 'none';
    } else {
      listaUni.style.display = '';
      vazio.style.display = 'none';
    }
  }

  toggleSkeleton(false);
  try{ window.lucide?.createIcons?.(); }catch{}
}

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", ()=>{
  try{ window.lucide?.createIcons?.(); }catch{}
  wire();
  render();
});

// ===== PATCH: Integração inicial com agenda-bridge + refresh manual =====

// helpers locais seguros (não colidem)
const __NI = {
  read(key, fb){ try { return JSON.parse(localStorage.getItem(key) || "null") ?? fb; } catch { return fb; } },
  money(n){ return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); },
  // hoje em horário LOCAL
  today(){
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
};

// mapeia nível -> rótulo/ícone (feed curto)
const __LEVEL = { info:'info', warn:'alert-triangle', error:'octagon' };

// render dos itens da agenda unificada (cards simples)
function renderAgendaUnified() {
  const box = document.getElementById('lista-agenda') 
           || document.getElementById('listaInternas') 
           || document.getElementById('lista');
  if (!box) return;

  // normalização de itens
  function normalizarAgendaUnifiedItem(x) {
    if (!x) return null;
    return {
      id: x.id,
      tipo: x.src || x.tipo || 'interno',
      titulo: x.title || x.titulo || '(sem título)',
      dataISO: (x.date || x.data || '').slice(0, 10),
      hora: (x.timeStart || x.hora || '').toString().slice(0, 5),
      status: x.status || 'scheduled',
      audience: x.audience || 'todos',
      desc: x.desc || '',
      entity: x.entity || null,
    };
  }

  // lê, normaliza e filtra os itens válidos
  const itens = (__NI.read('agendaUnified', []) || [])
    .map(normalizarAgendaUnifiedItem)
    .filter(a => a && a.dataISO);

  if (!Array.isArray(itens) || !itens.length) {
    box.innerHTML = `<div class="muted">Sem itens de agenda.</div>`;
    return;
  }

  // ordenação por data e hora ascendente
  itens.sort((a, b) => {
    return String(a.dataISO).localeCompare(String(b.dataISO)) ||
           String(a.hora).localeCompare(String(b.hora));
  });

  // filtro por audiência (caso o usuário selecione "todos" / "vendas" etc.)
  const fa = (document.getElementById('fAudience')?.value || 'todos').toLowerCase();
  const filtrados = itens.filter(x =>
    fa === 'todos' ? true : String(x.audience || '').toLowerCase() === fa
  );

  // renderização principal
  box.innerHTML = filtrados.map(it => {
    const href = (window.__agendaBridge?.buildEntityUrl?.(it.entity))
              || (typeof mapEntityToHref === 'function' ? mapEntityToHref(it.entity) : '')
              || 'javascript:void(0)';

    const chip = (it.status || 'scheduled');
    return `
      <div class="card notif">
        <div class="notif__main">
          <div class="notif__title">${it.titulo || '—'}</div>
          <div class="notif__meta muted">
            <span>${it.dataISO}${it.hora ? ` • ${it.hora}` : ''}</span>
            ${it.desc ? ` • ${it.desc}` : ''}
            ${it.tipo ? ` • <em>${it.tipo}</em>` : ''}
          </div>
        </div>
        <div class="notif__actions">
          <a class="btn btn-ghost" href="${href}" target="_blank" rel="noopener">
            <i data-lucide="external-link"></i> Abrir origem
          </a>
          ${chip ? `<span class="chip">${chip}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  try { window.lucide?.createIcons?.(); } catch {}
}

// render do feed curto (notificações recentes)
// render do feed curto (notificações recentes) — agora usando "read" do backend
function renderFeedRecentes() {
  const box =
    document.getElementById('lista-recentes') ||
    document.getElementById('recentes') ||
    document.getElementById('lista');

  if (!box) return;

  const feed = __NI.read('notificationsFeed', []);
  if (!Array.isArray(feed) || !feed.length) {
    // não sobrescreve se a mesma div é usada por agenda; só mostra vazio se for dedicado
    if (box.id === 'lista-recentes' || box.id === 'recentes') {
      box.innerHTML = `<div class="muted">Sem notificações recentes.</div>`;
    }
    return;
  }

  box.innerHTML = feed.map(ev => {
    const when = ev.createdAtISO || ev.createdAt || new Date().toISOString();
    const ico  = __LEVEL[(ev.level || 'info')] || 'info';
    const isRead = ev.read === 1 || ev.read === true; // vem direto da API

    return `
      <div class="card notif ${isRead ? 'is-read' : 'is-unread'}">
        <div class="notif__main">
          <div class="notif__title">
            <i data-lucide="${ico}"></i> ${ev.title || '—'}
          </div>
          <div class="notif__meta muted">
            ${new Date(when).toLocaleString('pt-BR')}
          </div>
        </div>
        <div class="notif__actions">
          ${!isRead ? `<button class="btn-ghost" data-mark-read="${String(ev.id)}">
            <i data-lucide="check"></i> Marcar lida
          </button>` : ''}
        </div>
      </div>`;
  }).join('');

  try { window.lucide?.createIcons?.(); } catch {}

  // delegação para “Marcar lida” — chama API e atualiza espelho local
  box.querySelectorAll('[data-mark-read]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = String(btn.getAttribute('data-mark-read'));
      if (!id) return;

      // 1) Marca na API
      await marcarNotificacaoLidaNoBackend(id);

      // 2) Atualiza o espelho local (notificationsFeed) para refletir "read = 1"
      try {
        const atual = __NI.read('notificationsFeed', []) || [];
        const atualizado = atual.map(ev =>
          String(ev.id) === id ? { ...ev, read: 1 } : ev
        );
        localStorage.setItem('notificationsFeed', JSON.stringify(atualizado));
      } catch (e) {
        console.warn('[notificacoes-internas] falha ao atualizar espelho local:', e);
      }

      // 3) Dispara ping para outras abas/telas
      localStorage.setItem('notificationsFeed:ping', String(Date.now()));
      try {
        const bc = new BroadcastChannel('mrubuffet');
        bc.postMessage({ type: 'notificationsFeed:ping', at: Date.now() });
      } catch {}

      // 4) Re-renderiza feed
      renderFeedRecentes();
    });
  });
}

function bindRefreshButton(){
  const b = document.getElementById('btnAtualizar');
  if (!b || b.dataset.bound === '1') return;
  b.dataset.bound = '1';
  b.addEventListener('click', () => {
    // Primeiro busca da nuvem...
    syncFromCloud().then(() => {
      // ...depois re-renderiza com os dados atualizados
      renderAgendaUnified();
      renderFeedRecentes();
    }).catch(() => {
      // Se der erro na API, pelo menos repinta o que já tem
      renderAgendaUnified();
      renderFeedRecentes();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => { try{ bindRefreshButton(); }catch{} });


// listeners de storage (ping local somente, ainda sem WebSocket/Firebase)
function bindStorageListeners(){
  if (window.__niBound) return; // evita multi-bind
  window.__niBound = true;
  window.addEventListener('storage', (e) => {
    if (e.key === 'agendaUnified:ping') {
      renderAgendaUnified();
    }
    if (e.key === 'notificationsFeed:ping') {
      renderFeedRecentes();
    }
  });
}

// boot leve (não interfere no que já existe)
document.addEventListener('DOMContentLoaded', () => {
  // 1) puxa da nuvem para o espelho local
  syncFromCloud().then(() => {
    // 2) renderiza com base no espelho (já vindo da API)
    renderAgendaUnified();    // agenda do dia/lista
    renderFeedRecentes();     // feed curtinho (opcional)
  }).catch(() => {
    // fallback: se der erro, tenta pelo que estiver local
    renderAgendaUnified();
    renderFeedRecentes();
  });

  bindRefreshButton();      // atualização manual
  bindStorageListeners();   // ouvir pings locais
});

// === Auto-reload para notificações internas ===
(function wireNotificacoesLive(){
  function safeRender(){
    try {
      if (typeof renderNotificacoes === 'function') return renderNotificacoes();
      if (typeof loadAndRenderNotificacoes === 'function') return loadAndRenderNotificacoes();
    } catch (e) {
      console.warn('[Notificações] render falhou:', e);
    }
  }

  window.addEventListener('storage', (ev) => {
    if (!ev || !ev.key) return;
    if (ev.key === 'financeiroGlobal' || ev.key === 'financeiroGlobal:ping') {
      safeRender();
    }
  });

  try {
    const bc = new BroadcastChannel('mrubuffet');
    bc.onmessage = (e) => {
      if (e?.data?.type === 'fin-store-changed') safeRender();
    };
  } catch {}
})();
