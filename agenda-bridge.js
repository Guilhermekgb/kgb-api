// === INÍCIO PATCH GUARD (agenda-bridge.js) ===
if (window.__AgendaBridgeLoaded) {
  console.debug('[bridge] já carregado — ignorando segundo include');
  // Impede reexecução e sai
  // (Se a página incluir o arquivo 2x por engano, não quebra)
  // Não faça nada aqui
} else {
  window.__AgendaBridgeLoaded = true;

  // Canal Broadcast compartilhado e único na janela
  window.__kgbBC = window.__kgbBC || new BroadcastChannel('kgb-bridge');
  function __getBC(){ try{ return window.__kgbBC; } catch { return null; } }

  // >>> Deixe o conteúdo ORIGINAL do arquivo daqui para baixo <<<
  // (não remova nada; só garanta que o arquivo inteiro fica dentro deste bloco)
/* ========= AGENDA BRIDGE =========
   Cole este arquivo como agenda-bridge.js e referencie nos módulos.
   Expõe no window.__agendaBridge:
   - upsertUnifiedItem(item)
   - setUnifiedDone(id)
   - publishNotificationFeed(event)
   - buildEntityUrl(entity)
   - (legados/aux): upsertAgendaItem, removeAgendaItem, publishNotification
*/

// === BroadcastChannel singleton (reuso entre funções; fora do IIFE p/ escopo único) ===
let __bc = null;
function __getBC(){
  try {
    if (!__bc) __bc = new BroadcastChannel('mrubuffet');
  } catch {}
  return __bc;
}

(function(){
  'use strict';

  // ===== Chaves de armazenamento =====
  const KEY_UNIFIED = 'agendaUnified';
  const KEY_FEED    = 'notificationsFeed';

  // ===== Low-level (read/write + ping) =====
  function __read(key, fb){
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fb; } catch { return fb; }
  }
  function __write(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
  function __ping(key){
    try { localStorage.setItem(key, String(Date.now())); } catch {}
  }
  function __keepAtMost(list, n){
    if (Array.isArray(list) && list.length > n) list.length = n;
  }

  // ===== Unified agenda helpers =====
  function __readUnified(){ return __read(KEY_UNIFIED, []); }
  function __writeUnified(arr){
__write(KEY_UNIFIED, arr || []);
__ping('agendaUnified:ping');
// Broadcast inter-abas
try { __getBC()?.postMessage({ type:'agendaUnified:ping', at: Date.now() }); } catch {}
// Evento local (mesma aba)
try { window.dispatchEvent(new CustomEvent('agendaUnified:ping', { detail:{ at: Date.now() } })); } catch {}

  }

  // Normaliza data ISO (YYYY-MM-DD) se vier com hora
function ensureISODate(d){
  if (!d) return '';
  if (d instanceof Date && !isNaN(d)) {
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);           // YYYY-MM-DD...
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) {                              // YYYY/MM/DD
    const [y,m,day]=s.slice(0,10).split('/');
    return `${y}-${m}-${day}`;
  }
  // tenta parsear
  const dt = new Date(s);
  if (!isNaN(dt)) {
    const y=dt.getFullYear(), m=String(dt.getMonth()+1).padStart(2,'0'), day=String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  return '';
}


  // ===== API principal =====

 function upsertUnifiedItem(item){
    if (!item || !item.id) return;

    const safe = {
      ...item,
      id: String(item.id),
      title: String(item.title || 'Item'),
      date: ensureISODate(item.date),
      status: item.status || 'scheduled',
      src: item.src || null,
      audience: item.audience || null,
      timeStart: item.timeStart || null,
      entity: item.entity || null,
      desc: item.desc || ''
    };

    // 1) Atualiza espelho local (para a tela continuar funcionando)
    const arr = __readUnified();
    const ix  = arr.findIndex(x => String(x.id) === safe.id);
    if (ix >= 0) arr[ix] = { ...arr[ix], ...safe };
    else arr.unshift(safe);

    __keepAtMost(arr, 800);
    __writeUnified(arr); // já pinga LS + BC

    // 2) Envia para a API (nuvem) — fonte oficial
    try {
      const API_BASE = window.__API_BASE__ || localStorage.getItem('API_BASE');
      if (API_BASE) {
        fetch(`${API_BASE}/agenda/unified`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({
            id: safe.id,
            src: safe.src,
            title: safe.title,
            date: safe.date,
            timeStart: safe.timeStart,
            status: safe.status,
            audience: safe.audience,
            entity: safe.entity,
            desc: safe.desc
          })
        }).catch(err => console.warn('[bridge] erro ao salvar na nuvem /agenda/unified:', err));
      }
    } catch(e){
      console.warn('[bridge] falha ao chamar API /agenda/unified:', e);
    }
  }

  /** marca como feito (done) mantendo a mesma data do compromisso */
  function setUnifiedDone(id){
    const arr = __readUnified();
    const ix  = arr.findIndex(x => String(x.id) === String(id));
    if (ix < 0) return;
    arr[ix].status = 'done';
    __writeUnified(arr); // já pinga LS + BC
  }

 function publishNotificationFeed(ev){
    try {
      if (!ev || ev.id == null) return;

      // Lê feed atual com fallback seguro
      const feedRaw = __read(KEY_FEED, []);
      const feed = Array.isArray(feedRaw) ? feedRaw.slice() : [];

      // Normaliza nível
      const lvlMap = { warn: 'warn', error: 'error', info: 'info' };
      const level = lvlMap[String(ev.level || 'info').toLowerCase()] || 'info';

      // Normaliza data de criação (ISO) com fallback robusto
      const createdAtISO = (() => {
        try {
          if (ev.createdAtISO) return new Date(ev.createdAtISO).toISOString();
          if (ev.createdAt)    return new Date(ev.createdAt).toISOString();
        } catch {}
        return new Date().toISOString();
      })();

      // Evento normalizado
      const norm = {
        id: String(ev.id),
        title: String(ev.title || 'Notificação'),
        level,
        createdAtISO,
        audience: ev.audience ?? null,
        entity: ev.entity ?? null,
        meta: ev.meta
      };

      // 1) Atualiza espelho local
      const idx = feed.findIndex(x => String(x?.id) === norm.id);
      if (idx >= 0) feed[idx] = { ...feed[idx], ...norm };
      else feed.unshift(norm);

      feed.sort((a, b) => (Date.parse(b.createdAtISO) || 0) - (Date.parse(a.createdAtISO) || 0));
      __keepAtMost(feed, 800);

      __write(KEY_FEED, feed);
      __ping('notificationsFeed:ping');
      try { __getBC()?.postMessage({ type: 'notificationsFeed:ping', at: Date.now() }); } catch {}
      try { window.dispatchEvent(new CustomEvent('notificationsFeed:ping', { detail:{ at: Date.now() } })); } catch {}

      // 2) Envia também para a API /notificacoes (nuvem)
      try {
        const API_BASE = window.__API_BASE__ || localStorage.getItem('API_BASE');
        if (API_BASE) {
          fetch(`${API_BASE}/notificacoes`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify({
              id: norm.id,
              kind: ev.kind || null,
              title: norm.title,
              message: ev.message || '',
              level: norm.level,
              audience: norm.audience || '',
              entityType: norm.entity?.type || null,
              entityId: norm.entity?.id || null
            })
          }).catch(err => console.warn('[bridge] erro ao salvar na nuvem /notificacoes:', err));
        }
      } catch(e){
        console.warn('[bridge] falha ao chamar API /notificacoes:', e);
      }

    } catch (e) {
      try { console.warn('[bridge] publishNotificationFeed erro:', e); } catch {}
    }
  }

/* ===== M33 — Helpers específicos: Próxima Ação (Leads) ===== */
// Cria/atualiza uma “tarefa” visível na Agenda e solta uma notificação no feed
// lead: objeto completo do lead (precisa ter id e nome); diaISO: 'AAAA-MM-DD'
function notifyProximaAcao(lead, diaISO, origemMsg = 'Próxima Ação definida'){
  if (!lead || !lead.id || !diaISO) return;
  try {
    const idLead = String(lead.id);
    const titulo = `Próxima ação: ${String(lead.nome || lead.cliente || 'Lead').slice(0,60)}`;

    upsertUnifiedItem({
      id: `task:lead:${idLead}`,          // id estável da tarefa
      title: titulo,
      date: diaISO,                       // data de vencimento na Agenda
      status: 'todo',
      src: 'leads',
      entity: { type: 'lead', id: idLead }
    });

    publishNotificationFeed({
      id: `notif:lead:task:set:${idLead}:${diaISO}`,
      title: `${origemMsg} — ${String(lead.nome||'Lead')}`,
      level: 'info',
      entity: { type: 'lead', id: idLead },
      meta: { date: diaISO }
    });
  } catch(e){ console.warn('M33 notifyProximaAcao falhou', e); }
}

// Marca como concluída e registra alerta
function notifyProximaAcaoConcluida(lead, origemMsg = 'Próxima Ação concluída'){
  if (!lead || !lead.id) return;
  try{
    const idLead = String(lead.id);

    // se existir suporte a “complete” na sua Agenda, ajuste aqui:
    upsertUnifiedItem({
      id: `task:lead:${idLead}`,
      title: `Próxima ação: ${String(lead.nome||'Lead')}`,
      // manter date anterior (se quiser) — ou remova para “apagar”
      status: 'done',
      src: 'leads',
      entity: { type: 'lead', id: idLead }
    });

    publishNotificationFeed({
      id: `notif:lead:task:done:${idLead}`,
      title: `${origemMsg} — ${String(lead.nome||'Lead')}`,
      level: 'info',
      entity: { type: 'lead', id: idLead }
    });
  } catch(e){ console.warn('M33 notifyProximaAcaoConcluida falhou', e); }
}

  // ===== Mapear entidade -> URL de origem (botão "Abrir origem") =====
  // entity: { type: 'evento'|'tarefa'|'parcela'|'fatura'|'lead'|'funil'|'degustacao'|'interno', id: string }
  function buildEntityUrl(entity){
    if (!entity || !entity.type) return '';
    const id = encodeURIComponent(entity.id || '');
    const map = {
      evento:        `evento-detalhado.html?id=${id}`,
      tarefa:        `checklist.html?id=${id}`,
      parcela:       `financeiro-evento.html?parcela=${id}`,
      fatura:        `financeiro-cartao.html?id=${id}`,
      lead:          `orcamento-detalhado.html?id=${id}`,
      funil:         `funil-leads.html`,
      degustacao:    `degustacoes-disponiveis.html`,
      interno:       `notificacoes-internas.html`
    };
    return map[entity.type] || '';
  }

  // ===== Legacy helpers (mantidos para compatibilidade) =====
  const KEY_LEGACY = KEY_UNIFIED;

  function readAgenda(){ return __read(KEY_LEGACY, []); }
function writeAgenda(arr){
  __write(KEY_LEGACY, arr);
  __ping('agendaUnified:ping');
  // Broadcast entre abas
  try { __getBC()?.postMessage({ type:'agendaUnified:ping', at: Date.now() }); } catch {}
  // Evento local (mesma aba)
  try { window.dispatchEvent(new CustomEvent('agendaUnified:ping', { detail:{ at: Date.now() } })); } catch {}
}


  // Upsert simples por id (legado; prefira upsertUnifiedItem)
  function upsertAgendaItem(item){
    if (!item) return '';
    const arr = readAgenda();
    const id = item.id || ('ag_' + Date.now().toString(36));
    item.id = id;
    const ix = arr.findIndex(x => String(x.id) === String(id));
    if (ix >= 0) arr[ix] = { ...arr[ix], ...item };
    else arr.unshift(item);
    __keepAtMost(arr, 800);
    writeAgenda(arr);
    return id;
  }

  function removeAgendaItem(id){
    const arr = readAgenda();
    const out = arr.filter(x => String(x.id) !== String(id));
    writeAgenda(out);
  }

  // Mantém publishNotification legado apontando pro feed atual (normaliza createdAt)
  function publishNotification(notif){
    const norm = {
      ...notif,
      createdAtISO: notif?.createdAtISO || notif?.createdAt || new Date().toISOString()
    };
    delete norm.createdAt;
    publishNotificationFeed(norm);
  }

const api = {
  // unificado
  upsertUnifiedItem,
  setUnifiedDone,
  publishNotificationFeed,
  buildEntityUrl,
  // M33 – Próxima Ação (expostos)
  notifyProximaAcao,
  notifyProximaAcaoConcluida,
  // legados/aux
  upsertAgendaItem,
  removeAgendaItem,
  publishNotification,
  // meta
  __version: '1.2.2'
};


const __frozen = Object.freeze(api);
if (!window.__agendaBridge) {
  window.__agendaBridge = __frozen;
} else {
  window.__agendaBridge = Object.freeze(Object.assign({}, window.__agendaBridge, api));
}

})();
// Fechamento do guard
} // window.__AgendaBridgeLoaded
// === FIM PATCH GUARD (agenda-bridge.js) ===
