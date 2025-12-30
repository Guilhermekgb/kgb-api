/* =========================================================
   CARDÁPIOS E PRODUTOS – COM IMAGENS EM INDEXEDDB
   - Evita QuotaExceededError do localStorage
   - Suporta ordem/remoção e tamanhos
   - Migração automática de imagens antigas (base64 -> IndexedDB)
   ========================================================= */

/* =================== STORAGE BÁSICO =================== */
// Agora trabalhamos sempre com as listas em memória
let produtos   = [];
let adicionais = [];
let servicos   = [];

// Lê o que já existe no navegador (modo antigo, só como cópia de segurança)
function carregarDoLocalStorage() {
  try { produtos   = (typeof readLS === 'function' ? (readLS('produtosBuffet',[])||[]) : (JSON.parse(localStorage.getItem("produtosBuffet")) || [])); } catch { produtos = []; }
  try { adicionais = (typeof readLS === 'function' ? (readLS('adicionaisBuffet',[])||[]) : (JSON.parse(localStorage.getItem("adicionaisBuffet")) || [])); } catch { adicionais = []; }
  try { servicos   = (typeof readLS === 'function' ? (readLS('servicosBuffet',[])||[]) : (JSON.parse(localStorage.getItem("servicosBuffet")) || [])); } catch { servicos = []; }
}

// Grava uma cópia no navegador (para telas antigas continuarem funcionando)
function salvarNoLocalStorage() {
  try {
    if (typeof writeLS === 'function') {
      writeLS('produtosBuffet', produtos);
      writeLS('cardapiosBuffet', produtos.filter(p => p.tipo === 'cardapio'));
      writeLS('adicionaisBuffet', adicionais);
      writeLS('servicosBuffet', servicos);
    } else {
      localStorage.setItem("produtosBuffet", JSON.stringify(produtos));
      const cardapios = produtos.filter(p => p.tipo === "cardapio");
      localStorage.setItem("cardapiosBuffet", JSON.stringify(cardapios));
      localStorage.setItem("adicionaisBuffet", JSON.stringify(adicionais));
      localStorage.setItem("servicosBuffet", JSON.stringify(servicos));
    }
  } catch (e) {
    console.warn("Falha ao salvar no localStorage:", e);
  }
}
// Carrega dados dando preferência para a NUVEM (API)
// e usa o localStorage como plano B se a API falhar
async function carregarDadosIniciais() {
  // Se tivermos apiFetch configurado, tentamos buscar da API
  if (TEM_API && typeof window.apiFetch === "function") {
    try {
      // Busca em paralelo cardápios, adicionais e serviços
      const [remotosCardapios, remotosAdicionais, remotosServicos] = await Promise.all([
        window.apiFetch("/catalogo/cardapios"),
        window.apiFetch("/catalogo/adicionais"),
        window.apiFetch("/catalogo/servicos")
      ]);

      // Garante que venham arrays
      produtos   = Array.isArray(remotosCardapios)   ? remotosCardapios   : [];
      adicionais = Array.isArray(remotosAdicionais) ? remotosAdicionais : [];
      servicos   = Array.isArray(remotosServicos)   ? remotosServicos   : [];

      // Garante que cada cardápio tenha tipo "cardapio"
      produtos.forEach(p => {
        if (!p.tipo) p.tipo = "cardapio";
      });

      // Mantém uma cópia no localStorage como cache/espelho
      salvarNoLocalStorage();

      console.log("[cardapios] Dados carregados da API.");
      return; // sai da função aqui se deu certo
    } catch (err) {
      console.warn("[cardapios] Falha ao carregar da API, usando dados locais:", err);
    }
  }

  // Se não tiver API ou se deu erro, cai pro localStorage
  carregarDoLocalStorage();
  console.log("[cardapios] Dados carregados do localStorage.");
}

/* =================== NUVEM / API (Render) =================== */
// Usa o helper apiFetch do kgb-common.js quando existir
const TEM_API = typeof window !== "undefined" && typeof window.apiFetch === "function";

// Envia 1 registro para a nuvem. Não trava a tela se falhar; apenas mostra aviso.
async function salvarNaNuvem(tipo, registro) {
  if (!TEM_API) return false;

  let path = null;
  if (tipo === "cardapio")      path = "/catalogo/cardapios";
  else if (tipo === "adicional") path = "/catalogo/adicionais";
  else if (tipo === "servico")   path = "/catalogo/servicos";

  if (!path) return false;

  try {
    await window.apiFetch(path, { method: "POST", body: registro });
    try { window.toast?.("Sincronizado com a nuvem.", "success"); } catch {}
    return true;
  } catch (e) {
    console.warn("[cardapios] Falha ao salvar na nuvem:", e);
    try {
      window.toast?.(
        "Não foi possível sincronizar com a nuvem agora. Os dados continuam salvos neste navegador.",
        "warn"
      );
    } catch {}
    return false;
  }
}
// Sobe uma imagem do catálogo para a NUVEM (Firebase Storage via /catalogo/imagens)
// e devolve a URL pública. Se algo der errado, retorna null.
async function uploadImagemCatalogo(fileOrBlob) {
  try {
    if (!fileOrBlob) return null;

    // Descobre a base da API (mesma lógica que o resto do sistema usa)
    const base =
      (typeof window !== "undefined" && window.__API_BASE__) ||
      localStorage.getItem("API_BASE") ||
      "";

    const apiBase = String(base || "").trim();
    if (!apiBase) {
      console.warn("[cardapios] API_BASE não configurada para upload de imagens.");
      return null;
    }

    const form = new FormData();
    form.append("file", fileOrBlob);

    const resp = await fetch(apiBase.replace(/\/$/, "") + "/catalogo/imagens", {
      method: "POST",
      body: form
    });

    const out = await resp.json().catch(() => ({}));

    if (!resp.ok || !out || !out.data || !out.data.url) {
      console.warn("[cardapios] Falha ao enviar imagem para a nuvem:", out);
      return null;
    }

    return out.data.url;
  } catch (e) {
    console.warn("[cardapios] Erro ao enviar imagem para a nuvem:", e);
    return null;
  }
}

/* =================== ESTADO DE EDIÇÃO =================== */
let indexEditando = null;
let indexEditandoAdicional = null;
let indexEditandoServico = null;

/* =================== MENU MOBILE =================== */
document.getElementById("hamburguer")?.addEventListener("click", () => {
  document.getElementById("menuLateral")?.classList.toggle("aberto");
  document.getElementById("menuBackdrop")?.toggleAttribute("hidden");
});

/* =================== INDEXEDDB HELPERS =================== */
const DB_NAME = "buffetDB";
const DB_STORE = "imagens";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function newId() {
  return (crypto?.randomUUID?.() ?? ("img_" + Date.now() + "_" + Math.random().toString(16).slice(2)));
}

async function putImageBlob(blob) {
  const db = await openDB();
  const id = newId();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({ id, blob });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

async function getImageBlob(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => reject(req.error);
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onloadend = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

async function srcToBlob(src) {
  // funciona com data: e blob:
  const resp = await fetch(src);
  return await resp.blob();
}

/* =================== INIT =================== */
document.addEventListener("DOMContentLoaded", async () => {
   if (window.lucide) lucide.createIcons();

  // Agora carregamos dando preferência para a nuvem (API),
  // e usamos os dados locais só como plano B.
  await carregarDadosIniciais();

  // Tabs
  const tabs = document.querySelectorAll(".tab[data-aba]");
  const abas = document.querySelectorAll(".conteudo-aba");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("ativo"));
      abas.forEach(a => a.style.display = "none");
      tab.classList.add("ativo");
      document.getElementById("aba-" + tab.dataset.aba).style.display = "block";
      if (window.lucide) lucide.createIcons();
    });
  });

  // Previews
  document.getElementById("imagemProduto")?.addEventListener("change", () => {
    montarPreviewComSelect("imagemProduto", "previewImagens");
  });
  document.getElementById("imagemAdicional")?.addEventListener("change", () => {
    montarPreviewComSelect("imagemAdicional", "previewAdicional");
  });

  // Formulários
  document.getElementById("formProduto")?.addEventListener("submit", salvarProduto);
  document.getElementById("btnAddFaixa")?.addEventListener("click", adicionarFaixa);
  document.getElementById("formAdicional")?.addEventListener("submit", salvarAdicional);
  document.getElementById("formServico")?.addEventListener("submit", salvarServico);

  // Migração automática (base64 -> IndexedDB), depois listar
  await migrarImagensSeNecessario();
  listarProdutos();
  listarAdicionais();
  listarServicos();
  listarCategoriasServico();
  listarFornecedoresServico();
});

/* =================== UTILS =================== */
function validarFaixas(faixas) {
  if (!Array.isArray(faixas) || faixas.length === 0) return true;
  const ordenadas = [...faixas].sort((a, b) => a.min - b.min);
  for (let i = 0; i < ordenadas.length; i++) {
    const {min, max, valor} = ordenadas[i];
    if (Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(valor)) return false;
    if (min < 1 || max < 1 || valor < 0) return false;
    if (min > max) return false;
    if (i > 0 && min <= ordenadas[i-1].max) return false;
  }
  return true;
}

function toBRL(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* =================== PREVIEW DE IMAGENS =================== */
function removerArquivoDoInput(inputId, removeIndex) {
  const input = document.getElementById(inputId);
  if (!input || !input.files) return;
  const dt = new DataTransfer();
  Array.from(input.files).forEach((file, idx) => {
    if (idx !== Number(removeIndex)) dt.items.add(file);
  });
  input.files = dt.files;
}

function moverPreview(previewId, wrap, dir) {
  const container = document.getElementById(previewId);
  const items = Array.from(container.children);
  const idx = items.indexOf(wrap);
  const novo = idx + dir;
  if (novo < 0 || novo >= items.length) return;
  if (dir < 0) container.insertBefore(wrap, items[novo]);
  else container.insertBefore(wrap, items[novo].nextSibling);
}

function anexarBotoesOrdenacao(wrap, previewId) {
  const box = document.createElement("div");
  box.className = "controles-ordem";

  const up = document.createElement("button");
  up.type = "button";
  up.className = "btn-mover";
  up.title = "Mover para cima";
  up.textContent = "↑";
  up.addEventListener("click", () => moverPreview(previewId, wrap, -1));

  const down = document.createElement("button");
  down.type = "button";
  down.className = "btn-mover";
  down.title = "Mover para baixo";
  down.textContent = "↓";
  down.addEventListener("click", () => moverPreview(previewId, wrap, +1));

  box.appendChild(up);
  box.appendChild(down);
  wrap.appendChild(box);
}

function anexarBotaoRemover(wrap, { source, inputId, previewId } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-remover-img";
  btn.title = "Remover imagem";
  btn.textContent = "×";
  btn.addEventListener("click", () => {
    if (source === "input") {
      removerArquivoDoInput(inputId, wrap.dataset.fileIndex);
      montarPreviewComSelect(inputId, previewId); // reindexa
    } else {
      wrap.remove(); // preview é a fonte da verdade
    }
  });
  wrap.appendChild(btn);
}

function montarPreviewComSelect(fileInputId, previewDivId) {
  const input = document.getElementById(fileInputId);
  const preview = document.getElementById(previewDivId);
  if (!input || !preview) return;

  const files = Array.from(input.files || []);
  preview.innerHTML = "";

  files.forEach((file, idx) => {
    const url = URL.createObjectURL(file);

    const wrap = document.createElement("div");
    wrap.className = "preview-item";
    wrap.dataset.fileIndex = String(idx);

    const img = document.createElement("img");
    img.src = url;
    img.className = "preview-thumb";

    const select = document.createElement("select");
    select.className = "select-tamanho";
    select.innerHTML = `
      <option value="grande">Grande</option>
      <option value="medio">Médio</option>
      <option value="pequena">Pequena (½)</option>
    `;
    select.value = idx === 0 ? "grande" : "pequena";

    wrap.appendChild(img);
    wrap.appendChild(select);
    preview.appendChild(wrap);

    anexarBotaoRemover(wrap, { source: "input", inputId: fileInputId, previewId: previewDivId });
    anexarBotoesOrdenacao(wrap, previewDivId);
  });
}

/* =================== MIGRAÇÃO (base64 -> IDB) =================== */
async function migrarColecaoImagens(lista) {
  let mudou = false;

  for (const item of lista) {
    if (!Array.isArray(item.imagens)) continue;

    for (let i = 0; i < item.imagens.length; i++) {
      const img = item.imagens[i];
      // Se já tem dbId, já está migrada
      if (img && typeof img === "object" && img.dbId) continue;

      // Caso antigo: { src: "data:image/...", tamanho }
      if (img && typeof img === "object" && img.src?.startsWith("data:")) {
        try {
          const blob = await srcToBlob(img.src);
          const id = await putImageBlob(blob);
          item.imagens[i] = { dbId: id, tamanho: img.tamanho || "pequena" };
          mudou = true;
        } catch {}
      }
    }
  }

  return mudou;
}

async function migrarImagensSeNecessario() {
  try {
    const mudouProdutos = await migrarColecaoImagens(produtos);
    const mudouAdicionais = await migrarColecaoImagens(adicionais);

    if (mudouProdutos) {
      localStorage.setItem("produtosBuffet", JSON.stringify(produtos));
      // espelho legacy
      let espelho = JSON.parse(localStorage.getItem("cardapiosBuffet")) || [];
      // reescreve mantendo ids
      espelho = produtos.filter(p => p.tipo === "cardapio");
      localStorage.setItem("cardapiosBuffet", JSON.stringify(espelho));
    }
    if (mudouAdicionais) {
      localStorage.setItem("adicionaisBuffet", JSON.stringify(adicionais));
    }
  } catch (e) {
    // se algo falhar, apenas segue o fluxo
    console.warn("Migração de imagens falhou:", e);
  }
}

/* =================== CARDÁPIOS =================== */
function adicionarFaixa() {
  const container = document.getElementById("faixasContainer");
  const index = container.children.length;
  const div = document.createElement("div");
  div.className = "linha-faixa";
  div.innerHTML = `
    <input type="number" placeholder="Mínimo de convidados" class="input" id="faixaMin-${index}" />
    <input type="number" placeholder="Máximo de convidados" class="input" id="faixaMax-${index}" />
    <input type="number" step="0.01" placeholder="Valor R$" class="input" id="faixaValor-${index}" />
  `;
  container.appendChild(div);
}

async function salvarProduto(e) {
  e.preventDefault();

  const nomeProduto      = document.getElementById("nomeProduto");
  const descricaoProduto = document.getElementById("descricaoProduto");

  // Coleta faixas
  const faixas = [];
  const container = document.getElementById("faixasContainer");
  for (let i = 0; i < container.children.length; i++) {
    const min   = parseInt(document.getElementById(`faixaMin-${i}`)?.value);
    const max   = parseInt(document.getElementById(`faixaMax-${i}`)?.value);
    const valor = parseFloat(document.getElementById(`faixaValor-${i}`)?.value);
    if (!Number.isNaN(min) && !Number.isNaN(max) && !Number.isNaN(valor)) {
      faixas.push({ min, max, valor });
    }
  }
  if (!validarFaixas(faixas)) {
    alert("Verifique as faixas: valores válidos, sem sobreposição e com mínimo ≤ máximo.");
    return;
  }

  const input = document.getElementById("imagemProduto");
  const files = Array.from(input?.files || []);

  const concluir = async (imagensMeta) => {
    const novo = {
      id: indexEditando !== null ? produtos[indexEditando].id : Date.now(),
      nome: (nomeProduto.value || "").trim(),
      tipo: "cardapio",
      descricao: (descricaoProduto.value || "").trim(),
      faixas,
      // Agora imagensMeta pode ter { url, tamanho } ou { dbId, tamanho }
      imagens: imagensMeta
    };

    if (!novo.nome) {
      alert("Informe o nome do cardápio.");
      return;
    }

    // Atualiza lista em memória
    if (indexEditando !== null) {
      produtos[indexEditando] = novo;
      indexEditando = null;
      const btn = document.querySelector("#formProduto button[type='submit']");
      if (btn) btn.textContent = "Salvar Cardápio";
    } else {
      produtos.push(novo);
    }

    // 1) Salva cópia local (para outras telas antigas)
    salvarNoLocalStorage();

    // 2) Tenta sincronizar com a nuvem (não trava se der erro)
    await salvarNaNuvem("cardapio", novo);

    // 3) Limpa formulário e atualiza tabela
    e.target.reset();
    const faixasContainer = document.getElementById("faixasContainer");
    if (faixasContainer) faixasContainer.innerHTML = "";
    const preview = document.getElementById("previewImagens");
    if (preview) preview.innerHTML = "";
    listarProdutos();

    const msg = document.getElementById("msgProduto");
    if (msg) {
      msg.style.display = "block";
      setTimeout(() => (msg.style.display = "none"), 2500);
    }
    if (window.lucide) lucide.createIcons();
  };

  // Há arquivos novos selecionados
  if (files.length > 0) {
    // Respeita a ORDEM definida no preview
    const itemsPreview   = Array.from(document.querySelectorAll("#previewImagens .preview-item"));
    const ordemIdx       = itemsPreview.map(w => Number(w.dataset.fileIndex));
    const filesOrdenados = ordemIdx.map(i => files[i]);
    const selects        = itemsPreview.map(w => w.querySelector(".select-tamanho")?.value);

    const metas = [];
    for (let i = 0; i < filesOrdenados.length; i++) {
      const file    = filesOrdenados[i];
      const tamanho = selects[i] || (i === 0 ? "grande" : "pequena");

      // 1) Tenta subir para a nuvem
      let url = await uploadImagemCatalogo(file);

      if (url) {
        // Imagem salva na nuvem
        metas.push({ url, tamanho });
      } else {
        // 2) Fallback: salva no IndexedDB local (modo antigo)
        try {
          const id = await putImageBlob(file);
          metas.push({ dbId: id, tamanho });
        } catch (err) {
          console.warn("[cardapios] Falha ao salvar imagem localmente:", err);
        }
      }
    }
    await concluir(metas);
  } else {
    // Sem arquivos novos => usa exatamente o que está no preview
    const itensPreview = Array.from(document.querySelectorAll("#previewImagens .preview-item"));
    const metas = [];

    for (let i = 0; i < itensPreview.length; i++) {
      const wrap    = itensPreview[i];
      const tamanho = wrap.querySelector(".select-tamanho")?.value || (i === 0 ? "grande" : "pequena");
      const url     = wrap.dataset.url;
      const dbId    = wrap.dataset.dbid;

      if (url) {
        // Já tem URL da nuvem associada
        metas.push({ url, tamanho });
      } else if (dbId) {
        // Imagem antiga, salva no IndexedDB
        metas.push({ dbId, tamanho });
      } else {
        // Legado: só tem o src (base64 ou blob URL) -> tenta mandar pra nuvem agora
        const src = wrap.querySelector("img")?.src || "";
        if (src) {
          try {
            const blob = await srcToBlob(src);
            let novaUrl = await uploadImagemCatalogo(blob);

            if (novaUrl) {
              metas.push({ url: novaUrl, tamanho });
            } else {
              // Se nem na nuvem nem nada, tenta pelo menos guardar localmente
              const id = await putImageBlob(blob);
              metas.push({ dbId: id, tamanho });
            }
          } catch (err) {
            console.warn("[cardapios] Falha ao migrar imagem legacy:", err);
          }
        }
      }
    }
    await concluir(metas);
  }
}

function listarProdutos() {
  const tbody = document.querySelector("#tabelaProdutos tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  produtos.forEach((p, i) => {
    const faixasHTML = Array.isArray(p.faixas) && p.faixas.length
      ? p.faixas.map(f => `De ${f.min} a ${f.max}: ${toBRL(f.valor)}`).join("<br>")
      : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:6px;">${p.nome}</td>
      <td style="text-align:center;">${faixasHTML}</td>
      <td style="font-size:13px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${p.descricao || "-"}
      </td>
      <td class="acoes-celula">
        <span class="badge-status">ativo</span>
        <button class="btn-editar" onclick="editarProduto(${i})">Editar</button>
        <button class="btn-excluir" onclick="removerProduto(${i})">Excluir</button>
        <button class="btn-pdf" title="Visualizar PDF" onclick="gerarPdf(${i})">
          <i data-lucide="file-text"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (window.lucide) lucide.createIcons();
}

async function editarProduto(index) {
  const p = produtos[index];

  document.getElementById("nomeProduto").value = p.nome || "";
  document.getElementById("tipoProduto").value = "cardapio";
  document.getElementById("descricaoProduto").value = p.descricao || "";

  const fileInput = document.getElementById("imagemProduto");
  if (fileInput) fileInput.value = "";

  // Faixas
  const cont = document.getElementById("faixasContainer");
  cont.innerHTML = "";
  (p.faixas || []).forEach((f, i) => {
    const div = document.createElement("div");
    div.className = "linha-faixa";
    div.innerHTML = `
      <input type="number" class="input" placeholder="Mínimo" id="faixaMin-${i}" value="${f.min}">
      <input type="number" class="input" placeholder="Máximo" id="faixaMax-${i}" value="${f.max}">
      <input type="number" step="0.01" class="input" placeholder="Valor R$" id="faixaValor-${i}" value="${f.valor}">
    `;
    cont.appendChild(div);
  });

  // Preview de imagens existentes (URL na nuvem, IDB ou legado)
  const previewDiv = document.getElementById("previewImagens");
  previewDiv.innerHTML = "";

  for (let idx = 0; idx < (p.imagens || []).length; idx++) {
    const img = p.imagens[idx];
    const wrap = document.createElement("div");
    wrap.className = "preview-item";

    const el = document.createElement("img");
    el.className = "preview-thumb";

    let tamanho = "pequena";

    if (img && typeof img === "object" && img.url) {
      // NOVO: imagem já está na nuvem
      el.src = img.url;
      wrap.dataset.url = img.url;
      tamanho = img.tamanho || (idx === 0 ? "grande" : "pequena");
    } else if (img && typeof img === "object" && img.dbId) {
      // Imagem antiga salva no IndexedDB
      const blob = await getImageBlob(img.dbId);
      const url = blob ? URL.createObjectURL(blob) : "";
      el.src = url;
      wrap.dataset.dbid = img.dbId;
      tamanho = img.tamanho || (idx === 0 ? "grande" : "pequena");
    } else {
      // legado base64 ou string simples
      el.src = (typeof img === "string") ? img : (img?.src || "");
      tamanho = (typeof img === "object" && img?.tamanho) ? img.tamanho : (idx === 0 ? "grande" : "pequena");
    }

    const select = document.createElement("select");
    select.className = "select-tamanho";
    select.innerHTML = `
      <option value="grande">Grande</option>
      <option value="medio">Médio</option>
      <option value="pequena">Pequena (½)</option>
    `;
    select.value = tamanho;

    wrap.appendChild(el);
    wrap.appendChild(select);
    previewDiv.appendChild(wrap);

    anexarBotaoRemover(wrap, { source: "existing" });
    anexarBotoesOrdenacao(wrap, "previewImagens");
  }

  indexEditando = index;
  const btn = document.querySelector("#formProduto button[type='submit']");
  if (btn) btn.textContent = "Atualizar Cardápio";
}


function removerProduto(index) {
  if (!confirm("Deseja excluir este cardápio?")) return;
  const id = produtos[index]?.id;
  produtos.splice(index, 1);
  localStorage.setItem("produtosBuffet", JSON.stringify(produtos));
  if (id) {
    let cs = JSON.parse(localStorage.getItem("cardapiosBuffet")) || [];
    cs = cs.filter(c => c.id !== id);
    localStorage.setItem("cardapiosBuffet", JSON.stringify(cs));
  }
  listarProdutos();
}

async function gerarPdf(index) {
  const produto = produtos[index];

  const faixasHTML = Array.isArray(produto.faixas) && produto.faixas.length
    ? produto.faixas.map(f => `De ${f.min} a ${f.max} convidados: ${toBRL(f.valor)}`).join("<br>")
    : "—";

  const partes = [];
  for (let i = 0; i < (produto.imagens || []).length; i++) {
    const img = produto.imagens[i];
    let dataURL = "";
    let tamanho = "pequena";

    if (img && typeof img === "object" && img.dbId) {
      const blob = await getImageBlob(img.dbId);
      dataURL = blob ? await blobToDataURL(blob) : "";
      tamanho = img.tamanho || (i === 0 ? "grande" : "pequena");
    } else {
      dataURL = (typeof img === "string") ? img : (img?.src || "");
      tamanho = (typeof img === "object" && img?.tamanho) ? img.tamanho : (i === 0 ? "grande" : "pequena");
    }

    const width = tamanho === "grande" ? 600 : (tamanho === "medio" ? 400 : 280);
    partes.push(`<img src="${dataURL}" style="max-width:100%; width:${width}px; margin-bottom:20px; border-radius:10px;">`);
  }
  const imagensHTML = partes.join("<br>");

  const html = `
    <html>
      <head>
        <title>${produto.nome} - PDF</title>
        <style>
          body { font-family: 'Playfair Display', serif; padding:40px; background:#fff; color:#333; }
          h1 { color:#5a3e2b; font-size:28px; border-bottom:2px solid #c29a5d; padding-bottom:10px; margin-bottom:30px; }
          .info { margin-bottom: 16px; font-size: 16px; }
          strong { color:#5a3e2b; }
          img { display:block; margin:0 auto 30px auto; box-shadow:0 0 6px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <h1>${produto.nome}</h1>
        ${imagensHTML}
        <div class="info"><strong>Tipo:</strong> Cardápio</div>
        <div class="info"><strong>Descrição:</strong> ${produto.descricao || 'Sem observações'}</div>
        <div class="info"><strong>Faixas de preço:</strong><br>${faixasHTML}</div>
        <p style="margin-top: 40px; font-size: 14px;">Gerado automaticamente pelo sistema.</p>
      </body>
    </html>
  `;
  const novaJanela = window.open('', '_blank', 'width=900,height=700');
  novaJanela.document.write(html);
  novaJanela.document.close();
  novaJanela.print();
}

/* =================== ADICIONAIS =================== */
function listarAdicionais() {
  const tbody = document.querySelector("#tabelaAdicionais tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  adicionais.forEach((a, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.nome}</td>
      <td style="text-align:center;">${a.tipo || "-"}</td>
      <td style="text-align:center;">${a.cobranca || "-"}</td>
      <td style="text-align:center;">${a.unidade || "-"}</td>
      <td style="text-align:center;">${toBRL(a.valor || 0)}</td>
      <td style="font-size:13px;">${a.descricao || "-"}</td>
      <td class="acoes-celula">
        <button class="btn-editar" onclick="editarAdicional(${i})">Editar</button>
        <button class="btn-excluir" onclick="removerAdicional(${i})">Excluir</button>
        <button class="btn-pdf" title="PDF" onclick="gerarPdfAdicional(${i})">
          <i data-lucide="file-text"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (window.lucide) lucide.createIcons();
}

async function salvarAdicional(e) {
  e.preventDefault();

  const nome      = document.getElementById("nomeAdicional").value.trim();
  const tipo      = document.getElementById("tipoAdicional").value;
  const cobranca  = document.getElementById("cobrancaAdicional").value;
  const unidade   = document.getElementById("unidadeAdicional").value.trim();
  const valor     = parseFloat(document.getElementById("valorAdicional").value) || 0;
  const descricao = document.getElementById("descricaoAdicional").value.trim();

  if (!nome || !tipo || !cobranca) {
    alert("Preencha nome, tipo e forma de cobrança.");
    return;
  }

  const input = document.getElementById("imagemAdicional");
  const files = Array.from(input?.files || []);

  const concluir = async (imagensMeta) => {
    const adicional = {
      id: indexEditandoAdicional !== null ? adicionais[indexEditandoAdicional].id : Date.now(),
      nome,
      tipo,
      cobranca,
      unidade,
      valor,
      descricao,
      // Pode ter { url, tamanho } ou { dbId, tamanho }
      imagens: imagensMeta
    };

    if (indexEditandoAdicional !== null) {
      adicionais[indexEditandoAdicional] = adicional;
      indexEditandoAdicional = null;
      const btn = document.querySelector("#formAdicional button[type='submit']");
      if (btn) btn.textContent = "Salvar Adicional";
    } else {
      adicionais.push(adicional);
    }

    // mantém cópia local
    localStorage.setItem("adicionaisBuffet", JSON.stringify(adicionais));

    // tenta sincronizar com a nuvem (se a API existir)
    try {
      await salvarNaNuvem("adicional", adicional);
    } catch (err) {
      console.warn("Falha ao sincronizar adicional na nuvem:", err);
    }

    listarAdicionais();

    e.target.reset();
    const prev = document.getElementById("previewAdicional");
    if (prev) prev.innerHTML = "";

    const msg = document.getElementById("msgAdicional");
    if (msg) {
      msg.style.display = "block";
      setTimeout(() => (msg.style.display = "none"), 2500);
    }
    if (window.lucide) lucide.createIcons();
  };

  if (files.length > 0) {
    // ordem do preview
    const itemsPreview   = Array.from(document.querySelectorAll("#previewAdicional .preview-item"));
    const ordemIdx       = itemsPreview.map(w => Number(w.dataset.fileIndex));
    const filesOrdenados = ordemIdx.map(i => files[i]);
    const selects        = itemsPreview.map(w => w.querySelector(".select-tamanho")?.value);

    const metas = [];
    for (let i = 0; i < filesOrdenados.length; i++) {
      const file    = filesOrdenados[i];
      const tamanho = selects[i] || (i === 0 ? "grande" : "pequena");

      // 1) tenta mandar pra nuvem
      let url = await uploadImagemCatalogo(file);

      if (url) {
        metas.push({ url, tamanho });
      } else {
        // 2) fallback: guarda no IndexedDB
        try {
          const id = await putImageBlob(file);
          metas.push({ dbId: id, tamanho });
        } catch (err) {
          console.warn("[adicionais] Falha ao salvar imagem localmente:", err);
        }
      }
    }
    await concluir(metas);
  } else {
    // usa preview atual
    const itensPreview = Array.from(document.querySelectorAll("#previewAdicional .preview-item"));
    const metas = [];

    for (let i = 0; i < itensPreview.length; i++) {
      const wrap    = itensPreview[i];
      const tamanho = wrap.querySelector(".select-tamanho")?.value || (i === 0 ? "grande" : "pequena");
      const url     = wrap.dataset.url;
      const dbId    = wrap.dataset.dbid;

      if (url) {
        metas.push({ url, tamanho });
      } else if (dbId) {
        metas.push({ dbId, tamanho });
      } else {
        // legado: só tem src → tenta nuvem e depois fallback
        const src = wrap.querySelector("img")?.src || "";
        if (src) {
          try {
            const blob   = await srcToBlob(src);
            let novaUrl  = await uploadImagemCatalogo(blob);

            if (novaUrl) {
              metas.push({ url: novaUrl, tamanho });
            } else {
              const id = await putImageBlob(blob);
              metas.push({ dbId: id, tamanho });
            }
          } catch (err) {
            console.warn("[adicionais] Falha ao migrar imagem legacy:", err);
          }
        }
      }
    }

    await concluir(metas);
  }
}



async function editarAdicional(index) {
  const a = adicionais[index];

  document.getElementById("nomeAdicional").value      = a.nome || "";
  document.getElementById("tipoAdicional").value      = a.tipo || "";
  document.getElementById("cobrancaAdicional").value  = a.cobranca || "";
  document.getElementById("unidadeAdicional").value   = a.unidade || "";
  document.getElementById("valorAdicional").value     = a.valor || "";
  document.getElementById("descricaoAdicional").value = a.descricao || "";

  const fileInput = document.getElementById("imagemAdicional");
  if (fileInput) fileInput.value = "";

  const preview = document.getElementById("previewAdicional");
  preview.innerHTML = "";

  for (let idx = 0; idx < (a.imagens || []).length; idx++) {
    const img  = a.imagens[idx];
    const wrap = document.createElement("div");
    wrap.className = "preview-item";

    const el = document.createElement("img");
    el.className = "preview-thumb";

    let tamanho = "pequena";

    if (img && typeof img === "object" && img.url) {
      // NOVO: imagem já na nuvem
      el.src = img.url;
      wrap.dataset.url = img.url;
      tamanho = img.tamanho || (idx === 0 ? "grande" : "pequena");
    } else if (img && typeof img === "object" && img.dbId) {
      // Imagem antiga no IndexedDB
      const blob = await getImageBlob(img.dbId);
      const url  = blob ? URL.createObjectURL(blob) : "";
      el.src = url;
      wrap.dataset.dbid = img.dbId;
      tamanho = img.tamanho || (idx === 0 ? "grande" : "pequena");
    } else {
      // legado base64/string
      el.src = (typeof img === "string") ? img : (img?.src || "");
      tamanho = (typeof img === "object" && img?.tamanho) ? img.tamanho : (idx === 0 ? "grande" : "pequena");
    }

    const select = document.createElement("select");
    select.className = "select-tamanho";
    select.innerHTML = `
      <option value="grande">Grande</option>
      <option value="medio">Médio</option>
      <option value="pequena">Pequena (½)</option>
    `;
    select.value = tamanho;

    wrap.appendChild(el);
    wrap.appendChild(select);
    preview.appendChild(wrap);

    anexarBotaoRemover(wrap, { source: "existing" });
    anexarBotoesOrdenacao(wrap, "previewAdicional");
  }

  indexEditandoAdicional = index;
  const btn = document.querySelector("#formAdicional button[type='submit']");
  if (btn) btn.textContent = "Atualizar Adicional";
}


function removerAdicional(index) {
  if (!confirm("Deseja excluir este adicional?")) return;
  adicionais.splice(index, 1);
  localStorage.setItem("adicionaisBuffet", JSON.stringify(adicionais));
  listarAdicionais();
}

async function gerarPdfAdicional(index) {
  const a = adicionais[index];

  const partes = [];
  for (let i = 0; i < (a.imagens || []).length; i++) {
    const img = a.imagens[i];
    let dataURL = "";
    let tamanho = "pequena";

    if (img && typeof img === "object" && img.dbId) {
      const blob = await getImageBlob(img.dbId);
      dataURL = blob ? await blobToDataURL(blob) : "";
      tamanho = img.tamanho || (i === 0 ? "grande" : "pequena");
    } else {
      dataURL = (typeof img === "string") ? img : (img?.src || "");
      tamanho = (typeof img === "object" && img?.tamanho) ? img.tamanho : (i === 0 ? "grande" : "pequena");
    }

    const width = tamanho === "grande" ? 600 : (tamanho === "medio" ? 400 : 280);
    partes.push(`<img src="${dataURL}" style="max-width:100%; width:${width}px; display:block; margin:0 auto 20px; border-radius:8px;">`);
  }
  const imagensHTML = partes.join("");

  const html = `
    <html>
      <head>
        <title>${a.nome}</title>
        <style>
          body { font-family:'Playfair Display',serif; padding:40px; }
          h1 { color:#5a3e2b; font-size:26px; border-bottom:2px solid #c29a5d; padding-bottom:10px; margin-bottom:20px; }
          .info { margin-bottom:20px; }
          strong { color:#5a3e2b; }
        </style>
      </head>
      <body>
        <h1>${a.nome}</h1>
        ${imagensHTML}
        <div class="info"><strong>Tipo:</strong> ${a.tipo || '-'}</div>
        <div class="info"><strong>Cobrança:</strong> ${a.cobranca || '-'}</div>
        <div class="info"><strong>Unidade:</strong> ${a.unidade || '-'}</div>
        <div class="info"><strong>Valor:</strong> ${toBRL(a.valor || 0)}</div>
        <div class="info"><strong>Descrição:</strong> ${a.descricao || 'Sem observações'}</div>
        <p style="margin-top:40px;">Gerado automaticamente pelo sistema.</p>
      </body>
    </html>`;
  const novaJanela = window.open('', '_blank', 'width=800,height=600');
  novaJanela.document.write(html);
  novaJanela.document.close();
  novaJanela.print();
}

/* =================== SERVIÇOS =================== */
function listarCategoriasServico() {
  const categorias = JSON.parse(localStorage.getItem("categoriasServicos")) || [];
  const select = document.getElementById("categoriaServico");
  if (!select) return;
  select.innerHTML = '<option value="">Selecione</option>';
  categorias.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat; opt.textContent = cat;
    select.appendChild(opt);
  });
}

function listarFornecedoresServico() {
  const fornecedores = JSON.parse(localStorage.getItem("fornecedoresBuffet")) || [];
  const select = document.getElementById("fornecedorServico");
  if (!select) return;
  select.innerHTML = '<option value="">Selecione</option>';
  fornecedores.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.nome || f;
    opt.textContent = f.nome || f;
    select.appendChild(opt);
  });
}

async function salvarServico(e) {
  e.preventDefault();

  const servico = {
    id: indexEditandoServico !== null ? servicos[indexEditandoServico].id : Date.now(),
    nome: document.getElementById("nomeServico").value.trim(),
    categoria: document.getElementById("categoriaServico").value,
    valor: parseFloat(document.getElementById("valorServico").value) || 0,
    cobranca: document.getElementById("cobrancaServico").value,
    fornecedor: document.getElementById("fornecedorServico").value,
    descricao: document.getElementById("descricaoServico").value.trim()
  };

  if (!servico.nome || !servico.categoria || !servico.cobranca) {
    alert("Preencha nome, categoria e forma de cobrança.");
    return;
  }

  if (indexEditandoServico !== null) {
    servicos[indexEditandoServico] = servico;
    indexEditandoServico = null;
    const btn = document.querySelector("#formServico button[type='submit']");
    if (btn) btn.textContent = "Salvar Serviço";
  } else {
    servicos.push(servico);
  }

  // mantém cópia local
  localStorage.setItem("servicosBuffet", JSON.stringify(servicos));

  // tenta mandar pra nuvem (se a API estiver disponível)
  try {
    await salvarNaNuvem("servico", servico);
  } catch (err) {
    console.warn("Falha ao sincronizar serviço na nuvem:", err);
  }

  listarServicos();
  e.target.reset();

  // volta pra aba de serviços bonitinha
  const tabServ = document.querySelector(".tab[data-aba='servicos']");
  if (tabServ) tabServ.classList.add("ativo");
  const abaServ = document.getElementById("aba-servicos");
  if (abaServ) abaServ.style.display = "block";

  document.querySelectorAll(".tab:not([data-aba='servicos'])").forEach(t => t.classList.remove("ativo"));
  document.querySelectorAll(".conteudo-aba:not(#aba-servicos)").forEach(a => a.style.display = "none");

  if (window.lucide) lucide.createIcons();
}


function listarServicos() {
  const tbody = document.querySelector("#tabelaServicos tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  servicos.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.nome}</td>
      <td>${s.categoria}</td>
      <td>${toBRL(s.valor)}</td>
      <td>${s.cobranca === "pessoa" ? "Por Pessoa" : "Total"}</td>
      <td>${s.fornecedor || '-'}</td>
      <td>${s.descricao || '-'}</td>
      <td class="acoes-celula">
        <button class="btn-editar" onclick="editarServico(${i})">Editar</button>
        <button class="btn-excluir" onclick="removerServico(${i})">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editarServico(index) {
  const s = servicos[index];
  document.getElementById("nomeServico").value = s.nome || "";
  document.getElementById("categoriaServico").value = s.category || s.categoria || "";
  document.getElementById("valorServico").value = s.valor || 0;
  document.getElementById("cobrancaServico").value = s.cobranca || "";
  document.getElementById("fornecedorServico").value = s.fornecedor || "";
  document.getElementById("descricaoServico").value = s.descricao || "";

  indexEditandoServico = index;
  const botao = document.querySelector("#formServico button[type='submit']");
  if (botao) botao.textContent = "Atualizar Serviço";
}

function removerServico(index) {
  if (!confirm("Deseja excluir este serviço?")) return;
  servicos.splice(index, 1);
  localStorage.setItem("servicosBuffet", JSON.stringify(servicos));
  listarServicos();
}
