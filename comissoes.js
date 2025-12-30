/* =========================
   Comissões – Página Admin/Vendedor
   Agora lê de: localStorage.financeiroGlobal (lancamentos.isComissao = true)
   Eventos são usados só para pegar nome/data do evento.
   ========================= */

// ---------- Helpers básicos ----------
const getLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const todayISO = () => new Date().toISOString().slice(0,10);
const ddmmyyyy = (iso) => {
  if (!iso) return "—";
  const [y,m,d] = String(iso).split("-");
  return (d && m && y) ? `${d}/${m}/${y}` : String(iso);
};
const fmtBR = (n) => (Number(n||0)).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

function getUsuarioAtual(){
  try {
    if (window.__KGB_USER_CACHE) return window.__KGB_USER_CACHE;
    // dispara carregamento assíncrono se disponível
    try { if (typeof window.getUsuarioAtualAsync === 'function') window.getUsuarioAtualAsync().then(u=>{ if(u) window.__KGB_USER_CACHE = u; }); } catch {}
  } catch {}
  return { nome:"", email:"", perfil:"", tipo:"vendedor" };
}

// normaliza perfil/tipo p/ diferenciar admin x vendedor
function isAdmin(u){
  if (!u) return false;
  const p = (u.perfil || u.tipo || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  return p === "admin" || p === "administrador";
}

// ---------- Resolve o nome do vendedor a partir do evento/comissão ----------
function resolverVendedor(ev, com){
  const fromCom = (com?.destinatario || com?.vendedor || "").toString().trim();
  const candidatos = [
    fromCom,
    ev?.vendedor, ev?.vendedorNome, ev?.vendedorPrincipal,
    ev?.responsavel, ev?.responsavelVendas,
    ev?.comercial?.nome, ev?.equipe?.vendedor,
    ev?.atendimento?.vendedor
  ].map(x => (x ?? "").toString().trim()).filter(Boolean);
  return candidatos[0] || "—";
}

// ---------- Coleta de dados (a partir de lançamentos de comissão) ----------
function coletarComissoes() {
  // Snapshot atual do financeiro (localStorage)
  const fg = getLS("financeiroGlobal", { lancamentos: [], parcelas: [] });
  const lancs    = Array.isArray(fg.lancamentos) ? fg.lancamentos : [];
  const parcelas = Array.isArray(fg.parcelas)    ? fg.parcelas    : [];

  // Eventos ainda ajudam a descobrir nome/data do evento
  const eventos = getLS("eventos", []);

  // Index de parcelas por lançamento (pega a 1ª ou a de menor vencimento)
  const parcPorLanc = {};
  parcelas.forEach(p => {
    const lid = String(p.lancamentoId || p.lancId || "");
    if (!lid) return;

    const atual = parcPorLanc[lid];
    const vNovo =
      p.vencimentoISO ||
      p.vencimento ||
      p.dataVencimento ||
      "";

    const vAnt =
      atual?.vencimentoISO ||
      atual?.vencimento ||
      atual?.dataVencimento ||
      "";

    if (!atual || (vNovo && (!vAnt || vNovo < vAnt))) {
      parcPorLanc[lid] = p;
    }
  });

  const ds = [];

  lancs.forEach(l => {
    // Só queremos lançamentos marcados no modal como comissão
    if (!l || !l.isComissao) return;

    const lancId   = String(l.id || "");
    const eventoId = l.eventoId || "";

    const ev = eventos.find(e => String(e.id) === String(eventoId)) || null;

    const eventoNome =
      (ev && (ev.nomeEvento || ev.titulo || ev.nome)) ||
      l.eventoNome ||
      "";

    const dataEvento =
      ev?.data ||
      ev?.dataEvento ||
      ev?.dataDoEvento ||
      "";

    const vendedor =
      l.comissaoVendedorNome ||
      l.comissaoVendedorEmail ||
      resolverVendedor(ev || {}, null);

    const parc = parcPorLanc[lancId] || null;

    const vencimentoISO =
      parc?.vencimentoISO ||
      parc?.vencimento ||
      parc?.dataVencimento ||
      l.vencimentoISO ||
      l.data ||
      l.dataCompetencia ||
      "";

    const rawStatus = (parc?.status || l.status || "pendente")
      .toString()
      .toLowerCase();

    const status =
      rawStatus.includes("pago") || rawStatus.includes("receb")
        ? "pago"
        : "pendente";

    const dataPagamentoISO =
      parc?.dataPagamentoISO ||
      parc?.dataPagamento ||
      l.dataPagamentoISO ||
      null;

    // Se você preencheu "Valor da comissão" usamos ele; senão caímos no valor do lançamento
    const valorBase = Number(
      (typeof l.comissaoValor !== "undefined" ? l.comissaoValor : l.valor) || 0
    ) || 0;

    const etiqueta =
      l.comissaoTipo === "percentual"
        ? `Comissão (${(l.comissaoPerc ?? l.comissaoValor ?? 0)}%)`
        : (l.etiqueta || "Comissão");

    ds.push({
      id: `lanc_${lancId}`,
      eventoId,
      eventoNome,
      dataEvento,
      vendedor,
      valor: valorBase,
      vencimentoISO,
      status,
      dataPagamentoISO,
      relacionado: "lanc_comissao",
      relacionadoId: lancId,
      etiqueta
    });
  });

  return ds;
}

// ---------- Auto-sincronização (modo novo: tudo via lançamentos) ----------
function ensureIndexAndFGFromEventos(){
  // Modo atual: as comissões já são lançadas diretamente
  // no financeiro (lancamentos.isComissao = true).
  // Não precisamos mais gerar nada a partir de eventos.
}

// ---------- Render ----------
function preencherFiltroVendedor(lista) {
  const sel = document.getElementById("fVendedor");
  if (!sel) return;

  const u = getUsuarioAtual();
  const admin = isAdmin(u);

  const nomes = new Set();
  lista.forEach(c => {
    if (c.vendedor) nomes.add(c.vendedor);
  });

  const current = sel.value;
  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = admin ? "Todos os vendedores" : "Minhas comissões";
  sel.appendChild(optAll);

  nomes.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);
  });

  if (current && [...nomes].includes(current)) {
    sel.value = current;
  } else if (!admin && u && (u.nome || u.email)) {
    const alvo = u.nome || u.email;
    if ([...nomes].includes(alvo)) sel.value = alvo;
  }
}

function badgeTone(item){
  const hoje = todayISO();
  if (item.status === "pago") return "tone-ok";
  const d = item.vencimentoISO || "";
  if (!d) return "tone-future";
  if (d < hoje)  return "tone-overdue";
  if (d === hoje) return "tone-today";
  return "tone-future";
}

function renderTabela(lista){
  const tb = document.getElementById("tbComissoes");
  const hint = document.getElementById("hintSemReg");
  if (!tb) return;

  tb.innerHTML = "";
  if (!lista.length){
    hint?.removeAttribute("hidden");
    return;
  }
  hint?.setAttribute("hidden","");

  lista.forEach(item => {
    const tr = document.createElement("div");
    tr.className = "tr";
    tr.style.cssText = "display:grid;grid-template-columns:140px 1fr 140px 140px 120px;align-items:center;border-top:1px solid #eee1d3;padding:10px 12px;";

    tr.innerHTML = `
      <div class="td td-data">
        <div>${ddmmyyyy(item.vencimentoISO || item.dataPagamentoISO || item.dataEvento || "")}</div>
        <small class="muted">Evento: ${ddmmyyyy(item.dataEvento || "")}</small>
      </div>
      <div class="td td-evento">
        <div class="evt-nome">${item.eventoNome || "(sem nome)"}</div>
        <div class="evt-vendedor">${item.vendedor || "—"}</div>
      </div>
      <div class="td td-valor">
        <strong>${fmtBR(item.valor || 0)}</strong>
        <div class="etiqueta">${item.etiqueta || ""}</div>
      </div>
      <div class="td td-status">
        <span class="badge ${badgeTone(item)}">
          ${item.status === "pago" ? "Pago" : "Pendente"}
        </span>
      </div>
      <div class="td td-acoes">
        <button
          type="button"
          class="btn-ver"
          data-id="${item.relacionadoId || ''}"
          data-evento-id="${item.eventoId || ''}"
          data-ym="${(item.vencimentoISO || item.dataPagamentoISO || item.dataEvento || '').slice(0,7)}"
        >
          Ver lançamento
        </button>
      </div>

    `;
    tb.appendChild(tr);
  });

// ação "Ver lançamento" – agora abre a tela de Lançamentos já filtrada
tb.querySelectorAll(".btn-ver").forEach(btn => {
  btn.addEventListener("click", () => {
    const ym        = btn.getAttribute("data-ym") || "";
    const eventoId  = btn.getAttribute("data-evento-id") || "";
    const statusDet = btn.getAttribute("data-status") || "";

    const usp = new URLSearchParams();
    if (ym)       usp.set("mes", ym);          // mês da comissão (AAAA-MM)
    if (eventoId) usp.set("eventoId", eventoId);
    if (statusDet)usp.set("status", statusDet);

    // abre a tela de lançamentos com esses filtros
    window.location.href = `financeiro-lancamentos.html?${usp.toString()}`;
  });
});

}

// ---------- Filtros/KPIs ----------
function filtrar(lista){
  const u = getUsuarioAtual();
  const admin = isAdmin(u);

  const fMes      = document.getElementById("fMes")?.value || "";
  const fStatus   = document.getElementById("fStatus")?.value || "";
  const fVend     = document.getElementById("fVendedor")?.value || "";
  const fBuscaRaw = document.getElementById("fBusca")?.value || "";
  const fBusca    = fBuscaRaw.toLowerCase().trim();

  const ym = fMes; // "2025-02"

  return lista.filter(item => {
    if (ym){
      const base = (item.vencimentoISO || item.dataPagamentoISO || item.dataEvento || "").slice(0,7);
      if (base !== ym) return false;
    }

    if (fStatus){
      const st = (item.status || "").toLowerCase();
      if (fStatus === "pendente" && st !== "pendente") return false;
      if (fStatus === "pago"     && st !== "pago")     return false;
    }

    // Se não for admin, força filtro pelo próprio vendedor
    if (!admin){
      const me = (u.nome || u.email || "").toLowerCase().trim();
      const vend = (item.vendedor || "").toLowerCase();
      if (!vend.includes(me)) return false;
    } else if (fVend){
      const vend = (item.vendedor || "").toLowerCase();
      if (!vend.includes(fVend.toLowerCase())) return false;
    }

    if (fBusca){
      const txt = [
        item.eventoNome,
        item.vendedor,
        item.etiqueta
      ].join(" ").toLowerCase();
      if (!txt.includes(fBusca)) return false;
    }

    return true;
  });
}

function calcularKPIs(lista){
  let tot = 0, pagas = 0, pend = 0;
  lista.forEach(item => {
    const v = Number(item.valor||0);
    tot += v;
    if (item.status === "pago") pagas += v;
    else pend += v;
  });
  return { tot, pagas, pend };
}

function renderKPIs(lista){
  const { tot, pagas, pend } = calcularKPIs(lista);

  // IDs que estão no HTML (kpiTotalMes, kpiPendentesMes, kpiPagasMes)
  const elTot   = document.getElementById("kpiTotalMes");
  const elPagas = document.getElementById("kpiPagasMes");
  const elPend  = document.getElementById("kpiPendentesMes");

  if (elTot)   elTot.textContent   = fmtBR(tot);
  if (elPagas) elPagas.textContent = fmtBR(pagas);
  if (elPend)  elPend.textContent  = fmtBR(pend);
}


// ---------- Orquestração ----------
function carregarEDesenhar(){
  const base = coletarComissoes();
  preencherFiltroVendedor(base);
  const filtrada = filtrar(base);
  renderKPIs(filtrada);
  renderTabela(filtrada);
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  // filtros
  document.getElementById("fMes")?.addEventListener("change", carregarEDesenhar);
  document.getElementById("fStatus")?.addEventListener("change", carregarEDesenhar);
  document.getElementById("fVendedor")?.addEventListener("change", carregarEDesenhar);
  document.getElementById("fBusca")?.addEventListener("input", carregarEDesenhar);

  document.getElementById("btnLimpar")?.addEventListener("click", () => {
    const m = document.getElementById("fMes");     if (m) m.value = "";
    const s = document.getElementById("fStatus");  if (s) s.value = "";
    const b = document.getElementById("fBusca");   if (b) b.value = "";

    const { tipo, perfil } = getUsuarioAtual();
    if (isAdmin({tipo, perfil})) {
      const v = document.getElementById("fVendedor");
      if (v) v.value = "";
    }

    carregarEDesenhar();
  });

  // mês atual como padrão
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const mes = document.getElementById("fMes");
  if (mes && !mes.value) mes.value = ym;

  // 🔹 NOVO: sincroniza com a API, se disponível
  if (window.finSyncFromApi) {
    try {
      await window.finSyncFromApi();
    } catch (e) {
      console.warn('[comissoes] finSyncFromApi falhou, usando dados locais', e);
    }
  }

  // primeiro desenho da tela
  ensureIndexAndFGFromEventos(); // hoje é “vazio”, mas mantemos por compatibilidade
  carregarEDesenhar();

  // se outro lugar da aplicação atualizar o financeiroGlobal via localStorage,
  // esta tela se atualiza sozinha
  window.addEventListener("storage", (e) => {
    const k = e.key || "";
    if (k === "financeiroGlobal") {
      carregarEDesenhar();
    }
  });

  // 🔹 NOVO: se o financeiro for atualizado via BroadcastChannel / eventos internos,
  // a tela também se atualiza (mesmo padrão do painel de análises)
  window.addEventListener("fin-store-changed", carregarEDesenhar);
});

