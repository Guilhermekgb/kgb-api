// checklist.js
"use strict";

/* =========================
   Storage helpers
========================= */
function getJSON(k, fb){ try{ var v = JSON.parse(localStorage.getItem(k)||"null"); return v==null?fb:v; }catch(e){ return fb; } }
function setJSON(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function fmtBRDate(d){
  if(!d) return "-";
  try{
    const dt = (d instanceof Date)? d : new Date(d);
    if (isNaN(dt)) return "-";
    const dd = String(dt.getDate()).padStart(2,"0");
    const mm = String(dt.getMonth()+1).padStart(2,"0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }catch(_){ return "-"; }
}
/* =========================
   API / Backend (eventos)
========================= */
const IS_REMOTE = !!(window.__API_BASE__ && String(window.__API_BASE__).trim());

function callApi(endpoint, method = 'GET', body = {}) {
  // mesmo padrão usado nos outros módulos
  return import('./api/routes.js').then(({ handleRequest }) =>
    new Promise(resolve => handleRequest(endpoint, { method, body }, resolve))
  );
}

// Carrega um evento do backend (com fallback para o localStorage "eventos")
async function carregarEventoDoBackend(evtId) {
  if (!evtId) return null;

  if (!IS_REMOTE) {
    const lista = getJSON("eventos", []);
    return (lista || []).find(e => String(e.id) === String(evtId)) || null;
  }

  try {
    const resp = await callApi(`/eventos/${encodeURIComponent(String(evtId))}`, 'GET', {});
    const ev = resp?.data || resp;

    if (ev && ev.id) {
      // reforça o cache local de "eventos"
      try {
        const lista = getJSON("eventos", []);
        const i = lista.findIndex(e => String(e.id) === String(ev.id));
        if (i > -1) lista[i] = ev; else lista.push(ev);
        setJSON("eventos", lista);
      } catch {}
    }

    return ev || null;
  } catch (e) {
    console.warn('[checklist] Falha ao carregar evento na API, usando cache local', e);
    const lista = getJSON("eventos", []);
    return (lista || []).find(e => String(e.id) === String(evtId)) || null;
  }
}

// Salva o checklist dentro do próprio evento no backend
async function salvarEventoChecklistNoBackend(evtId, checklistState) {
  if (!evtId) return;

  // carrega o evento existente
  const ev = await carregarEventoDoBackend(evtId);
  if (!ev) return;

  // grava checklist dentro do objeto do evento
  ev.checklist = {
    selectedAbas: checklistState.selectedAbas || {},
    itens: Array.isArray(checklistState.itens) ? checklistState.itens : []
  };

  // atualiza cache local
  try {
    const lista = getJSON("eventos", []);
    const i = lista.findIndex(e => String(e.id) === String(ev.id));
    if (i > -1) lista[i] = ev; else lista.push(ev);
    setJSON("eventos", lista);
  } catch {}

  // manda para a API (PUT /eventos/{id})
  if (IS_REMOTE) {
    try {
      await callApi(`/eventos/${encodeURIComponent(String(ev.id))}`, 'PUT', ev);
    } catch (e) {
      console.warn('[checklist] Falha ao salvar checklist na API', e);
    }
  }
}

/* =========================
   Chaves
========================= */
function keyEventoChecklist(evtId){ return "checklist:event:"+evtId; }   // onde salvamos seleção + progresso
const KEY_MODELOS = "checklistModelos";                                  // modelos salvos (abas -> itens[])
const KEY_EVENTOS = "eventos";                                           // lista de eventos (para nome/data)
const KEY_AGENDA  = "agenda:itens";                                      // lembretes/agenda

/* =========================
   API / Backend (eventos) – versão isolada do checklist
========================= */
function checklistIsRemote(){
  return !!(window.__API_BASE__ && String(window.__API_BASE__).trim());
}

function checklistCallApi(endpoint, method = 'GET', body = {}) {
  // mesmo padrão usado em outros módulos (lista-evento, itens-evento, etc.)
  return import('./api/routes.js').then(({ handleRequest }) =>
    new Promise(resolve => handleRequest(endpoint, { method, body }, resolve))
  );
}

// Carrega evento pela API, com fallback pro localStorage
async function carregarEventoDoBackend(evtId) {
  if (!evtId) return null;

  if (!checklistIsRemote()) {
    const lista = getJSON(KEY_EVENTOS, []);
    return (lista || []).find(e => String(e.id) === String(evtId)) || null;
  }

  try {
    const resp = await checklistCallApi(`/eventos/${encodeURIComponent(String(evtId))}`, 'GET', {});
    const ev = resp?.data || resp;

    if (ev && ev.id) {
      // reforça cache local
      try {
        const lista = getJSON(KEY_EVENTOS, []);
        const i = lista.findIndex(e => String(e.id) === String(ev.id));
        if (i > -1) lista[i] = ev; else lista.push(ev);
        setJSON(KEY_EVENTOS, lista);
      } catch {}
    }

    return ev || null;
  } catch (e) {
    console.warn('[checklist] Falha ao carregar evento da API, usando cache local', e);
    const lista = getJSON(KEY_EVENTOS, []);
    return (lista || []).find(e => String(e.id) === String(evtId)) || null;
  }
}

// Salva o checklist dentro do próprio evento no backend
async function salvarEventoChecklistNoBackend(evtId, checklistState) {
  if (!evtId) return;

  const ev = await carregarEventoDoBackend(evtId);
  if (!ev) return;

  ev.checklist = {
    selectedAbas: checklistState.selectedAbas || {},
    itens: Array.isArray(checklistState.itens) ? checklistState.itens : []
  };

  // atualiza cache local
  try {
    const lista = getJSON(KEY_EVENTOS, []);
    const i = lista.findIndex(e => String(e.id) === String(ev.id));
    if (i > -1) lista[i] = ev; else lista.push(ev);
    setJSON(KEY_EVENTOS, lista);
  } catch {}

  if (checklistIsRemote()) {
    try {
      await checklistCallApi(`/eventos/${encodeURIComponent(String(ev.id))}`, 'PUT', ev);
    } catch (e) {
      console.warn('[checklist] Falha ao salvar checklist na API', e);
    }
  }
}


/* =========================
   Carregar modelos
   Formato aceito:
   {
     "Pré-Evento": [{ id, texto|nome, offsetDiasAntes? | prazo:{dias,tipo,agenda} }, ...],
     "Dia do Evento": [...],
     "Pós-Evento": [...]
   }
========================= */
function loadModelos(){
  const raw = getJSON(KEY_MODELOS, {});
  // normaliza: aceita item.nome ou item.texto e, se vier estrutura nova (prazo),
  // converte para offsetDiasAntes quando necessário
  const m = {};
  Object.keys(raw||{}).forEach(aba=>{
    m[aba] = (raw[aba]||[]).map(it=>{
      const texto = (it.texto!=null ? it.texto : it.nome) || "";
      let offset = null;
      let agenda = true;
      if (it.offsetDiasAntes!=null) offset = Number(it.offsetDiasAntes);
      if (it.prazo && typeof it.prazo === "object"){
        const dias = Number(it.prazo.dias||0);
        const tipo = (it.prazo.tipo==="depois" ? "depois" : "antes");
        offset = (tipo==="antes" ? dias : -dias);
        agenda = (it.prazo.agenda!==false);
      }
      return { id: it.id, texto, offsetDiasAntes: offset, agenda: agenda };
    });
  });
  return m;
}

/* =========================
   Evento & data do evento
========================= */
function findEvento(evtId){
  const lista = getJSON(KEY_EVENTOS, []);
  return (lista||[]).find(e => String(e.id)===String(evtId)) || null;
}
function getEventoNome(ev){
  if(!ev) return "Evento";
  return ev.nomeEvento || ev.titulo || ev.nome || ev.cliente || ev.evento || ("Evento "+(ev.id||""));
}
function getEventoDateISO(ev){
  const cand = ev && (ev.dataISO || ev.dataEventoISO || ev.dataEvento || ev.data || ev.quando);
  if (!cand) return null;
  const d = new Date(cand);
  return isNaN(d) ? null : d.toISOString();
}

/* =========================
   Estado
========================= */
var state = {
  evtId: "",
  ev: null,
  modelos: {},           // abas -> itens[]
  selectedAbas: {},      // { "Pré-Evento": true, ... }
  itens: []              // itens instanciados para o evento
};

/* =========================
   Carregar/salvar do evento
========================= */
function loadEventoChecklist(evtId){
  const saved = getJSON(keyEventoChecklist(evtId), null);
  if (!saved) return { selectedAbas:{}, itens:[] };
  return {
    selectedAbas: saved.selectedAbas || {},
    itens: Array.isArray(saved.itens) ? saved.itens : []
  };
}
function saveEventoChecklist(){
  const payload = {
    selectedAbas: state.selectedAbas || {},
    itens: state.itens || []
  };

  // 1) Salva no storage local (como já fazia)
  setJSON(keyEventoChecklist(state.evtId), payload);

  // 2) Tenta mandar pro backend em background
  try {
    if (IS_REMOTE && state.evtId) {
      salvarEventoChecklistNoBackend(state.evtId, payload)
        .catch(e => {
          console.warn('[checklist] Erro ao salvar checklist na nuvem', e);
        });
    }
  } catch (e) {
    console.warn('[checklist] Erro inesperado ao acionar salvarEventoChecklistNoBackend', e);
  }
}


/* =========================
   Construir itens a partir dos modelos + abas selecionadas
========================= */
function rebuildItensFromSelection(){
  const itens = [];
  Object.keys(state.selectedAbas||{}).forEach(aba=>{
    if (!state.selectedAbas[aba]) return;
    const arr = state.modelos[aba] || [];
    arr.forEach(it=>{
      itens.push({
        id: it.id != null ? String(it.id) :
            (aba+"|"+(it.texto||"").slice(0,24)+"|"+Math.random().toString(36).slice(2,7)),
        aba: aba,
        texto: String(it.texto||""),
        done: false,
        offsetDiasAntes: (typeof it.offsetDiasAntes === "number" ? it.offsetDiasAntes : null),
        agenda: (it.agenda!==false)
      });
    });
  });
  state.itens = itens;
}

/* =========================
   Render do checklist (somente check/uncheck)
========================= */
function renderChecklist(){
  const host = document.getElementById("checklistHost");
  if (!host) return;
  host.innerHTML = "";

  // agrupa por aba
  const mapa = {};
  (state.itens||[]).forEach(it=>{
    if (!mapa[it.aba]) mapa[it.aba]=[];
    mapa[it.aba].push(it);
  });

  Object.keys(mapa).forEach(aba=>{
    const grupo = document.createElement("div");
    grupo.className = "grupo";
    grupo.innerHTML = `<h3>${aba}</h3>`;
    const ul = document.createElement("div");
    ul.className = "lista";

    mapa[aba].forEach(item=>{
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML =
        `<label>
          <input type="checkbox" class="chk" data-id="${item.id}" ${item.done?'checked':''}>
          <span class="texto">${item.texto || '-'}</span>
        </label>`;
      ul.appendChild(row);
    });

    grupo.appendChild(ul);
    host.appendChild(grupo);
  });

  // bind
  host.querySelectorAll('.chk').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const id = String(chk.getAttribute('data-id'));
      const it = (state.itens||[]).find(x=>String(x.id)===id);
      if (it){ it.done = !!chk.checked; saveEventoChecklist(); }
    });
  });
}

/* =========================
   Modal: selecionar abas
========================= */
function openSelectAbas(){
  const cont = document.getElementById('tabsContainer');
  const dlg  = document.getElementById('dlgSelectAbas');
  if (!cont || !dlg) return;

  cont.innerHTML = "";
  const abas = Object.keys(state.modelos||{});
  if (!abas.length){
    const div = document.createElement('div');
    div.className = 'muted';
    div.textContent = "Você ainda não criou modelos. Vá em 'Modelos de Checklist' e crie suas abas/itens.";
    cont.appendChild(div);
  } else {
    abas.forEach(aba=>{
      const qtd = Array.isArray(state.modelos[aba]) ? state.modelos[aba].length : 0;
      const wrap = document.createElement('label');
      wrap.className = 'tab';
      wrap.innerHTML = `
        <input type="checkbox" class="aba-opt" value="${aba}" ${state.selectedAbas[aba]?'checked':''}>
        <div><b>${aba}</b><div class="muted">${qtd} item(ns)</div></div>`;
      cont.appendChild(wrap);
    });
  }

  if (typeof dlg.showModal === "function") dlg.showModal();
}
function confirmAbas(){
  const dlg  = document.getElementById('dlgSelectAbas');
  const marc = document.querySelectorAll('#tabsContainer .aba-opt');
  const novoSel = {};
  marc.forEach(chk=>{ if (chk.checked) novoSel[String(chk.value)] = true; });

  state.selectedAbas = novoSel;
  rebuildItensFromSelection();
  saveEventoChecklist();
  renderChecklist();

  // gera lembretes na agenda, quando houver offsetDiasAntes e item.agenda===true
  syncAgendaFromChecklist();

  if (dlg) dlg.close();
}

/* =========================
   Agenda: lembretes relativos à data do evento
========================= */
function syncAgendaFromChecklist(){
  if (!state.ev) return;
  const iso = getEventoDateISO(state.ev);
  if (!iso) return;

  const base = new Date(iso);
  if (isNaN(base)) return;

  const agenda = getJSON(KEY_AGENDA, []);
  const agendaIdx = new Set(agenda.map(a=> (a._k || (String(a.eventoId||"")+"|"+String(a.itemId||"")))));

  (state.itens||[]).forEach(it=>{
    if (it.agenda!==false && typeof it.offsetDiasAntes === "number"){
      const d = new Date(base);
      d.setDate(d.getDate() - it.offsetDiasAntes);
      const key = state.evtId + "|" + it.id;
      if (!agendaIdx.has(key)){
        agenda.push({
          _k: key,
          tipo: "checklist",
          eventoId: state.evtId,
          titulo: (getEventoNome(state.ev)+" - "+(it.texto||"")),
          quandoISO: d.toISOString()
        });
        agendaIdx.add(key);
      }
    }
  });

  setJSON(KEY_AGENDA, agenda);
}

/* =========================
   Boot
========================= */
(function(){
  async function initChecklist(){
    const p = new URLSearchParams(location.search);
    const evtId = p.get("id");
    if (!evtId){
      alert("EVENTO ID ausente na URL.");
      return;
    }
    state.evtId = String(evtId);

    // 1) Evento (nome + data) – tenta na API primeiro
    let ev = null;
    try {
      ev = await carregarEventoDoBackend(state.evtId);
    } catch (e) {
      console.warn('[checklist] Erro ao carregar evento do backend', e);
    }
    if (!ev) {
      ev = findEvento(state.evtId); // fallback local
    }
    state.ev = ev;

    const lblEvento = document.getElementById('lblEvento');
    const lblEvtId  = document.getElementById('lblEvtId');
    const lblData   = document.getElementById('lblDataEvt');
    if (lblEvento) lblEvento.textContent = ev ? getEventoNome(ev) : "-";
    if (lblEvtId)  lblEvtId.textContent  = state.evtId;
    if (lblData)   lblData.textContent   = fmtBRDate(getEventoDateISO(ev));

    // 2) Modelos + checklist salvo (local + backend)
    state.modelos = loadModelos();

    const savedLocal = loadEventoChecklist(state.evtId);
    let merged = {
      selectedAbas: savedLocal.selectedAbas || {},
      itens: Array.isArray(savedLocal.itens) ? savedLocal.itens : []
    };

    if (ev && ev.checklist && typeof ev.checklist === "object") {
      merged = {
        selectedAbas: ev.checklist.selectedAbas || merged.selectedAbas || {},
        itens: Array.isArray(ev.checklist.itens) && ev.checklist.itens.length
          ? ev.checklist.itens
          : merged.itens
      };
    }

    state.selectedAbas = merged.selectedAbas || {};

    if (merged.itens && merged.itens.length){
      state.itens = merged.itens;
    } else {
      rebuildItensFromSelection();
    }

    // 3) Render e binds
    renderChecklist();

    document.getElementById('btnAddChecklist')?.addEventListener('click', openSelectAbas);
    document.getElementById('btnConfirmarAbas')?.addEventListener('click', confirmAbas);
    document.getElementById('btnSalvar')?.addEventListener('click', ()=>{
      saveEventoChecklist();
      alert('Checklist salvo.');
    });
  }

  initChecklist();
})();
