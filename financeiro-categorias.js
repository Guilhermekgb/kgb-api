/* ========= Utils ========= */
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const getLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const uid = (p="id_") => p + Math.random().toString(36).slice(2,9);
function normalizeTipoLanc(t){
  t = String(t || 'entrada').toLowerCase();
  if (t === 'receita') t = 'entrada';
  if (t === 'despesa') t = 'saida';
  return t;
}
function formatarBRL(n) {
  const val = (n === "" || n == null || isNaN(Number(n))) ? 0 : Number(n);
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseMoedaBR(txt){
  if (txt == null) return 0;
  // remove R$, espaços, separadores de milhar e troca vírgula por ponto
  const limpo = String(txt)
    .replace(/\s+/g, "")
    .replace(/[Rr]\$?/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "");
  const n = Number(limpo);
  return isNaN(n) ? 0 : n;
}

let CFG = null;
let editCatId = null;
let editContaId = null;
let editCartaoId = null;
let editTipoId = null;

/* ========= Config & Backfill ========= */
function ensureConfig(){
  let cfg = getLS("configFinanceiro", null);
  if (!cfg || typeof cfg !== "object") {
    cfg = { categorias: [], contas: [], cartoes: [], tipos: [] };
  }
  if (!Array.isArray(cfg.categorias)) cfg.categorias = [];
  if (!Array.isArray(cfg.contas))     cfg.contas     = [];
  if (!Array.isArray(cfg.cartoes))    cfg.cartoes    = [];
  if (!Array.isArray(cfg.tipos))      cfg.tipos      = [];

  // Backfills categorias
  cfg.categorias = cfg.categorias.map(c => ({ ...c, escopo: c.escopo || "ambas" }));
  cfg.categorias = cfg.categorias.map(c => ({ ...c, paiId: c.paiId ?? null }));
// Backfill contas: garantir campo saldo (número)
// Backfill contas: garantir campo saldo (número)
if (!Array.isArray(cfg.contas)) cfg.contas = [];
cfg.contas = cfg.contas.map(ct => ({
  ...ct,
  saldo: (typeof ct.saldo === "number" ? ct.saldo : 0)
}));


  setLS("configFinanceiro", cfg);
  return cfg;
}
// === Recalcular os saldos de todas as contas lendo config + FG (usado na tela de categorias) ===
window.recomputeAllAccountBalances = function(){
  // 0) carrega FG e garante estruturas
  let g;
  try { g = JSON.parse(localStorage.getItem('financeiroGlobal') || '{}') || {}; } catch { g = {}; }
  g.contas      = Array.isArray(g.contas)      ? g.contas      : [];
  g.movimentos  = Array.isArray(g.movimentos)  ? g.movimentos  : [];
  g.lancamentos = Array.isArray(g.lancamentos) ? g.lancamentos : [];
  g.parcelas    = Array.isArray(g.parcelas)    ? g.parcelas    : [];
  g.saldoPorConta = g.saldoPorConta || {};

  // 1) Baseline das contas a partir do config (nome + saldoInicial SEMPRE do config.saldo)
  const cfg   = typeof ensureConfig === 'function' ? ensureConfig() : (JSON.parse(localStorage.getItem('configFinanceiro')||'{}')||{});
  const contasCfg = Array.isArray(cfg.contas) ? cfg.contas : [];
  const idsCfg = new Set(contasCfg.map(c => String(c.id)));

  // mapa atual de contas do FG
  const mapContas = new Map(g.contas.map(c => [String(c.id), { ...c }]));

  // hidrata/atualiza contas do FG a partir do config
  contasCfg.forEach(ct => {
    const id = String(ct.id);
    const cur = mapContas.get(id) || { id };
    cur.nome = ct.nome || cur.nome || '';
    cur.saldoInicial = Number(ct.saldo ?? cur.saldoInicial ?? 0) || 0;
    mapContas.set(id, cur);
  });

  // remove contas que não existem mais no config
  g.contas = Array.from(mapContas.values()).filter(c => idsCfg.has(String(c.id)));

  // 2) inicia mapa de saldos com os saldos iniciais
  const byId = {};
  g.contas.forEach(c => { byId[String(c.id)] = Number(c.saldoInicial || 0); });

  // 3) aplica TODOS os movimentos (fonte única da verdade)
  //    tipo: 'credito' soma, 'debito' subtrai
  //    também tentamos casar por nome se o id não bater
  const nomeParaId = {};
  g.contas.forEach(c => { nomeParaId[String((c.nome||'').trim().toLowerCase())] = String(c.id); });

  (g.movimentos || []).forEach(m => {
    let contaId = String(m.contaId || '');
    if (!contaId || !(contaId in byId)) {
      // fallback por nome
      const guess = nomeParaId[String((m.contaNome || '').trim().toLowerCase())];
      if (guess) contaId = guess;
    }
    if (!contaId || !(contaId in byId)) return;

    const v = Number(m.valor || 0);
    const tipo = String(m.tipo || '').toLowerCase();
    if (tipo === 'credito') byId[contaId] += v;
    else if (tipo === 'debito') byId[contaId] -= v;
  });

  // 4) reflete saldoAtual nas contas e publica saldoPorConta
  g.contas.forEach(c => { c.saldoAtual = byId[String(c.id)] ?? Number(c.saldoInicial || 0); });
  g.saldoPorConta = { ...byId };

  // 5) persiste + ping para outras telas reagirem
  try {
    localStorage.setItem('financeiroGlobal', JSON.stringify(g));
    localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
  } catch {}
};


/* ========= Dialog helpers ========= */
function openDialogSafe(dlg){
  if (!dlg) return;
  try { if (typeof dlg.showModal === "function") { dlg.showModal(); return; } } catch {}
  dlg.classList.add("dialog-fallback");
}
function closeDialogSafe(dlg){
  if (!dlg) return;
  try { if (typeof dlg.close === "function") { dlg.close(); return; } } catch {}
  dlg.classList.remove("dialog-fallback");
}

/* ========= Subcategorias (Categorias) ========= */
function listarFilhos(paiId) {
  return (CFG.categorias || [])
    .filter(c => c.paiId === paiId)
    .sort((a,b)=> String(a.descricao||"").localeCompare(String(b.descricao||"")));
}
function renderSubList(paiId) {
  const ul = $("#subList");
  if (!ul) return;
  ul.innerHTML = "";
  const filhos = listarFilhos(paiId);
  if (!filhos.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="muted">Nenhuma subcategoria ainda.</span>`;
    ul.appendChild(li);
    return;
  }
  for (const f of filhos) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="left">
        <span class="dot" style="--cor:${f.cor || "#c29a5d"}"></span>
        <span class="name">${f.descricao || "—"}</span>
      </div>
      <div class="actions">
        <button class="btn" data-subedit="${f.id}">Editar</button>
        <button class="btn" data-subdel="${f.id}">Excluir</button>
      </div>`;
    ul.appendChild(li);
  }
  ul.querySelectorAll("[data-subedit]").forEach(btn => btn.onclick = () => editarSub(btn.dataset.subedit));
  ul.querySelectorAll("[data-subdel]").forEach(btn => btn.onclick = () => excluirSub(btn.dataset.subdel));
}
function editarSub(id) {
  CFG = ensureConfig();
  const i = CFG.categorias.findIndex(x => x.id === id);
  if (i < 0) return;
  const atual = CFG.categorias[i];
  const novo = prompt("Renomear subcategoria:", atual.descricao || "");
  if (!novo) return;
 CFG.categorias[i] = { ...atual, descricao: novo.trim() };

  setLS("configFinanceiro", CFG);
  try { localStorage.setItem("configFinanceiro:ping", String(Date.now())); } catch {}
  renderSubList(atual.paiId);
  renderCategorias();
}
function excluirSub(id) {
  CFG = ensureConfig();
  const sub = (CFG.categorias || []).find(c => c.id === id);
  if (!sub) return;
  if (!confirm("Excluir esta subcategoria?")) return;
  CFG.categorias = CFG.categorias.filter(c => c.id !== id);
  setLS("configFinanceiro", CFG);
  try { localStorage.setItem("configFinanceiro:ping", String(Date.now())); } catch {}
  renderSubList(sub.paiId);
  renderCategorias();
}
// === Totais por categoria, assinando pelo TIPO DO LANÇAMENTO ===
function calcTotaisPorCategoria({ escopoFiltro = "empresa" } = {}) {
  // base
  let g;
  try { g = JSON.parse(localStorage.getItem("financeiroGlobal") || "{}") || {}; } catch { g = {}; }
  const lancs = Array.isArray(g.lancamentos) ? g.lancamentos : [];
  const parcs = Array.isArray(g.parcelas)    ? g.parcelas    : [];

  // mapa rápido de lançamentos por id
  const byL = new Map(lancs.map(l => [String(l.id), l]));

  // helpers
  const isQuitParcela = (s) => ["pago","recebido","baixado","quitado","liquidado"]
    .includes(String(s||"").toLowerCase());
  const isQuitLanc = (s) => ["pago","recebido","baixado","quitado","liquidado"]
    .includes(String(s||"").toLowerCase());

  const matchEsc = (cEsc) => {
    const e = String(cEsc || "ambas").toLowerCase();
    if (escopoFiltro === "empresa") return e === "empresa" || e === "ambas";
    if (escopoFiltro === "pessoal") return e === "pessoal" || e === "ambas";
    return true; // "ambas"
  };

  // totais
  const totaisSaldo   = {}; // entradas somam, saídas subtraem
  const totaisEntrada = {};
  const totaisSaida   = {};

  // --- PARCELAS quitadas ---
  for (const p of parcs) {
    const l = byL.get(String(p.lancamentoId));
    if (!l) continue;
    if (!matchEsc(l.escopo)) continue;

    const catId = l.subcategoriaId || l.categoriaId || null;
    if (!catId) continue;

    const v = Number(p.totalPago ?? p.valor ?? 0) || 0;
    if (!v) continue;

    if (!isQuitParcela(p.status)) continue;

    let t = String(l.tipo || "entrada").toLowerCase();
if (t === "receita") t = "entrada";
if (t === "despesa") t = "saida";
const ehEntrada = (t === "entrada");

    const key = String(catId);

    totaisEntrada[key] = (totaisEntrada[key] || 0) + (ehEntrada ? v : 0);
    totaisSaida[key]   = (totaisSaida[key]   || 0) + (!ehEntrada ? v : 0);
    totaisSaldo[key]   = (totaisSaldo[key]   || 0) + (ehEntrada ? +v : -v);
  }

  // --- LANÇAMENTOS quitados SEM parcelas (evita duplicar) ---
  const lancComParcela = new Set(parcs.map(p => String(p.lancamentoId)));

  for (const l of lancs) {
    if (lancComParcela.has(String(l.id))) continue;     // já somado via parcelas
    if (!isQuitLanc(l.status)) continue;
    if (!matchEsc(l.escopo)) continue;

    const catId = l.subcategoriaId || l.categoriaId || null;
    if (!catId) continue;

    const v = Number(l.valorTotal ?? l.valor ?? 0) || 0;
    if (!v) continue;

    const ehEntrada = String(l.tipo || "entrada").toLowerCase() === "entrada";
    const key = String(catId);

    totaisEntrada[key] = (totaisEntrada[key] || 0) + (ehEntrada ? v : 0);
    totaisSaida[key]   = (totaisSaida[key]   || 0) + (!ehEntrada ? v : 0);
    totaisSaldo[key]   = (totaisSaldo[key]   || 0) + (ehEntrada ? +v : -v);
  }

  return { totaisSaldo, totaisEntrada, totaisSaida };
}


/* ========= CATEGORIAS ========= */
function renderCategorias(){
  // === helpers locais ===
  const fmtBR = (n) => Number(n||0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});

  // carrega CFG e filtros
  CFG = ensureConfig();
  const tipoSel = ($("#catTipoFiltro")?.value || "entrada").toLowerCase(); // "entrada" | "saida"
  const escSel  = ($("#catEscopoFiltro")?.value || "empresa").toLowerCase(); // "empresa" | "pessoal" | "ambas"

  // "ambas" no filtro mostra tudo
  const matchEsc = (cEsc) => {
    const e = String(cEsc||"ambas").toLowerCase();
    if (escSel === "empresa") return e === "empresa" || e === "ambas";
    if (escSel === "pessoal") return e === "pessoal" || e === "ambas";
    return true; // escSel === "ambas"
  };

  // filtra categorias pela aba atual (tipoSel) + escopo
  const categoriasAll = Array.isArray(CFG.categorias) ? CFG.categorias : [];
  const todos = categoriasAll.filter(c =>
    String(c.tipo).toLowerCase() === tipoSel && matchEsc(c.escopo)
  );

  // mapa rápido para vincular pai/filhos
  const byId = new Map(todos.map(c => [String(c.id), c]));
  const filhosDe = (paiId) => todos.filter(c => c.paiId === paiId);

  // pais primeiro
  const pais = todos
    .filter(c => c.paiId == null)
    .sort((a,b)=> String(a.descricao||"").localeCompare(String(b.descricao||"")));

  const tb = $("#tbCategorias"), hint = $("#hintCategorias");
  if (!tb) return;
  tb.innerHTML = "";
  if (!todos.length){ if (hint) hint.style.display="block"; return; }
  if (hint) hint.style.display="none";

  // ===== cálculo de totais por TIPO DO LANÇAMENTO =====
  // (somamos por subcategoria se houver; caso contrário, na própria categoria)
  let FG;
  try { FG = JSON.parse(localStorage.getItem("financeiroGlobal")||"{}")||{}; } catch { FG = {}; }
  const lancs = Array.isArray(FG.lancamentos) ? FG.lancamentos : [];
  const parcs = Array.isArray(FG.parcelas)    ? FG.parcelas    : [];
  const byL   = new Map(lancs.map(l => [String(l.id), l]));

  // parcelas: considere quitado apenas pago/recebido/baixado/quitado/liquidado
  // (NÃO inclua "parcial" aqui — "parcial" é status agregado de lançamento)
  const isQuitParcela = (s) => ["pago","recebido","baixado","quitado","liquidado"].includes(String(s||"").toLowerCase());

  const totEntrada = {}; // por catId/subId (somente entradas)
  const totSaida   = {}; // por catId/subId (somente saídas)

  // --- PARCELAS quitadas (principal fonte) ---
  for (const p of parcs){
    const l = byL.get(String(p.lancamentoId));
    if (!l) continue;
    if (!matchEsc(l.escopo||"ambas")) continue;

  // ✅ normaliza SEMPRE
  const tipoLanc = (typeof normalizeTipoLanc === 'function')
    ? normalizeTipoLanc(l.tipo)
    : (String(l.tipo||"entrada").toLowerCase()==='despesa' ? 'saida' : 'entrada');

  const catIdRef = l.subcategoriaId || l.categoriaId || null;
  if (!catIdRef || !byId.has(String(catIdRef))) continue;

  const v = Number(p.totalPago ?? p.valor ?? 0) || 0;
  if (!v) continue;
  if (!isQuitParcela(p.status)) continue;

  if (tipoLanc === "entrada"){
    totEntrada[catIdRef] = (totEntrada[catIdRef] || 0) + v;
  } else {
    totSaida[catIdRef]   = (totSaida[catIdRef]   || 0) + v;
  }
}

  // --- LANÇAMENTOS quitados SEM parcelas (caso especial, sem duplicar) ---
  // se o lançamento já possui qualquer parcela, não somamos aqui para evitar contagem dupla
  const lancComParcela = new Set(parcs.map(p => String(p.lancamentoId)));

  for (const l of lancs){
    if (lancComParcela.has(String(l.id))) continue; // evita duplicar

    const st = String(l.status || "").toLowerCase();
    const quitado = ["pago","recebido","baixado","quitado","liquidado"].includes(st);
    if (!quitado) continue;

    if (!matchEsc(l.escopo||"ambas")) continue;

    const catIdRef = l.subcategoriaId || l.categoriaId || null;
    if (!catIdRef || !byId.has(String(catIdRef))) continue;

    const v = Number(l.valorTotal ?? l.valor ?? 0) || 0;
    if (!v) continue;

   let tipoLanc = String(l.tipo||"entrada").toLowerCase();
if (tipoLanc === "receita") tipoLanc = "entrada";
if (tipoLanc === "despesa") tipoLanc = "saida";
    if (tipoLanc === "entrada"){
      totEntrada[catIdRef] = (totEntrada[catIdRef] || 0) + v;
    } else {
      totSaida[catIdRef]   = (totSaida[catIdRef]   || 0) + v;
    }
  }

  // helper para pegar total "da aba" (entrada/saída) de um id (cat ou sub)
  const totalDoId = (id) => {
    const k = String(id);
    return (tipoSel === "entrada") ? (totEntrada[k] || 0) : (totSaida[k] || 0);
  };

  // soma do pai = total direto no pai + soma dos filhos
  const totalDoPai = (paiId) => {
    const direto = totalDoId(paiId);
    const somaFilhos = filhosDe(paiId).reduce((acc, f) => acc + totalDoId(f.id), 0);
    return direto + somaFilhos;
  };

  // monta uma linha (pai ou sub)
  const addRow = (c, isSub=false) => {
    const tr = document.createElement("tr");
    if (isSub) tr.classList.add("is-sub");

    const total = isSub ? totalDoId(c.id) : totalDoPai(c.id);

    tr.innerHTML = `
      <td><span class="cor" style="--cor:${c.cor||"#999"}"></span></td>
      <td>${c.descricao||"—"}</td>
      <td class="valor">R$ ${fmtBR(total)}</td>
      <td class="acoes">
        <button class="btn-ghost" data-edit="${c.id}">Editar</button>
        <button class="btn-ghost" data-del="${c.id}">Excluir</button>
      </td>`;
    tb.appendChild(tr);
  };

  // pinta pais e seus filhos
  for (const p of pais){
    addRow(p, false);
    const filhos = filhosDe(p.id)
      .sort((a,b)=> String(a.descricao||"").localeCompare(String(b.descricao||"")));
    for (const f of filhos) addRow(f, true);
  }
}



function abrirCategoria(id=null){
  editCatId = id;
  const tipoAtual   = $("#catTipoFiltro")?.value   || "entrada";
  const escopoAtual = $("#catEscopoFiltro")?.value || "empresa";
  const c = id ? (CFG.categorias||[]).find(x=>x.id===id)
               : { id:null, tipo:tipoAtual, escopo:escopoAtual, descricao:"", cor:"#c29a5d", paiId:null };

  $("#dlgCategoriaTitulo").textContent = id ? "Editar categoria" : "Nova categoria";
  $("#catTipo").value   = c?.tipo   || tipoAtual;
  $("#catEscopo").value = c?.escopo || escopoAtual;
  $("#catDesc").value   = c?.descricao || "";
  $("#catCor").value    = c?.cor || "#c29a5d";

  const box = $("#boxSubcats"), hintNew = $("#subcatsHintNew"),
        btnAddSub = $("#btnAddSub"), subDesc = $("#subDesc");

  if (c.paiId === null) {
    box.style.display = "block";
    if (c.id) {
      hintNew.style.display = "none";
      subDesc.value = "";
      renderSubList(c.id);
      btnAddSub.disabled = false;
      btnAddSub.onclick = () => {
        const nome = (subDesc.value||"").trim();
        if (!nome) { alert("Digite o nome da subcategoria."); return; }
        CFG = ensureConfig();
        const filho = {
          id: uid("cat_"),
          tipo: $("#catTipo").value,
          escopo: $("#catEscopo").value,
          descricao: nome,
          cor: $("#catCor").value || "#c29a5d",
          paiId: c.id
        };
        CFG.categorias.push(filho);
        setLS("configFinanceiro", CFG);
        try { localStorage.setItem("configFinanceiro:ping", String(Date.now())); } catch {}
        subDesc.value = "";
        renderSubList(c.id);
        renderCategorias();
      };
    } else {
      hintNew.style.display = "block";
      btnAddSub.disabled = true;
      subDesc.value = "";
      $("#subList").innerHTML = `<li><span class="muted">Salve a categoria para liberar as subcategorias.</span></li>`;
    }
  } else {
    box.style.display = "none";
  }

  openDialogSafe($("#dlgCategoria"));
}
function salvarCategoria(e){
  if (e) e.preventDefault();
  const tipo   = $("#catTipo").value;
  const escopo = $("#catEscopo").value;
  const desc   = ($("#catDesc").value||"").trim();
  const cor    = $("#catCor").value || "#c29a5d";
  if (!desc) { alert("Informe a descrição."); return; }

  CFG = ensureConfig();
  if (editCatId){
    const i = CFG.categorias.findIndex(x=>x.id===editCatId);
    if (i>-1) {
      const eraPai = CFG.categorias[i].paiId === null;
      CFG.categorias[i] = {...CFG.categorias[i], tipo, escopo, descricao:desc, cor };
      if (eraPai) {
        CFG.categorias = CFG.categorias.map(c => c.paiId === editCatId ? { ...c, tipo, escopo } : c);
      }
    }
  } else {
    const novo = { id: uid("cat_"), tipo, escopo, descricao:desc, cor, paiId:null };
    CFG.categorias.push(novo);
    editCatId = novo.id;
  }
  setLS("configFinanceiro", CFG);
  try { localStorage.setItem("configFinanceiro:ping", String(Date.now())); } catch {}
  closeDialogSafe($("#dlgCategoria"));
  renderCategorias();
}
function excluirCategoria(id){
  CFG = ensureConfig();
  const temFilhos = (CFG.categorias||[]).some(c => c.paiId === id);
  let msg = "Excluir esta categoria?";
  if (temFilhos) msg = "Esta categoria possui subcategorias. Excluir a categoria e TODAS as subcategorias?";
  if (!confirm(msg)) return;
  CFG.categorias = (CFG.categorias||[]).filter(c => c.id !== id && c.paiId !== id);
  setLS("configFinanceiro", CFG);
  try { localStorage.setItem("configFinanceiro:ping", String(Date.now())); } catch {}
  renderCategorias();
}

/* ========= CONTAS (somente nome + escopo) ========= */
function renderContas(){
  CFG = ensureConfig();
  const tb   = $("#tbContas");
  const hint = $("#hintContas");
  if (!tb || !hint) return;

  // tenta garantir que os saldos estejam atualizados
  try { window.recomputeAllAccountBalances?.(); } catch {}

  tb.innerHTML = "";

  const contasCfg = Array.isArray(CFG?.contas) ? CFG.contas : [];
  if (!contasCfg.length){
    hint.style.display = "block";
    return;
  }
  hint.style.display = "none";

  // snapshot do financeiroGlobal
  const FG = (function(){
    try { return JSON.parse(localStorage.getItem('financeiroGlobal') || '{}') || {}; }
    catch { return {}; }
  })();
  const fgContas       = Array.isArray(FG.contas) ? FG.contas : [];
  const fgSaldoPorConta= (typeof FG.saldoPorConta === 'object' && FG.saldoPorConta) ? FG.saldoPorConta : {};

  const linhas = contasCfg
    .slice()
    .sort((a,b)=> String(a.nome||"").localeCompare(String(b.nome||"")))
    .map(ct => {
      // saldo: 1) saldoPorConta[ct.id]  2) contas[].saldoAtual  3) saldo inicial do config
      let saldo = null;

      // 1) map saldoPorConta, se existir
      if (fgSaldoPorConta && Object.prototype.hasOwnProperty.call(fgSaldoPorConta, ct.id)) {
        saldo = Number(fgSaldoPorConta[ct.id]);
      }

      // 2) fallback: procurar a conta no array de contas do FG
      if (!Number.isFinite(saldo)) {
        const match = fgContas.find(x => String(x.id) === String(ct.id));
        if (match && Number.isFinite(Number(match.saldoAtual))) {
          saldo = Number(match.saldoAtual);
        }
      }

      // 3) último recurso: saldo inicial cadastrado na tela de categorias
      if (!Number.isFinite(saldo)) {
        saldo = Number(ct.saldo || 0);
      }

      const escopoLabel =
        (String(ct.escopo||'').toLowerCase() === "empresa" || String(ct.escopo||'').toLowerCase() === "empresarial")
          ? "Empresarial" : "Pessoal";

      return `
        <tr>
          <td>${ct.nome || "—"}</td>
          <td>${escopoLabel}</td>
          <td>${formatarBRL(saldo)}</td>
          <td class="acoes">
            <button class="btn-ghost" data-edit-conta="${ct.id}">Editar</button>
            <button class="btn-ghost" data-del-conta="${ct.id}">Excluir</button>
          </td>
        </tr>`;
    })
    .join("");

  tb.insertAdjacentHTML("beforeend", linhas);
}

function abrirConta(id=null){
  editContaId = id;
  CFG = ensureConfig();
  const ct = id ? CFG.contas.find(c=>c.id===id) : { id:null, nome:"", escopo:"empresa", saldo:0 };

  $("#dlgContaTitulo").textContent = id ? "Editar conta" : "Nova conta";
  $("#ctNome").value   = ct?.nome || "";
  $("#ctEscopo").value = ct?.escopo || "empresa";
  // mostra formatado, mas vamos aceitar qualquer digitação no salvar
  $("#ctSaldo").value  = ct?.saldo != null ? formatarBRL(ct.saldo) : "";
  openDialogSafe($("#dlgConta"));
}

// === SUBSTITUIR a função salvarConta(e) por esta ===
function salvarConta(e){
  if (e) e.preventDefault();

  const nome   = ($("#ctNome")?.value || "").trim();
  const escopo = $("#ctEscopo")?.value || "empresa";
  const saldo  = parseMoedaBR($("#ctSaldo")?.value || "0");

  if (!nome){
    alert("Informe o nome da conta.");
    return;
  }

  // Garante estrutura do config
  CFG = ensureConfig();
  if (!Array.isArray(CFG.contas)) CFG.contas = [];

  // Edita ou cria
  if (editContaId){
    const i = CFG.contas.findIndex(c => String(c.id) === String(editContaId));
    if (i > -1){
      CFG.contas[i] = { ...CFG.contas[i], nome, escopo, saldo };
    } else {
      // Se por algum motivo o id não foi encontrado, cria nova
      CFG.contas.push({ id: String(editContaId), nome, escopo, saldo });
    }
  } else {
    CFG.contas.push({ id: uid("ct_"), nome, escopo, saldo });
  }

  // Persiste o config e pinga
  setLS("configFinanceiro", CFG);
  try { localStorage.setItem("configFinanceiro:ping", String(Date.now())); } catch {}

  // Recalcula os saldos globais com base no novo baseline das contas
  try { window.recomputeAllAccountBalances?.(); } catch {}

  // Fecha modal, limpa estado de edição e re-renderiza
  try { closeDialogSafe($("#dlgConta")); } catch {}
  try { editContaId = null; } catch {}
  try { $("#formConta")?.reset(); } catch {}

  // Recarrega a tabela/abas de contas
  try { renderContas?.(); } catch {}
}


function excluirConta(id){
  CFG = ensureConfig();
  if (!confirm("Excluir esta conta?")) return;
  CFG.contas = CFG.contas.filter(c=> c.id !== id);
  setLS("configFinanceiro", CFG);
  renderContas();
}

/* ========= CARTÕES ========= */
function renderCartoes(){
  CFG = ensureConfig();
  const tb = $("#tbCartoes"), hint = $("#hintCartoes");
  tb.innerHTML = "";
  if (!CFG.cartoes.length){ hint.style.display="block"; return; }
  hint.style.display="none";

  const linhas = CFG.cartoes
    .slice().sort((a,b)=> String(a.nome||"").localeCompare(String(b.nome||"")))
    .map(cc=> `
      <tr>
        <td>${cc.nome || "—"}</td>
        <td>${cc.fechamento || "-"}</td>
        <td>${cc.vencimento || "-"}</td>
        <td>${cc.limite != null && cc.limite !== "" ? Number(cc.limite).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "-"}</td>
        <td class="acoes">
          <button class="btn-ghost" data-edit-cartao="${cc.id}">Editar</button>
          <button class="btn-ghost" data-del-cartao="${cc.id}">Excluir</button>
        </td>
      </tr>`).join("");
  tb.insertAdjacentHTML("beforeend", linhas);
}
function abrirCartao(id=null){
  editCartaoId = id;
  const cc = id ? CFG.cartoes.find(c=>c.id===id) : { id:null, nome:"", fechamento:10, vencimento:20, limite:"" };
  $("#dlgCartaoTitulo").textContent = id ? "Editar cartão" : "Novo cartão";
  $("#ccNome").value  = cc?.nome || "";
  $("#ccFech").value  = cc?.fechamento ?? 10;
  $("#ccVenc").value  = cc?.vencimento ?? 20;
  $("#ccLimite").value = cc?.limite ?? "";
  openDialogSafe($("#dlgCartao"));
}
function salvarCartao(e){
  if (e) e.preventDefault();
  const nome = ($("#ccNome").value||"").trim();
  const fechamento = parseInt($("#ccFech").value,10);
  const vencimento = parseInt($("#ccVenc").value,10);
  const limite = $("#ccLimite").value; // deixa texto/numero livre
  if (!nome){ alert("Informe o nome do cartão."); return; }
  CFG = ensureConfig();
  if (editCartaoId){
    const i = CFG.cartoes.findIndex(c=>c.id===editCartaoId);
    if (i>-1) CFG.cartoes[i] = { ...CFG.cartoes[i], nome, fechamento, vencimento, limite };
  } else {
    CFG.cartoes.push({ id: uid("cc_"), nome, fechamento, vencimento, limite });
  }
  setLS("configFinanceiro", CFG);
  closeDialogSafe($("#dlgCartao"));
  renderCartoes();
}
function excluirCartao(id){
  CFG = ensureConfig();
  if (!confirm("Excluir este cartão?")) return;
  CFG.cartoes = CFG.cartoes.filter(c=> c.id !== id);
  setLS("configFinanceiro", CFG);
  renderCartoes();
}

/* ========= TIPOS ========= */
function renderTipos(){
  CFG = ensureConfig();
  const tb = $("#tbTipos"), hint = $("#hintTipos");
  tb.innerHTML = "";
  if (!CFG.tipos.length){ hint.style.display="block"; return; }
  hint.style.display="none";

  const linhas = CFG.tipos
    .slice().sort((a,b)=> String(a.descricao||"").localeCompare(String(b.descricao||"")))
    .map(t=> `
      <tr>
        <td>${t.descricao || "—"}</td>
        <td class="acoes">
          <button class="btn-ghost" data-edit-tipo="${t.id}">Editar</button>
          <button class="btn-ghost" data-del-tipo="${t.id}">Excluir</button>
        </td>
      </tr>`).join("");
  tb.insertAdjacentHTML("beforeend", linhas);
}
function abrirTipo(id=null){
  editTipoId = id;
  const t = id ? CFG.tipos.find(x=>x.id===id) : { id:null, descricao:"" };
  $("#dlgTipoTitulo").textContent = id ? "Editar tipo" : "Novo tipo de conta";
  $("#tpDesc").value = t?.descricao || "";
  openDialogSafe($("#dlgTipo"));
}
function salvarTipo(e){
  if (e) e.preventDefault();
  const descricao = ($("#tpDesc").value||"").trim();
  if (!descricao){ alert("Informe a descrição do tipo."); return; }
  CFG = ensureConfig();
  if (editTipoId){
    const i = CFG.tipos.findIndex(x=>x.id===editTipoId);
    if (i>-1) CFG.tipos[i] = { ...CFG.tipos[i], descricao };
  } else {
    CFG.tipos.push({ id: uid("tp_"), descricao });
  }
  setLS("configFinanceiro", CFG);
  closeDialogSafe($("#dlgTipo"));
  renderTipos();
}
function excluirTipo(id){
  CFG = ensureConfig();
  if (!confirm("Excluir este tipo?")) return;
  CFG.tipos = CFG.tipos.filter(t=> t.id !== id);
  setLS("configFinanceiro", CFG);
  renderTipos();
}

/* ========= Abas ========= */
function switchTab(tab){
  $$(".tabs .tab").forEach(b => b.classList.toggle("active", b.dataset.tab===tab));
  $$(".panel").forEach(p => { p.hidden = (p.id !== "panel-"+tab); p.classList.toggle("active", !p.hidden); });
}

/* ========= Bind & Init ========= */
function bindEventos(){
  // Fechar modais
  document.body.addEventListener("click", (ev)=>{
    const btn = ev.target.closest("[data-close]");
    if (!btn) return;
    const id = btn.getAttribute("data-close");
    closeDialogSafe(document.getElementById(id));
  });

  // Abas
  document.addEventListener("click", (ev)=>{
    const tabBtn = ev.target.closest(".tabs .tab");
    if (!tabBtn) return;
    switchTab(tabBtn.dataset.tab);
  });

  /* Categorias */
  $("#btnNovaCategoria")?.addEventListener("click", ()=> abrirCategoria(null));
  $("#btnSalvarCategoria")?.addEventListener("click", salvarCategoria);
  $("#catTipoFiltro")?.addEventListener("change", renderCategorias);
  $("#catEscopoFiltro")?.addEventListener("change", renderCategorias);
  $("#tbCategorias")?.addEventListener("click", (ev)=>{
    const b = ev.target.closest("[data-edit],[data-del]");
    if (!b) return;
    const id = b.dataset.edit || b.dataset.del;
    if (b.dataset.edit) abrirCategoria(id);
    if (b.dataset.del)  excluirCategoria(id);
  });

  /* Contas */
  $("#btnNovaConta")?.addEventListener("click", ()=> abrirConta(null));
  $("#btnSalvarConta")?.addEventListener("click", salvarConta);
  $("#tbContas")?.addEventListener("click", (ev)=>{
    const b = ev.target.closest("[data-edit-conta],[data-del-conta]");
    if (!b) return;
    const id = b.dataset.editConta || b.dataset.delConta;
    if (b.dataset.editConta) abrirConta(id);
    if (b.dataset.delConta)  excluirConta(id);
  });

  /* Cartões */
  $("#btnNovoCartao")?.addEventListener("click", ()=> abrirCartao(null));
  $("#btnSalvarCartao")?.addEventListener("click", salvarCartao);
  $("#tbCartoes")?.addEventListener("click", (ev)=>{
    const b = ev.target.closest("[data-edit-cartao],[data-del-cartao]");
    if (!b) return;
    const id = b.dataset.editCartao || b.dataset.delCartao;
    if (b.dataset.editCartao) abrirCartao(id);
    if (b.dataset.delCartao)  excluirCartao(id);
  });

  /* Tipos */
  $("#btnNovoTipo")?.addEventListener("click", ()=> abrirTipo(null));
  $("#btnSalvarTipo")?.addEventListener("click", salvarTipo);
  $("#tbTipos")?.addEventListener("click", (ev)=>{
    const b = ev.target.closest("[data-edit-tipo],[data-del-tipo]");
    if (!b) return;
    const id = b.dataset.editTipo || b.dataset.delTipo;
    if (b.dataset.editTipo) abrirTipo(id);
    if (b.dataset.delTipo)  excluirTipo(id);
  });
}
function init(){
  CFG = ensureConfig();
  switchTab("categorias");
  renderCategorias();
  renderContas();
  renderCartoes();
  renderTipos();
}
document.addEventListener("DOMContentLoaded", ()=>{ bindEventos(); init(); });
// --- SINCRONIZAÇÃO COM O FINANCEIRO (lançamentos/baixas) ---
window.addEventListener('storage', (e) => {
  if (e.key === 'financeiroGlobal' || e.key === 'financeiroGlobal:ping' || e.key === 'configFinanceiro') {
    try { renderContas?.(); } catch {}
    try { renderCategorias?.(); } catch {} // <- recarrega os totais da aba Categorias
  }
});
window.addEventListener('finmodal:confirm', () => {
  try { renderContas?.(); } catch {}
  try { renderCategorias?.(); } catch {} // <- idem ao confirmar no modal
});
