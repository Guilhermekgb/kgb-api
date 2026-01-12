/* ===== Datas (local, sem “-1 dia”) ===== */
function parseDataLocal(str) {
  if (!str) return null;
  if (str instanceof Date) return str;

  const s = String(str).trim();

  // dd/mm/aaaa
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]); // local

  // yyyy-mm-dd (valor de <input type="date">)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]); // local

  // ISO com hora (ex.: 2025-08-22T00:00:00Z) -> tratar como data local
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]); // local

  // fallback: pega só a “parte de data” do Date() criado
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
// === CACHE DE LEADS EM MEMÓRIA (cloud only) ===
// Fonte única dos LEADS enquanto a tela estiver aberta
window.__LEADS_CACHE__ = window.__LEADS_CACHE__ || [];

// Lê leads do cache em memória
function getLeadsFromCache() {
  const arr = window.__LEADS_CACHE__;
  return Array.isArray(arr) ? arr : [];
}

// Salva leads no cache em memória
  // (opcionalmente poderia persistir em storage externa, mas aqui mantemos apenas cache em memória)
function setLeadsInCache(leads) {
  const arr = Array.isArray(leads) ? leads : [];
  window.__LEADS_CACHE__ = arr;

  // Mantemos apenas cache em memória; não persistir os dados dos leads fora da aba.
  try {
    // sinaliza outras abas/janelas se suportado
    try {
      new BroadcastChannel("mrubuffet").postMessage({ type: "leads:ping", at: Date.now() });
    } catch (e) {
      // alguns navegadores não suportam BroadcastChannel, tudo bem
    }
  } catch (e) {
    // noop
  }
}

// Compatibilidade com código antigo: quem chamar __getLeadsLS()
// agora lê do cache em memória (fonte principal)
function __getLeadsLS() {
  return getLeadsFromCache();
}

// ======= Memória local (substitui storage persistente para este módulo) =======
window.__FUNIL_MEM__ = window.__FUNIL_MEM__ || {};
function readLS(key){
  try { return typeof window.__FUNIL_MEM__[key] === 'undefined' ? null : window.__FUNIL_MEM__[key]; }
  catch(e){ return null; }
}
function writeLS(key, val){
  try { window.__FUNIL_MEM__[key] = typeof val === 'string' ? val : JSON.stringify(val); }
  catch(e){}
}
function removeLS(key){ try { delete window.__FUNIL_MEM__[key]; } catch(e){} }

// Helper para requisicoes — usa window.kgbAuth.api
async function apiRequest(method, path, body){
  if (!window.kgbAuth || typeof window.kgbAuth.api !== 'function') throw new Error('kgbAuth.api não disponível');
  const opts = { method };
  if (body !== undefined) opts.body = body;
  return await window.kgbAuth.api(path, opts);
}

// === helper: publica/atualiza "Próxima ação" do lead na Agenda Unificada ===
function __publishLeadNextAction(lead){
  try {
    if (!lead) return;
    const dia = String(lead.proximoContato||"").slice(0,10); // YYYY-MM-DD
    if (!dia) return;

    window.__agendaBridge?.upsertUnifiedItem({
      id: `lead:next:${lead.id}:${dia}`,
      src: 'funil',
      title: `Próxima ação • ${lead.nome || 'Lead'}`,
      date: dia,
      status: 'scheduled',
      audience: 'vendas',
      entity: { type:'lead', id:String(lead.id) },
      desc: lead.etapa ? `Etapa: ${lead.etapa}` : ''
    });
  } catch(e){ console.warn('hook lead:next', e); }
}

function __norm(s){ return String(s||"").toLowerCase(); }

/* Retorna "dd/mm/aaaa" a partir de "yyyy-mm-dd" ou Date */
function formatBR(value) {
  const d = parseDataLocal(value);
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function safeIcon(val){
  const s = String(val || '').trim().toLowerCase();

  // se veio algo que parece cor hex (fff/ffffff/#fff/#ffffff) => não é ícone
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s)) return 'columns';

  // só aceito "letras-numeros-hifens"
  if (!/^[a-z0-9-]{2,}$/.test(s)) return 'columns';

  return s;
}

// ========== Utils ==========
function normaliza(v){ return String(v||"").toLowerCase(); }
function num(v){
  if (v == null) return null;                     // undefined / null -> null
  const digits = String(v).replace(/\D/g, "");    // só números
  if (digits === "") return null;                 // vazio -> null (não 0!)
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// use SEMPRE o parser local
function parseDataFlex(s){
  return parseDataLocal(s);
}

// sempre devolve DD/MM/AAAA (ou "–" se vazio)
function formatarDataBR(s){
  const out = formatBR(s);
  return out || "–";
}

function equivalenteStatus(a,b){
  const na=normaliza(a).trim(), nb=normaliza(b).trim();
  if(["novo","novo lead"].includes(na) && ["novo","novo lead"].includes(nb)) return true;
  if(na.startsWith("fechado") && nb.startsWith("fechado")) return true;
  if(na.startsWith("arquivado") && nb.startsWith("arquivado")) return true;
  return na===nb;
}
function flagPrazoRetorno(dataStr, status){
  if(equivalenteStatus(status,"Fechados") || equivalenteStatus(status,"Arquivados")) return "";
  const d=parseDataFlex(dataStr); if(!d) return "";
  const hoje=new Date(); const h0=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()).getTime();
  const t=new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if(t<h0) return "atrasado";
  if(t===h0) return "hoje";
  return "";
}
function showToast({title="Pronto!",message="",type="success",timeout=3600}={}){
  let stack=document.getElementById("toastStack");
  if(!stack){ stack=document.createElement("div"); stack.id="toastStack"; document.body.appendChild(stack); }
  const t=document.createElement("div");
  t.className=`toast ${type}`;
  t.innerHTML=`<div class="t-title">${title}</div><button class="t-close" aria-label="Fechar">×</button><div class="t-body">${message}</div>`;
  t.querySelector(".t-close").onclick=()=>t.remove();
  stack.appendChild(t); setTimeout(()=>t.remove(), timeout);
}

// ========== Usuário / Visibilidade ==========
function getUsuarioAtual(){
  try{
    if (window.__usuarioLogado__) return window.__usuarioLogado__;
    const s = readLS('usuarioLogado') || null;
    if (s) {
      try { return JSON.parse(s); } catch { return {} }
    }
    return {};
  } catch { return {}; }
}
function isAdmin(u){
  const p = String(u?.perfil||"").toLowerCase().trim();
  return ["administrador","administradora","admin","adm"].includes(p);
}
function respId(obj){ return String(obj?.responsavel || obj?.responsavel_nome || obj?.nome || obj?.email || "").trim().toLowerCase(); }
function filterLeadsByUser(leads){
  const u=getUsuarioAtual();
  const ident=String(u?.nome || u?.email || "").trim().toLowerCase();
  if(isAdmin(u) || !ident) return leads;
  return leads.filter(ld => respId(ld)===ident);
}

// ========== Colunas (vêm do categorias-gerais) ==========

// Base da API (vem do patch do HTML)
const apiBase = (typeof window !== 'undefined' && (window.__API_BASE__ || window.API_BASE)) || '';
// --- Compat wrapper: kgbAuth.api required
// NOTE: este módulo exige window.kgbAuth.api; não há fallback.

// getLeadsAll helper: always returns an array (never throws)
if (!window.getLeadsAll) {
  window.getLeadsAll = async function(){
    try {
      const r = await apiRequest('GET', '/leads');
      if (!r) return [];
      if (Array.isArray(r)) return r;
      if (Array.isArray(r.data)) return r.data;
      if (Array.isArray(r.data?.data)) return r.data.data;
      return [];
    } catch (e) { return []; }
  };
}
/* ------------------ API: Listas Auxiliares ------------------ */

// Mapeia as chaves da memória do módulo para os endpoints da API
const LISTA_ENDPOINTS = {
    comoConheceu: "/listas/como-conheceu",
  motivosArquivamento: "/listas/motivos-arquivamento",
  categoriasServicos: "/listas/categorias-servicos",
  categoriasCardapio: "/listas/categorias-cardapio",
  tiposEvento: "/listas/tipos-evento",
  tiposAgenda: "/listas/tipos-agenda",
  funcoesEquipe: "/listas/funcoes-equipe",
};

/**
 * Salva uma lista na memória do módulo e, se possível, também na API.
 */
function salvarListaLocalEApi(chaveLocal, valores) {
  const arr = Array.isArray(valores) ? valores : [];
  try { writeLS(chaveLocal, arr); } catch(e){ console.warn('[Categorias] mem save failed', e); }
  const endpointPath = LISTA_ENDPOINTS[chaveLocal];
  if (!endpointPath) return;
  salvarListaNaApi(endpointPath, arr);
}

/**
 * Envia a lista inteira para o endpoint correspondente da API.
 * Contrato sugerido: PUT /listas/... com body { itens: [...] }
 */
async function salvarListaNaApi(endpointPath, valores) {
  try {
    await apiRequest('PUT', endpointPath, JSON.stringify({ itens: valores }));
    console.log('[Categorias] Lista salva na API:', endpointPath);
  } catch (e) { console.warn('[Categorias] Falha ao salvar lista na API:', endpointPath, e); }
}

/**
 * Busca a lista na API e salva na memória do módulo.
 * Se falhar, mantém o que já estiver no navegador.
 */
async function syncListaFromApiToLocal(chaveLocal) {
  const endpointPath = LISTA_ENDPOINTS[chaveLocal];
  if (!endpointPath) return;
  try {
    const resp = await apiRequest('GET', endpointPath);
    const data = resp && (resp.data || resp);
    const itens = Array.isArray(data) ? data : (Array.isArray(data?.itens) ? data.itens : []);
    if (!itens || !itens.length) return;
    writeLS(chaveLocal, itens);
    console.log('[Categorias] Lista sincronizada da API:', chaveLocal);
  } catch (e) { console.warn('[Categorias] Falha ao buscar lista da API:', chaveLocal, e); }
}

/**
 * Busca colunas do funil na API e joga em `colunasLead` na memória do módulo.
 * Se não existir API ou der erro, não quebra nada.
 */
async function syncColunasFromApiToLocal(){
  try {
    const resp = await apiRequest('GET', '/funil/colunas');
    const data = resp && (resp.data || resp);
    const lista = Array.isArray(data) ? data : (Array.isArray(data?.colunas) ? data.colunas : []);
    if (!lista || !lista.length) return;
    writeLS('colunasLead', lista);
    console.log('[FUNIL] Colunas do funil sincronizadas da API.');
  } catch (e) { console.warn('[FUNIL] Falha ao buscar colunas da API:', e); }
}

function getColunasFromStorage(){
  try { const s = readLS('colunasLead') || '[]'; return JSON.parse(s || '[]') || []; } catch { return []; }
}

/** Só garante "Novo Lead". As demais colunas vêm de categorias-gerais.html */
function ensureColunas(){
  let cols = getColunasFromStorage();
  // garante "Novo Lead" no topo (sem duplicar)
  if (!cols.some(c => (String(c?.nome||"").trim().toLowerCase()) === "novo lead")) {
    cols.unshift({ nome: "Novo Lead", icone: "user-plus" });
    try { writeLS('colunasLead', cols); } catch(e){ console.warn('[FUNIL] Não foi possível salvar colunas na memória:', e); }
  }
  return cols;
}
function isArquivado(ld){
  return equivalenteStatus(ld?.status, "Arquivados") || ld?.arquivado === true;
}
function isEvento(ld){
  const s = normaliza(ld?.status||"").trim();
  return ld?.virouEvento === true || !!ld?.eventoId || !!ld?.idEvento || s === "evento";
}

/* ===========================================================
   RENDER: Coluna + cards (com renderização em PEDAÇOS)
   =========================================================== */
function montarColuna(col, leadsDaColuna){
  const div = document.createElement("div");
  div.className = "fl-coluna";

  const icone = safeIcon(col.icone);
  const h = document.createElement("h2");
  h.innerHTML = `<i data-lucide="${icone}"></i> ${col.nome} (${leadsDaColuna.length})`;
  div.appendChild(h);

  if(!leadsDaColuna.length){
    const vazio = document.createElement("div");
    vazio.className = "fl-coluna-vazio";
    vazio.textContent = "Nada aqui no momento.";
    div.appendChild(vazio);
    return div;
  }

  // 🔧 ORDENAÇÃO: vencidos → hoje → futuro → sem data; por data crescente
  const listaOrdenada = leadsDaColuna.slice().sort((a, b) => {
    const [pa, ta] = retornoScore(a);
    const [pb, tb] = retornoScore(b);
    if (pa !== pb) return pa - pb;
    return ta - tb;
  });

  // 🚀 Renderização em pedaços (evita travadinhas)
  (async () => {
    const CHUNK = 200;
    let frag = document.createDocumentFragment();

    for (let i = 0; i < listaOrdenada.length; i++) {
      const ld = listaOrdenada[i];
      const flag = flagPrazoRetorno(ld.proximoContato, ld.status);

     const card = document.createElement("div");
 card.className = `card-lead ${flag}`;
 card.setAttribute('data-lead-id', String(ld.id ?? ''));
      card.innerHTML = `
        <strong>${ld.nome || "Sem nome"}</strong>

        <div class="lead-info li-data">
          <small>Data do evento:</small>
          <span class="v">${formatarDataBR(ld.dataEvento)}</span>
        </div>

        <div class="lead-info li-local">
          <small>Local:</small>
          <span class="v">${ld.local || "–"}</span>
        </div>

        <div class="lead-info li-conv">
          <small>Convidados:</small>
          <span class="v">${ld.qtd ?? ld.quantidadeConvidados ?? "–"}</span>
        </div>

        <div class="lead-info li-whats">
          <small>WhatsApp:</small>
          <span class="v">${(ld.whatsapp || "").toString() || "–"}</span>
        </div>

        <div class="lead-info li-retorno ${flag}">
          <small>Próximo retorno:</small>
          <span class="v">${formatarDataBR(ld.proximoContato)}</span>
        </div>

        <div class="btn-inline">
          <a class="btn outline" href="orcamento-detalhado.html?id=${ld.id}">
            <i data-lucide="external-link"></i> Abrir
          </a>
        </div>

        <select class="mover-para" data-id="${ld.id}">
          <option value="">Mover para…</option>
          ${ensureColunas().map(c=>c.nome)
            .filter(n=>!equivalenteStatus(n, ld.status||"Novo Lead"))
            .map(n=>`<option value="${n}">${n}</option>`).join("")}
        </select>
      `;

      // Listener do select (mantido como estava)
      const sel = card.querySelector("select.mover-para");
      sel.addEventListener("change", function(){
        const nova = this.value;
        this.value = "";
        if(nova) moverLead(String(ld.id), nova);
      });

      frag.appendChild(card);

      if ((i + 1) % CHUNK === 0) {
        div.appendChild(frag);
        frag = document.createDocumentFragment();
        await new Promise(requestAnimationFrame); // cede 1 frame p/ pintar
      }
    }

    if (frag.childNodes.length) div.appendChild(frag);
    try { window.lucide?.createIcons?.(); } catch {}
  })();

  return div;
}

function atualizarFunil(){
  const colunas = ensureColunas();

  // 0) Base: tudo que está no cache de leads em memória (já unificado e sem arquivados/evento)
  const todos = getLeadsFromCache();
  let leads = Array.isArray(todos) ? [...todos] : [];

  console.debug("[FUNIL] Etapa 0 - base cache leads:", leads.length);

  // 1) Perfil: se não for admin, filtra por responsável atual
  const u = getUsuarioAtual();
  const admin = isAdmin(u);
  const antesPerfil = leads.length;
  leads = filterLeadsByUser(leads);
  console.debug("[FUNIL] Etapa 1 - após filtro por perfil:", admin, "| diferença:", antesPerfil - leads.length);

  // 2) Filtro por responsável (visível só para admin)
  const respSel = normaliza(document.getElementById("filtroResponsavel")?.value || "todos").trim();
  const antesResp = leads.length;
  if (admin && respSel !== "todos") {
    leads = leads.filter(ld => normaliza(respId(ld)) === respSel);
  }
  console.debug("[FUNIL] Etapa 2 - após filtro Responsável:", respSel, "| diferença:", antesResp - leads.length);

  // 3) Blindagem: nunca mostrar arquivados/eventos no funil
  const antesBlind = leads.length;
  leads = leads.filter(ld => !isArquivado(ld) && !isEvento(ld));
  console.debug("[FUNIL] Etapa 3 - após blindagem arquivados/eventos:", leads.length, "| diferença:", antesBlind - leads.length);

  // 4) Filtros avançados (inputs podem nem existir → não filtram)
  function parseDataFlexSafe(v){ try{ return parseDataFlex(v); }catch{return null;} }
  const de      = parseDataFlexSafe(document.getElementById("filtroDataDe")?.value);
  const ate     = parseDataFlexSafe(document.getElementById("filtroDataAte")?.value);
  const retDe   = parseDataFlexSafe(document.getElementById("filtroRetDe")?.value);
  const retAte  = parseDataFlexSafe(document.getElementById("filtroRetAte")?.value);
  const statusSel = normaliza(document.getElementById("filtroStatus")?.value || "todos").trim();
  const localTxt  = normaliza(document.getElementById("filtroLocal")?.value || "").trim();
  const minConv = document.getElementById("filtroMinConvidados")
    ? num(document.getElementById("filtroMinConvidados").value)
    : null;
  const maxConv = document.getElementById("filtroMaxConvidados")
    ? num(document.getElementById("filtroMaxConvidados").value)
    : null;
  const origemTxt = normaliza(document.getElementById("filtroOrigem")?.value || "").trim();

  function inRange(d, ini, fim){
    if(!ini && !fim) return true;
    const x = parseDataFlexSafe(d); if(!x) return false;
    const x0 = new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const i0 = ini ? new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime() : -9e15;
    const f0 = fim ? new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime() :  9e15;
    return x0 >= i0 && x0 <= f0;
  }

  const antesAvanc = leads.length;
  leads = leads.filter(ld=>{
    const okStatus = (statusSel==="todos")
      ? true
      : equivalenteStatus(ld.status||"Novo Lead", statusSel);

    const okEvento  = inRange(ld.dataEvento, de, ate);
    const okRetorno = inRange(ld.proximoContato, retDe, retAte);
    const okLocal   = localTxt ? normaliza(ld.local||"").includes(localTxt) : true;
    const qtd = num(ld.qtd ?? ld.quantidadeConvidados);
    const okQtd = (minConv==null && maxConv==null) ? true :
      ( (minConv==null || (qtd!=null && qtd>=minConv)) &&
        (maxConv==null || (qtd!=null && qtd<=maxConv)) );
    const okOrigem = origemTxt ? normaliza(ld.origem||"").includes(origemTxt) : true;
    return okStatus && okEvento && okRetorno && okLocal && okQtd && okOrigem;
  });
  console.debug("[FUNIL] Etapa 4 - após filtros avançados:", leads.length, 
                "| statusSel:", statusSel, "| diferença:", antesAvanc - leads.length);

  // 5) Busca livre
  const busca = normaliza(document.getElementById("filtroBusca")?.value).trim();
  const antesBusca = leads.length;
  if (busca){
    leads = leads.filter(ld=>{
      const whatsDigits = String(ld.whatsapp||"").replace(/\D/g,"");
      const campos = [
        ld.nome, ld.local, ld.whatsapp, whatsDigits,
        ld.tipoEvento,
        formatarDataBR(ld.dataEvento),
        formatarDataBR(ld.proximoContato),
        String(ld.qtd ?? ld.quantidadeConvidados ?? "")
      ].map(v=>normaliza(v)).join("|");
      return campos.includes(busca);
    });
  }
  console.debug("[FUNIL] Etapa 5 - após busca livre:", leads.length, "| termo:", busca || "(vazio)",
                "| diferença:", antesBusca - leads.length);

  // 6) Monta colunas
  const box = document.getElementById("funil-container");
  if(!box) return;
  box.innerHTML = "";

  // Extra: distribuição por status (do conjunto já filtrado)
  const distFiltrado = {};
  leads.forEach(l=>{
    const s = String(l?.status||"").toLowerCase().trim() || "(vazio)";
    distFiltrado[s] = (distFiltrado[s]||0)+1;
  });
  console.debug("[FUNIL] Distribuição após todos os filtros:", distFiltrado);

  ensureColunas().forEach(col=>{
    const daColuna = leads.filter(ld => pertenceColuna(ld, col.nome));
    box.appendChild(montarColuna(col, daColuna));
  });

  // ícones/scroll/indicadores
  if (window.lucide?.createIcons) window.lucide.createIcons();
  setupHorizontalWheelScroll();
  setupTopScrollBar();
  atualizarIndicadores(leads, ensureColunas());
}

/** Converte a rodinha do mouse em scroll horizontal só no scroller principal */
function setupHorizontalWheelScroll(){
  const scroller = document.getElementById("funilScroller");
  if(!scroller) return;

  if(!scroller.dataset.wheelBound){
    scroller.addEventListener("wheel", (ev) => {
      if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
        scroller.scrollLeft += ev.deltaY;
        ev.preventDefault();
      }
    }, { passive:false });
    scroller.dataset.wheelBound = "1";
  }
}
/** Barra superior: define largura e sincroniza com o scroller das colunas */
function setupTopScrollBar(){
  const scroller = document.getElementById("funilScroller");
  const top = document.getElementById("scrollXTop");
  const inner = document.getElementById("scrollXTopInner");
  const container = document.getElementById("funil-container");
  if(!scroller || !top || !inner || !container) return;

  // Largura total do trilho (igual ao conteúdo rolável das colunas)
  const width = Math.max(container.scrollWidth || 0, scroller.scrollWidth || 0);
  inner.style.width = width + "px";

  // Sincronização de scrollLeft (com trava para evitar loop)
  let syncing = false;
  function sync(from, to){
    if(syncing) return;
    syncing = true;
    to.scrollLeft = from.scrollLeft;
    syncing = false;
  }

  if(!top.dataset.bound){
    top.addEventListener("scroll", ()=> sync(top, scroller));
    scroller.addEventListener("scroll", ()=> sync(scroller, top));

    // Rodinha do mouse → rolagem horizontal na barra de cima
    top.addEventListener("wheel", (ev)=>{
      if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
        top.scrollLeft += ev.deltaY;
        ev.preventDefault();
      }
    }, { passive:false });

    top.dataset.bound = "1";
  }
}
function atualizarIndicadores(leads, colunas){
  // Garante que são arrays
  if (!Array.isArray(leads)) leads = [];
  if (!Array.isArray(colunas)) colunas = [];

  // ================================
  // 1) CÁLCULO LOCAL (como já era)
  // ================================
  const agora = new Date();
  const m = agora.getMonth();
  const y = agora.getFullYear();

  function isMesAtual(d){
    const x = parseDataFlex(d);
    if (!x) return false;
    return x.getMonth() === m && x.getFullYear() === y;
  }

  // Total no mês (pela data do evento)
  var totalMes = leads.filter(function(l){ return isMesAtual(l.dataEvento); }).length;
  var elTot = document.getElementById("indTotalMes");
  if (elTot) elTot.textContent = String(totalMes);

  // Coluna com mais leads (pelo status atual)
  var porCol = {};
  leads.forEach(function(l){
    var statusPadrao = (colunas.length > 0 && colunas[0] && colunas[0].nome) ? colunas[0].nome : "Novo Lead";
    var s = l.status || statusPadrao;
    porCol[s] = (porCol[s] || 0) + 1;
  });

  var topNome = "–";
  var topQtd  = 0;
  Object.keys(porCol).forEach(function(k){
    var v = porCol[k];
    if (v > topQtd) {
      topQtd  = v;
      topNome = k;
    }
  });

  var elTop = document.getElementById("indTopColuna");
  if (elTop) elTop.textContent = topQtd ? (topNome + " (" + topQtd + ")") : "–";

  // Tempo médio para fechar (dias)
  var fechados = leads.filter(function(l){ return equivalenteStatus(l.status, "Fechados"); });
  var dur = fechados
    .map(function(l){
      var ini = parseDataFlex(l.dataCriacao || l.criadoEm || l.dataCadastro);
      var fim = parseDataFlex(l.dataFechamento);
      return (ini && fim) ? Math.max(0, (fim - ini) / 86400000) : null;
    })
    .filter(function(v){ return v != null; });

  var media = dur.length ? Math.round(dur.reduce(function(a,b){ return a + b; }, 0) / dur.length) : null;
  var elTm = document.getElementById("indTempoMedio");
  if (elTm) elTm.textContent = (media == null) ? "–" : (media + " dia" + (media === 1 ? "" : "s"));

  // Taxa de conversão
  var total = leads.length || 0;
  var conv  = total ? Math.round((fechados.length / total) * 100) : 0;
  var elConv = document.getElementById("indConversao");
  if (elConv) elConv.textContent = total ? (conv + "%") : "–";

  // ==========================================
  // 2) SOBRESCREVER COM DADOS DA API (opcional)
  //    Endpoint sugerido: GET /leads/metrics
  // ==========================================
  try {
    var ids = leads
      .map(function(l){ return l.id; })
      .filter(function(id){ return !!id; });

    // Se não tiver leads na tela, não precisa chamar a API
    if (!ids.length) return;

    (async function(){
      try {
        const resp = await apiRequest('GET', '/leads/metrics', { ids: ids });
        const d = resp && (resp.data || resp);
        if (!d) return;

        var elTot2 = document.getElementById("indTotalMes");
        if (elTot2 && d.totalMes != null) {
          elTot2.textContent = String(d.totalMes);
        }

        var elTop2 = document.getElementById("indTopColuna");
        if (elTop2) {
          var nomeApi = d.topColunaNome || topNome || "–";
          var qtdApi  = (d.topColunaQtd != null)
            ? d.topColunaQtd
            : (d.topColunaQuantidade != null ? d.topColunaQuantidade : topQtd);

          if (!qtdApi) qtdApi = 0;
          elTop2.textContent = qtdApi ? (nomeApi + " (" + qtdApi + ")") : nomeApi;
        }

        var elTm2 = document.getElementById("indTempoMedio");
        if (elTm2 && d.tempoMedioFechamentoDias != null) {
          var nTm = Math.round(d.tempoMedioFechamentoDias);
          elTm2.textContent = nTm + " dia" + (nTm === 1 ? "" : "s");
        }

        var elConv2 = document.getElementById("indConversao");
        if (elConv2 && d.taxaConversaoPercent != null) {
          var nCv = Math.round(d.taxaConversaoPercent);
          elConv2.textContent = nCv + "%";
        }
      } catch (e) {
        console.warn("[FUNIL] Falha ao buscar /leads/metrics:", e);
      }
    })();
  } catch (e) {
    console.warn("[FUNIL] Erro inesperado em atualizarIndicadores/API:", e);
  }
}


// ===== Notificações (badge simples) =====
function _usuarioIdentAtual(){
  try{
    const u = (typeof getUsuarioAtual === "function" ? getUsuarioAtual() : {}) || {};
    return String(u.nome || u.email || "").trim();
  }catch{ return ""; }
}
function _usuarioPerfilAtual(){
  try{
    const u = (typeof getUsuarioAtual === "function" ? getUsuarioAtual() : {}) || {};
    return String(u.perfil || "").toLowerCase().trim();
  }catch{ return ""; }
}

function contarNotificacoesDoUsuario(){
  try{
    const ident = _usuarioIdentAtual();
    const perf  = _usuarioPerfilAtual();
    const arr = readLS('notificacoes', []) || [];
    return arr.filter(n=>{
      if(n.lido) return false;
      const destNome = String(n.destinatarioNome||"").trim();
      const destPerf = String(n.destinatarioPerfil||"").toLowerCase().trim();
      return (destNome && destNome===ident) || (destPerf && destPerf===perf);
    }).length;
  }catch{ return 0; }
}

function atualizarBadgeNotificacoes(){
  const el = document.getElementById("badgeNotificacoes");
  if(!el) return;
  const n = contarNotificacoesDoUsuario();
  el.textContent = n ? String(n) : "";
}

function marcarNotificacoesComoLidasDoUsuario(){
  try{
    const ident = _usuarioIdentAtual();
    const perf  = _usuarioPerfilAtual();
    const arr = readLS('notificacoes', []) || [];
    let mudou = false;
    arr.forEach(n=>{
      const destNome = String(n.destinatarioNome||"").trim();
      const destPerf = String(n.destinatarioPerfil||"").toLowerCase().trim();
      if(!n.lido && ((destNome && destNome===ident) || (destPerf && destPerf===perf))){
        n.lido = true; mudou = true;
      }
    });
    if(mudou) writeLS('notificacoes', arr);
  }catch{}
}

// Fallback simples para toast (se não existir showToast no projeto)
if (typeof window.showToast !== "function") {
  window.showToast = ({title, message, timeout=1600}={})=>{
    try{
      const el=document.createElement("div");
      el.style.cssText="position:fixed;right:12px;bottom:12px;background:#333;color:#fff;padding:10px 12px;border-radius:8px;z-index:9999;font-size:14px";
      el.textContent = (title?title+": ":"") + (message||"");
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), timeout);
    }catch{ alert((title?title+": ":"")+(message||"")); }
  };
}
function enviarHistoricoMovimentacaoApi(lead, de, para){
  try {
    if (!lead || !lead.id) return;
    const usuarioAtual = (typeof getUsuarioAtual === "function" ? getUsuarioAtual() : {}) || {};
    const responsavelNome = usuarioAtual.nome || usuarioAtual.email || null;
    const agoraISO = new Date().toISOString();
    apiRequest('POST', '/leads/historico', {
      leadId: String(lead.id),
      item: {
        dataISO: agoraISO,
        tipo: "Movimentação",
        observacao: `Movido de "${de}" para "${para}" no funil.`,
        responsavel: responsavelNome,
        de: de,
        para: para
      }
    }).catch(function(e){ console.warn('[HIST] Falha ao enviar movimentação para API:', e); });
  } catch (e) {
    console.warn('[HIST] Erro ao preparar envio de movimentação para API:', e);
  }
}


// ========== Ações ==========
function moverLead(id, novaColuna){
  if (!novaColuna) return;

    // 1) Lê leads do cache em memória (já sincronizados com a API)
  let leads = getLeadsFromCache().slice();

  const idx = leads.findIndex(l => String(l?.id) === String(id));
  if (idx < 0) return;

  const lead = leads[idx];
  const de   = lead.status || "Novo Lead";
  const para = novaColuna;
  if (de === para) return;

  // 2) Atualiza histórico LOCAL e envia para a API (/leads/historico)
  if (!Array.isArray(lead.historico)) lead.historico = [];

  const usuarioAtual = (typeof getUsuarioAtual === "function" ? getUsuarioAtual() : {}) || {};
  const agora = new Date();

  // Se foi para "Fechados", consideramos um fechamento/ganho
  const tipoHist = equivalenteStatus(para, "Fechados")
    ? "Fechamento"
    : "Movimentação";

  const histItem = {
    data: agora.toLocaleString("pt-BR"),
    dataISO: agora.toISOString(),
    tipo: tipoHist,
    de: de,
    para: para,
    responsavel: usuarioAtual.nome || usuarioAtual.email || "-"
  };



  // salva local
  lead.historico.push(histItem);

  // envia para o backend (não quebra se a API não estiver disponível)
  try {
    enviarHistoricoMovimentacaoApi(lead, de, para);
  } catch (e) {
    console.warn("[HIST] Erro ao agendar envio de movimentação para API:", e);
  }


  // 3) Atualiza status e data de fechamento (quando vai pra “Fechados”)
  lead.status = para;
  if (equivalenteStatus(para, "Fechados") && !lead.dataFechamento) {
    lead.dataFechamento = new Date().toISOString().slice(0,10);
  }

    // 4) Salva no cache em memória (memória local do módulo)
  leads[idx] = lead;
  setLeadsInCache(leads);


  // Broadcast para outras abas (se tiver)
  try {
    new BroadcastChannel("mrubuffet").postMessage({ type: "leads:ping", at: Date.now() });
  } catch {}

  // 5) Atualiza agenda unificada (próxima ação)
  try {
    __publishLeadNextAction(lead);
  } catch(e) {
    console.warn(e);
  }

  // 6) Sincroniza com o BACKEND (PUT /leads/{id}), se a API estiver disponível
  try {
    apiRequest('PUT', `/leads/${id}`, {
      status: para,
      dataFechamento: lead.dataFechamento || null
    }).catch(e => console.warn('[FUNIL] Falha ao sincronizar movimentação na API', e));
  } catch (e) {
    console.warn('[FUNIL] Falha ao sincronizar movimentação na API', e);
  }

  // 7) Feedback visual
  showToast({
    title: "Lead movido",
    message: `“${lead.nome || "Lead"}” → ${para}`
  });

  // 8) Repinta imediatamente o funil
  atualizarFunil();
  setupTopScrollBar();
}

// === INÍCIO PATCH FL-QUOTA (revisado) ===
function compactLeadForLS(l){
  // Somente campos usados na UI do funil (mantém leve)
  const soNum = s => String(s||'').replace(/\D/g,'');
  const toISO = v => {
    const d = new Date(String(v));  // aceita yyyy-mm-dd/ISO
    if (isNaN(+d)) return null;
    return d.toISOString().slice(0,10);
  };
  return {
    id: String(l.id ?? l._id ?? l.codigo ?? ''),
    nome: (l.nome || l.cliente || l.contato_nome || 'Lead').toString(),
    whatsapp: soNum(l.whatsapp || l.telefone || (l.cliente && l.cliente.whatsapp)),
    dataEvento: toISO(l.dataEvento || l.data || (l.evento && l.evento.data)),
    proximoContato: toISO(l.proximoContato || l.next || l.retorno),
    local: (l.local || l.espaco || (l.endereco && l.endereco.local) || '').toString(),
    qtd: Number(l.qtd ?? l.quantidadeConvidados ?? l.convidados ?? '') || null,
    status: (l.status || 'Novo Lead').toString(),
    responsavel: (l.responsavel || l.vendedor || l.usuario || '').toString(),
    arquivado: !!(l.arquivado || l.archived),
    virouEvento: !!(l.virouEvento || l.eventoId || l.idEvento)
  };
}

function safeSetLeads(leads){
  try {
    // compacta só com os campos usados no funil
    const arrAll = Array.isArray(leads) ? leads.map(compactLeadForLS) : [];
    // salva no cache em memória (cache persistente removido)
    setLeadsInCache(arrAll);
  } catch (e) {
    console.warn('[FUNIL] safeSetLeads falhou:', e);
  }
}


/** Migração automática: compacta o que já existir no LS uma única vez */
(function migrateLeadsOnce(){
  try {
    try {
      if (readLS('__leads_migrado') === '1') return;
    } catch {}
    const atuais = readLS('leads', []) || [];
    if (atuais.length) safeSetLeads(atuais); // compacta e grava
    try { writeLS('__leads_migrado', '1'); } catch {}
  } catch {}
})();
// === FIM PATCH FL-QUOTA (revisado) ===

// ========== Boot ==========
async function syncLeadsFromApiToLocal(){
  // 1) base local: o que já estiver no cache em memória
  const locais = getLeadsFromCache();

  // 2) Busca o que vier da API (ou deixa [] se não tiver API ainda)
  let remotos = [];
  try {
    if (typeof getLeadsAll === 'function') {
      remotos = await getLeadsAll(); // deve retornar array
    }
  } catch (e) {
    console.warn('[FUNIL] getLeadsAll falhou:', e);
    remotos = [];
  }

  // 3) Indexador estável por prioridade: id → telefone → nome normalizado
  const soDig = s => String(s||'').replace(/\D+/g,'');
  const normaliza = s => String(s||'').trim().toLowerCase();
  const chave = l => (
    String(l.id||'').trim() ||
    soDig(l.whatsapp||l.telefone||'') ||
    normaliza(l.nome)
  );

  // 4) Monta o mapa com os locais primeiro (não perder nada em memória)
  const mapa = new Map((Array.isArray(locais) ? locais : []).map(l => [chave(l), l]));

  // 5) Mescla os remotos (remoto sobrescreve campo vazio, mas não apaga info útil)
  for (const r of (Array.isArray(remotos) ? remotos : [])) {
    const k = chave(r);
    const prev = mapa.get(k) || {};
    mapa.set(k, {
      ...prev,
      ...r,
      id: r.id || prev.id,
      nome: r.nome || prev.nome,
      whatsapp: r.whatsapp || prev.whatsapp,
      status: r.status || prev.status || 'Novo Lead',
      proximoContato: r.proximoContato || prev.proximoContato || null,
      dataEvento: r.dataEvento || prev.dataEvento || null,
      arquivado: r.arquivado ?? prev.arquivado ?? false,
      virouEvento: r.virouEvento ?? prev.virouEvento ?? false,
      origem: r.origem || prev.origem || '',
      origemTipo: r.origemTipo || prev.origemTipo || '',
      feiraId: r.feiraId || prev.feiraId || '',
      feiraNome: r.feiraNome || prev.feiraNome || ''
    });
  }

  // 6) Salva a união (no cache em memória)
  const unidos = Array.from(mapa.values());
  safeSetLeads(unidos);
}


function popularFiltroResponsavel(){
  const sel = document.getElementById("filtroResponsavel");
  if(!sel) return;

  const u = getUsuarioAtual();
  const admin = isAdmin(u);
  if(!admin){
    sel.style.display = "none";
    return;
  }

  // Admin: mostra lista "todos + responsáveis"
  let idents = [];
  const labels = {};

  // usuários cadastrados (apenas admin + vendedor)
  try{
    const usuarios = (() => { try { const s = readLS('usuarios') || '[]'; return JSON.parse(s||'[]') || []; } catch { return []; } })();
    usuarios
      .filter(us => ["administrador","vendedor"].includes(String(us?.perfil||"").toLowerCase()))
      .forEach(us=>{
        const ident = String(us?.nome || us?.email || "").trim().toLowerCase();
        if(ident){
          idents.push(ident);
          labels[ident] = (us?.nome || us?.email || "").trim();
        }
      });
  }catch{}

   // responsáveis já existentes nos leads (em memória)
  try{
    const leads = getLeadsFromCache();
    leads.forEach(ld=>{
      const ident = respId(ld);
      if(ident){
        idents.push(ident);
        if(!labels[ident]) labels[ident] = ident; // label de fallback
      }
    });
  }catch{}


  const unicos = [...new Set(idents.filter(Boolean))].sort((a,b)=>{
    const la = (labels[a]||a).toLowerCase();
    const lb = (labels[b]||b).toLowerCase();
    return la.localeCompare(lb);
  });

  sel.innerHTML = `<option value="todos">Todos</option>` +
    unicos.map(ident=>`<option value="${ident}">${labels[ident]||ident}</option>`).join("");

  sel.addEventListener("change", atualizarFunil);
}

function popularFiltroStatus(){
  const sel = document.getElementById("filtroStatus");
  if(!sel) return;
  const opts = [{v:"todos", t:"Todos"}]
    .concat(ensureColunas().map(c => ({v:c.nome, t:c.nome})));
  sel.innerHTML = opts.map(o=>`<option value="${o.v}">${o.t}</option>`).join("");
  sel.addEventListener("change", atualizarFunil);
}

/* ===========================================================
   DOMContentLoaded ÚNICO (remove duplicidade / travadinhas)
   =========================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  // --- handshake vindo da tela de Feiras ---
const focusId   = readLS('funil_focus_lead') || '';
const mustReset = (readLS('funil_reset_filters') === '1');

// 2.1) Zerar filtros que podem esconder o lead
if (mustReset) {
  const limpa = (sel, val='') => { const el = document.querySelector(sel); if (el) el.value = val; };
  limpa('#busca', '');
  limpa('#filtroStatus', 'todos');
  limpa('#filtroEtapa', 'todas');
  limpa('#filtroResponsavel', 'todos');
  limpa('#filtroOrigem', 'todas');
  // …inclua aqui os seus outros selects/inputs de filtro do funil
  removeLS('funil_reset_filters');
}

// 2.2) Guarde o id para destacar após o render
if (focusId) {
  // deixe em memória até o fim do render
  window.__FUNIL_FOCUS_ID__ = focusId;
  removeLS('funil_focus_lead');
}
  // Antes de pintar as colunas/leads, sincroniza a partir da API (se estiver disponível)
  await syncColunasFromApiToLocal();
  await syncLeadsFromApiToLocal();

  // 1) pinta as colunas e prepara coluna "Novo Lead"
  ensureColunas();

  // === PATCH C2: fallback - garantir "Novo Lead" no board a partir dos leads em memória
  (function ensureNovoLeadFromLocal(){
    try{
      // helpers locais (auto-contidos)
      const __norm = (s)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
           const __getLeadsLS = ()=> getLeadsFromCache();


      // 1) detecta estrutura do "board" que seu funil usa
      const board =
        (window.FUNIL && window.FUNIL.board) ||
        window.board ||
        window.funnel ||
        null;

      const columns =
        (board && (board.columns || board.colunas || board.lists || board.listas)) ||
        null;

      // Se você usa estrutura de colunas (board)
      if (columns && Array.isArray(columns)) {
        // a) acha a coluna "Novo Lead" (ou cria)
        let colNovo = columns.find(c => /novo\s*lead|^novo$/i.test(__norm(c?.name || c?.nome || c?.titulo)));
        if (!colNovo) {
          colNovo = { id:"col_novo", name:"Novo Lead", itens:[], items:[], leads:[], cards:[] };
          columns.unshift(colNovo);
        }

        // b) util para pegar o array que contém os itens desta coluna
        const getArrRef = (c) => (c.itens || c.items || c.leads || (c.cards ||= []) );
        const arrNovo = getArrRef(colNovo);

        // c) set com TODOS os ids já presentes em QUALQUER coluna (pra não duplicar)
        const present = new Set();
        for (const c of columns){
          const arr = getArrRef(c) || [];
          for (const it of arr){
            const id = (typeof it === "object") ? (it.id || it.leadId) : it;
            if (id != null) present.add(String(id));
          }
        }

        // d) insere no "Novo Lead" todo lead local com status "Novo Lead" ou sem status
        const leads = __getLeadsLS();
        for (const l of leads){
          const st = __norm(l.status);
          const isNovo = (!st || /novo\s*lead|^novo$/.test(st));
          if (isNovo && !present.has(String(l.id))){
            arrNovo.unshift({ id:String(l.id) }); // formato simples: só o id
            present.add(String(l.id));
          }
        }

        // e) se houver um persistidor do board, dispare
        if (typeof window.saveBoard === "function") {
          try { window.saveBoard(board); } catch {}
        }
      }

      // 2) Se o funil NÃO usa board e renderiza direto de listas internas,
      //    deixo um fallback com a 1ª coluna em memória:
      if (!columns) {
        const leads = __getLeadsLS();
        const NOVOS = leads.filter(l => {
          const st = __norm(l.status);
          return (!st || /novo\s*lead|^novo$/.test(st));
        });
        window.FUNIL = window.FUNIL || {};
        window.FUNIL._fallbackNovos = NOVOS;
        // OBS: No seu render, inclua (window.FUNIL._fallbackNovos || []) na 1ª coluna.
      }
    }catch(e){
      console.warn("fallback Novo Lead do cache em memória falhou:", e);
    }
  })();
  atualizarFunil();

  // 2) listeners
  const inpBusca = document.getElementById("filtroBusca");
  if (inpBusca) {
    let t = null;
    inpBusca.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => atualizarFunil(), 200);
    });
  }

  [
    "filtroDataDe","filtroDataAte","filtroStatus","filtroLocal",
    "filtroMinConvidados","filtroMaxConvidados","filtroOrigem",
    "filtroRetDe","filtroRetAte"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const ev = (el.tagName === "SELECT") ? "change" : "input";
    el.addEventListener(ev, atualizarFunil);
  });

if (false && typeof atualizarBadgeNotificacoes === "function") {
  atualizarBadgeNotificacoes();
}

  popularFiltroResponsavel();
  setupTopScrollBar();
  window.addEventListener("resize", setupTopScrollBar);

     // === Filtros por URL no Funil (retornos vencidos etc.) ===
(function applyURLFiltersFunil(){
  try{
    const q = new URLSearchParams(location.search);

    // Caso simples: ?retAte=YYYY-MM-DD  (RETORNOS VENCIDOS)
    const retAte = q.get('retAte');
    if (retAte && /^\d{4}-\d{2}-\d{2}$/.test(retAte)) {
      const el = document.getElementById('filtroRetAte');
      if (el) el.value = retAte;
    }

    // Opcional: também aceito ?retDe=YYYY-MM-DD, se vier
    const retDe = q.get('retDe');
    if (retDe && /^\d{4}-\d{2}-\d{2}$/.test(retDe)) {
      const el = document.getElementById('filtroRetDe');
      if (el) el.value = retDe;
    }

    // Se algum dos dois foi setado, força repintar
    if (retAte || retDe) {
      try { typeof atualizarFunil === 'function' && atualizarFunil(); } catch {}
    }
  }catch{}
})();
// === PATCH: reset de filtros + foco no lead recém-criado ===
(function(){
  try{
    const doReset = (readLS("funil_reset_filters") === "1");
    const focusId = readLS("funil_focus_lead") || '';

    if (doReset) {
      // zere seus filtros aqui (exemplos; ajuste para seus IDs reais de filtro):
      try { document.getElementById("filtroBusca").value = ""; } catch {}
      try { document.getElementById("filtroResponsavel").value = ""; } catch {}
      try { document.getElementById("filtroPeriodo").value = ""; } catch {}
      // se seu código usa algum objeto de estado, limpe-o aqui também.

      removeLS("funil_reset_filters");
    }

if (focusId) {
  // tente rolar/realçar o card do lead
  setTimeout(()=>{
    // proteção para navegadores sem CSS.escape
    let selId = String(focusId);
    if (window.CSS && typeof CSS.escape === "function") {
      selId = CSS.escape(selId);
    } else {
      // fallback bem simples: só escapa aspas duplas
      selId = selId.replace(/"/g, '\\"');
    }

    const el = document.querySelector(`[data-lead-id="${selId}"]`);
    if (el) {
      el.classList.add("pulse");   // defina um CSS .pulse se quiser
      el.scrollIntoView({behavior:"smooth", block:"center"});
    }
  }, 250);
  removeLS("funil_focus_lead");
}

  }catch{}
})();
/* ===== Live updates do Funil (entre abas) ===== */
(function funilLiveUpdates(){
  // storage (outra aba salvou leads)
  window.addEventListener('storage', (e) => {
    const k = e?.key || '';
    if (k === 'leads' || k === 'leads:ping') {
      try { atualizarFunil(); setupTopScrollBar(); } catch {}
    }
  });

  // BroadcastChannel (pings cross-aba)
  try {
    const bc = new BroadcastChannel('mrubuffet');
    bc.addEventListener('message', (ev) => {
      const t = ev?.data?.type;
      if (t === 'leads:ping') {
        try { atualizarFunil(); setupTopScrollBar(); } catch {}
      }
    });
  } catch {}
})();

});
(function dailyLeadReminders(){
  const KEY='mrubuffet:lastLeadDaily';

  function todayISO(){
    const d=new Date(), p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function shouldRun(){
    const t = todayISO();
    const last = readLS(KEY) || '';
    if (last===t) return false;
    return new Date().getHours() >= 9; // depois das 09:00
  }

  // cria BC uma única vez
  let bc = null;
  try { bc = new BroadcastChannel('mrubuffet'); } catch {}

  function run(){
    const leads = getLeadsFromCache();
    const t = new Date(); t.setDate(t.getDate()+1); // amanhã
    const p=n=>String(n).padStart(2,'0');
    const tomorrow = `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`;

    for (const l of leads){
      const dia = String(l.proximoContato||'').slice(0,10);
      if (dia === tomorrow){
        try {
          window.__agendaBridge?.publishNotificationFeed?.({
            id:`feed:lead:remind:${l.id}:${tomorrow}`,
            title:`Amanhã: retorno de lead • ${l.nome||'—'}`,
            level:'info',
            audience:'vendas',
            entity:{ type:'lead', id:String(l.id) }
          });
        } catch {}
      }
    }

    // marca que já rodou hoje e pinga (memória do módulo)
    writeLS(KEY, todayISO());
    try { writeLS('notificationsFeed:ping', String(Date.now())); } catch {}
    try { bc?.postMessage({type:'notificationsFeed:ping', at: Date.now()}); } catch {}
  }

  setInterval(()=>{ if (shouldRun()) run(); }, 60*1000);
})();

