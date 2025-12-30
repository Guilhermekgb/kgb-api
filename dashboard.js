// ========= DASHBOARD com Lançamento Rápido + ALERTAS =========
// PATCH: garante que a variável global "leads" exista para não quebrar o dashboard
if (typeof window.leads === 'undefined') {
  window.leads = [];
}
// torna "leads" visível dentro do código do dashboard
var leads = window.leads;

let __CURRENT_USER_DASH = window.__KGB_USER_CACHE || null;

async function initDashboard(){
  try {
    if (typeof window.getUsuarioAtualAsync === 'function') {
      __CURRENT_USER_DASH = await window.getUsuarioAtualAsync() || window.__KGB_USER_CACHE || null;
    } else {
      __CURRENT_USER_DASH = window.__KGB_USER_CACHE || null;
    }
  } catch (e) { __CURRENT_USER_DASH = window.__KGB_USER_CACHE || null; }

  // After user loaded, refresh greeting and bell
  try { renderSaudacaoUsuario(); } catch(e){}
  try { refreshDashboardBell(); } catch(e){}
}

document.addEventListener("DOMContentLoaded", () => {
// Helpers idempotentes no escopo global (não quebram se já existirem)
window.$  = window.$  || ((s, el=document) => el.querySelector(s));
window.$$ = window.$$ || ((s, el=document) => Array.from(el.querySelectorAll(s)));

  // ✅ ISO respeitando fuso local
  const ISO = (d=new Date()) => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const fmtBR = (v) => Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2});

  const aHoje = document.getElementById('linkAgendaHoje');
  if (aHoje) aHoje.href = 'agenda.html?data=' + ISO();
  // === INÍCIO PATCH SAFE-KPI ===
function safeRenderFinanceiroKPIs(data){
  if (typeof window.renderFinanceiroKPIs === 'function') {
   try { window.renderFinanceiroKPIs(data); } catch(e){ console.warn('[Dashboard] KPIs erro:', e); }

  } else {
    // sem a função nos arquivos atuais — evita erro no console
    // console.debug('[Dashboard] renderFinanceiroKPIs ausente');
  }
}
// === FIM PATCH SAFE-KPI ===

// === Sino do Dashboard: feed + "não lidas" + sync entre abas ===
(function dashboardBell(){
  const BADGE_ID = 'badgeNotif';

  function __getUID(){
    try {
      const cand = [
          localStorage.getItem('userProfile'),
          // usuarioLogado removed: prefer session via getUsuarioAtualAsync/guard
          localStorage.getItem('usuario'),
          localStorage.getItem('currentUser'),
          localStorage.getItem('auth:user')
        ];
      for (const c of cand){
        try{
          const o = c ? JSON.parse(c) : null;
          if (o && (o.id || o.uid || o.userId)) {
            return String(o.id || o.uid || o.userId);
          }
        }catch{}
      }
    } catch {}
    return 'anon';
  }

  function __getFeed(){
    try { return JSON.parse(localStorage.getItem('notificationsFeed')||'[]') || []; }
    catch { return []; }
  }

  function __getReadSet(uid){
    try {
      const arr = JSON.parse(localStorage.getItem(`notificationsRead:${uid}`)||'[]') || [];
      return new Set(arr.map(String));
    } catch { return new Set(); }
  }
  function __saveReadSet(uid, set){
    const arr = Array.from(set);
    localStorage.setItem(`notificationsRead:${uid}`, JSON.stringify(arr));
  }

  function countNaoLidas(){
    const uid  = __getUID();
    const feed = __getFeed();
    const read = __getReadSet(uid);
    let n = 0;
    for (const f of feed){
      const id = f?.id;
      if (id == null) continue;
      if (!read.has(String(id))) n++;
    }
    return n;
  }

  function refreshDashboardBell(){
    const el = document.getElementById(BADGE_ID);
    if (!el) return; // sem badge no dashboard, não faz nada
    const n = countNaoLidas();
    if (n > 0){
      el.textContent = String(n);
      el.style.display = '';
    } else {
      el.textContent = '0';
      el.style.display = 'none';
    }
  }

  // Disponibiliza "marcar tudo como lido" para botões/páginas chamarem
  function markAllNotificationsAsRead(){
    const uid  = __getUID();
    const feed = __getFeed();
    const set  = __getReadSet(uid);
    for (const f of feed){
      if (!f || f.id == null) continue;
      set.add(String(f.id));
    }
    __saveReadSet(uid, set);
    refreshDashboardBell();
    // Pinga outras abas
    try { localStorage.setItem('notificationsFeed:ping', String(Date.now())); } catch {}
    try { const bc = new BroadcastChannel('mrubuffet'); bc.postMessage({ type:'notificationsFeed:ping', ts: Date.now() }); bc.close?.(); } catch {}
  }
  window.markAllNotificationsAsRead = markAllNotificationsAsRead;

  // Reage a mudanças de feed/leitura nesta e em outras abas
  window.addEventListener('storage', (ev)=>{
    if (!ev || !ev.key) return;
    if (ev.key.startsWith('notificationsFeed') || ev.key.startsWith('notificationsRead:')) {
      refreshDashboardBell();
    }
  });
  try {
    const bc = new BroadcastChannel('mrubuffet');
    bc.onmessage = (e)=>{
      if (e?.data?.type === 'notificationsFeed:ping') refreshDashboardBell();
    };
  } catch {}

  // Primeiro render ao carregar o Dashboard
  document.addEventListener('DOMContentLoaded', refreshDashboardBell);
  // E um pequeno atraso para o caso do menu/lucide terminarem de montar
  setTimeout(refreshDashboardBell, 80);
})();

 // ===== Lucide: hidratar ícones somente quando aparecerem novos =====
(function(){
  // Marca <i data-lucide> já processados para não reprocessar
  function hydrateLucideOnce(root=document){
    try{
      const L = window.lucide;
      if (!L || typeof L.createIcons !== 'function') return;

      const novos = root.querySelectorAll('i[data-lucide]:not([data-lucide-hydrated])');
      if (!novos.length) return;

      // Marca como “hidratado” antes de chamar o createIcons (evita loops)
      novos.forEach(i => i.setAttribute('data-lucide-hydrated', ''));
      // Executa a hidratação; múltiplas chamadas são inofensivas, mas agora raras
      if (L.icons) L.createIcons({ icons: L.icons });
      else L.createIcons();
    }catch(e){
      console.warn('Lucide hydrate falhou:', e);
    }
  }

  // 1) Hidrata o que já existe no primeiro load
  document.addEventListener('DOMContentLoaded', ()=> hydrateLucideOnce(document));

  // 2) Observa SOMENTE novos <i data-lucide> ainda não hidratados
  if (!window.__lucideObsDash){
    window.__lucideObsDash = new MutationObserver((muts)=>{
      let precisa = false;
      for (const m of muts){
        if (!m.addedNodes || !m.addedNodes.length) continue;
        for (const n of m.addedNodes){
          if (n.nodeType !== 1) continue;
          // Checa se o nó adicionado É um <i data-lucide> não hidratado,
          // ou se contém algum assim por dentro
          if (
            (n.matches?.('i[data-lucide]:not([data-lucide-hydrated])')) ||
            n.querySelector?.('i[data-lucide]:not([data-lucide-hydrated])')
          ){
            precisa = true; break;
          }
        }
        if (precisa) break;
      }
      if (precisa) requestAnimationFrame(()=> hydrateLucideOnce(document));
    });
    // Observa mudanças, mas sem retriggerar por qualquer alteração do body inteiro
    window.__lucideObsDash.observe(document.body, { childList:true, subtree:true });
  }

  // Exponho uma função manual (para você chamar quando abrir menus/popovers, se quiser)
  window.__lucideHydrateNow = () => hydrateLucideOnce(document);
})();


// Alias de compatibilidade para chamadas antigas
function refreshLucideIcons(){
  try {
    if (typeof window.__lucideRefresh === 'function') {
      window.__lucideRefresh();
    } else if (window.lucide && typeof window.lucide.createIcons === 'function') {
      // fallback
      if (window.lucide.icons) window.lucide.createIcons({ icons: window.lucide.icons });
      else window.lucide.createIcons();
    }
  } catch (e) {
    console.warn('refreshLucideIcons falhou:', e);
  }
}

  // Saudação com o nome do usuário
    function renderSaudacaoUsuario(){
  // prefer in-memory user
  const u = __CURRENT_USER_DASH || window.__KGB_USER_CACHE || null;
  const primeiroValido = u || (function(){
    try {
      const cand = [localStorage.getItem('usuario'), localStorage.getItem('currentUser'), localStorage.getItem('auth:user')]
        .map(x => { try { return x ? JSON.parse(x) : null; } catch { return null; } });
      return cand.find(x => x && typeof x === 'object') || {};
    } catch { return {}; }
  })();
  let nome =
      primeiroValido.nome ||
      primeiroValido.name ||
      primeiroValido.displayName ||
      (primeiroValido.firstName && primeiroValido.lastName ? (primeiroValido.firstName + ' ' + primeiroValido.lastName) : '') ||
      primeiroValido.usuario ||
      '';

  // fallback: se vier só email
  if (!nome && typeof primeiroValido.email === 'string') {
    nome = primeiroValido.email.split('@')[0];
  }
  if (!nome) nome = 'Usuário';

  const h1 = document.getElementById('tituloSaudacao');
  if (h1) h1.textContent = `Bem-vindo(a), ${nome}`;
}

// chama a saudação ao carregar
renderSaudacaoUsuario();


  // ===== LS helpers
  const readLS  = (k,d)=>{ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):d; }catch{ return d; } };
  const writeLS = (k,v)=>{
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch(e){
      if (e && (e.name==='QuotaExceededError' || e.code===22 || e.code===1014)) {
        throw e;
      } else { throw e; }
    }
  };
  // ===== Helper genérico para chamadas de API (local/backend)
  async function fetchJSON(url, opts = {}) {
    const base = window.API_BASE || ""; // se quiser apontar p/ /api, define window.API_BASE = "/api"
    const resp = await fetch(base + url, {
      headers: { "Accept": "application/json" },
      ...opts,
    });
    if (!resp.ok) throw new Error(`[API] ${url} → ${resp.status}`);
    return resp.json();
  }

    // Gatilhos centrais de refresh do Dashboard (apenas financeiro)
  async function refreshDashboardKPIs() {
    // Hoje não precisamos chamar nada aqui, porque os KPIs financeiros
    // já são carregados pelo script dentro do arquivo dashboard.html.
    // Esta função fica só para não quebrar nada que ainda espere ela existir.
    return;
  }

  // dispara no load (mantido só por segurança)
  document.addEventListener("DOMContentLoaded", () => {
    try {
      refreshDashboardKPIs();
    } catch (e) {
      console.warn("[Dashboard] erro no refresh inicial (simplificado):", e);
    }
  });


  // ===== Aviso "sem conta/forma" (Dashboard) =====
  let __dlBypassContaWarn = false;
  function __maybeContaWarningDash({ exigeForma=false, onProceed } = {}){
    if (__dlBypassContaWarn) { onProceed?.(); return true; }
    const dlg = document.getElementById('dlgAvisoContaDash');
    const msgBase = exigeForma
      ? 'Este lançamento está como "Pago/Recebido", mas a CONTA e/ou a FORMA não foram informadas.\nDeseja salvar assim mesmo?'
      : 'Nenhuma CONTA foi informada para este lançamento.\nDeseja salvar assim mesmo?';

    if (dlg && typeof dlg.showModal === 'function'){
      dlg.showModal();
      const btnVoltar = dlg.querySelector('[data-acao="voltar"], #btnDashVoltar');
      const btnSalvar = dlg.querySelector('[data-acao="salvar"], #btnDashSalvarMesmo');
      const btnClose  = dlg.querySelector('[data-close]');
      const off = ()=>{ try{ dlg.close(); }catch{} dlg.hidden = true; };
      dlg.addEventListener('click', (e)=>{ if (e.target === dlg) off(); }, { once:true });
      dlg.addEventListener('cancel', (e)=>{ e.preventDefault(); off(); }, { once:true });
      btnClose?.addEventListener('click', ()=> off(), { once:true });
      (dlg.querySelector('#btnDashVoltar')||btnVoltar)?.addEventListener('click', ()=> off(), { once:true });
      (dlg.querySelector('#btnDashSalvarMesmo')||btnSalvar)?.addEventListener('click', ()=>{
        off(); __dlBypassContaWarn = true; try { onProceed?.(); } finally { __dlBypassContaWarn = false; }
      }, { once:true });
      return true;
    }
    const ok = window.confirm(msgBase);
    if (ok) {
      __dlBypassContaWarn = true;
      try { onProceed?.(); } finally { __dlBypassContaWarn = false; }
    }
    return true;
  }

  // Normaliza "tipo" para 'entrada' | 'saida'
  function normalizeTipoLanc(tipo) {
    let t = (tipo == null ? '' : String(tipo)).trim().toLowerCase();
    try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch {}
    if (t === 'saida' || t === 'despesa' || t === 's') return 'saida';
    if (t === 'entrada' || t === 'receita' || t === 'e' || t === 'r') return 'entrada';
    return ''; // fallback neutro
  }
 // Substitua o parseMoney antigo por este:
const parseMoney = (input) => {
  if (input == null) return 0;
  let s = String(input).trim();

  // remove símbolos e espaços (ex.: "R$ 1.234,56")
  s = s.replace(/[^\d.,-]/g, '');

  const hasComma = s.indexOf(',') !== -1;
  const hasDot   = s.indexOf('.') !== -1;

  // Caso tenha os dois separadores, considera como decimal o que aparecer por último
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot   = s.lastIndexOf('.');
    const decPos = Math.max(lastComma, lastDot);

    const intPart = s.slice(0, decPos).replace(/[.,]/g, '');     // remove milhares
    const decPart = s.slice(decPos + 1).replace(/[^\d]/g, '');   // só dígitos

    const norm = intPart + '.' + decPart; // monta no padrão JS
    const n = Number(norm);
    return isNaN(n) ? 0 : n;
  }

  // Só vírgula -> vírgula é decimal, tira pontos de milhar
  if (hasComma) {
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  // Só ponto ou sem separador -> ponto é decimal (JS entende), remove vírgulas perdidas
  const n = Number(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
// === Persistência unificada do lançamento rápido (Dashboard) ===
function __salvarLancRapidoNoFG({
  tipo,
  descricao,
  valorStr,
  dataISO,
  contaId,
  contaNome,
  formaDescricao,
  eventoId,
  status = 'pendente',
  parcelas = 1,
  categoriaId = '',
  escopo = 'empresa'
}) {
  // --- helpers simples (sem depender de nada externo complicado) ---
  const FG_KEY = 'financeiroGlobal';

  const parseBRL = (s) => {
    if (s == null) return 0;
    s = String(s).trim().replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    // vírgula como decimal
    if (s.includes(',') && !s.includes('.')) {
      return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
    }
    // ponto como decimal ou só números
    return Number(s.replace(/,/g, '')) || 0;
  };

  const normTipo = (t) => {
    t = String(t || '').toLowerCase();
    if (t === 'receita') t = 'entrada';
    if (t === 'despesa') t = 'saida';
    return (t === 'entrada' || t === 'saida') ? t : 'saida';
  };

  const lerFG = () => {
    try {
      const raw = localStorage.getItem(FG_KEY);
      const g = raw ? JSON.parse(raw) : {};
      return {
        contas: [],
        lancamentos: [],
        parcelas: [],
        movimentos: [],
        saldoPorConta: {},
        ...g
      };
    } catch {
      return { contas: [], lancamentos: [], parcelas: [], movimentos: [], saldoPorConta: {} };
    }
  };

  const gravarFG = (g) => {
    try {
      localStorage.setItem(FG_KEY, JSON.stringify(g));
    } catch (e) {
      console.warn('[Dashboard] Falhou ao salvar financeiroGlobal', e);
    }

    // "ping" para outras abas/telas
    try { localStorage.setItem('financeiroGlobal:ping', String(Date.now())); } catch {}
    try { localStorage.setItem('fg:ping', String(Date.now())); } catch {}

    // BroadcastChannel para telas que escutam mudanças
    try {
      const bc1 = new BroadcastChannel('kgb-sync');
      bc1.postMessage({ type: 'fg:changed', reason: 'dashboard-quick', ts: Date.now() });
      bc1.close?.();
    } catch {}

    try {
      const bc2 = new BroadcastChannel('mrubuffet');
      bc2.postMessage({ type: 'fg:changed', reason: 'dashboard-quick', ts: Date.now() });
      bc2.close?.();
    } catch {}

    // evento de janela (Financeiro Lançamentos também escuta isso)
    try {
      window.dispatchEvent(new Event('fin-store-changed'));
    } catch {}

    // helper global do sistema (se existir)
    try {
      window.emitFGChange?.('dashboard-quick', { origem: 'dashboard', ts: Date.now() });
    } catch {}
  };

  const uid = () =>
    (crypto.randomUUID?.() ||
      (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)));

  // --- monta dados básicos do lançamento ---
  const t = normTipo(tipo || 'saida');
  const vNum = Math.round(parseBRL(valorStr) * 100) / 100;
  const competenciaISO = (dataISO || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const g = lerFG();

  // lançamento principal
  const lancId = uid();
  const lanc = {
    id: lancId,
    tipo: t,                               // 'entrada' | 'saida'
    descricao: descricao || '',
    valorOriginal: vNum,
    contaId: String(contaId || ''),
    contaNome: contaNome || '',
    formaDescricao: String(formaDescricao || ''),
    competencia: competenciaISO,
    status: String(status || 'pendente').toLowerCase(),
    dataPagamentoISO: '',                  // dashboard rápido começa como pendente
    origem: 'dashboard',                   // importante p/ rastrear de onde veio
    fonte: 'dashboard-quick',
    eventoId: eventoId ? String(eventoId) : '',
    categoriaId: categoriaId || '',
    escopo: escopo || 'empresa'
  };
  if (!Array.isArray(g.lancamentos)) g.lancamentos = [];
  g.lancamentos.unshift(lanc);

  // parcelas
  if (!Array.isArray(g.parcelas)) g.parcelas = [];
  const nParc = Math.max(1, parseInt(parcelas || 1, 10));
  const vParc = Math.round((vNum / nParc) * 100) / 100;

  for (let i = 0; i < nParc; i++) {
    const parcId = 'p_' + uid();
    g.parcelas.push({
      id: parcId,
      lancamentoId: lancId,
      descricao: nParc > 1
        ? `${lanc.descricao} (${i + 1}/${nParc})`
        : (lanc.descricao || ''),
      valor: vParc,
      totalPago: 0,                        // começa em aberto
      status: 'pendente',
      contaId: lanc.contaId,
      contaNome: lanc.contaNome,
      vencimentoISO: competenciaISO,
      dataPagamentoISO: ''
    });
  }

  // (opcional) movimentos/saldos ficam para as telas que já recalculam depois;
  // aqui não vamos inventar nada para não quebrar nada.

  gravarFG(g);

  return lancId;
}


// === Bind do formulário de Lançamento Rápido (Dashboard)
(function wireFormLancRapido(){
  const form = document.getElementById('formLancRapido');

  // Se o formulário não existir, falha silenciosa (página pode não incluir o modal)
  if (!form) return;

  if (form.__boundQuick) return;
  form.__boundQuick = true;


  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try{
 const tipo  = (document.getElementById('fTipo')  ?.value || 'entrada').trim();
const desc  = (document.getElementById('fDesc')  ?.value || '').trim();
const valor = (document.getElementById('fValor') ?.value || '0').trim();
const data  = (document.getElementById('fData')  ?.value || new Date().toISOString().slice(0,10)).slice(0,10);
const conta = (document.getElementById('fConta') ?.value || '').trim(); // ID da conta
const forma = (document.getElementById('fForma') ?.value || '').trim();
const parc  = Number(document.getElementById('fParcelas')?.value || 1) || 1;
// NOVOS: categoria + escopo entram no lançamento
const categoriaId = (document.getElementById('fCategoria')?.value || '').trim();
const escopo      = (document.getElementById('fEscopo')   ?.value || 'empresa').trim().toLowerCase();


      // descrição da forma (amigável) a partir do config (opcional)
      let formaDescricao = '';
      try {
        const cfg = JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{};
        const tipos = Array.isArray(cfg.tipos)?cfg.tipos:[];
        const m = tipos.find(t => String(t.id)===String(forma));
        formaDescricao = m?.descricao || m?.nome || forma || '';
      } catch {}

      // status automático: se escolheu conta, já marca como quitado
      const status = conta ? (String(tipo).toLowerCase()==='entrada' ? 'recebido' : 'pago') : 'pendente';

await __salvarLancRapidoNoFG({
  
  tipo, descricao: desc, valorStr: valor, dataISO: data,
  contaId: conta, contaNome: '',          // resolvido na função
  formaDescricao,
  eventoId: '',                           // sem evento
  status, parcelas: parc,
  categoriaId,                            // << agora grava categoria
  escopo                                   // << empresa/pessoal
});

// === INÍCIO PATCH FF-SYNC · Dashboard quick ===
try {
  // Monta uma operação simples de "upsert" de lançamento
  const op = {
    kind: 'fin:lanc',                // tipo de objeto
    action: 'upsert',                // operação
    ts: Date.now(),                  // carimbo de tempo
    scope: { eventId: '', origem: 'dashboard-quick' }, // sem evento aqui
    data: {
      tipo,
      descricao: desc,
      valor: Number((valor||'').toString().replace(/\./g,'').replace(',','.'))||0,
      dataISO: data,
      contaId: conta,
      forma,
      parcelas: parc,
      status,
      categoriaId,
      escopo
    }
  };

  // Dispara sem travar a UI (se syncPush existir)
  window.syncPush?.({ ops: [op] }).catch(()=>{ /* silencioso */ });
} catch(e) {
  console.warn('[sync] quick lanc push falhou', e);
}
// === FIM PATCH FF-SYNC · Dashboard quick ===


         // só para feedback visual:
      try { form.reset(); } catch {}
      try { window.fmtBRL && alert('Lançamento salvo com sucesso.'); } catch {}

      // 👉 depois de salvar, abre a tela de Financeiro Lançamentos
      try {
        window.location.href = 'financeiro-lancamentos.html';
      } catch {}

    } catch (e) {
      console.error('[dashboard] erro ao salvar lançamento rápido', e);
      alert('Não consegui salvar o lançamento. Veja o console para detalhes.');
    }
  });
})();


  const uid = ()=> (crypto.randomUUID?.() || ('dl_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)));

  (function bindDashboardCardLinks(){
    const fmtMes = () => ISO().slice(0,7);
    const hojeISO = () => ISO();
    const ontemISO = () => {
      const d=new Date(); d.setDate(d.getDate()-1);
      return ISO(d);
    };

    // RETORNOS VENCIDOS → Funil de Leads com retAte = ontem
      document.querySelectorAll('[data-card="retornos-vencidos"], #cardRetornosVencidos a, #cardRetornosVencidos, #al-retornos')
      .forEach(el=>{
        const url = `funil-leads.html?retAte=${encodeURIComponent(ontemISO())}`;
        if (el.tagName === 'A') el.href = url;
        else el.addEventListener('click', ()=> location.href=url);
      });


    // DEGUSTAÇÕES / PRÓXIMA DEGUSTAÇÃO (não sobrescrever #al-degust — é feito no renderAlertas)
    document.querySelectorAll('[data-card="degustacoes-hoje"], #cardDegustacoesHoje a, #cardDegustacoesHoje')
      .forEach(el=>{
        if (el.id === 'al-degust') return;
        const url = `degustacoes-disponiveis.html?data=${encodeURIComponent(hojeISO())}`;
        if (el.tagName === 'A') el.href = url;
        else el.addEventListener('click', ()=> location.href=url);
      });

    // PAGAMENTOS VENCIDOS
       document.querySelectorAll('[data-card="pg-vencidos"], #cardPagamentosVencidos a, #cardPagamentosVencidos, #al-vencidos')
      .forEach(el=>{
        const url = `painel-cobrancas.html?status=atraso&mes=${encodeURIComponent(fmtMes())}`;
        if (el.tagName === 'A') el.href = url;
        else el.addEventListener('click', ()=> location.href=url);
      });

// A VENCER (7 dias) — janela rolling (hoje → hoje+7)
document.querySelectorAll('[data-card="pg-a-vencer"], #cardPagamentosAVencer a, #cardPagamentosAVencer, #al-avencer')
  .forEach(el=>{
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const de  = hojeISO();                    // hoje (local)
    const ate = ISO(addDays(new Date(), 7));  // hoje + 7 dias (local)
    const url = `painel-cobrancas.html?status=aberto&de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`;
    if (el.tagName === 'A') el.href = url;
    else el.addEventListener('click', ()=> location.href = url);
  });


      // PÓS-EVENTO PENDENTES
    document.querySelectorAll('[data-card="pos-evento"], #cardPosEvento a, #cardPosEvento, #al-posevento')
      .forEach(el=>{
        const url = `painel-cobrancas.html?status=aberto&mes=${encodeURIComponent(fmtMes())}`;
        if (el.tagName === 'A') el.href = url;
        else el.addEventListener('click', ()=> location.href=url);
      });

  })();

  // ===== Config/Financeiro
  const CFG_KEY = "configFinanceiro";  // contas/cartões/formas/categorias
  const FG_KEY  = "financeiroGlobal";  // banco principal

  function getCfg(){
    const cfg = readLS(CFG_KEY, {});
    cfg.categorias = Array.isArray(cfg.categorias)?cfg.categorias:[];
    cfg.contas     = Array.isArray(cfg.contas)?cfg.contas:[];
    cfg.cartoes    = Array.isArray(cfg.cartoes)?cfg.cartoes:[];
    cfg.tipos      = Array.isArray(cfg.tipos)?cfg.tipos:[]; // formas pagamento
    return cfg;
  }

  function getContas(){
    const cfg = getCfg();
    const bancos = (cfg.contas||[]).map(c=>({ id:c.id, nome:c.nome, tipo:"conta_corrente" }));
    const cartoes = (cfg.cartoes||[]).map(k=>({ id:k.id, nome:k.nome, tipo:"cartao_credito", diaFechamento:k.fechamento??null, diaVencimento:k.vencimento??null }));
    const map = new Map();
    [...bancos, ...cartoes].forEach(c=> c?.id && map.set(c.id,c));
    return [...map.values()].sort((a,b)=> String(a.nome||"").localeCompare(String(b.nome||"")));
  }

  // ========= Categorias (unificada)
  function getCategoriasUnificadas(){
    const cfgCats = getCfg().categorias;
    const legacy1 = readLS("financeiro_categorias", []);
    const legacy2 = readLS("categorias_financeiro", []);
    const raw = [...(cfgCats||[]), ...(legacy1||[]), ...(legacy2||[])];
    const norm = (c)=>({
      id: c.id ?? c.value,
      nome: c.nome ?? c.descricao ?? "",
      descricao: c.descricao ?? c.nome ?? "",
      tipo: String(c.tipo ?? c.tipoLancamento ?? "").toLowerCase() || null,
      escopo: String(c.escopo ?? c.scope ?? "").toLowerCase() || null,
      paiId: c.paiId ?? c.parentId ?? null,
      ativo: c.ativo !== false,
    });
    const list = raw.map(norm).filter(c=>c.id && c.ativo);
    const map = new Map(); list.forEach(c=> map.set(String(c.id), c));
    return [...map.values()];
  }

  // === Eventos para vínculo
  function getEventos(){
    try{ return JSON.parse(localStorage.getItem("eventos")||"[]")||[]; }catch{ return []; }
  }
  function fillEventos(){
    const sel = document.getElementById("fEvento"); if (!sel) return;
    const evs = (getEventos()||[]).map(e=>({
      id: e.id ?? e.eventoId ?? e.uid ?? e._id ?? "",
      nome: e.nome || e.titulo || e.nomeEvento || "Evento",
      data: e.data || e.dataEvento || e.inicio || e.start || ""
    })).filter(e=> String(e.id||"").trim() !== "");
    const fmt = iso => iso ? ` — ${String(iso).slice(0,10).split("-").reverse().join("/")}` : "";
    sel.innerHTML = `<option value="">(Sem evento)</option>` + evs
      .sort((a,b)=> String(a.nome).localeCompare(String(b.nome)))
      .map(e => `<option value="${e.id}">${e.nome}${fmt(e.data)}</option>`).join("");
  }

 // Normaliza 'entrada' | 'saida' (aceita 'receita'/'despesa')
function _normTipo(t) {
  let s = (t == null ? '' : String(t)).trim().toLowerCase();
  if (s === 'receita') s = 'entrada';
  if (s === 'despesa') s = 'saida';
  return (s === 'entrada' || s === 'saida') ? s : '';
}
function _cfg() {
  try { return JSON.parse(localStorage.getItem('configFinanceiro') || '{}') || {}; }
  catch { return {}; }
}

let _catFillVer = 0; // evita condições de corrida se trocar rápido tipo/escopo
function fillCategoriasCombined() {
  const ver = ++_catFillVer;

  const selCat   = document.getElementById('fCategoria');
  if (!selCat) return;

  const tipoSel   = _normTipo(document.getElementById('fTipo')?.value || '');
  const escopoSel = String(document.getElementById('fEscopo')?.value || 'empresa').toLowerCase();

  const cfg   = _cfg();
  const all   = Array.isArray(cfg.categorias) ? cfg.categorias : [];

  // Index rápido por id
  const byId = new Map(all.map(c => [String(c.id), c]));

  // Helper: lê campos prováveis do objeto categoria
  const getNome = (c) => String(c?.descricao || c?.nome || '').trim();
  const getEsc  = (c) => String(c?.escopo || '').toLowerCase() || 'ambas';
  const getTipo = (c) => _normTipo(c?.tipo);
  const getPai  = (c) => (c?.parentId ?? c?.paiId ?? c?.idPai ?? c?.parent ?? '');

  // Filtra por tipo + escopo
  const okEscopo = (c) => {
    const e = getEsc(c);
    return (e === 'ambas' || e === escopoSel);
  };
  const okTipo = (c) => {
    const t = getTipo(c);
    if (!tipoSel) return true;
    return !t || t === tipoSel; // se a categoria não define tipo, não exclui
  };

  const valids = all.filter(c => okEscopo(c) && okTipo(c));

  // Separa pais e subs
  const pais = valids.filter(c => !getPai(c));
  const subs = valids.filter(c => !!getPai(c));

  // Agrupa subs por pai
  const subsByPai = new Map();
  for (const s of subs) {
    const pid = String(getPai(s));
    if (!subsByPai.has(pid)) subsByPai.set(pid, []);
    subsByPai.get(pid).push(s);
  }

  // Ordena por nome
  pais.sort((a,b)=>getNome(a).localeCompare(getNome(b), 'pt-BR'));
  for (const arr of subsByPai.values()) {
    arr.sort((a,b)=>getNome(a).localeCompare(getNome(b), 'pt-BR'));
  }

  // Preserva seleção anterior
  const prev = String(selCat.value || '');

  // Recria options
  selCat.innerHTML = '';
  const mkOpt = (id, label, paiId) => {
    const opt = document.createElement('option');
    opt.value = String(id);
    opt.text  = label;
    if (paiId) opt.setAttribute('data-pai', String(paiId));
    return opt;
  };

  // Monta opções: Pai e logo abaixo suas Subs
  for (const p of pais) {
    const pId = String(p.id);
    selCat.appendChild(mkOpt(pId, getNome(p), '')); // pai (sem data-pai)
    const filhos = subsByPai.get(pId) || [];
    for (const s of filhos) {
      const sId = String(s.id);
      selCat.appendChild(mkOpt(sId, `${getNome(p)} › ${getNome(s)}`, pId)); // sub com data-pai
    }
  }

  // Caso não haja nenhuma categoria válida
  if (!selCat.options.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.text  = '— Sem categorias para este escopo/tipo —';
    selCat.appendChild(opt);
    selCat.value = '';
    return;
  }

  // Restaura seleção anterior, se ainda existir
  if (prev && Array.from(selCat.options).some(o => o.value === prev)) {
    selCat.value = prev;
  } else {
    // Seleciona a primeira opção válida
    selCat.selectedIndex = 0;
  }

  // Se houve corrida com outra chamada, não propaga evento
  if (ver !== _catFillVer) return;

  // Dispara change para quem depende da categoria
  selCat.dispatchEvent(new Event('change'));
}

  function fillFormas(){
    const sel = $("#fForma"); if(!sel) return;
    const tipos = getCfg().tipos || [];
    sel.innerHTML = '<option value="">(Selecione)</option>' + tipos.map(t=>`<option value="${t.id}">${t.descricao||t.nome||t.label||t.id}</option>`).join("");
  }

  function fillContas(){
    const contas = getContas();
    const apply = (el)=>{
      if (!el) return;
      el.innerHTML = '<option value="">(Selecione)</option>' + contas.map(c=>`<option value="${c.id}" data-tipo="${c.tipo}">${c.nome}${c.tipo==="cartao_credito"?" (Cartão)":""}</option>`).join("");
    };
    apply($("#fConta"));
    apply($("#fContaOrigem"));
    apply($("#fContaDestino"));
  }

  // ========= Financeiro Global
  function readFG(){ const g = readLS(FG_KEY, {}); return { contas:[], lancamentos:[], parcelas:[], saldoPorConta:{}, ...g }; }
  // === KPIs FINANCEIROS (cards inferiores do Dashboard) ===
  async function refreshFinanceiroKPIsFromAPI(){
    const setText = (id, val, fmtMoney=false)=>{
      const el = document.getElementById(id);
      if (!el) return;
      const v = Number(val || 0);
      el.textContent = fmtMoney ? ("R$ " + fmtBR(v)) : String(v);
    };

    try {
      // Exemplo esperado de contrato:
      // GET /fin/resumo?range=mes
      // {
      //   "aReceber": 15000.32,
      //   "aPagar": 8200.50,
      //   "entradas": 23000.00,
      //   "saidas": 9500.00,
      //   "saldo": 13500.00,
      //   "posEventoPendentes": 4200.00
      // }
      const res = await fetchJSON("/fin/resumo?range=mes");

      setText("kpiFinAReceber", res.aReceber, true);
      setText("kpiFinAPagar",   res.aPagar,   true);
      setText("kpiFinEntradas", res.entradas, true);
      setText("kpiFinSaidas",   res.saidas,   true);
      setText("kpiFinSaldo",    res.saldo,    true);

      // se existir um card específico de pós-evento:
      if (document.getElementById("kpiFinPosEventoPend")) {
        setText("kpiFinPosEventoPend", res.posEventoPendentes ?? 0, true);
      }

    } catch (e) {
      console.warn("[Dashboard] Falha ao buscar resumo financeiro na API, usando financeiroGlobal local:", e);
      try {
        const fg = readFG();
        const hoje = new Date();
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();

        const inMes = (iso)=>{
          if (!iso) return false;
          const d = new Date(iso);
          return !isNaN(d) && d.getMonth()===mesAtual && d.getFullYear()===anoAtual;
        };

        let aReceber=0, aPagar=0, entradas=0, saidas=0;
        (fg.parcelas || []).forEach(p=>{
          const tipo = String(p.tipo || (p.valor>=0?'entrada':'saida') || '').toLowerCase();
          const st   = String(p.status || '').toLowerCase();
          const venc = p.vencimentoISO || p.vencimento || p.dataPagamentoISO || p.data;
          const v    = Number(p.valor || p.totalPago || 0) || 0;

          if (!inMes(venc)) return;

          const isEntrada = (tipo === 'entrada' || tipo === 'receita');
          const isSaida   = (tipo === 'saida'   || tipo === 'despesa');

          if (isEntrada) {
            if (st === 'recebido' || st === 'pago' || st === 'baixado' || st === 'quitado') entradas += v;
            else aReceber += v;
          } else if (isSaida) {
            if (st === 'pago' || st === 'baixado' || st === 'quitado') saidas += v;
            else aPagar += v;
          }
        });

        const saldo = (fg.saldoPorConta && Object.values(fg.saldoPorConta).reduce((a,b)=>a+Number(b||0),0)) || (entradas - saidas);

        setText("kpiFinAReceber", aReceber, true);
        setText("kpiFinAPagar",   aPagar,   true);
        setText("kpiFinEntradas", entradas, true);
        setText("kpiFinSaidas",   saidas,   true);
        setText("kpiFinSaldo",    saldo,    true);
      } catch (err) {
        console.warn("[Dashboard] Falha também no fallback local de KPIs financeiros:", err);
      }
    }
  }

  // ========= Financeiro Global (save seguro + backup + compactação progressiva)
  function writeFG(g){
    const KEY = "financeiroGlobal";

    const bytes = (obj)=> { try { return new Blob([JSON.stringify(obj)]).size; } catch { return Infinity; } };
    const isQuotaErr = (e)=> e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);

    const stages = [
      (x)=> {
        const dst = { contas:[], lancamentos:[], parcelas:[], saldoPorConta:{}, ...x };
        const strip = (o)=>{ if (!o || typeof o !== "object") return o;
          delete o.html; delete o._html; delete o.snapshot; delete o._snapshot;
          delete o.layout; delete o._layout; delete o.imagem; delete o._imagem;
          delete o.cache; delete o._cache; delete o._debug; delete o.debug;
          return o; };
        dst.contas      = (dst.contas||[]).map(strip);
        dst.lancamentos = (dst.lancamentos||[]).map(strip);
        dst.parcelas    = (dst.parcelas||[]).map(strip);
        dst.movimentos  = (dst.movimentos||[]).map(strip);
        return dst;
      },
      (x)=> {
        const dst = { ...x };
        const keepLanc = 1200, keepParc = 2500, keepMov = 2000;
        dst.lancamentos = Array.isArray(dst.lancamentos) ? dst.lancamentos.slice(-keepLanc) : [];
        dst.parcelas    = Array.isArray(dst.parcelas)    ? dst.parcelas.slice(-keepParc)   : [];
        dst.movimentos  = Array.isArray(dst.movimentos)  ? dst.movimentos.slice(-keepMov)  : [];
        return dst;
      },
      (x)=> {
        const dst = { ...x };
        const trim = (s)=> (String(s||'').length>140 ? (String(s||'').slice(0,140)+'…') : s);
        if (Array.isArray(dst.lancamentos)) dst.lancamentos = dst.lancamentos.map(l=> ({...l, descricao: trim(l.descricao)}));
        if (Array.isArray(dst.parcelas))    dst.parcelas    = dst.parcelas.map(p=> ({...p, observacao: trim(p.observacao)}));
        return dst;
      },
      (x)=> { const dst = { ...x }; delete dst.extras; delete dst.tmp; delete dst.buffers; return dst; },
      (x)=> {
        const dst = { ...x };
        dst.lancamentos = Array.isArray(dst.lancamentos) ? dst.lancamentos.slice(-400) : [];
        dst.parcelas    = Array.isArray(dst.parcelas)    ? dst.parcelas.slice(-900)  : [];
        dst.movimentos  = [];
        return dst;
      },
    ];

    try {
      writeLS(KEY, g);
      try { localStorage.setItem(KEY + ":ping", String(Date.now())); } catch {}
      try { window.dispatchEvent(new CustomEvent("finmodal:confirm",{detail:{reason:"dashboard-quick"}})); } catch {}
      return;
    } catch (err) {
      if (!isQuotaErr(err)) throw err;
    }

    try {
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(KEY + ":backup:" + Date.now(), prev);
    } catch (e) { console.warn("[Financeiro] Backup falhou (seguindo mesmo assim):", e); }

   let cur = { contas:[], lancamentos:[], parcelas:[], saldoPorConta:{}, ...g };

    for (let i=0; i<stages.length; i++){
      cur = stages[i](cur);
      try {
        writeLS(KEY, cur);
        try { localStorage.setItem(KEY + ":ping", String(Date.now())); } catch {}
        try { window.dispatchEvent(new CustomEvent("finmodal:confirm",{detail:{reason:`dashboard-quick-compact-s${i+1}`}})); } catch {}
        console.warn(`[Financeiro] Salvou após compactação (etapa ${i+1}). Tamanho ~${(bytes(cur)/1024/1024).toFixed(2)} MB`);
        return;
      } catch (err2){
        if (!isQuotaErr(err2)) throw err2;
      }
    }

    const aproxMB = (bytes(g)/1024/1024).toFixed(2);
    alert(
      "Seu armazenamento local está cheio (financeiroGlobal). " +
      "Tentei compactar em vários níveis e ainda não coube.\n\n" +
      `Tamanho aproximado atual: ~${aproxMB} MB (limite do navegador ~5 MB).\n\n` +
      "Soluções rápidas:\n" +
      "• Menu Dev > Console: chame __fgExport() para baixar um backup e depois __fgVacuum() para limpar.\n" +
      "• Habilite a sincronização remota (Firebase) para sair do limite local.\n"
    );
    throw new Error("QuotaExceeded (após compactação progressiva)");

      // === AUTO-BACKUP M34 ===
  try {
    if (window.kgbBackup?.saveWithBackup) {
      // salva a chave e cria snapshot com retenção (KEEP=5)
      kgbBackup.saveWithBackup('financeiroGlobal', g);
    } else {
      // fallback absoluto: pelo menos gera um snapshot bruto
      localStorage.setItem('backup:financeiroGlobal:' + Date.now(), JSON.stringify(g));
    }
  } catch (e) {
    console.warn('Auto-backup falhou:', e);
  }

  }

  // ===== Utilitários rápidos (Console)
  window.__fgExport = function(){
    try{
      const blob = new Blob([localStorage.getItem("financeiroGlobal")||"{}"], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `financeiroGlobal-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(a.href), 8000);
      console.log("Backup exportado.");
    }catch(e){ console.error(e); alert("Falha ao exportar."); }
  };
  window.__fgPurgeCaches = function(){
    const keys = Object.keys(localStorage);
    const pesados = keys.filter(k => /layout|snapshot|_html|_imagem|cache|tmp|buffer/i.test(k));
    pesados.forEach(k => localStorage.removeItem(k));
    alert(`Limpou ${pesados.length} chaves de cache temporário.`);
  };
  window.__fgVacuum = function(){
    try{
      const cur = localStorage.getItem("financeiroGlobal");
      if (cur) localStorage.setItem("financeiroGlobal:backup:"+Date.now(), cur);
      localStorage.removeItem("financeiroGlobal");
      alert("Financeiro limpo (backup salvo em localStorage). Reabra o modal e salve novamente.");
    }catch(e){ console.error(e); alert("Falha ao limpar."); }
  };

  function recalcSaldos(g){
    g = g && typeof g === 'object' ? g : {};
    g.contas      = Array.isArray(g.contas)      ? g.contas      : [];
    g.movimentos  = Array.isArray(g.movimentos)  ? g.movimentos  : [];
    g.lancamentos = Array.isArray(g.lancamentos) ? g.lancamentos : [];
    g.parcelas    = Array.isArray(g.parcelas)    ? g.parcelas    : [];
    g = ensureFgContasBaseline(g);
    const map = {};
    (g.contas || []).forEach(c => { map[String(c.id)] = Number(c.saldoInicial ?? c.saldo ?? 0) || 0; });
    (g.movimentos || []).forEach(m => {
      const contaId = String(m.contaId || ''); if (!contaId || !(contaId in map)) return;
      const v = Number(m.valor || 0); const tipo = String(m.tipo || '').toLowerCase();
      if (tipo === 'credito') map[contaId] += v; else if (tipo === 'debito') map[contaId] -= v;
    });
    g.contas.forEach(c => { c.saldoAtual = map[String(c.id)] ?? Number(c.saldoInicial || 0); });
    g.saldoPorConta = map;
  }
  function ensureFgContasBaseline(g){
    const cfg = getCfg();
    const contasCfg = Array.isArray(cfg?.contas) ? cfg.contas : [];
    const idsCfg = new Set(contasCfg.map(c => String(c.id)));
    const curMap = new Map((Array.isArray(g.contas) ? g.contas : []).map(c => [String(c.id), { ...c }]));
    contasCfg.forEach(ct => {
      const id = String(ct.id);
      const cur = curMap.get(id) || { id };
      cur.nome = ct.nome || cur.nome || '';
      cur.saldoInicial = Number(ct.saldo ?? cur.saldoInicial ?? 0) || 0;
      curMap.set(id, cur);
    });
    g.contas = Array.from(curMap.values()).filter(c => idsCfg.has(String(c.id)));
    return g;
  }

  // ========= POPOVERS: ORÇAMENTO / EVENTO (substitui dropdown antigo)
  (function(){
    const btnOrc = $('#btnOrcamento');
    const btnEvt = $('#btnEvento');
    const popOrc = $('#menuOrcamento');
    const popEvt = $('#menuEvento');
    if (!btnOrc || !btnEvt || !popOrc || !popEvt) return;

   const refreshIcons = ()=> { try { refreshLucideIcons(); } catch {} };


    function placePopover(trigger, pop){
      const r = trigger.getBoundingClientRect();
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      pop.style.position = 'absolute';
      pop.style.left = (r.left + scrollX) + 'px';
      pop.style.top  = (r.bottom + scrollY + 6) + 'px';
    }
    function openPopover(trigger, pop){
      closePopover(pop===popOrc ? popEvt : popOrc);
      placePopover(trigger, pop);
      pop.hidden = false;
      pop.querySelector('.kgb-popover__item')?.focus?.();
      refreshIcons();
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', onReflow, {passive:true});
      window.addEventListener('scroll', onReflow, {passive:true});
    }
    function closePopover(pop){
      if (!pop || pop.hidden) return;
      pop.hidden = true;
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow);
    }
    function togglePopover(trigger, pop){ pop.hidden ? openPopover(trigger, pop) : closePopover(pop); }
    function onDocClick(e){
      const t = e.target; if (!t) return;
      if (!popOrc.contains(t) && !popEvt.contains(t) && t!==btnOrc && t!==btnEvt){
        closePopover(popOrc); closePopover(popEvt);
      }
    }
    function onKey(e){ if (e.key === 'Escape'){ closePopover(popOrc); closePopover(popEvt); } }
    function onReflow(){ if (!popOrc.hidden) placePopover(btnOrc, popOrc); if (!popEvt.hidden) placePopover(btnEvt, popEvt); }

    btnOrc.addEventListener('click', (e)=>{ e.preventDefault(); togglePopover(btnOrc, popOrc); });
    btnEvt.addEventListener('click', (e)=>{ e.preventDefault(); togglePopover(btnEvt, popEvt); });

    ['keydown','keyup'].forEach(ev=>{
      btnOrc.addEventListener(ev, (e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); if (ev==='keyup') togglePopover(btnOrc, popOrc); }});
      btnEvt.addEventListener(ev, (e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); if (ev==='keyup') togglePopover(btnEvt, popEvt); }});
    });
  })();

  // ========= Modal: abrir/fechar
  const dlg = $("#modalLancamento");
  const btnOpen = $("#btnLancamentoRapido");
  const toastEl = $("#toast");
  btnOpen?.addEventListener("click", openModal);
  dlg?.addEventListener("click", (e) => { if (e.target?.dataset?.close !== undefined) closeModal(); });
  if (dlg) { $$("[data-close]", dlg).forEach(b => b.addEventListener("click", closeModal)); }
  dlg?.addEventListener('cancel', (e)=>{ e.preventDefault(); closeModal(); });

  function openModal() {
  // tenta preencher os campos do formulário de lançamento rápido, se existirem
  const ISO = (d = new Date()) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);

  const fData    = document.getElementById('fData');
  const fTipo    = document.getElementById('fTipo');
  const fEscopo  = document.getElementById('fEscopo');
  const fStatus  = document.getElementById('fStatus');
  const fValor   = document.getElementById('fValor');
  const fDesc    = document.getElementById('fDesc');

  if (fData)   fData.value   = ISO();
  if (fTipo)   fTipo.value   = 'entrada';
  if (fEscopo) fEscopo.value = 'empresa';
  if (fStatus) fStatus.value = 'pendente';
  if (fValor)  fValor.value  = '';
  if (fDesc)   fDesc.value   = '';

  // essas funções só são chamadas se existirem
  try { window.fillCategoriasCombined?.(); } catch {}
  try { window.fillFormas?.(); } catch {}
  try { window.fillContas?.(); } catch {}
  try { window.fillEventos?.(); } catch {}

  // tenta abrir algum modal de lançamento, se houver
  const dlg =
    document.getElementById('modalLancamento') ||
    document.querySelector('dialog#modalLancamento, .modalLancamento');

  if (dlg && typeof dlg.showModal === 'function') {
    try { dlg.showModal(); } catch {}
  }
}

  function closeModal(){
    if (dlg?.close) dlg.close(); else dlg.hidden=true;
    dlg?.classList?.remove('is-open');
    document.documentElement.classList.remove("no-scroll");
    document.body.classList.remove("no-scroll");
  }

  // ========= Repetição
  function addMes(iso, inc){
    const [Y,M,D] = iso.split("-").map(Number);
    const base = new Date(Y, (M||1)-1, D||1);
    const d = new Date(base.getFullYear(), base.getMonth()+inc, 1);
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    const dia = Math.min(D||1, last);
    return ISO(new Date(d.getFullYear(), d.getMonth(), dia));
  }
  function renderRepetePreview(){
    const box = $("#rep-prev"); if(!box) return;
    const ativo = $("#cbRepete").checked;
    if (!ativo){ box.textContent=""; return; }
    const data = $("#fData").value || ISO();
    const valor = Number($("#fValor").value||0);
    const n = Math.max(1, parseInt($("#fQtd").value||"1",10));
    const inicio = Math.max(0, parseInt($("#fInicioMes").value||"0",10));
    const modo = $("#fModo").value || "dividir";
    if (!valor){ box.textContent=""; return; }
    let total = valor, parcela = valor;
    if (modo==="dividir"){ parcela = Math.round((valor/n)*100)/100; total=valor; }
    else { parcela = valor; total = Math.round((valor*n)*100)/100; }
    const datas = Array.from({length:n},(_,i)=> addMes(data, inicio+i)).map(iso=>{
      const [y,m,d]=iso.split("-"); return `${d}/${m}/${y}`;
    }).join(" • ");
    box.textContent = n===1
      ? `Prévia: 1x de R$ ${fmtBR(parcela)} — vencimento ${datas}`
      : `Prévia: ${n}x de R$ ${fmtBR(parcela)} (Total R$ ${fmtBR(total)}) — vencimentos: ${datas}`;
  }
  $("#cbRepete")?.addEventListener("change", ()=>{ $("#boxRepete").hidden = !$("#cbRepete").checked; renderRepetePreview(); });
  ["#fValor","#fQtd","#fInicioMes","#fModo","#fData"].forEach(s=> $(s)?.addEventListener("input", renderRepetePreview));

  // ========= Tipo
  function toggleTipo(){
    const t = ($("#fTipo")?.value||"").toLowerCase();
    const transf = $("#blocoTransfer");
    if (transf) transf.hidden = (t!=="transferencia");
    const sel = $("#fCategoria");
    if (sel){
      if (t==="transferencia"){
        sel.innerHTML = '<option value="">(Não aplicável em transferência)</option>';
        sel.disabled = true;
      }else{
        sel.disabled = false;
        fillCategoriasCombined();
      }
    }
  }
  $("#fTipo")?.addEventListener("change", toggleTipo);
  $("#fEscopo")?.addEventListener("change", ()=>{ if (($("#fTipo")?.value||"")==="transferencia") return; fillCategoriasCombined(); });

  // ========= Salvar
  $("#formLancamento")?.addEventListener("submit", (e)=>{
    e.preventDefault();
    try{
      salvarLancamentoRapido();
      toast("Salvo com sucesso!");
      closeModal();
    }catch(err){
      console.error(err);
      toast("Falha ao salvar. Confira os campos.");
    }
  });
  function toast(msg){
    const el = $("#toast"); if (!el) return;
    el.textContent = msg||"OK";
    el.hidden = false;
    setTimeout(()=> el.hidden=true, 1800);
  }
// --- Cartão de crédito (helpers) ---
function __cfg(){ 
  try { return JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{}; }
  catch { return {}; }
}

function isLancFeitoNoCartao(lanc){
  const cfg = __cfg();
  const nomesCartoes = (Array.isArray(cfg.cartoes) ? cfg.cartoes : [])
    .map(c => String(c.nome||'').toLowerCase())
    .filter(Boolean);

  const forma = String(lanc.formaDescricao || lanc.formaNome || '').toLowerCase();
  const conta = String(lanc.contaNome || '').toLowerCase();

  return nomesCartoes.some(n =>
    forma.includes(n) || conta.includes(n) || forma.includes('cartão') || forma.includes('cartao')
  );
}

if (typeof window !== 'undefined' && !window.isLancFeitoNoCartao) {
  window.isLancFeitoNoCartao = isLancFeitoNoCartao;
}



try { toast('Lançamento salvo!'); } catch {}
try { document.getElementById('modalLancamento')?.close?.(); } catch {}
// === Helper: destrói instância anterior do Chart com segurança (v3/v4) ===
function __destroyChartInstance(canvasOrCtx){
  try{
    if (!window.Chart) return;
    const canvas = (canvasOrCtx && canvasOrCtx.canvas) ? canvasOrCtx.canvas : canvasOrCtx;
    if (Chart.getChart && canvas) {
      const inst = Chart.getChart(canvas);
      if (inst) inst.destroy();
    }
    if (window.__grafConv && typeof window.__grafConv.destroy === 'function'){
      try{ window.__grafConv.destroy(); }catch{}
      window.__grafConv = null;
    }
  }catch{}
}

  // === GRÁFICO: TAXA DE CONVERSÃO MÊS A MÊS ===

  function __destroyChartInstance(canvasOrCtx){
    try{
      if (!window.Chart) return;
      const canvas = (canvasOrCtx && canvasOrCtx.canvas) ? canvasOrCtx.canvas : canvasOrCtx;
      if (Chart.getChart && canvas) {
        const inst = Chart.getChart(canvas);
        if (inst) inst.destroy();
      }
      if (window.__grafConv && typeof window.__grafConv.destroy === 'function'){
        try{ window.__grafConv.destroy(); }catch{}
        window.__grafConv = null;
      }
    }catch{}
  }

  function renderGraficoConversaoSeries(labels, taxas){
    try{
      if (!window.Chart) {
        console.warn("Chart.js ainda não carregado — adiando renderização do gráfico.");
        setTimeout(()=> renderGraficoConversaoSeries(labels, taxas), 500);
        return;
      }
      const el  = document.getElementById("graficoConversao");
      const ctx = el && typeof el.getContext === "function" ? el.getContext("2d") : null;
      if (!ctx) return;

      __destroyChartInstance(el);

      window.__grafConv = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Taxa de Conversão (%)",
            data: taxas,
            fill: false,
            borderColor: "#c29a5d",
            backgroundColor: "#c29a5d",
            tension: 0.25,
            pointRadius: 4,
            pointBackgroundColor: "#c29a5d",
            pointBorderColor: "#fff",
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true, ticks: { color:"#5a3e2b", callback: v => v+"%" }, grid:{ color:"rgba(194,154,93,0.15)" } },
            x: { ticks: { color:"#5a3e2b" }, grid:{ color:"rgba(194,154,93,0.08)" } }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#fff",
              titleColor: "#5a3e2b",
              bodyColor: "#5a3e2b",
              borderColor: "#c29a5d",
              borderWidth: 1,
              callbacks: { label: ctx => `${ctx.parsed.y}% de conversão` }
            }
          }
        }
      });
    }catch(e){
      console.error("Erro ao renderizar gráfico de conversão:", e);
    }
  }

  // Fallback antigo: calcula séries a partir de leads da LS (mantido pra compatibilidade)
  function buildConversaoSeriesFromLeads(leads){
    const grupos = {};
    for (const ld of (leads||[])) {
      const data = new Date(ld.createdAt || ld.data || ld.dataLead || ld.inicio || Date.now());
      if (isNaN(data)) continue;
      const mesChave = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,"0")}`;
      if (!grupos[mesChave]) grupos[mesChave] = { total:0, finalizados:0 };
      grupos[mesChave].total++;
      const status = String(ld.status||"").toLowerCase();
      if (status.includes("arquiv") || status.includes("finaliz")) grupos[mesChave].finalizados++;
    }

    let chaves = Object.keys(grupos).sort();
    if (chaves.length === 0) {
      const hoje = new Date();
      chaves = Array.from({length: 6}).map((_,i)=>{
        const d = new Date(hoje.getFullYear(), hoje.getMonth()-5+i, 1);
        const ym = d.toISOString().slice(0,7);
        grupos[ym] = { total: 0, finalizados: 0 };
        return ym;
      });
    }

    const labels = chaves.map(c=>{
      const [y,m] = c.split("-");
      return `${m}/${y}`;
    });
    const taxas = chaves.map(c=>{
      const g = grupos[c] || { total:0, finalizados:0 };
      return g.total>0 ? Math.round((g.finalizados / g.total)*100) : 0;
    });

    return { labels, taxas };
  }

  // Versão nova: busca série oficial na API
  async function refreshGraficoConversaoFromAPI(){
    try {
      // espera algo como:
      // GET /leads/metrics?groupBy=mes
      // {
      //   "conversaoPorMes": [
      //     { "mes": "2025-01", "taxa": 32 },
      //     { "mes": "2025-02", "taxa": 28 },
      //     ...
      //   ]
      // }
      const data = await fetchJSON("/leads/metrics?groupBy=mes");
      const rawSerie = data.conversaoPorMes || data.series || data.data || [];
      const serie = Array.isArray(rawSerie) ? rawSerie : [];

      const labels = serie.map(p => {
        const ym = p.mes || p.month || p.label || "";
        if (!ym) return "";
        if (/^\d{4}-\d{2}$/.test(ym)) {
          const [yy,mm] = ym.split("-");
          return `${mm}/${yy}`;
        }
        return ym; // já vem formatado
      });

      const taxas = serie.map(p =>
        Number(p.taxa || p.taxaConversao || p.percent || p.conversao || 0)
      );

      if (labels.filter(Boolean).length && taxas.length) {
        renderGraficoConversaoSeries(labels, taxas);
        return;
      }

      // se a API devolveu algo inesperado, cai pro cálculo local
      throw new Error("Formato da série de conversão não reconhecido");
    } catch (e) {
      console.warn("[Dashboard] Falha ao usar API para gráfico de conversão, usando leads locais:", e);
      try {
        const leads = JSON.parse(sessionStorage.getItem("leads") || "[]");
        const { labels, taxas } = buildConversaoSeriesFromLeads(leads);
        renderGraficoConversaoSeries(labels, taxas);
      } catch (err) {
        console.warn("Falha também no fallback local para gráfico:", err);
      }
    }
  }

  // Observadores para re-render do gráfico quando leads mudarem
  (function bindLeadsObservers(){
    function rerenderConversao(){
      refreshGraficoConversaoFromAPI().catch(e=>console.warn("Falha ao re-renderizar gráfico:", e));
    }

    window.addEventListener('storage', (ev)=>{
      if (!ev?.key) return;
      if (ev.key === 'leads' || ev.key === 'leads:ping') rerenderConversao();
    });

    try {
      const bc = new BroadcastChannel('mrubuffet');
      bc.onmessage = (e)=>{
        if (e?.data?.type === 'leads:ping') rerenderConversao();
      };
    } catch {}

    // exporta helper para quem salvar/editar leads manualmente
    window.__leadsChanged = function(){
      try { localStorage.setItem('leads:ping', String(Date.now())); } catch {}
      rerenderConversao();
    };
  })();


  // === KPIs SUPERIORES (Leads / Funil / Eventos) ===

  async function refreshLeadsKPIsFromAPI(){
    try {
      // Exemplo de contrato esperado (ajuste para o teu backend):
      // GET /leads/metrics?range=mes
      // {
      //   "leadsMes": 42,
      //   "vendasMes": 8,
      //   "emNegociacao": 15,
      //   "finalizadosMes": 27
      // }
      const mLeads = await fetchJSON("/leads/metrics?range=mes");
      const mFunil  = await fetchJSON("/funil/metrics?range=mes").catch(()=> ({}));
      const mEvts   = await fetchJSON("/eventos/metrics?range=mes").catch(()=> ({}));
      const mFin    = await fetchJSON("/fin/metrics?range=mes").catch(()=> ({}));

      const setText = (id, val)=>{
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = String(val ?? "0");
      };

      // números principais vindos da API (cai pro valor atual ou 0)
      setText("leadsMes",        mLeads.leadsMes        ?? mLeads.totalMes      ?? 0);
      setText("vendasRealizadas",mLeads.vendasMes       ?? mFunil.vendasMes     ?? 0);
      setText("emNegociacao",    mLeads.emNegociacao    ?? mFunil.emNegociacao  ?? 0);
      setText("leadsFinalizados",mLeads.finalizadosMes  ?? mLeads.arquivadosMes ?? 0);

      // se você tiver outros KPIs superiores (tempo médio, ticket médio, etc),
      // pode aproveitar mFunil / mEvts / mFin aqui:
      if (mFunil.tempoMedioDias != null) {
        const el = document.getElementById("tempoMedioLeads");
        if (el) el.textContent = `${mFunil.tempoMedioDias} dias`;
      }
      if (mFin.ticketMedio != null) {
        const el = document.getElementById("ticketMedio");
        if (el) el.textContent = fmtBR(mFin.ticketMedio);
      }

    } catch (e) {
      console.warn("[Dashboard] Falha ao buscar KPIs de leads na API, usando cálculo local:", e);
      try {
        // Fallback: mesma lógica antiga baseada em localStorage
        const leads = readLS("leads", []);
        const hoje = new Date();
        const MES = hoje.getMonth(), ANO = hoje.getFullYear();

        const norm = (s)=> String(s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
        function parseDateFrom(obj, keys=[]){
          for (const k of keys){
            const v=obj?.[k]; if (v==null) continue;
            if (v instanceof Date && !isNaN(v)) return v;
            if (typeof v==="number" && Number.isFinite(v)){ const d=new Date(v); if(!isNaN(d)) return d; }
            if (typeof v==="string"){
              const s=v.trim(); const mBR=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              if (mBR){ const d=new Date(+mBR[3], +mBR[2]-1, +mBR[1]); if(!isNaN(d)) return d; }
              if (/^\d+$/.test(s)){ const d=new Date(Number(s)); if(!isNaN(d)) return d; }
              const d=new Date(s); if(!isNaN(d)) return d;
            }
          }
          return null;
        }
        const isArchived = (ld)=>{
          const s=norm(ld?.status);
          if (s.includes("arquiv")||s.includes("finaliz")||s.includes("cancel")) return true;
          const flags=["arquivado","isArquivado","archived","cancelado","cancelled"];
          if (flags.some(k=> ld?.[k]===true || ld?.[k]==="true" || ld?.[k]===1 || ld?.[k]==="1")) return true;
          if (Array.isArray(ld?.tags) && ld.tags.some(t=>{const n=norm(t); return n.includes("arquiv")||n.includes("cancel");})) return true;
          return false;
        };
        const isConverted = (ld)=>{
          const s=norm(ld?.status);
          return ld?.virouEvento===true || !!ld?.eventoId || s.includes("evento") || s.includes("fech") || s.includes("aceit") || s.includes("convert");
        };

        const dataCriacaoDe     = (ld)=> parseDateFrom(ld, ["dataCriacao","data_criacao","createdAt","data","ts","dataCadastro"]);
        const dataFechamentoDe  = (ld)=> parseDateFrom(ld, ["dataFechamento","fechadoEm","closedAt","dtFechamento","data_evento","eventoData"]);
        const dataArquivadoDe   = (ld)=> parseDateFrom(ld, ["archivedAt","arquivadoEm","updatedAt","ultimaAtualizacao"]) || dataFechamentoDe(ld) || dataCriacaoDe(ld);
        const noMes = (d)=> !!d && d.getMonth()===MES && d.getFullYear()===ANO;

        let leadsMes=0, vendasMes=0, emNegociacao=0, finalizadosMes=0;
        for (const ld of leads){
          const dCri  = dataCriacaoDe(ld);
          const dFech = dataFechamentoDe(ld);
          const arqu  = isArchived(ld);
          const conv  = isConverted(ld);

          if (dCri && noMes(dCri)) leadsMes++;
          if (conv && dFech && noMes(dFech)) vendasMes++;
          if (!arqu && !conv) emNegociacao++;
          if (arqu){
            const dArq = dataArquivadoDe(ld);
            if (dArq && noMes(dArq)) finalizadosMes++;
          }
        }
        const setText=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=String(val); };
        setText("leadsMes", leadsMes);
        setText("vendasRealizadas", vendasMes);
        setText("emNegociacao", emNegociacao);
        setText("leadsFinalizados", finalizadosMes);
      } catch (err) {
        console.warn("[Dashboard] Falha também no fallback local dos KPIs de leads:", err);
      }
    }
  }


  // helpers já existentes/compatíveis:
  const norm = (s)=> String(s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
  function parseDateFrom(obj, keys=[]){
    for (const k of keys){
      const v=obj?.[k]; if (v==null) continue;
      if (v instanceof Date && !isNaN(v)) return v;
      if (typeof v==="number" && Number.isFinite(v)){ const d=new Date(v); if(!isNaN(d)) return d; }
      if (typeof v==="string"){
        const s=v.trim(); const mBR=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (mBR){ const d=new Date(+mBR[3], +mBR[2]-1, +mBR[1]); if(!isNaN(d)) return d; }
        if (/^\d+$/.test(s)){ const d=new Date(Number(s)); if(!isNaN(d)) return d; }
        const d=new Date(s); if(!isNaN(d)) return d;
      }
    }
    return null;
  }
  const isArchived = (ld)=>{
    const s=norm(ld?.status);
    if (s.includes("arquiv")||s.includes("finaliz")||s.includes("cancel")) return true;
    const flags=["arquivado","isArquivado","archived","cancelado","cancelled"];
    if (flags.some(k=> ld?.[k]===true || ld?.[k]==="true" || ld?.[k]===1 || ld?.[k]==="1")) return true;
    if (Array.isArray(ld?.tags) && ld.tags.some(t=>{const n=norm(t); return n.includes("arquiv")||n.includes("cancel");})) return true;
    return false;
  };
  const isConverted = (ld)=>{
    const s=norm(ld?.status);
    return ld?.virouEvento===true || !!ld?.eventoId || s.includes("evento") || s.includes("fech") || s.includes("aceit") || s.includes("convert");
  };

  // datas
  const dataCriacaoDe     = (ld)=> parseDateFrom(ld, ["dataCriacao","data_criacao","createdAt","data","ts","dataCadastro"]);
  const dataFechamentoDe  = (ld)=> parseDateFrom(ld, ["dataFechamento","fechadoEm","closedAt","dtFechamento","data_evento","eventoData"]);
  const dataArquivadoDe   = (ld)=> parseDateFrom(ld, ["archivedAt","arquivadoEm","updatedAt","ultimaAtualizacao"]) || dataFechamentoDe(ld) || dataCriacaoDe(ld);
  const noMes = (d)=> !!d && d.getMonth()===MES && d.getFullYear()===ANO;

  // ===== Contagens
  let leadsMes=0, vendasMes=0, emNegociacao=0, finalizadosMes=0;
  for (const ld of leads){
    const dCri  = dataCriacaoDe(ld);
    const dFech = dataFechamentoDe(ld);
    const arqu  = isArchived(ld);
    const conv  = isConverted(ld);

    if (dCri && noMes(dCri)) leadsMes++;
    if (conv && dFech && noMes(dFech)) vendasMes++;
    if (!arqu && !conv) emNegociacao++;
    if (arqu){
      const dArq = dataArquivadoDe(ld);
      if (dArq && noMes(dArq)) finalizadosMes++;
    }
  }
  const setText=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=String(val); };
  setText("leadsMes", leadsMes);
  setText("vendasRealizadas", vendasMes);
  setText("emNegociacao", emNegociacao);
  setText("leadsFinalizados", finalizadosMes);

  // ========= Próximos eventos (15 dias) — com link para detalhado =========
(function proximosEventos15dias(){
  // chip “15 dias”
  const badge = document.getElementById("tagRangeEventos");
  if (badge) badge.textContent = "15 dias";

  const ul = document.getElementById("listaProximosEventos");
  if (!ul) return;

  // lê eventos
  const eventos = (function(){
    try { return JSON.parse(localStorage.getItem("eventos") || "[]") || []; }
    catch { return []; }
  })();

  // datas base (00:00)
  const hoje = new Date();
  const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fim = new Date(hoje0); fim.setDate(fim.getDate() + 15);

  // helpers
  const parseData = (e) => {
    const raw = e?.data || e?.dataEvento || e?.start || e?.inicio || e?.dataDoEvento;
    if (!raw) return null;
    // aceita ISO, timestamp e dd/mm/aaaa
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(raw))) {
      const [dd,mm,aa] = String(raw).split('/');
      const d = new Date(+aa, +mm-1, +dd);
      return isNaN(d) ? null : d;
    }
    const d = new Date(raw);
    return isNaN(d) ? null : d;
  };
  const estaArquivado = (ev) => {
    const s = [ev?.status, ev?.situacao, ev?.tag].filter(Boolean).join("|").toLowerCase();
    return s.includes("arquiv") || s.includes("cancel");
  };

  // normalizações de campos
  const getId   = (e) => e?.id || e?.eventoId || e?.uid || e?._id || e?.uuid || "";
  const getNome = (e) => e?.nome || e?.titulo || e?.nomeEvento || "Evento";
  const getLocal= (e) => e?.local || e?.localEvento || e?.endereco || "";
  const getQtd  = (e) => {
    // tenta várias chaves comuns
    const cands = [e?.convidados, e?.qtdConvidados, e?.quantConvidados, e?.numConvidados, e?.convidadosPrevistos];
    const n = cands.find(v => v != null);
    const num = Number(n);
    return Number.isFinite(num) ? num : (typeof n === "string" ? n : "");
  };

  // filtra janela [hoje, +15d] e ativos
  const proximos = (eventos || [])
    .map(e => ({ ...e, _dt: parseData(e) }))
    .filter(e => e._dt && e._dt >= hoje0 && e._dt <= fim)
    .filter(e => !estaArquivado(e))
    .sort((a,b) => a._dt - b._dt);

  // render
  ul.innerHTML = "";
  if (!proximos.length) {
    ul.innerHTML = `<li>Sem eventos nos próximos 15 dias</li>`;
    return;
  }

  proximos.slice(0, 6).forEach(e => {
    const id    = String(getId(e));
    const data  = e._dt.toLocaleDateString("pt-BR");
    const nome  = getNome(e);
    const local = getLocal(e);
    const qtd   = getQtd(e); // pode ser número ou string

    const li = document.createElement("li");
    li.className = "evento-link"; // classe para hover bonito (css opcional abaixo)
    li.innerHTML = `
      <div class="ttl">${data} — ${nome}</div>
      <div class="txt">
        ${qtd !== "" ? `Convidados: ${qtd}` : "Convidados: —"}
        ${local ? ` • ${local}` : ""}
      </div>
    `;
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      // vai para a página detalhada do evento
     window.location.href = `evento-detalhado.html?id=${encodeURIComponent(id)}`;
    });
    ul.appendChild(li);
  });
})();
// ========= Agenda de Degustações — próximas 15 datas + total de pessoas =========
(function agendaDegustacoes15dias(){
  const ul = document.getElementById('listaDegustacoes');
  if (!ul) return;

  // Leitura segura
  const LS = (k, fb=[]) => { try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };

  // Slots cadastrados (data, hora, local, cardapio)
  const slots = LS('degustacoesDisponiveis', []);
  // Agendados (tipo === "degustacao") — cada item pode ter: acompanhantes, pessoasTotal, compareceu, etc.
  const agenda = LS('agenda', []).filter(a => a && a.tipo === 'degustacao');

  // janela de 15 dias a partir de hoje (00:00)
  const hoje = new Date();
  const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fim = new Date(hoje0); fim.setDate(fim.getDate() + 15);

  // Parse dd/mm/aaaa e ISO
  const parseISOorBR = (s) => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(s))) {
      const d = new Date(s + 'T00:00:00');
      return isNaN(d) ? null : d;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(s))) {
      const [dd,mm,aa] = String(s).split('/');
      const d = new Date(+aa, +mm-1, +dd);
      return isNaN(d) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };
  const fmtBR = (iso) => {
    const d = parseISOorBR(iso);
    return d ? String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear() : String(iso||'');
  };

  // chave de coincidência entre agenda e slot (data|hora|local)
  const slotKey = (x) => `${x.data||''}|${x.hora||''}|${x.local||''}`;

  // Indexa agendados por slot
  const agByKey = agenda.reduce((acc, a)=>{
    const k = slotKey(a);
    (acc[k]||(acc[k]=[])).push(a);
    return acc;
  }, {});

  // Seleciona slots dentro da janela e ordena por data/hora
  const proximos = (slots||[])
    .map(s => ({...s, _dt: parseISOorBR(s.data)}))
    .filter(s => s._dt && s._dt >= hoje0 && s._dt <= fim)
    .sort((a,b)=> a._dt - b._dt || String(a.hora).localeCompare(String(b.hora)));

  // Render
  ul.innerHTML = '';
  if (!proximos.length){
    ul.innerHTML = '<li>Sem degustações nas próximas 2 semanas</li>';
    return;
  }

  proximos.slice(0, 15).forEach(s=>{
    const k = slotKey(s);
    const ags = agByKey[k] || [];

    // soma de pessoas: usa pessoasTotal se houver; senão 2 (casal) + acompanhantes
    const totalPessoas = ags.reduce((tot, a)=>{
      const p = Number(a.pessoasTotal);
      if (Number.isFinite(p)) return tot + p;
      const acomp = Math.max(0, parseInt(a.acompanhantes||'0',10) || 0);
      return tot + (2 + acomp);
    }, 0);

    const li = document.createElement('li');
    li.className = 'link-lista'; // use sua classe de “clicável”, se quiser
    li.innerHTML = `
      <div class="ttl">${fmtBR(s.data)} — ${s.local || 'Local a definir'}</div>
      <div class="txt">${s.cardapio || 'Cardápio a definir'} — <b>${totalPessoas}</b> pessoa(s)</div>
    `;
    li.style.cursor = 'pointer';
    // abre a página de degustações já filtrando pela data do slot
    li.addEventListener('click', ()=>{
      const d = (String(s.data||'').match(/^\d{2}\/\d{2}\/\d{4}$/))
        ? String(s.data).split('/').reverse().join('-')
        : String(s.data||'');
      window.location.href = `degustacoes-disponiveis.html?data=${encodeURIComponent(d)}`;
    });
    ul.appendChild(li);
  });
})();
// ========= Notificações (todas / internas / externas) — único card com abas =========
(function notificacoesUnificado(){
  const WRAP = document.getElementById('cardNotificacoes');
  const UL   = document.getElementById('listaNotificacoes');
  if (!WRAP || !UL) return;

  const LS = (k, fb=[]) => { try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };

  // Normaliza item vindo de qualquer fonte
  function normalize(it, origem){
    if (!it || typeof it !== 'object') return null;
    const id    = String(it.id ?? it._id ?? it.uid ?? it.uuid ?? '');
    const nome  = String(it.titulo ?? it.nome ?? it.assunto ?? it.mensagem ?? 'Notificação');
    const data  = it.data ?? it.dataISO ?? it.createdAt ?? it.ts ?? null;
    const lida  = !!(it.lida === true);
    const url   = it.url ?? '';
    const when  = data ? new Date(data) : null;
    const tipo  = origem; // 'interna' | 'externa'
    return { id, nome, lida, url, when, tipo };
  }
  const sortByDateDesc = (a,b) => (b.when?.getTime?.()||0) - (a.when?.getTime?.()||0);

  // Lê e combina
  function getData(){
    const internasRaw = LS('notif:internas', LS('notificacoesInternas', []));
    const externasRaw = LS('notif:externas', LS('notificacoesExternas', []));
    const internas = (internasRaw||[]).map(n=>normalize(n,'interna')).filter(Boolean);
    const externas = (externasRaw||[]).map(n=>normalize(n,'externa')).filter(Boolean);
    const todas    = [...internas, ...externas].sort(sortByDateDesc);
    return { todas, internas, externas };
  }

  // Estado de aba
  let abaAtual = 'todas'; // 'todas' | 'internas' | 'externas'
  function setAba(tab){
    abaAtual = tab;
    // UI das abas
    WRAP.querySelectorAll('.tab').forEach(btn=>{
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    render();
  }

  // Render conforme aba
  function render(){
    const { todas, internas, externas } = getData();
    const src = (abaAtual === 'internas') ? internas : (abaAtual === 'externas' ? externas : todas);

    if (!src.length){
      UL.innerHTML = '<li>Sem notificações</li>';
      return;
    }
    UL.innerHTML = '';
    src.slice(0, 6).forEach(n=>{
      const li = document.createElement('li');
      li.className = 'link-item';
      li.dataset.id = n.id;
      li.dataset.tipo = n.tipo;

      const badge = n.lida ? '' : `<span class="badge-unread" title="Não lida">•</span>`;
      const dt    = n.when ? `<div class="txt">${n.when.toLocaleString('pt-BR')}</div>` : '';
      const tag   = n.tipo === 'interna' ? 'Interna' : 'Externa';

      li.innerHTML = `
        <div class="ttl">${n.nome} ${badge}</div>
        <div class="txt">${tag}${n.when ? ` • ${n.when.toLocaleDateString('pt-BR')} ${n.when.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}` : ''}</div>
      `;

// dentro de notificacoesUnificado(), logo após montar cada <li>:
li.addEventListener('click', ()=>{
  // marca como lida
  try { window.marcarNotificacaoComoLida(n.tipo === 'externa' ? 'externa' : 'interna', n.id); } catch {}
  // navega
  if (n.url) {
    window.location.href = n.url;
  } else {
    const alvo = (n.tipo === 'interna') ? 'interna' : 'externa';
    window.location.href = `notificacoes.html?tipo=${encodeURIComponent(alvo)}&id=${encodeURIComponent(n.id)}`;
  }
});


      UL.appendChild(li);
    });

    try { window.lucide?.createIcons?.(); } catch {}
  }

  // Bind das abas
  WRAP.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=> setAba(btn.dataset.tab));
    btn.addEventListener('keydown', (e)=> {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAba(btn.dataset.tab); }
    });
  });

  // Primeira pintura
  setAba('todas');

  // Atualiza quando outras telas alterarem notificações
  window.addEventListener('storage', (e)=>{
    const k = String(e.key||'');
    if (['notif:ping','notif:internas','notif:externas','notificacoesInternas','notificacoesExternas'].includes(k)) {
      render();
      try { window.__refreshBellBadge?.(); } catch {}
    }
  });

  // Refresh leve
  setInterval(()=>{ try{ render(); }catch{} }, 20000);
})();
// ========= FINANCEIRO — KPIs dos cards =========
// Observação de escopo: somamos TUDO (empresa + pessoal), como você pediu.

(function setupFinanceCards(){
  const fmtBR = (v) => Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2});
  const IS_PAGO = (st)=> ['pago','recebido','baixado','quitado','liquidado','parcial']
                           .includes(String(st||'').toLowerCase());

  function readFG(){
    try { return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}')||{}; } catch { return {}; }
  }
  function val(n){ return Number(n||0) || 0; }

  // Pega parcelas vinculadas por lancamentoId
  function indexParcelas(parcelas){
    const map = new Map();
    (Array.isArray(parcelas)?parcelas:[]).forEach(p=>{
      const k = String(p.lancamentoId||''); if(!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    });
    return map;
  }

  // ---- 1) Fluxo previsto (A receber/A pagar) -> tudo que está EM ABERTO (independente do mês)
  function computePrevisto(){
    const fg = readFG();
    const lancs = Array.isArray(fg.lancamentos)?fg.lancamentos:[];
    const parc  = Array.isArray(fg.parcelas)?fg.parcelas:[];
    const byL   = indexParcelas(parc);

    let aReceber = 0;
    let aPagar   = 0;

    // conta um "título" (lançamento ou parcela) se NÃO estiver pago
    function somaSeAberto(obj, tipoLanc){
      const pago = IS_PAGO(obj.status) || !!obj.dataPagamentoISO;
      if (pago) return;
      const v = val(obj.valor || obj.valorParcela || obj.valorPrevisto);
      if (tipoLanc === 'entrada') aReceber += v; else if (tipoLanc === 'saida') aPagar += v;
    }

    // percorre lançamentos; se tiver parcelas, avalia cada; senão, avalia o próprio lanc
    lancs.forEach(l=>{
      const t = String(l?.tipo||'').toLowerCase(); // 'entrada'|'saida'|'transferencia'
      if (t !== 'entrada' && t !== 'saida') return;
      const parts = byL.get(String(l.id)) || [];
      if (parts.length) parts.forEach(p=> somaSeAberto(p, t));
      else somaSeAberto(l, t);
    });

    return { aReceber, aPagar };
  }

  // ---- 2) Resultado do mês (Entrou/Saiu/Base)
  // Por padrão, usamos os "movimentos" do mês atual (mais robusto para refletir baixas);
  // se não houver movimentos, caímos num fallback pelas datas de pagamento em lanc/parcelas.
  function computeMes(){
    const fg = readFG();
    const hoje = new Date();
    const Y = hoje.getFullYear(), M = hoje.getMonth();
    const inicioMes = new Date(Y, M, 1);
    const proxMes   = new Date(Y, M+1, 1);

    const inRange = (iso) => {
      if (!iso) return false;
      const d = new Date(iso);
      return !isNaN(d) && d >= inicioMes && d < proxMes;
    };

    let entrou = 0; // créditos
    let saiu   = 0; // débitos

    const movs = Array.isArray(fg.movimentos)?fg.movimentos:[];
    if (movs.length){
      movs.forEach(m=>{
        if (!inRange(m.dataISO || m.data || m.ts)) return;
        const t = String(m?.tipo||'').toLowerCase(); // 'credito' | 'debito'
        const v = val(m.valor);
        if (t === 'credito') entrou += v;
        else if (t === 'debito') saiu += v;
      });
    } else {
      // fallback: olhar lanc/parcelas pagas no mês
      const lancs = Array.isArray(fg.lancamentos)?fg.lancamentos:[];
      const parc  = Array.isArray(fg.parcelas)?fg.parcelas:[];
      const byL   = indexParcelas(parc);

      function somaPago(obj, tipoLanc){
        const pago = IS_PAGO(obj.status) || !!obj.dataPagamentoISO;
        if (!pago) return;
        const data = obj.dataPagamentoISO || obj.dataBaixaISO || obj.dataBaixa || obj.dataPagamento;
        if (!inRange(data)) return;
        const v = val(obj.valor || obj.valorParcela || obj.valorPago || obj.valorPrevisto);
        if (tipoLanc === 'entrada') entrou += v; else if (tipoLanc === 'saida') saiu += v;
      }

      lancs.forEach(l=>{
        const t = String(l?.tipo||'').toLowerCase();
        if (t !== 'entrada' && t !== 'saida') return;
        const parts = byL.get(String(l.id)) || [];
        if (parts.length) parts.forEach(p=> somaPago(p, t));
        else somaPago(l, t);
      });
    }

    return { entrou, saiu, base: (entrou - saiu) };
  }

  // ---- Render
  function renderFinanceCards(){
    const p = computePrevisto();
    const m = computeMes();

    const $ar = document.getElementById('kpiAReceber');
    const $ap = document.getElementById('kpiAPagar');
    const $en = document.getElementById('kpiEntrou');
    const $sa = document.getElementById('kpiSaiu');
    const $ba = document.getElementById('kpiBase');

    if ($ar) $ar.textContent = 'R$ ' + fmtBR(p.aReceber);
    if ($ap) $ap.textContent = 'R$ ' + fmtBR(p.aPagar);
    if ($en) $en.textContent = 'R$ ' + fmtBR(m.entrou);
    if ($sa) $sa.textContent = 'R$ ' + fmtBR(m.saiu);
    if ($ba) $ba.textContent = 'R$ ' + fmtBR(m.base);
  }

  // expor para outras partes forçarem refresh, se quiser
  window.__refreshFinanceCards = renderFinanceCards;

  // boot + listeners
  document.addEventListener('DOMContentLoaded', renderFinanceCards);
  // quando financeiro/leads/eventos mudarem, atualiza (inclui quando um título é baixado)
  window.addEventListener('storage', (e)=>{
    const k = String(e.key||'');
    if (k.includes('financeiroGlobal')) renderFinanceCards();
  });
  // “keep fresh”
  setInterval(renderFinanceCards, 15000);
})();
// ==== CONTAS A PAGAR / A RECEBER — próximos 15 dias (em aberto) ====
(function contas15dias(){
  const UL_PAGAR   = 'listaAPagar15';
  const UL_RECEBER = 'listaAReceber15';

  const IS_PAGO = (st)=> ['pago','recebido','baixado','quitado','liquidado','parcial']
    .includes(String(st||'').toLowerCase());
  const fmtBR = (v)=> Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2});

  function readFG(){
    try { return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}')||{}; } catch { return {}; }
  }
  function val(n){ return Number(n||0) || 0; }

  // pega data de vencimento “onde existir”
  function getVencimento(obj){
    const cand = obj?.vencimentoISO || obj?.dataVencimentoISO || obj?.dataVencimento || obj?.data || obj?.dataCompetencia;
    if (!cand) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(cand))){
      const [dd,mm,aa] = String(cand).split('/');
      const d = new Date(+aa, +mm-1, +dd);
      return isNaN(d) ? null : d;
    }
    const d = new Date(cand);
    return isNaN(d) ? null : d;
  }

  // nome amigável
  function nomeLanc(l){
    return l?.descricao || l?.categoriaNome || 'Lançamento';
  }

  // index de parcelas por lançamento
  function indexParcelas(parcelas){
    const map = new Map();
    (Array.isArray(parcelas)?parcelas:[]).forEach(p=>{
      const k = String(p.lancamentoId||''); if(!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    });
    return map;
  }

  // janela [hoje 00:00, +15 dias 23:59] (compara em datas sem hora)
  function rangeDatas(){
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const fim = new Date(inicio); fim.setDate(fim.getDate()+15);
    return {inicio, fim};
  }
  const {inicio:HOJE0, fim:FIM} = rangeDatas();

  function toISOdate(d){ return d.toISOString().slice(0,10); }
  function br(d){ return d.toLocaleDateString('pt-BR'); }

  // coleta itens abertos por tipo ('entrada' para receber, 'saida' para pagar)
  function coletar(tipoAlvo){
    const fg    = readFG();
    const lcs   = Array.isArray(fg.lancamentos)?fg.lancamentos:[];
    const prcs  = Array.isArray(fg.parcelas)?fg.parcelas:[];
    const byL   = indexParcelas(prcs);

    /** @type {Array<{dt:Date, nm:string, vl:number, key:string}>} */
    const itens = [];

    function pushItem(obj, tipoLanc, nmBase){
      // só do tipo que queremos
      const t = String(tipoLanc||'').toLowerCase();
      if (t !== tipoAlvo) return;

      // ignorar pagos
      if (IS_PAGO(obj.status) || !!obj.dataPagamentoISO) return;

      // data de vencimento dentro da janela
      const dv = getVencimento(obj);
      if (!dv) return;
      const d0 = new Date(dv.getFullYear(), dv.getMonth(), dv.getDate());
      if (d0 < HOJE0 || d0 > FIM) return;

      const v = val(obj.valor || obj.valorParcela || obj.valorPrevisto);
      const nm = obj?.descricao || nmBase || 'Lançamento';
      itens.push({ dt:d0, nm:String(nm), vl:v, key:(obj.id ? String(obj.id) : (nm+toISOdate(d0))) });
    }

    lcs.forEach(l=>{
      const t = String(l?.tipo||'').toLowerCase(); // entrada | saida | transferencia
      if (t!=='entrada' && t!=='saida') return;

      const parts = byL.get(String(l.id)) || [];
      if (parts.length){
        parts.forEach(p=>{
          // deixa claro número da parcela, se houver
          const parcelaTxt = (p?.numeroParcela && p?.totalParcelas)
            ? `${nomeLanc(l)} (${p.numeroParcela}/${p.totalParcelas})`
            : nomeLanc(l);
          pushItem(p, t, parcelaTxt);
        });
      } else {
        pushItem(l, t, nomeLanc(l));
      }
    });

    // ordena por data, depois nome
    itens.sort((a,b)=> (a.dt - b.dt) || a.nm.localeCompare(b.nm));
    return itens;
  }

  function render(){
    const ulP = document.getElementById(UL_PAGAR);
    const ulR = document.getElementById(UL_RECEBER);
    if (!ulP && !ulR) return;

    const pagar   = coletar('saida');
    const receber = coletar('entrada');

    if (ulP){
      ulP.innerHTML = '';
      if (!pagar.length){
        ulP.innerHTML = '<li>Sem contas a pagar no período</li>';
      } else {
        pagar.slice(0, 10).forEach(it=>{
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="linha">
              <span class="dt">${br(it.dt)}</span>
              <span class="nm">— ${it.nm}</span>
            </div>
            <strong class="vl neg">R$ ${fmtBR(it.vl)}</strong>
          `;
          ulP.appendChild(li);
        });
      }
    }

    if (ulR){
      ulR.innerHTML = '';
      if (!receber.length){
        ulR.innerHTML = '<li>Sem contas a receber no período</li>';
      } else {
        receber.slice(0, 10).forEach(it=>{
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="linha">
              <span class="dt">${br(it.dt)}</span>
              <span class="nm">— ${it.nm}</span>
            </div>
            <strong class="vl">R$ ${fmtBR(it.vl)}</strong>
          `;
          ulR.appendChild(li);
        });
      }
    }

    // atualiza ícones (caso o bloco tenha sido inserido depois)
    try { window.lucide?.createIcons?.(); } catch {}
  }

  // boot + atualizações
  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('storage', (e)=>{
    const k = String(e.key||'');
    if (k.includes('financeiroGlobal')) render();
  });
  setInterval(render, 15000);

  // expo opcional
  window.__refreshContas15 = render;
})();
// ==== LEADS PARA RETORNO — lista ordenada por data de retorno (clicável) ====
(function leadsParaRetorno(){
  const TBL_ID = 'tabelaRetornos';

  // Helpers LS
  const LS = (k, fb=[]) => { try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };
  const hoje0 = (()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })();

  // Normalizadores
  const norm = (s)=> String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const isArchived = (ld)=>{
    const s = norm(ld?.status);
    if (s.includes('arquiv') || s.includes('cancel') || s.includes('finaliz')) return true;
    if (ld?.arquivado || ld?.archived) return true;
    return false;
  };
  const isConverted = (ld)=>{
    const s = norm(ld?.status);
    return ld?.virouEvento===true || !!ld?.eventoId || s.includes('evento') || s.includes('fech') || s.includes('aceit') || s.includes('convert');
  };

  // Data de retorno (diversos nomes aceitos)
  function parseRetorno(ld){
    const cand = ld?.proximoContato || ld?.retornoEm || ld?.retorno || ld?.followUp || ld?.proximo_contato || ld?.nextContact;
    if (!cand) return null;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(String(cand))){
      const [dd,mm,aa] = String(cand).slice(0,10).split('/');
      const d = new Date(+aa, +mm-1, +dd);
      return isNaN(d) ? null : d;
    }
    const d = new Date(cand);
    return isNaN(d) ? null : d;
  }

  // Nome/Evento/Local/Convidados
  const nomeLead   = (ld)=> ld?.nome || ld?.cliente || ld?.contato || '—';
  const eventoLead = (ld)=> {
    const tipo = ld?.tipoEvento || ld?.evento || '';
    const data = ld?.dataEvento || ld?.eventoData || '';
    return [tipo, data].filter(Boolean).join(' • ') || (tipo || '—');
  };
  const localLead  = (ld)=> ld?.local || ld?.local_evento || ld?.endereco || '—';
  const convLead   = (ld)=> {
    const v = ld?.qtd ?? ld?.qtdConvidados ?? ld?.convidados ?? ld?.quantidade ?? null;
    return (v === 0 || v) ? String(v) : '—';
  };

  // Visualizações por lead:
  //  - tenta 'propostas' (cada proposta com .leadId, .visualizacoes, .ultimaVisualizacao / .lastViewAt)
  //  - cai para campos do próprio lead, se existirem
  function getViewsInfo(leadId){
    const props = LS('propostas', []);
    let total = 0;
    let last  = null;
    if (Array.isArray(props) && props.length){
      props.filter(p => String(p?.leadId) === String(leadId)).forEach(p=>{
        const v = Number(p?.visualizacoes||0) || 0;
        total += v;
        const rawLast = p?.ultimaVisualizacao || p?.lastViewAt || p?.last_view_at;
        if (rawLast){
          const dt = new Date(rawLast);
          if (!isNaN(dt)) last = (!last || dt>last) ? dt : last;
        }
      });
    }
    // fallback: campos no lead
    if (total === 0){
      const leads = LS('leads', []);
      const L = leads.find(l => String(l.id) === String(leadId));
      const v = Number(L?.visualizacoes||L?.views||0) || 0;
      total = v;
      const rawLast = L?.ultimaVisualizacao || L?.lastViewAt || L?.ultViz;
      if (rawLast){ const dt = new Date(rawLast); if (!isNaN(dt)) last = dt; }
    }
    return { total, last };
  }

  // Monta lista
  function coletar(){
    const leads = LS('leads', []);
    /** @type {Array<{id:string, retorno:Date, cliente:string, evento:string, local:string, convidados:string, views:number, last:Date|null}>} */
    const arr = [];
    (leads||[]).forEach(ld=>{
      if (isArchived(ld) || isConverted(ld)) return;
      const ret = parseRetorno(ld);
      if (!ret) return; // só com retorno definido
      const cliente = nomeLead(ld);
      const evento  = eventoLead(ld);
      const local   = localLead(ld);
      const conv    = convLead(ld);
      const { total, last } = getViewsInfo(ld?.id);
      arr.push({
        id: String(ld?.id ?? ''),
        retorno: new Date(ret.getFullYear(), ret.getMonth(), ret.getDate()),
        cliente, evento, local,
        convidados: conv,
        views: total,
        last
      });
    });
    // Ordena por data de retorno asc (mais próxima/past due no topo)
    arr.sort((a,b)=> a.retorno - b.retorno || a.cliente.localeCompare(b.cliente));
    return arr;
  }

  function brDate(d){
    if (!d) return '—';
    if (d instanceof Date && !isNaN(d)) return d.toLocaleDateString('pt-BR');
    const dt = new Date(d); return isNaN(dt) ? '—' : dt.toLocaleDateString('pt-BR');
  }
  function brDateTime(d){
    if (!d) return '—';
    if (d instanceof Date && !isNaN(d)) return d.toLocaleString('pt-BR');
    const dt = new Date(d); return isNaN(dt) ? '—' : dt.toLocaleString('pt-BR');
  }

  function render(){
    const tbl = document.getElementById(TBL_ID);
    if (!tbl) return;
    const tbody = tbl.tBodies?.[0] || tbl.querySelector('tbody');
    if (!tbody) return;

    const items = coletar();
    tbody.innerHTML = '';

    if (!items.length){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7">Sem leads com retorno agendado.</td>`;
      tbody.appendChild(tr);
      return;
    }

    items.slice(0, 15).forEach(it=>{
      const atrasado = it.retorno < hoje0;
      const tr = document.createElement('tr');
      tr.className = atrasado ? 'is-overdue' : '';
      tr.innerHTML = `
        <td>${brDate(it.retorno)}</td>
        <td>${it.cliente}</td>
        <td>${it.evento}</td>
        <td>${it.local}</td>
        <td style="text-align:right">${it.convidados}</td>
        <td style="text-align:right">${it.views}</td>
        <td>${brDateTime(it.last)}</td>
      `;
    tr.style.cursor = 'pointer';
tr.addEventListener('click', ()=>{
  // Preferir abrir o orçamento **existente** (se houver) desse lead
  try {
    const leadId = String(it.id || '');
    const props = JSON.parse(localStorage.getItem('propostas') || '[]') || [];

    // Tenta casar por campos comuns: leadId | lead_id | clienteLeadId
    const match = props.find(p => {
      const pid = String(p?.leadId || p?.lead_id || p?.clienteLeadId || '');
      return pid && pid === leadId;
    });

    if (match && match.id) {
      // Já existe proposta → abre diretamente o detalhado por ID
      window.location.href = `orcamento-detalhado.html?id=${encodeURIComponent(match.id)}`;
      return;
    }

    // Sem proposta existente → abre a tela detalhada passando o leadId,
    // para que a própria página pré-preencha a partir do lead.
    window.location.href = `orcamento-detalhado.html?leadId=${encodeURIComponent(leadId)}`;
  } catch {
    // fallback simples
    window.location.href = `orcamento-detalhado.html?leadId=${encodeURIComponent(it.id)}`;
  }
});

      tbody.appendChild(tr);
    });
  }

  // estilos leves para vencido
  (function injectCSS(){
    const css = `
      #${TBL_ID}.tabela-min tr.is-overdue td { color:#8b2f2f; }
      #${TBL_ID}.tabela-min tr:hover { background: rgba(0,0,0,.03); }
    `;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  })();

  // Boot + updates
  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('storage', (e)=>{
    const k = String(e.key||'');
    if (k.includes('leads') || k.includes('propostas')) render();
  });
  setInterval(render, 15000);

  // expo
  window.__refreshRetornos = render;
})();

// ========= Tarefas dos Eventos — vencidas por evento (clicável) =========
(function tarefasEventosVencidas(){
  const ul = document.getElementById('listaTarefas');
  if (!ul) return;

  // helpers de leitura
  const LS = (k, fb=[]) => { try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };
  const hoje0 = (()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })();

  // normaliza "concluída?"
  const isDone = (t) => {
    const s = String(t?.status || '').toLowerCase();
    if (t?.concluida === true || t?.done === true || s.includes('concl') || s.includes('feito')) return true;
    return false;
  };
  // normaliza "cancelada?"
  const isCancel = (t) => {
    const s = String(t?.status || '').toLowerCase();
    return s.includes('cancel');
  };
  // pega data de prazo/vencimento
  const parsePrazo = (t) => {
    const cand = t?.prazo || t?.dataLimite || t?.vencimentoISO || t?.dueDate || t?.dataPrevista;
    if (!cand) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(cand))) {
      const [dd,mm,aa] = String(cand).split('/');
      const d = new Date(+aa, +mm-1, +dd);
      return isNaN(d) ? null : d;
    }
    const d = new Date(cand);
    return isNaN(d) ? null : d;
  };

  // fontes possíveis
  const tarefas = []
    .concat(LS('checklist', []), LS('checklists', []), LS('tarefas', []), LS('tarefasEventos', []))
    .filter(Boolean);

  // agrupa vencidas por evento
  const map = new Map(); // eventoId -> { id, nome, data, count }
  const eventos = LS('eventos', []);
  const getEvt = (id) => eventos.find(e => String(e.id||e.eventoId||'') === String(id)) || null;
  const nomeEvt = (e) => e?.nome || e?.titulo || e?.nomeEvento || 'Evento';
  const dataEvt = (e) => e?.data || e?.dataEvento || e?.inicio || e?.start || '';

  (tarefas || []).forEach(t => {
    const evId = t?.eventoId || t?.idEvento || t?.eventId || t?.refEvento;
    if (!evId) return;

    if (isCancel(t) || isDone(t)) return;
    const prazo = parsePrazo(t);
    if (!prazo) return;             // só contamos com prazo definido
    if (prazo >= hoje0) return;     // só vencidas

    const key = String(evId);
    if (!map.has(key)) {
      const ev = getEvt(evId);
      map.set(key, {
        id: key,
        nome: nomeEvt(ev),
        data: dataEvt(ev),
        count: 0
      });
    }
    map.get(key).count += 1;
  });

  // render
  const itens = Array.from(map.values())
    .filter(x => x.count > 0)
    // ordena: mais vencidas primeiro, depois data do evento
    .sort((a,b) => (b.count - a.count) || String(a.data).localeCompare(String(b.data)));

  ul.innerHTML = '';
  if (!itens.length) {
    ul.innerHTML = '<li>Sem tarefas vencidas de checklist</li>';
    return;
  }

  itens.slice(0, 8).forEach(ev => {
    const li = document.createElement('li');
    li.className = 'link-lista'; // opcional: use esta classe pra aplicar estilo “clicável”
    li.dataset.eventoId = ev.id;
    const sub = ev.data ? ` • ${String(ev.data).slice(0,10).split('-').reverse().join('/')}` : '';
    li.innerHTML = `
      <div class="ttl">${ev.nome}${sub}</div>
      <div class="chip chip-warn" aria-label="tarefas vencidas">${ev.count}</div>
    `;
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => {
      // abre checklist do evento
      window.location.href = `checklist.html?eventoId=${encodeURIComponent(ev.id)}`;
    });
    ul.appendChild(li);
  });
})();

// ====== TAREFAS DOS EVENTOS (Checklist vencidas) ======
(function tarefasEventosAtrasadas(){
  const KEY_EVENTOS = "eventos";

  // Pega data ISO do evento (aceita vários campos)
  function eventDateISO(ev){
    const raw = ev?.data || ev?.dataEvento || ev?.dataISO || ev?.inicio || ev?.start;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d) ? null : new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  }

  function nomeEvento(ev){
    return ev?.nomeEvento || ev?.titulo || ev?.nome || ev?.cliente || ev?.evento || ("Evento " + (ev?.id||""));
  }

  // varre localStorage por keys "checklist:event:<id>"
  function lerEstadosChecklist(){
    const out = [];
    for (const k of Object.keys(localStorage)){
      if (!k.startsWith("checklist:event:")) continue;
      try{
        const json = JSON.parse(localStorage.getItem(k)||"null");
        if (json && Array.isArray(json.itens)) out.push({ id: k.split(":").pop(), itens: json.itens });
      }catch{}
    }
    return out;
  }

  // monta lista de vencidos
  function computeVencidos(){
    const eventos = (()=>{
      try{ return JSON.parse(localStorage.getItem(KEY_EVENTOS)||"[]") || []; }catch{ return []; }
    })();
    const mapEv = new Map(eventos.map(e => [String(e.id), e]));

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const vencidos = [];

    for (const ec of lerEstadosChecklist()){
      const ev = mapEv.get(String(ec.id));
      if (!ev) continue;
      const dataEvISO = eventDateISO(ev);
      if (!dataEvISO) continue;
      const base = new Date(dataEvISO); base.setHours(0,0,0,0);

      for (const it of ec.itens||[]){
        if (it?.done) continue;                          // já concluído
        if (typeof it?.offsetDiasAntes !== "number") continue; // sem prazo relativo
        const d = new Date(base);
        d.setDate(d.getDate() - it.offsetDiasAntes);     // data do vencimento
        if (d < hoje){
          vencidos.push({
            eventoId: ec.id,
            eventoNome: nomeEvento(ev),
            texto: String(it.texto||"-"),
            quando: d
          });
        }
      }
    }

    // mais antigos primeiro
    vencidos.sort((a,b)=> a.quando - b.quando);
    return vencidos;
  }

  function render(){
    const ul = document.getElementById("listaTarefas");
    if (!ul) return;

    const itens = computeVencidos();
    ul.innerHTML = "";

    if (!itens.length){
      ul.innerHTML = "<li>Sem tarefas atrasadas</li>";
      return;
    }

    // mostra no máximo 6
    const max = 6;
    itens.slice(0, max).forEach(t => {
      const li = document.createElement("li");
      // deixei sem link (apenas visual). Se quiser linkar ao checklist: use <a href="checklist.html?id=...">
      li.innerHTML = `
        <div class="ttl">${t.texto}</div>
        <div class="txt">Evento: ${t.eventoNome} • Venceu em ${t.quando.toLocaleDateString("pt-BR")}</div>
      `;
      ul.appendChild(li);
    });

    if (itens.length > max){
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = `+ ${itens.length - max} tarefa(s) atrasada(s)`;
      ul.appendChild(li);
    }
  }

  // primeira pintura
  render();

  // reagir quando algo de checklist/evento mudar em outra tela
  window.addEventListener("storage", (e)=>{
    const k = String(e.key||"");
    if (k.startsWith("checklist:event:") || k === "eventos") {
      try { render(); } catch {}
    }
  });

  // expor se quiser forçar recálculo a partir de outra tela
  window.__refreshTarefasEventos = render;
})();

  // ========= ALERTAS
  function IS_PAGO(st){ return ['pago','recebido','baixado','quitado','liquidado','parcial'].includes(String(st||'').toLowerCase()); }

  function computeAlertas(){
    const hoje = new Date();
    const today0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const addDias = (d, n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
    const fimJanela = addDias(today0, 7);
    const read = (k, d)=>{ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):d; }catch{ return d; } };
    const parseISO = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

    // 1) RETORNOS VENCIDOS
    const agenda = read("agenda", []);
    const isPendente = (st)=> { const s = String(st||"").toLowerCase(); return !s.includes("cancel") && !s.includes("feito") && !s.includes("concl"); };

    const retornosAgenda = (agenda||[]).filter(a=>{
      const tipo = String(a.tipo||a.categoria||"").toLowerCase();
      const d = parseISO(a.data || a.dataISO || a.dataPrevista);
      return d && d < today0 && isPendente(a.status) && (tipo.includes("retorno") || tipo.includes("follow") || tipo.includes("contato"));
    }).length;

    const leadsArr = read("leads", []);
    const retornosLeads = (leadsArr||[]).filter(ld=>{
      const status = String(ld?.status||"").toLowerCase();
      const arquivado = status.includes("arquiv") || status.includes("cancel");
      const convertido = (ld?.virouEvento===true) || !!ld?.eventoId || status.includes("evento") || status.includes("fech");
      const cand = ld.proximoContato || ld.retornoEm || ld.retorno || ld.followUp || ld.proximo_contato;
      const d = parseISO(cand);
      return d && d < today0 && !arquivado && !convertido;
    }).length;

    const retornoVenc = retornosAgenda + retornosLeads;

    // 2) PRÓXIMA DEGUSTAÇÃO
    const deguIt = (agenda||[]).map(a=>{
      const tipo = String(a.tipo||a.categoria||"").toLowerCase();
      const d = parseISO(a.data || a.dataISO);
      const cancel = String(a.status||"").toLowerCase().includes("cancel");
      return (!cancel && tipo.includes("degust") && d) ? { ...a, _dt: d } : null;
    }).filter(Boolean).filter(a => a._dt >= today0).sort((a,b)=> a._dt - b._dt);

    let proximaDegData = null;
    let proximaDegQtd  = 0;
    if (deguIt.length){
      proximaDegData = deguIt[0]._dt;
      const iso = proximaDegData.toISOString().slice(0,10);
      proximaDegQtd = deguIt.filter(a => (a._dt.toISOString().slice(0,10) === iso)).length;
    }

    // 3) FINANCEIRO: SAÍDAS — vencidos / a vencer (7 dias)
    const fg = read("financeiroGlobal", {});
    const lancs = Array.isArray(fg.lancamentos)?fg.lancamentos:[];
    const parcelas = Array.isArray(fg.parcelas)?fg.parcelas:[];
    const byLanc = new Map();
    (parcelas||[]).forEach(p=>{
      const k = String(p.lancamentoId||''); if(!k) return;
      (byLanc.get(k)||byLanc.set(k,[]).get(k)).push(p);
    });

    let vencidos=0, aVencer=0, posEvento=0;
    function somaTitulo(obj){
      const pago = IS_PAGO(obj.status) || !!obj.dataPagamentoISO;
      const vRaw = obj.vencimentoISO || obj.dataVencimentoISO || obj.dataVencimento || obj.data || obj.dataCompetencia;
      const venc = parseISO(vRaw);
      if (!venc || pago) return;
      if (venc < today0) vencidos++;
      else if (venc >= today0 && venc <= fimJanela) aVencer++;
    }

    (lancs||[]).forEach(l=>{
      const tipoLanc = String(l?.tipo||'').toLowerCase();
      if (tipoLanc !== 'saida') return;
      const parts = byLanc.get(String(l.id))||[];
      if (parts.length){ parts.forEach(somaTitulo); } else { somaTitulo(l); }
    });

    // 4) PÓS-EVENTO PENDENTE
    const arrEv = read("eventos", []);
    (lancs||[]).forEach(l=>{
      const tipoLanc = String(l?.tipo||'').toLowerCase();
      if (tipoLanc !== 'entrada') return;
      const parts = byLanc.get(String(l.id))||[];
      const ev = arrEv.find(e => String(e.id||e.eventoId||"")===String(l.eventoId||""));
      const raw = ev?.data || ev?.dataEvento || ev?.start || ev?.inicio;
      const dEv = raw ? parseISO(raw) : null;
      const temAberto = (parts.length ? parts : [l]).some(o=>{ const pago = IS_PAGO(o.status) || !!o.dataPagamentoISO; return !pago; });
      if (dEv && dEv < today0 && temAberto) posEvento++;
    });

    return { retornoVenc, proximaDeg: proximaDegQtd, proximaDegData, vencidos, aVencer, posEvento };
  }

  function renderAlertas(){
    const Araw = computeAlertas() || {};
    const A = {
      retornoVenc:   Math.max(0, Number(Araw.retornoVenc || 0)),
      proximaDeg:    Math.max(0, Number(Araw.proximaDeg  || 0)),
      vencidos:      Math.max(0, Number(Araw.vencidos    || 0)),
      aVencer:       Math.max(0, Number(Araw.aVencer     || 0)),
      posEvento:     Math.max(0, Number(Araw.posEvento   || 0)),
      proximaDegData: Araw.proximaDegData
    };

    if (A.proximaDegData && !(A.proximaDegData instanceof Date)) {
      const d = new Date(A.proximaDegData);
      A.proximaDegData = isNaN(d.getTime()) ? null : d;
    }

    const spanDeg = document.getElementById("txtProximaDeg");
    if (spanDeg){
      if (A.proximaDegData){ spanDeg.textContent = A.proximaDegData.toLocaleDateString("pt-BR"); spanDeg.parentElement?.classList.remove("muted"); }
      else { spanDeg.textContent = "—"; spanDeg.parentElement?.classList.add("muted"); }
    }

    (function(){
      const cardDeg = document.getElementById("al-degust");
      if (!cardDeg) return;
      let url = "degustacoes-disponiveis.html?tipo=degustacao";
      if (A.proximaDegData){
        const iso = A.proximaDegData.toISOString().slice(0,10);
        url = `degustacoes-disponiveis.html?tipo=degustacao&data=${iso}`;
      }
      if (cardDeg.tagName === "A"){
        cardDeg.href = url;
        cardDeg.title = A.proximaDegData && spanDeg?.textContent ? `Degustação em ${spanDeg.textContent}` : "Degustações";
      } else {
        cardDeg.style.cursor = "pointer";
        cardDeg.onclick = () => { window.location.href = url; };
      }
    })();

    const setPill = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
    const setZeroState = (cardId, val) => {
      const card = document.getElementById(cardId);
      if (!card) return;
      if (Number(val) === 0) card.classList.add("zero"); else card.classList.remove("zero");
    };

    setPill("ctaRetornos", A.retornoVenc);
    setPill("ctaDegust",   A.proximaDeg);
    setPill("ctaVencidos", A.vencidos);
    setPill("ctaAVencer",  A.aVencer);
    setPill("ctaPosEvento",A.posEvento);

    setZeroState("al-retornos", A.retornoVenc);
    setZeroState("al-degust",   A.proximaDeg);
    setZeroState("al-vencidos", A.vencidos);
    setZeroState("al-avencer",  A.aVencer);
    setZeroState("al-posevento",A.posEvento);

   
    try { applyHideZeroAlerts?.(); } catch {}
    try { window.lucide?.createIcons?.(); } catch {}
  }
// ========= BADGE DO SINO (somente notificações não lidas) =========
// Convenções de armazenamento (aceitamos múltiplos nomes):
//  - "notif:internas" | "notificacoesInternas"
//  - "notif:externas" | "notificacoesExternas"
// Cada item deve ter: { id, ... , lida: true|false }  (se 'lida' faltar, tratamos como NÃO lida)

(function setupBellBadge(){
  const LS = (k, fb=[]) => { try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };

  function countUnreadFrom(arr){
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((acc, it) => acc + (it && it.lida ? 0 : 1), 0);
  }

  function getUnreadTotal(){
    // suportamos chaves novas e legadas
    const internas = LS('notif:internas', LS('notificacoesInternas', []));
    const externas = LS('notif:externas', LS('notificacoesExternas', []));
    return countUnreadFrom(internas) + countUnreadFrom(externas);
  }

  function renderBell(){
    const el = document.getElementById('badgeNotif');
    if (!el) return;
    const n = Math.max(0, getUnreadTotal());
    el.textContent = String(n);
    // Se quiser ocultar quando 0: el.hidden = n === 0;
  }

  // Clique no sino não faz nada (só visual)
  (function bindBellClickNoop(){
    const btn = document.querySelector('.acoes-topo .btn-icone[title="Notificações"]')
           || document.querySelector('.acoes-topo .btn-icone[aria-label="Notificações"]');
    if (!btn) return;
    btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); /* noop */ });
  })();

  // Primeira pintura
  renderBell();

  // Atualiza quando a tela de Notificações marcar algo como lido:
  //  • Ela deve fazer: localStorage.setItem('notif:ping', Date.now().toString());
  //  • Ou salvar/atualizar as listas (internas/externas)
  window.addEventListener('storage', (e)=>{
    const k = String(e.key||'');
    if (!k) return;
    if (k === 'notif:ping' ||
        k === 'notif:internas' || k === 'notif:externas' ||
        k === 'notificacoesInternas' || k === 'notificacoesExternas') {
      try { renderBell(); } catch {}
    }
  });

  // Opcional: refresh leve periódico (caso outra aba mude sem 'storage')
  setInterval(()=>{ try { renderBell(); } catch {} }, 15000);

  // Expo pequena p/ outras telas forçarem o redraw
  window.__refreshBellBadge = renderBell;
})();

  const HIDE_ZERO_KEY = "dashboard:hideZeroAlerts";
  function applyHideZeroAlerts(){
    const hide = localStorage.getItem(HIDE_ZERO_KEY) === "1";
    const cb = document.getElementById("cbOcultarZeros");
    if (cb) cb.checked = hide;

    const cards = [ "al-retornos","al-degust","al-vencidos","al-avencer","al-posevento" ];
    let visiveis = 0;
    cards.forEach(id=>{
      const el = document.getElementById(id);
      if (!el) return;
      const isZero = el.classList.contains("zero");
      const deveOcultar = hide && isZero;
      el.hidden = !!deveOcultar;
      if (!deveOcultar) visiveis++;
    });

    const msg = document.getElementById("msgSemAlertas");
    if (msg) msg.hidden = visiveis !== 0;
  }
  function bindHideZeroToggle(){
    const cb = document.getElementById("cbOcultarZeros");
    if (!cb) return;
    cb.addEventListener("change", ()=>{
      localStorage.setItem(HIDE_ZERO_KEY, cb.checked ? "1" : "0");
      applyHideZeroAlerts();
    });
  }
// ========= Função global: marcar notificação como lida + ping =========
window.marcarNotificacaoComoLida = function(tipo, id) {
  // tipo: 'interna' | 'externa'
  const keyNew = (tipo === 'interna') ? 'notif:internas' : 'notif:externas';
  const keyOld = (tipo === 'interna') ? 'notificacoesInternas' : 'notificacoesExternas';

  const read  = (k, fb=[]) => { try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };
  const write = (k,v)      =>  localStorage.setItem(k, JSON.stringify(v));

  // carrega lista (aceita chave nova e legada)
  let lista = read(keyNew, read(keyOld, []));
  if (!Array.isArray(lista)) lista = [];

  // marca o item como lido
 lista = lista.map(n => String(n?.id) === String(id) ? ({ ...n, lida: true }) : n);


  // salva de volta (preferindo a chave nova)
  write(keyNew, lista);

  // 🔔 aqui dispara o ping que o dashboard escuta (é isso que você perguntou “onde colar”)
  localStorage.setItem('notif:ping', Date.now().toString());
};

  // Primeira renderização e auto-refresh
  bindHideZeroToggle();
  renderAlertas();
  applyHideZeroAlerts();
  setInterval(renderAlertas, 60000);
  // ==== [M26·UX] Tooltips e microanimação de contadores de alertas ====
// Observa as pílulas de contagem e anima quando mudarem; também injeta tooltips
(function setupAlertPillsUX(){
  const IDS = {
    vencidos : { pill: '#ctaVencidos',  card: '#al-vencidos',
      tip: 'Tarefas/configurações de evento vencidas (data de vencimento já passou).' },
    aVencer  : { pill: '#ctaAVencer',   card: '#al-avencer',
      tip: 'Contador “A vencer (7 dias)” usa janela ROLLING: hoje até hoje+7 (inclusive), independentemente do mês.' },
    retornos : { pill: '#ctaRetornos',  card: '#al-retornos',
      tip: 'Leads com “Próximo retorno” vencido ou para hoje.' },
     posEv    : { pill: '#ctaPosEvento', card: '#al-posevento',
      tip: 'Pendências pós-evento registradas (checklist após a data do evento).' },
    degust   : { pill: '#ctaDegust',    card: '#al-degust',
      tip: 'Degustações e visitas de prova agendadas para o período curto.' }
  };

  // Aplica tooltip no card (container) e no número (melhor hit area)
  function applyTooltip(cardSel, pillSel, tip){
    try{
      const c = document.querySelector(cardSel);
      const p = document.querySelector(pillSel);
      if (c && !c.hasAttribute('data-tip')) c.setAttribute('data-tip', tip);
      if (p && !p.hasAttribute('data-tip')) p.setAttribute('data-tip', tip);
    }catch{}
  }

  // Normaliza extrair número da pílula
  const getNum = (el) => {
    if (!el) return null;
    const m = String(el.textContent||'').match(/-?\d+/);
    return m ? Number(m[0]) : null;
  };

  // Aplica classe de animação conforme subida/descida
  function bump(el, dir){
    if (!el) return;
    const cls = (dir>0) ? 'count-bump--up' : 'count-bump--down';
    el.classList.remove('count-bump--up','count-bump--down');
    // força reflow para reiniciar animação
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight;
    el.classList.add(cls);
    el.addEventListener('animationend', ()=> el.classList.remove(cls), { once:true });
  }

  // Observa mudanças de texto (renderAlertas atualiza a cada 60s + storage ping)
  // ver chamadas a renderAlertas e setInterval no arquivo (bloco principal do dashboard). 
  const targets = [];
  for (const k of Object.keys(IDS)){
    const { pill, card, tip } = IDS[k];
    const pel = document.querySelector(pill);
    if (tip) applyTooltip(card, pill, tip);
    if (pel) {
      pel.dataset.prevCount = getNum(pel);
      targets.push(pel);
    }
  }
  if (!targets.length) return;

  const obs = new MutationObserver((muts)=>{
    for (const m of muts){
      if (m.type !== 'childList' && m.type !== 'characterData') continue;
      const el = (m.target.nodeType===3 ? m.target.parentElement : m.target);
      const pill = el?.closest && targets.find(t => t === el || t.contains(el));
      if (!pill) continue;
      const prev = (pill.dataset.prevCount == null) ? null : Number(pill.dataset.prevCount);
      const cur  = getNum(pill);
      if (cur == null || prev == null || cur === prev) { pill.dataset.prevCount = cur; continue; }
      bump(pill, cur - prev);
      pill.dataset.prevCount = cur;
    }
  });

  // observar texto interno
  targets.forEach(p => {
    obs.observe(p, { childList: true, characterData: true, subtree: true });
  });

  // também reaplica tooltips após cada repaint dos ícones (caso cards re-renderizem)
  try{ window.addEventListener('storage', (e)=> {
    const k = String(e.key||'');
    if (k.includes('financeiroGlobal') || k.includes('leads') || k.includes('eventos')){
      for (const key of Object.keys(IDS)){
        const { card, pill, tip } = IDS[key];
        applyTooltip(card, pill, tip);
      }
    }
  }); }catch{}

})();

  window.addEventListener("storage", (e)=>{
    const k=String(e.key||'');
    if (k.includes("financeiroGlobal") || k.includes("leads") || k.includes("eventos")) renderAlertas();
  });
  // ==== Alinha saldos e animação
// ==== Alinha saldos e animação (assíncrono para não travar a UI)
(function(){
  const run = () => {
    try {
      const g0 = readFG();
      ensureFgContasBaseline(g0);
      recalcSaldos(g0);
      // gravação em lote, mas com pequeno atraso para não colidir com o paint
      setTimeout(()=>{ try{ writeFG(g0); }catch(e){ console.warn(e); } }, 30);
    } catch(e){}
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 1200 });
  } else {
    setTimeout(run, 60);
  }
})();


$$(".card").forEach(c=> c.classList.add("aparecer"));
window.__lucideRefresh?.();




// ============================
// ADIÇÕES NÃO-DESTRUTIVAS (SAFE)
// ============================
(function(){
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  function readLS(k, fb){ try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(fb)); } catch { return fb; } }
  function monthKey(d=new Date()){ return d.toISOString().slice(0,7); }

  function fixLeadsFinalizadosDoMes(){
    const leads = readLS('leads', []);
    const mk = monthKey(new Date());
    const count = leads.filter(l => {
      const st = (l.status || '').toLowerCase();
      if (st !== 'arquivado') return false;
      const dataArq = String(l.dataArquivamento || '')
        || (Array.isArray(l.historico) ? (l.historico.find(h => /arquiv/i.test(h?.observacao||''))?.dataISO || '') : '');
      return (dataArq || '').startsWith(mk);
    }).length;

    const slots = [
      '#leadsFinalizados',
      '#kpiLeadsFinalizados',
      '[data-kpi="leads-finalizados"]',
      '#cardLeadsFinalizados .valor',
      '#cardLeads .finalizados',
      '#leadsFinalizadosValor'
    ].map(sel => $(sel)).filter(Boolean);

    if (slots.length) slots.forEach(el => el.textContent = String(count));
  }

  function bindExtraCards(){
    const map = {
      'retornos-vencidos':     'lista-propostas.html?tab=retornos&filtro=vencidos',
      'retornos-hoje':         'lista-propostas.html?tab=retornos&filtro=hoje',
      'degustacoes':           'degustacoes.html',
      'pagamentos':            'financeiro-lancamentos.html?tab=receitas',
      'pos-evento':            'pos-evento.html',
      'orcamentos-enviados':   'lista-propostas.html?tab=enviados'
    };

    $$('[data-card]').forEach(card => {
      const key = card.getAttribute('data-card');
      if (!map[key]) return;
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => { window.location.href = map[key]; });
    });
  }

  function popularSelectEventoRapido(){
    const el = $('#fEvento') || $('#lrEvento') || $('#fastEvento') || null;
    if (!el) return;
    let eventos = readLS('eventos', []);
    if (!Array.isArray(eventos) || !eventos.length) {
      eventos = readLS('eventosPagos', []);
    }
    if (!Array.isArray(eventos)) eventos = [];
    const opt = e => {
      const id   = e.id || e.eventoId || e.uuid || e.codigo || '';
      const nome = e.nome || e.titulo || e.cliente || 'Evento';
      const data = e.data || e.dataEvento || e.dataISO || '';
      const label = data ? `${nome} — ${data}` : nome;
      return `<option value="${String(id)}">${label}</option>`;
    };
    const placeholder = `<option value="">(Selecione o evento)</option>`;
    el.innerHTML = placeholder + eventos.map(opt).join('');
  }

  function atualizarCardOrcamentos(){
    const slotQtd = $('#numOrcEnviados');
    const slotVis = $('#numVisOrc');
    if (!slotQtd || !slotVis) return;

    let propostas = readLS('propostas', []);
    let enviados = 0, views = 0;

    if (Array.isArray(propostas) && propostas.length){
      enviados = propostas.filter(p => (p.status||'').toLowerCase() === 'enviado').length;
      views    = propostas.reduce((t,p)=> t + (Number(p.visualizacoes||0)||0), 0);
    } else {
      const leads = readLS('leads', []);
      enviados = leads.reduce((t,l)=>{
        const hs = Array.isArray(l.historico) ? l.historico : [];
        const temEnvio = hs.some(h => /proposta\s+enviad/i.test(h?.observacao||''));
        return t + (temEnvio ? 1 : 0);
      }, 0);
      views = Number(localStorage.getItem('propostasViewsTotal') || 0) || 0;
    }

    slotQtd.textContent = String(enviados);
    slotVis.textContent = String(views);
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { fixLeadsFinalizadosDoMes(); } catch(e){}
    try { bindExtraCards(); } catch(e){}
    try { popularSelectEventoRapido(); } catch(e){}
    try { atualizarCardOrcamentos(); } catch(e){}

    // (Compat) Se ainda existirem listas antigas, apenas redireciona também:
    document.getElementById('listaNotifInt')?.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const id = li.getAttribute('data-id');
      window.location.href = `notificacoes.html?tipo=interna&id=${encodeURIComponent(id)}`;
    });

    document.getElementById('listaNotifExt')?.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const id = li.getAttribute('data-id');
      window.location.href = `notificacoes.html?tipo=externa&id=${encodeURIComponent(id)}`;
    });
  });
})();
// ===== Binds do Lançamento Rápido (Tipo/Escopo → recarrega categorias)
(function bindLancamentoRapidoFilters(){
  // dispara a (re)montagem das categorias quando muda o Tipo
  const tipoEl = document.getElementById('fTipo');
  if (tipoEl) {
    tipoEl.addEventListener('change', () => {
      try { fillCategoriasCombined(); } catch {}
    });
  }

  // dispara a (re)montagem das categorias quando muda o Escopo
  const escopoEl = document.getElementById('fEscopo');
  if (escopoEl) {
    escopoEl.addEventListener('change', () => {
      try { fillCategoriasCombined(); } catch {}
    });
  }

  // default ao carregar: EMPRESA + popula categorias
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const esc = document.getElementById('fEscopo');
      if (esc && !esc.value) esc.value = 'empresa';
      if (typeof fillCategoriasCombined === 'function') fillCategoriasCombined();
    } catch {}
  });
})();
// === ETAPA B (Dashboard) — Lançamento Rápido + Re-render ===
// Cole NO FINAL de dashboard.js (depois de definir renderDashboard)

(function wireLancRapidoDashboard(){
  if (window.__wiredLancRapidoDashboard) return;
  window.__wiredLancRapidoDashboard = true;

  // Garante que o modal esteja disponível (não quebra se não existir)
  try { window.FinModal?.ensureModal?.(); } catch {}

// Botão "Lançamento rápido"
document.getElementById('btnLancamentoRapido')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
// marca contexto para o salvamento não herdar evento da URL/LS
window.__lancOrigem = 'dashboard-quick';

  if (window.FinModal?.openNovo) {
    window.FinModal.openNovo({
      preferTipo: 'entrada',
      escopo: 'empresa',
      eventoId: '' // <- força SEM evento
    });
  } else {
    console.warn('[Dashboard] FinModal não carregado.');
  }
});


// Re-render do dashboard ao salvar pelo modal / store mudar
window.addEventListener('finmodal:confirm',  () => {
  try { renderDashboard?.(); } catch {}
  try { window.__lancOrigem = ''; } catch {}
});
window.addEventListener('fin-store-changed', () => {
  try { renderDashboard?.(); } catch {}
});

// (opcional, se seu modal dispara 'finmodal:cancel' ao fechar sem salvar)
window.addEventListener('finmodal:cancel', () => {
  try { window.__lancOrigem = ''; } catch {}
});

})();
/* ===================== FASE D — KPIs + Gráfico (IDs da Carol) ===================== */
/* Este bloco usa localStorage.leads como fonte local (fallback).
   Quando o M36 expuser /leads/metrics, a gente só troca a função de leitura. */

// ---------- Helpers de data ----------
const __isoLocal = (d = new Date()) => {
  // ISO em horário local (sem mudar de dia por causa do fuso)
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const __ym = (d = new Date()) => __isoLocal(d).slice(0, 7); // "YYYY-MM"
const __inYM = (iso, ym) => (typeof iso === 'string' && iso.slice(0, 7) === ym);
const __addMonths = (d, n) => {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + n);
  return nd;
};

// ---------- Leitura segura ----------
const __readLS = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };

// ---------- Normalização de status de lead ----------
function __statusClass(s) {
  const v = String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  // Ganho / vendido
  if (v.includes('ganh') || v.includes('fechad') || v.includes('contrat')) return 'ganho';
  // Em negociação / proposta / em andamento
  if (v.includes('negoci') || v.includes('propost') || v.includes('andament')) return 'negociacao';
  // Finalizados (perdidos/arquivados/cancelados/etc.)
  if (v.includes('perd') || v.includes('arquiv') || v.includes('cancel') || v.includes('inativ') || v.includes('descart')) return 'finalizado';
  // Desconhecido → tratamos como "outros"
  return 'outros';
}

// ---------- KPIs do mês atual ----------
function __calcKpisMes(ym = __ym()) {
  const leads = __readLS('leads', []); // esperado: [{status, dataCriacaoISO, dataFechamentoISO, ...}]
  const doMes = leads.filter(l => __inYM(l?.dataCriacaoISO || l?.createdAt, ym));

  let totalLeadsMes = doMes.length;
  let vendasRealizadas = 0;
  let emNegociacao = 0;
  let finalizados = 0;

  for (const l of doMes) {
    const c = __statusClass(l?.status);
    if (c === 'ganho') vendasRealizadas++;
    else if (c === 'negociacao') emNegociacao++;
    else if (c === 'finalizado') finalizados++;
  }

  return { totalLeadsMes, vendasRealizadas, emNegociacao, finalizados };
}

// ---------- Séries mensais (últimos 6 meses) para o gráfico ----------
function __calcConversaoUltimosMeses(nMeses = 6) {
  const leads = __readLS('leads', []);
  const hoje = new Date();
  const meses = [];

  // Gera labels e janelas "YYYY-MM" do mais antigo → mais recente
  for (let i = nMeses - 1; i >= 0; i--) {
    const d = __addMonths(hoje, -i);
    meses.push(__ym(d));
  }

  const conversao = meses.map(ym => {
    const doMes = leads.filter(l => __inYM(l?.dataCriacaoISO || l?.createdAt, ym));
    const ganhos = doMes.filter(l => __statusClass(l?.status) === 'ganho');
    const taxa = doMes.length ? (ganhos.length / doMes.length) * 100 : 0;
    return Number(taxa.toFixed(2));
  });

  return { meses, conversao };
}

// ---------- Render dos KPIs no DOM (IDs da Carol) ----------
function renderKpisCarol() {
  const ym = __ym();
  const k = __calcKpisMes(ym);

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };

  setTxt('leadsMes', k.totalLeadsMes);
  setTxt('vendasRealizadas', k.vendasRealizadas);
  setTxt('emNegociacao', k.emNegociacao);
  setTxt('leadsFinalizados', k.finalizados);
}

// ---------- Gráfico: Taxa de Conversão (mês a mês) ----------
// Ponte: usa o render único já definido acima
function renderGraficoConversaoCarol(){
  try {
    const leadsLS = (typeof readLS === 'function') ? (readLS('leads',[])||[]) : (JSON.parse(localStorage.getItem('leads') || '[]'));
    renderGraficoConversao(leadsLS);
  } catch {}
}


// ---------- Realtime (entre abas + eventos do app) ----------
function bindRealtimeDashboardCarol() {
  const REFRESH = () => {
    try { renderKpisCarol(); renderGraficoConversaoCarol(); } catch (e) { console.warn(e); }
  };

  // Mudanças relevantes no localStorage
  window.addEventListener('storage', (ev) => {
    if (!ev || !ev.key) return;
    // Se mudar leads (ou alguma chave que seu app use para avisar)
    if (/^leads$|leads:changed|notificationsFeed|eventos/.test(ev.key)) REFRESH();
  });

  // BroadcastChannel entre abas
  try {
    const bc = new BroadcastChannel('mrubuffet');
    bc.onmessage = (e) => {
      const t = e?.data?.type || '';
      if (/^leads:changed$|^fin-store-changed$|^notificationsFeed:ping$/.test(t)) REFRESH();
    };
  } catch {}

  // Eventos customizados que você já usa no app
  document.addEventListener('leads:changed', REFRESH);
  window.addEventListener('fin-store-changed', REFRESH);

  // Primeira atualização
  setTimeout(REFRESH, 60);
}

// ---------- Inicializa (uma vez) ----------
(function initFaseDCarol(){
  try {
    renderKpisCarol();
    renderGraficoConversaoCarol();
    bindRealtimeDashboardCarol();
  } catch (e) {
    console.warn('Fase D (Carol) init falhou:', e);
  }
})();


// === [PATCH] KPIs (fin/metrics) ===========================================
const fmtBRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

async function apiLocal(path, {method='GET', body=null}={}) {
  return new Promise((resolve) => {
    (window.handleRequest||window.handleRequestLocal)(path, { method, body }, (resp)=>resolve(resp));
  });
}

async function atualizarKPIs(range='mes'){
  const r = await apiLocal('/fin/metrics', { method:'GET', body:{ range } });
  if (r?.status!==200) return;

  const { entrada, saida, saldo } = r.data || {};
  const e = $('#kpiEntradaMes .kpi-value b');
  const s = $('#kpiSaidaMes   .kpi-value b');
  const d = $('#kpiSaldoMes   .kpi-value b');
  if (e) e.textContent = fmtBRL.format(entrada||0);
  if (s) s.textContent = fmtBRL.format(saida||0);
  if (d) d.textContent = fmtBRL.format(saldo||0);

  document.dispatchEvent(new CustomEvent('kpi:fin:updated', { detail: r.data }));
}

document.addEventListener('DOMContentLoaded', ()=>atualizarKPIs('mes'));

window.addEventListener('storage', (ev)=>{
  if (ev.key==='financeiroGlobal' || ev.key==='financeiro:ping') {
    atualizarKPIs('mes');
  }
});

try {
  const bc = new BroadcastChannel('kgb:fin');
  bc.onmessage = (ev)=>{
    if (ev?.data==='fg:changed') atualizarKPIs('mes');
  };
} catch {}
// === [/PATCH] ==============================================================


// =================== DASHBOARD LEADS via API (M36) ===================
(function(){
  async function apiGET(url){
    if (window.apiFetch) {
      return await window.apiFetch(url);
    }
    if (window.handleRequest) {
      return await window.handleRequest(url, { method: 'GET' });
    }
    const resp = await fetch(url, { method: 'GET', credentials: 'include' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  }

  function setTextById(id, value){
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = String(value ?? 0);
  }

  // monta/atualiza o gráfico de conversão usando Chart.js
  function renderGraficoConversaoFromApi(grafico){
    try{
      const canvas = document.getElementById('graficoConversao');
      if (!canvas || !window.Chart) return;

      try { __destroyChartInstance(canvas); } catch {}

      const ctx = canvas.getContext('2d');

      const labels = grafico.labels || grafico.meses || [];
      const values = grafico.values || grafico.conversao || grafico.series || [];

      if (!labels.length || !values.length) return;

      window.__grafConv = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Taxa de conversão (%)',
            data: values,
            tension: 0.25,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.parsed.y.toFixed(1)}%`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => v + '%'
              }
            }
          }
        }
      });
    }catch(e){
      console.warn('[Dashboard] gráfico de leads via API falhou, mantendo gráfico antigo.', e);
    }
  }

  async function carregarLeadsDashboardFromApi(){
    let resp;
    try{
      resp = await apiGET('/leads/metrics?range=mes');
    }catch(e){
      console.warn('[Dashboard] /leads/metrics falhou, usando dados locais.', e);
      try { typeof renderKpisCarol === 'function' && renderKpisCarol(); } catch {}
      try { typeof renderGraficoConversaoCarol === 'function' && renderGraficoConversaoCarol(); } catch {}
      return;
    }

    if (!resp) return;

    const k = resp.kpis || resp.metrics || resp;

    const leadsMes         = Number(k.leadsMes         ?? k.totalLeadsMes ?? k.total ?? 0);
    const vendasRealizadas = Number(k.vendasRealizadas ?? k.vendas        ?? k.ganhos ?? 0);
    const emNegociacao     = Number(k.emNegociacao     ?? k.negociacao    ?? k.abertos ?? 0);
    const leadsFinalizados = Number(k.leadsFinalizados ?? k.finalizados   ?? k.arquivados ?? 0);

    setTextById('leadsMes',         leadsMes);
    setTextById('vendasRealizadas', vendasRealizadas);
    setTextById('emNegociacao',     emNegociacao);
    setTextById('leadsFinalizados', leadsFinalizados);

    const graf =
      resp.grafico   ||
      resp.chart     ||
      resp.conversao ||
      null;

    if (graf) {
      renderGraficoConversaoFromApi(graf);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      carregarLeadsDashboardFromApi().catch(e =>
        console.warn('[Dashboard] erro geral em carregarLeadsDashboardFromApi', e)
      );
    }, 400);
  });

  window.reloadLeadsDashboardFromApi = carregarLeadsDashboardFromApi;
})();


// === Sincroniza com o financeiro da API ao abrir o Dashboard ===
;(async () => {
  try {
    if (window.finSyncFromApi) {
      await window.finSyncFromApi();
      // os alertas serão atualizados automaticamente quando o financeiro mudar
    }
  } catch (e) {
    console.warn('[dashboard] erro ao sincronizar financeiro:', e);
  }
})();
  });