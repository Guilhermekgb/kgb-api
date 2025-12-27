"use strict";

/* ------------------ Utilidades gerais ------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function lerJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined || raw === "") return fallback;
    const parsed = JSON.parse(raw);
    return (parsed === null || parsed === undefined) ? fallback : parsed;
  } catch { return fallback; }
}
/* ------------------ API: Colunas do Funil ------------------ */
/**
 * Base da API: vem do patch que está no HTML (window.__API_BASE__)
 * ou da chave "API_BASE" no localStorage.
 */
const API_BASE = window.__API_BASE__ || localStorage.getItem("API_BASE") || "";
/* ------------------ API: Listas Auxiliares ------------------ */

// Mapeia as chaves do localStorage para os endpoints da API
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
 * Salva uma lista no localStorage e, se possível, também na API.
 */
function salvarListaLocalEApi(chaveLocal, valores) {
  const arr = Array.isArray(valores) ? valores : [];
  try {
    localStorage.setItem(chaveLocal, JSON.stringify(arr));
  } catch (e) {
    console.warn("[Categorias] Não foi possível salvar lista no localStorage:", chaveLocal, e);
  }

  const endpointPath = LISTA_ENDPOINTS[chaveLocal];
  if (!endpointPath || !API_BASE) return;

  salvarListaNaApi(endpointPath, arr);
}

/**
 * Envia a lista inteira para o endpoint correspondente da API.
 * Contrato sugerido: PUT /listas/... com body { itens: [...] } ou { items: [...] }
 */
async function salvarListaNaApi(endpointPath, valores) {
  try {
    await fetch(`${API_BASE}${endpointPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: valores }),
    });
    console.log("[Categorias] Lista salva na API:", endpointPath);
  } catch (e) {
    console.warn("[Categorias] Falha ao salvar lista na API:", endpointPath, e);
  }
}

/**
 * Busca a lista na API e salva no localStorage.
 * Se falhar, mantém o que já estiver no navegador.
 */
async function syncListaFromApiToLocal(chaveLocal) {
  if (!API_BASE) return;

  const endpointPath = LISTA_ENDPOINTS[chaveLocal];
  if (!endpointPath) return;

  try {
    const resp = await fetch(`${API_BASE}${endpointPath}`, { method: "GET" });
    if (!resp.ok) {
      console.warn("[Categorias] Erro ao buscar lista da API:", endpointPath, resp.status);
      return;
    }

    let data = null;
    try { data = await resp.json(); } catch { data = null; }

    // aceita array direto, { itens: [...] } ou { items: [...] }
    const itens = Array.isArray(data)
      ? data
      : (Array.isArray(data?.itens) ? data.itens :
         (Array.isArray(data?.items) ? data.items : []));

    if (!itens || !itens.length) return;

    localStorage.setItem(chaveLocal, JSON.stringify(itens));
    console.log("[Categorias] Lista sincronizada da API:", chaveLocal);
  } catch (e) {
    console.warn("[Categorias] Falha ao buscar lista da API:", chaveLocal, e);
  }
}

/**
 * Chamada genérica de API (GET/PUT) para as colunas do funil.
 * Não precisa mexer aqui depois.
 */
async function apiColunasFetch(path, options = {}) {
  if (!API_BASE) {
    console.warn("[Categorias] API_BASE não configurado; usando somente localStorage.");
    return null;
  }

  const url = `${API_BASE}${path}`;
  const { body, ...rest } = options;

  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...rest,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Erro ${resp.status}: ${txt || resp.statusText}`);
  }

  if (resp.status === 204) return null;
  try { return await resp.json(); } catch { return null; }
}

/**
 * Busca as colunas do funil na API e joga no localStorage.colunasLead.
 * Se der erro, não quebra a tela: continua com o que tiver no navegador.
 */
async function syncColunasFromApiToLocal() {
  if (!API_BASE) return;

  try {
    const data = await apiColunasFetch("/funil/colunas", { method: "GET" });
    const lista = Array.isArray(data)
      ? data
      : (Array.isArray(data?.colunas) ? data.colunas : []);

    if (!lista || !lista.length) return;

    const ajustadas = garantirNovoLeadPrimeira(lista);
    localStorage.setItem("colunasLead", JSON.stringify(ajustadas));
    console.log("[Categorias] Colunas do funil sincronizadas da API.");
  } catch (e) {
    console.warn("[Categorias] Falha ao buscar colunas da API; mantendo localStorage:", e);
  }
}

/**
 * Salva as colunas tanto no localStorage quanto na API.
 * ESTA é a função que o restante do código vai chamar.
 */
function salvarColunasLocalEApi(colunas) {
  const arr = garantirNovoLeadPrimeira(Array.isArray(colunas) ? colunas : []);
  try {
    localStorage.setItem("colunasLead", JSON.stringify(arr));
  } catch (e) {
    console.warn("[Categorias] Não foi possível salvar colunas no localStorage:", e);
  }

  // Dispara o salvamento na API em background (não trava a tela)
  salvarColunasNaApi(arr);
}

/**
 * Função assíncrona que realmente envia a lista inteira para a API.
 * Endpoint sugerido: PUT /funil/colunas com { colunas: [...] }
 */
async function salvarColunasNaApi(colunas) {
  if (!API_BASE) return;

  try {
    await apiColunasFetch("/funil/colunas", {
      method: "PUT",
      body: { colunas },
    });
    console.log("[Categorias] Colunas do funil salvas na API.");
  } catch (e) {
    console.warn("[Categorias] Falha ao salvar colunas na API:", e);
  }
}

function refreshIcons() {
  // Corrige e desenha ícones lucide
  corrigirIconesDom();
  if (window.lucide && typeof lucide.createIcons === "function") {
    lucide.createIcons();
  }
}

/* ------------------ Ícones (Lucide) ------------------ */
// Ícones de ação que NUNCA devem ser trocados por fallback
const ICONES_FIXOS = new Set([
  'pencil','edit-3','trash-2','plus','chevron-up','chevron-down',
  'menu','settings','users','x-circle','briefcase','chef-hat',
  'calendar-heart','calendar-clock','users-2','columns-3'
]);

function nomeIconeValido(icone, contextoNome = "") {
  let n = (icone || "").trim().toLowerCase();
  if (ICONES_FIXOS.has(n)) return n;

  // Se for cor/hex, ignora
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(n)) n = "";

  if (n) return n;

  // Fallback SÓ para nomes de colunas do funil
  const nome = (contextoNome || "").toLowerCase();
  if (nome.includes("negocia")) return "handshake";
  if (nome.includes("lead"))     return "user-plus";
  if (nome.includes("card"))     return "send";
  if (nome.includes("degust"))   return "utensils";
  if (nome.includes("fech"))     return "check-circle";
  if (nome.includes("arquiv"))   return "archive";
  return "list";
}

function corrigirIconesDom() {
  $$("i[data-lucide]").forEach(el => {
    const atual = el.getAttribute("data-lucide") || "";
    const corrigido = nomeIconeValido(atual);
    if (corrigido !== atual) el.setAttribute("data-lucide", corrigido);
  });
}

/* ------------------ Abas ------------------ */
function setActiveTab(id) {
  // ativa/desativa painéis
  $$(".aba").forEach(div => div.classList.remove("ativa"));
  const tab = document.getElementById(id);
  if (tab) tab.classList.add("ativa");

  // ativa/desativa botões e atualiza aria-selected
  $$(".tabs .tab-btn").forEach(btn => {
    const isActive = btn.getAttribute("data-tab") === id;
    btn.classList.toggle("ativo", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.setAttribute("tabindex", isActive ? "0" : "-1"); // roving tabindex (opcional, mas ajuda no teclado)
  });

  // redesenha ícones
  refreshIcons();

  // carrega a lista correspondente
  if (id === "colunas") carregarColunas();
  if (id === "conheceu") carregarFontes();
  if (id === "motivos") carregarMotivos();
  if (id === "servicos") carregarServicos();
  if (id === "cardapio") carregarCardapios();
  if (id === "tipos") carregarTiposEvento();
  if (id === "funcoesEquipe") carregarFuncoesEquipe();
  if (id === "tiposAgenda") carregarTiposAgenda();
}


function wireTabs() {
  const tabs = $(".tabs");
  if (!tabs) return;
  tabs.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".tab-btn");
    if (!btn) return;
    const id = btn.getAttribute("data-tab");
    if (!id) return;
    setActiveTab(id);
  });
}

/* ------------------ Colunas do funil ------------------ */
const colunasProtegidas = ["Novo Lead"];
const COLUNAS_DEFAULT = [
  { nome: "Novo Lead", icone: "user-plus", descricao: "Entradas novas de orçamento e leads de formulário." },
  { nome: "Cardápio Enviado", icone: "send", descricao: "Proposta/cardápio já enviado ao cliente." },
  { nome: "Degustação Agendada", icone: "utensils", descricao: "Degustação marcada com data definida." },
  { nome: "Aguardando Degustação", icone: "hourglass", descricao: "Cliente aguardando data para degustação." },
  { nome: "Em Negociação", icone: "handshake", descricao: "Troca de condições, ajustes e negociação." },
  { nome: "Fechados", icone: "check-circle", descricao: "Propostas convertidas em venda." },
  { nome: "Arquivados", icone: "archive", descricao: "Leads perdidos/sem continuidade." }
];

function garantirNovoLeadPrimeira(colunas) {
  let arr = Array.isArray(colunas) ? [...colunas] : [];
  const temNovo = arr.find(c => (c?.nome || "").toLowerCase() === "novo lead");
  if (!temNovo) arr.unshift({ ...COLUNAS_DEFAULT[0] });

  // remove duplicatas de "Novo Lead"
  const resto = arr.filter((c, i) => (c?.nome || "").toLowerCase() !== "novo lead" || i === 0);

  // Reposiciona "Novo Lead" como 1ª
  const novoLead = { ...COLUNAS_DEFAULT[0], ...(resto[0]?.nome?.toLowerCase() === "novo lead" ? resto[0] : {}) };
  const outras = resto.filter((c, i) => i > 0);
  return [novoLead, ...outras];
}

function seedColunasSeVazio() {
  const atual = lerJSON("colunasLead", []);
  if (!Array.isArray(atual) || atual.length === 0) {
    salvarColunasLocalEApi(COLUNAS_DEFAULT);
  }
}


function mostrarMensagem(texto, tipo = "sucesso") {
  const msg = document.createElement("div");
  msg.textContent = texto;
  msg.className = `flash ${tipo}`;
  const container = $(".conteudo-central");
  const anchor = container.children[1] || container.firstChild || null;
  if (anchor) container.insertBefore(msg, anchor); else container.appendChild(msg);
  setTimeout(() => msg.remove(), 3000);
}

function sugerirIcone() {
  const nome = ($("#nomeColuna").value || "").toLowerCase();
  const iconeInput = $("#iconeColuna");
  if (nome.includes("negocia")) iconeInput.value = "handshake";
  else if (nome.includes("lead")) iconeInput.value = "user-plus";
  else if (nome.includes("card")) iconeInput.value = "send";
  else if (nome.includes("degust")) iconeInput.value = "utensils";
  else if (nome.includes("fech")) iconeInput.value = "check-circle";
  else if (nome.includes("arquiv")) iconeInput.value = "archive";
  else iconeInput.value = "list";
}

function adicionarColuna() {
  const nome = ($("#nomeColuna").value || "").trim();
  const iconeRaw = ($("#iconeColuna").value || "").trim();
  const descricao = ($("#descricaoColuna").value || "").trim();

  if (!nome) { mostrarMensagem("Informe pelo menos o NOME da coluna.", "erro"); return; }

  let colunas = lerJSON("colunasLead", []);

  // bloqueia nomes repetidos (case-insensitive)
  if (colunas.some(c => (c?.nome || "").toLowerCase() === nome.toLowerCase())) {
    mostrarMensagem("Já existe uma coluna com esse nome.", "erro");
    return;
  }

  const icone = iconeRaw ? nomeIconeValido(iconeRaw, nome) : nomeIconeValido("", nome);

  colunas.push({ nome, icone, descricao });
  colunas = garantirNovoLeadPrimeira(colunas);
  salvarColunasLocalEApi(colunas);


  // limpa campos
  $("#nomeColuna").value = "";
  $("#iconeColuna").value = "";
  $("#descricaoColuna").value = "";

  mostrarMensagem("Coluna adicionada com sucesso!", "sucesso");
  carregarColunas();
  refreshIcons();
}

function carregarColunas() {
  const colunas = lerJSON("colunasLead", []);
  const leads   = lerJSON("leads", []);
  const div = $("#listaColunas");
  div.innerHTML = "";

  colunas.forEach((col, index) => {
    const count = leads.filter(lead => lead.status === col.nome).length;
    const protegido = colunasProtegidas.some(p => p.toLowerCase() === (col.nome || "").toLowerCase());
    const iconName = nomeIconeValido(col.icone, col.nome);

    const box = document.createElement("div");
    box.className = "item-coluna";

    box.innerHTML = `
      <div class="top-line">
        <i data-lucide="${iconName}"></i>
        <span>${col.nome} (${count})</span>
      </div>
      <small>${col.descricao || ""}</small>
      <div class="acoes">
        <button class="btn-icone" data-act="up"    title="Subir"><i data-lucide="chevron-up"></i></button>
        <button class="btn-icone" data-act="down"  title="Descer"><i data-lucide="chevron-down"></i></button>
        <button class="btn-icone" data-act="edit"  title="Editar" ${protegido ? "disabled style='opacity:.5;'" : ""}><i data-lucide="pencil"></i></button>
        <button class="btn-icone" data-act="del"   title="Excluir" ${protegido ? "disabled style='opacity:.5;'" : ""}><i data-lucide="trash-2"></i></button>
      </div>
    `;

    // listeners
    const [btnUp, btnDown, btnEdit, btnDel] = $$(".acoes .btn-icone", box);

    btnUp?.addEventListener("click", () => moverColuna(index, -1));
    btnDown?.addEventListener("click", () => moverColuna(index, +1));
    btnEdit?.addEventListener("click", () => editarColuna(index));
    btnDel?.addEventListener("click", () => removerColuna(index));

    div.appendChild(box);
  });

  refreshIcons();
}

function editarColuna(index) {
  const colunas = lerJSON("colunasLead", []);
  const c = colunas[index];
  if (!c) return;

  if ((c.nome || "").toLowerCase() === "novo lead") {
    alert("A coluna 'Novo Lead' é fixa e não pode ser editada.");
    return;
  }

  const novoNome = prompt("Novo nome da coluna:", c.nome);
  if (novoNome === null) return;
  const nomeLimpo = novoNome.trim();
  if (!nomeLimpo) { alert("O nome não pode ficar vazio."); return; }

  if (nomeLimpo.toLowerCase() === "novo lead" ||
      colunas.some((x, i) => i !== index && (x?.nome || "").toLowerCase() === nomeLimpo.toLowerCase())) {
    alert("Já existe uma coluna com esse nome (ou é 'Novo Lead').");
    return;
  }

  const novoIcone = prompt("Ícone (Lucide):", c.icone || "");
  if (novoIcone === null) return;
  const iconeLimpo = nomeIconeValido((novoIcone || "").trim().toLowerCase(), nomeLimpo);

  const novaDesc = prompt("Descrição:", c.descricao || "");
  if (novaDesc === null) return;

  c.nome = nomeLimpo;
  c.icone = iconeLimpo;
  c.descricao = (novaDesc || "").trim();

  salvarColunasLocalEApi(colunas);
  carregarColunas();
  refreshIcons();
}


function removerColuna(index) {
  let colunas = lerJSON("colunasLead", []);
  let leads   = lerJSON("leads", []);

  const nome = colunas[index]?.nome;
  if (!nome) return;

  if (colunasProtegidas.some(p => p.toLowerCase() === (nome || "").toLowerCase())) {
    alert("Esta coluna é protegida e não pode ser excluída.");
    return;
  }

  if (!confirm(`Remover a coluna "${nome}"? Os leads nela serão movidos para "Novo Lead".`)) return;

  // Move os leads dessa coluna para "Novo Lead"
  leads = leads.map(l => (l.status === nome ? { ...l, status: "Novo Lead" } : l));
  localStorage.setItem("leads", JSON.stringify(leads));

  // Remove a coluna e garante ordem
  colunas.splice(index, 1);
  colunas = garantirNovoLeadPrimeira(colunas);
  salvarColunasLocalEApi(colunas);

  carregarColunas();
  refreshIcons();
}


function moverColuna(index, direcao) {
  let colunas = lerJSON("colunasLead", []);
  const novoIndex = index + direcao;
  if (novoIndex < 0 || novoIndex >= colunas.length) return;

  const ehNovoLead = (c) => (c?.nome || "").toLowerCase() === "novo lead";
  if (ehNovoLead(colunas[index]) || ehNovoLead(colunas[novoIndex])) {
    colunas = garantirNovoLeadPrimeira(colunas);
    salvarColunasLocalEApi(colunas);
    carregarColunas();
    return;
  }


  [colunas[index], colunas[novoIndex]] = [colunas[novoIndex], colunas[index]];
  colunas = garantirNovoLeadPrimeira(colunas);
  salvarColunasLocalEApi(colunas);
  carregarColunas();
}


/* Migração e semente */
function migrarColunas() {
  const colunas = lerJSON("colunasLead", []);
  let mudou = false;

  const sugerir = (nome = "") => {
    const n = (nome || "").toLowerCase();
    if (n.includes("negocia")) return "handshake";
    if (n.includes("lead"))     return "user-plus";
    if (n.includes("card"))     return "send";
    if (n.includes("degust"))   return "utensils";
    if (n.includes("fech"))     return "check-circle";
    if (n.includes("arquiv"))   return "archive";
    return "list";
  };

  colunas.forEach(c => {
    if (!c) return;
    if (!c.icone && c.icon) { c.icone = c.icon; mudou = true; }
    if (typeof c.icone !== "string" || !c.icone.trim() || !/^[a-z0-9-]+$/.test(c.icone.trim())) {
      c.icone = sugerir(c.nome);
      mudou = true;
    }
    if (typeof c.descricao !== "string") { c.descricao = ""; mudou = true; }
  });

  if (mudou) salvarColunasLocalEApi(colunas);
}

/* ------------------ CRUD das demais listas ------------------ */
function desenharListaSimples(container, itens, salvarCb, excluirCb) {
  container.innerHTML = "";
  itens.forEach((valor, index) => {
    const li = document.createElement("li");

    const input = document.createElement("input");
    input.value = valor;
    input.disabled = true;

    const btnEdit = document.createElement("button");
    btnEdit.innerHTML = '<i data-lucide="pencil"></i>';
    btnEdit.addEventListener("click", () => {
      input.disabled = !input.disabled;
      if (!input.disabled) input.focus();
      salvarCb();
    });

    const btnDel = document.createElement("button");
    btnDel.innerHTML = '<i data-lucide="trash-2"></i>';
    btnDel.addEventListener("click", () => excluirCb(index));

    li.append(input, btnEdit, btnDel);
    container.appendChild(li);
  });
  refreshIcons();
}

/* Como Conheceu */
function carregarFontes() {
  const lista = $("#listaFontes"); if (!lista) return;
  const fontes = lerJSON("comoConheceu", []);
  desenharListaSimples(
    lista, fontes,
    () => salvarFontes(),
    (i) => {
      fontes.splice(i, 1);
      salvarListaLocalEApi("comoConheceu", fontes);
      carregarFontes();
    }
  );
}
function adicionarFonte() {
  const v = ($("#novaFonte").value || "").trim(); if (!v) return;
  const fontes = lerJSON("comoConheceu", []);
  fontes.push(v);
  salvarListaLocalEApi("comoConheceu", fontes);
  $("#novaFonte").value = "";
  carregarFontes();
}
function salvarFontes() {
  const valores = $$("#listaFontes li input").map(i => i.value.trim());
  salvarListaLocalEApi("comoConheceu", valores);
}


/* Motivos de Arquivamento */
function carregarMotivos() {
  const lista = $("#listaMotivos"); if (!lista) return;
  const motivos = lerJSON("motivosArquivamento", []);
  desenharListaSimples(
    lista, motivos,
    () => salvarMotivos(),
    (i) => {
      motivos.splice(i, 1);
      salvarListaLocalEApi("motivosArquivamento", motivos);
      carregarMotivos();
    }
  );
}
function adicionarMotivo() {
  const v = ($("#novoMotivo").value || "").trim(); if (!v) return;
  const motivos = lerJSON("motivosArquivamento", []);
  motivos.push(v);
  salvarListaLocalEApi("motivosArquivamento", motivos);
  $("#novoMotivo").value = "";
  carregarMotivos();
}
function salvarMotivos() {
  const valores = $$("#listaMotivos li input").map(i => i.value.trim());
  salvarListaLocalEApi("motivosArquivamento", valores);
}

/* Categorias de Serviços */
function carregarServicos() {
  const lista = $("#listaServicos"); if (!lista) return;
  const servicos = lerJSON("categoriasServicos", []);
  desenharListaSimples(
    lista, servicos,
    () => salvarServicos(),
    (i) => {
      servicos.splice(i, 1);
      salvarListaLocalEApi("categoriasServicos", servicos);
      carregarServicos();
    }
  );
}
function adicionarServico() {
  const v = ($("#novoServico").value || "").trim(); if (!v) return;
  const servicos = lerJSON("categoriasServicos", []);
  servicos.push(v);
  salvarListaLocalEApi("categoriasServicos", servicos);
  $("#novoServico").value = "";
  carregarServicos();
}
function salvarServicos() {
  const valores = $$("#listaServicos li input").map(i => i.value.trim());
  salvarListaLocalEApi("categoriasServicos", valores);
}


/* Categorias de Cardápio */
function carregarCardapios() {
  const lista = $("#listaCardapio"); if (!lista) return;
  const cardapios = lerJSON("categoriasCardapio", []);
  desenharListaSimples(
    lista, cardapios,
    () => salvarCardapios(),
    (i) => {
      cardapios.splice(i, 1);
      salvarListaLocalEApi("categoriasCardapio", cardapios);
      carregarCardapios();
    }
  );
}
function adicionarCardapio() {
  const v = ($("#novoCardapio").value || "").trim(); if (!v) return;
  const cardapios = lerJSON("categoriasCardapio", []);
  cardapios.push(v);
  salvarListaLocalEApi("categoriasCardapio", cardapios);
  $("#novoCardapio").value = "";
  carregarCardapios();
}
function salvarCardapios() {
  const valores = $$("#listaCardapio li input").map(i => i.value.trim());
  salvarListaLocalEApi("categoriasCardapio", valores);
}

/* Tipos de Evento */
function carregarTiposEvento() {
  const lista = $("#listaTiposEvento"); if (!lista) return;
  const tipos = lerJSON("tiposEvento", []);
  desenharListaSimples(
    lista, tipos,
    () => salvarTiposEvento(),
    (i) => {
      tipos.splice(i, 1);
      salvarListaLocalEApi("tiposEvento", tipos);
      carregarTiposEvento();
    }
  );
}
function adicionarTipoEvento() {
  const v = ($("#novoTipoEvento").value || "").trim(); if (!v) return;
  const tipos = lerJSON("tiposEvento", []);
  tipos.push(v);
  salvarListaLocalEApi("tiposEvento", tipos);
  $("#novoTipoEvento").value = "";
  carregarTiposEvento();
}
function salvarTiposEvento() {
  const valores = $$("#listaTiposEvento li input").map(i => i.value.trim());
  salvarListaLocalEApi("tiposEvento", valores);
}


/* Tipos de Agenda */
function carregarTiposAgenda() {
  const lista = $("#listaTiposAgenda"); if (!lista) return;
  const tipos = lerJSON("tiposAgenda", []);
  desenharListaSimples(
    lista, tipos,
    () => salvarTiposAgenda(),
    (i) => {
      tipos.splice(i, 1);
      salvarListaLocalEApi("tiposAgenda", tipos);
      carregarTiposAgenda();
    }
  );
}
function adicionarTipoAgenda() {
  const campo = $("#novoTipoAgenda");
  const novo = (campo.value || "").trim();
  if (!novo) return;

  const tipos = lerJSON("tiposAgenda", []);
  tipos.push(novo);

  // normaliza, ordena e remove duplicados (case-insensitive)
  const ordenados = tipos
    .map(t => t.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const vistos = new Set();
  const limpos = [];
  for (const t of ordenados) {
    const k = t.toLowerCase();
    if (!vistos.has(k)) {
      vistos.add(k);
      limpos.push(t);
    }
  }

  salvarListaLocalEApi("tiposAgenda", limpos);
  campo.value = "";
  carregarTiposAgenda();
}
function salvarTiposAgenda() {
  const valores = $$("#listaTiposAgenda li input")
    .map(i => i.value.trim())
    .filter(Boolean);

  // remove duplicados (case-insensitive)
  const vistos = new Set();
  const limpos = [];
  for (const t of valores) {
    const k = t.toLowerCase();
    if (!vistos.has(k)) {
      vistos.add(k);
      limpos.push(t);
    }
  }

  salvarListaLocalEApi("tiposAgenda", limpos);
}


/* Funções da Equipe */
const FUNCOES_KEY = "funcoesEquipe";
const DEFAULT_FUNCOES = [
  "Maître","Garçom","Churrasqueiro","Cozinheira","Auxiliar",
  "Limpeza","Montagem/Desmontagem","Motorista","Coordenador","Auxiliar de cozinha"
];

function seedFuncoesEquipe() {
  const atual = lerJSON(FUNCOES_KEY, []);
  if (!Array.isArray(atual) || atual.length === 0) {
    salvarListaLocalEApi(FUNCOES_KEY, DEFAULT_FUNCOES);
  }
}

function carregarFuncoesEquipe() {
  const lista = $("#listaFuncoesEquipe"); if (!lista) return;
  const funcoes = lerJSON(FUNCOES_KEY, []);

  lista.innerHTML = "";
  funcoes.forEach((nome, idx) => {
    const li = document.createElement("li");

    const input = document.createElement("input");
    input.value = nome;
    input.disabled = true;

    const btnEdit = document.createElement("button");
    btnEdit.innerHTML = '<i data-lucide="pencil"></i>';
    btnEdit.addEventListener("click", () => {
      input.disabled = !input.disabled;
      input.focus();
      salvarFuncoesEquipe();
    });

    const btnDel = document.createElement("button");
    btnDel.innerHTML = '<i data-lucide="trash-2"></i>';
    btnDel.addEventListener("click", () => {
      funcoes.splice(idx, 1);
      salvarListaLocalEApi(FUNCOES_KEY, funcoes);
      carregarFuncoesEquipe();
    });

    li.append(input, btnEdit, btnDel);
    lista.appendChild(li);
  });
  refreshIcons();
}
function adicionarFuncaoEquipe() {
  const campo = $("#novaFuncaoEquipe");
  const nome = (campo.value || "").trim();
  if (!nome) return;

  const funcoes = lerJSON(FUNCOES_KEY, []);
  if (funcoes.some(f => f.toLowerCase() === nome.toLowerCase())) {
    alert("Já existe essa função.");
    return;
  }
  funcoes.push(nome);
  salvarListaLocalEApi(FUNCOES_KEY, funcoes);
  campo.value = "";
  carregarFuncoesEquipe();
}
function salvarFuncoesEquipe() {
  const inputs = $$("#listaFuncoesEquipe li input");
  const novos = inputs.map(i => i.value.trim()).filter(Boolean);
  salvarListaLocalEApi(FUNCOES_KEY, novos);
}


/* ------------------ Wire dos botões/inputs ------------------ */
function wireAcoes() {
  // Tabs
  wireTabs();

  // Colunas
  $("#btnAddColuna")?.addEventListener("click", adicionarColuna);
  $("#nomeColuna")?.addEventListener("input", sugerirIcone);

  // Como Conheceu
  $("#btnAddFonte")?.addEventListener("click", adicionarFonte);

  // Motivos
  $("#btnAddMotivo")?.addEventListener("click", adicionarMotivo);

  // Serviços
  $("#btnAddServico")?.addEventListener("click", adicionarServico);

  // Cardápio
  $("#btnAddCardapio")?.addEventListener("click", adicionarCardapio);

  // Tipos de Evento
  $("#btnAddTipoEvento")?.addEventListener("click", adicionarTipoEvento);

  // Funções de equipe
  $("#btnAddFuncaoEquipe")?.addEventListener("click", adicionarFuncaoEquipe);

  // Tipos de agenda
  $("#btnAddTipoAgenda")?.addEventListener("click", adicionarTipoAgenda);
}

/* ------------------ Inicialização ------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  // 1) Colunas do Funil: sincroniza da API para o localStorage (se a API estiver configurada)
  await syncColunasFromApiToLocal();

  // 2) Faz migração e semente padrão de colunas, se necessário
  migrarColunas();
  seedColunasSeVazio();

  // 3) Garante que "Novo Lead" exista e esteja correto, e salva em local + API
  const _tmpCols = lerJSON("colunasLead", []);
  salvarColunasLocalEApi(_tmpCols);

  // 4) Sincroniza listas auxiliares da API para o localStorage (se a API existir)
  await Promise.all([
    syncListaFromApiToLocal("comoConheceu"),
    syncListaFromApiToLocal("motivosArquivamento"),
    syncListaFromApiToLocal("categoriasServicos"),
    syncListaFromApiToLocal("categoriasCardapio"),
    syncListaFromApiToLocal("tiposEvento"),
    syncListaFromApiToLocal("tiposAgenda"),
    syncListaFromApiToLocal(FUNCOES_KEY),
  ]);

  // 5) Semente das funções de equipe (se ainda não houver nada)
  seedFuncoesEquipe();

  // 6) Liga os botões / ações da tela
  wireAcoes();

  // 7) Carrega o conteúdo inicial das abas
  setActiveTab("colunas");
  carregarFontes();
  carregarMotivos();
  carregarServicos();
  carregarCardapios();
  carregarTiposEvento();
  carregarTiposAgenda();
  carregarFuncoesEquipe();

  // 8) Atualiza os ícones exibidos
  refreshIcons();
});

