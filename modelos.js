// Usa a base que o HTML já definiu (Netlify / Render / Dev)
const API_BASE = (window.__API_BASE__ || "").replace(/\/+$/, "");

// ================= Utilitários =================
const $  = (s,p=document)=>p.querySelector(s);
const $$ = (s,p=document)=>Array.from(p.querySelectorAll(s));

// Cache em memória (nada de armazenamento local como fonte de verdade para modelos)
let modelosIndexCache = [];   // [{ slug, nome, updatedAt }]
let variaveisCache    = [];   // [{ chave, rotulo, exemplo }]

// ---- Cliente da API de Modelos ----
async function apiListarModelos(){
  const j = await window.apiFetch(`${API_BASE}/modelos`, { method: 'GET' });
  const data = (j && j.data) ? j.data : j;
  modelosIndexCache = Array.isArray(data) ? data : [];
  return modelosIndexCache;
}

async function apiCriarModelo(nome){
  const j = await window.apiFetch(`${API_BASE}/modelos`, { method: 'POST', body: { nome }, headers: { 'Content-Type':'application/json' } });
  const created = (j && j.data) ? j.data : j;
  modelosIndexCache.push(created);
  return created;
}

async function apiRenomearModelo(slug, novoNome){
  const j = await window.apiFetch(`${API_BASE}/modelos/${encodeURIComponent(slug)}`, { method: 'PUT', body: { nome: novoNome }, headers: { 'Content-Type':'application/json' } });
  const updated = (j && j.data) ? j.data : j;
  modelosIndexCache = modelosIndexCache.map(m =>
    m.slug === slug ? updated : m
  );
  return updated;
}

async function apiExcluirModelo(slug){
  await window.apiFetch(`${API_BASE}/modelos/${encodeURIComponent(slug)}`, { method: 'DELETE' });
  modelosIndexCache = modelosIndexCache.filter(m => m.slug !== slug);
  return true;
}

async function apiObterConteudo(slug){
  const j = await window.apiFetch(`${API_BASE}/modelos/${encodeURIComponent(slug)}/conteudo`, { method: 'GET' });
  const data = (j && j.data) ? j.data : j;
  return (data && data.html) ? data.html : "";
}

async function apiSalvarConteudo(slug, html){
  const j = await window.apiFetch(`${API_BASE}/modelos/${encodeURIComponent(slug)}/conteudo`, { method: 'PUT', body: { html }, headers: { 'Content-Type':'application/json' } });
  // se o backend devolver updatedAt, atualiza o cache
  try {
    const data = (j && j.data) ? j.data : j;
    if(data && data.updatedAt){
      modelosIndexCache = modelosIndexCache.map(m =>
        m.slug === slug ? { ...m, updatedAt: data.updatedAt } : m
      );
    }
  } catch {}
  return true;
}

// ---- Variáveis {{chave}} na nuvem ----
async function apiCarregarVariaveis(){
  try{
    const j = await window.apiFetch(`${API_BASE}/modelos/variaveis`, { method: 'GET' });
    const data = (j && j.data) ? j.data : j;
    variaveisCache = Array.isArray(data) ? data : [];
    return variaveisCache;
  }catch(e){
    console.warn("Falha ao carregar variáveis, usando lista vazia");
    variaveisCache = [];
    return variaveisCache;
  }
}

async function apiSalvarVariaveis(lista){
  await window.apiFetch(`${API_BASE}/modelos/variaveis`, { method: 'PUT', body: lista, headers: { 'Content-Type':'application/json' } });
  variaveisCache = lista;
  return true;
}

// Agora getIndex/setIndex/getVars passam a usar apenas os caches em memória:
const getIndex = ()=> modelosIndexCache;
const setIndex = (arr)=>{ modelosIndexCache = arr || []; };

// Variáveis: leitura só via cache
function getVars(){
  return Array.isArray(variaveisCache) ? variaveisCache : [];
}

const uniqueSlug = (base)=>{
  let s = slugify(base)||"modelo";
  let idx=2;
  const idxList = getIndex();
  while(idxList.some(m=>m.slug === s)){
    s = `${slugify(base)}_${idx++}`;
  }
  return s;
};

/**
 * Substitui {{chave}} por valores.
 * - values: objeto com { chave: valor } (opcional)
 * - useExemplos: se true, usa o campo "exemplo" das variáveis como fallback
 */
function replaceVars(html, values = {}, useExemplos = true){
  const vars = getVars();
  const base = useExemplos
    ? Object.fromEntries(vars.map(v => [v.chave, v.exemplo || '']))
    : {};
  const map = { ...base, ...values };

  for (const [k, v] of Object.entries(map)){
    const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
    html = html.replace(re, v ?? '');
  }
  return html;
}

const fmtDate = (t)=> new Date(t).toLocaleString();

// ================= Grade de Cards =================
function renderGrid(filter = "") {
  const grid = $("#cardsGrid");
  const hint = $("#gridVazioHint");
  if (!grid) return;

  const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = norm(filter);

  const lista = getIndex()
    .filter(m => norm(m.nome).includes(q))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  grid.innerHTML = lista.map(m => `
    <div class="card" data-slug="${m.slug}">
      <div class="card-top">
        <div class="name"><i data-lucide="file-text"></i> <span>${m.nome}</span></div>
        <div class="actions">
          <button class="act-rename" title="Renomear"><i data-lucide="edit-3"></i></button>
          <button class="act-delete" title="Excluir"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      <div class="meta">Atualizado: ${fmtDate(m.updatedAt || Date.now())}</div>
      <div class="card-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-secondary act-open">Abrir</button>
      </div>
    </div>
  `).join("");

  if (hint) hint.style.display = lista.length ? "none" : "block";
  try { window.lucide?.createIcons?.(); } catch {}

  // binds – abrir
  grid.querySelectorAll(".act-open").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const slug = e.currentTarget.closest(".card").dataset.slug;
      await openEditor(slug);
    });
  });

  // binds – renomear (somente nuvem)
  grid.querySelectorAll(".act-rename").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const card = e.currentTarget.closest(".card");
      const slug = card.dataset.slug;
      const nomeAtual = card.querySelector(".name span").textContent.trim();
      const novo = prompt("Novo nome do modelo:", nomeAtual);
      if (!novo || novo === nomeAtual) return;

      try {
        await apiRenomearModelo(slug, novo);
        renderGrid($("#buscaCards")?.value || "");
        if (state.slug === slug) {
          $("#editorNome").textContent = novo;
        }
      } catch (err) {
        console.error(err);
        alert("Não foi possível renomear o modelo na nuvem.");
      }
    });
  });

  // binds – excluir (somente nuvem)
  grid.querySelectorAll(".act-delete").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const card = e.currentTarget.closest(".card");
      const slug = card.dataset.slug;
      const nome = card.querySelector(".name span").textContent.trim();

      if (!confirm(`Excluir o modelo "${nome}"?`)) return;

      try {
        await apiExcluirModelo(slug);
        if (state.slug === slug) {
          closeEditor();
        }
        renderGrid($("#buscaCards")?.value || "");
      } catch (err) {
        console.error(err);
        alert("Não foi possível excluir o modelo na nuvem.");
      }
    });
  });
}

// ================= Editor =================
const state = { slug:"", editing:false, selectedImg:null, natW:0, natH:0 };

function setEditing(on){
  state.editing = !!on;
  $("#editorHtml").setAttribute("contenteditable", on?"true":"false");
  $("#toolbar").setAttribute("aria-disabled", on?"false":"true");
  $("#btnSalvar").disabled = !on;
  $("#btnEditar").disabled = on;
  $("#pageCounter").hidden = !on;
}

async function openEditor(slug){
  const idx = getIndex();
  const modelo = idx.find(m => m.slug === slug);
  const nome = modelo?.nome || "(sem título)";

  state.slug = slug;
  $("#editorNome").textContent = nome;
  const overlay = $("#editorOverlay");
  if (overlay) overlay.hidden = false;

  try {
    const html = await apiObterConteudo(slug);
    const editor = document.getElementById('editorHtml');
    const txt = document.getElementById('editorTexto');
    if(editor){
      editor.innerHTML = html || "";
    }
    if (txt){
      txt.value = html || "";
    }
    updatePageCounter();
  } catch(e){
    console.error(e);
    alert("Não foi possível carregar o conteúdo deste modelo da nuvem.");
  }
}

function closeEditor(){
  $("#editorOverlay").hidden = true;
  state.slug = "";
}

// Helpers de inserção no editor
function getEditorEl(){ return document.getElementById('editorHtml'); }

function insertNodeAtCursor(node){
  const editor = getEditorEl();
  if (!editor) return;

  editor.focus();
  const sel = window.getSelection?.();
  let range = null;

  if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    range = sel.getRangeAt(0);
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function insertImageSrc(src){
  const editor = getEditorEl();
  if (!editor) return;
  if (getComputedStyle(editor).display === 'none'){
    alert('Saia do modo "Ver código HTML" para inserir uma imagem.');
    return;
  }
  const img = new Image();
  img.alt = 'imagem';
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  img.onload = () => {
    insertNodeAtCursor(img);
    try { openImgTools(img); } catch (e) {}
  };
  img.src = src;
}

async function fileToDataURLCompressed(file, maxW=1200, maxH=1700, quality=0.75){
  const loadBitmap = () => createImageBitmap(file).catch(()=>null);
  let bmp = await loadBitmap();
  let w0, h0, draw;
  if (bmp){
    w0 = bmp.width; h0 = bmp.height;
    draw = (ctx,w,h)=>ctx.drawImage(bmp,0,0,w,h);
  } else {
    const data = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
    const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=data; });
    w0 = img.naturalWidth; h0 = img.naturalHeight;
    draw = (ctx,w,h)=>ctx.drawImage(img,0,0,w,h);
  }
  const ratio = Math.min(maxW / w0, maxH / h0, 1);
  const w = Math.round(w0 * ratio), h = Math.round(h0 * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

// ====== Toolbar ======
function bindToolbar(){
  $$(".editor-toolbar .tb[data-cmd]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const cmd = btn.getAttribute("data-cmd");
      document.execCommand(cmd, false, null);
      $("#editorHtml")?.focus();
      updatePageCounter();
    });
  });
  $("#blockFormat")?.addEventListener("change", (e)=>{
    const val=e.target.value; document.execCommand('formatBlock', false, val==='p'?'P':val);
    $("#editorHtml")?.focus(); updatePageCounter();
  });
  $("#fontSizeSel")?.addEventListener("change", (e)=>{
    document.execCommand('fontSize', false, e.target.value);
    $("#editorHtml")?.focus(); updatePageCounter();
  });
  $("#btnLink")?.addEventListener("click", ()=>{
    const url = prompt('URL (https://...)','https://'); if(url) document.execCommand('createLink', false, url);
    $("#editorHtml")?.focus();
  });
  $("#btnImgUrl")?.addEventListener("click", ()=>{
    const url = prompt('URL da imagem:');
    if (!url) return;
    insertImageSrc(url);
  });
  document.getElementById('btnImgUpload')?.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataURLCompressed(file, 1200, 1700, 0.75);
      insertImageSrc(dataUrl);
      document.getElementById('editorHtml')?.focus();
    } catch (err) {
      console.error(err);
      alert('Não consegui processar a imagem. Tente outra foto ou um arquivo menor.');
    } finally {
      e.target.value = '';
    }
  });
  $("#btnClear")?.addEventListener("click", ()=>{
    document.execCommand('removeFormat', false, null);
    $("#editorHtml")?.focus();
  });
  $("#btnToggleHtml")?.addEventListener("click", ()=>{
    const edH = $("#editorHtml");
    const edT = $("#editorTexto");
    if(edH.style.display!=="none"){
      edT.value = edH.innerHTML;
      edH.style.display="none"; edT.hidden=false;
    }else{
      edH.innerHTML = edT.value;
      edT.hidden=true; edH.style.display="";
      updatePageCounter();
    }
  });
  $("#imgQuick")?.addEventListener("change", ()=>{
    if(!state.selectedImg) return;
    const p = +$("#imgQuick").value;
    state.selectedImg.style.width = p + '%';
    state.selectedImg.style.height = 'auto';
    syncImgFields();
    updatePageCounter();
  });
}

// --- util: posiciona painel perto da imagem (acima; se não couber, abaixo)
function placeToolsNear(img){
  const t = document.getElementById('imgTools');
  if(!img || !t) return;
  const r = img.getBoundingClientRect();
  const padding = 10;
  const topAbove = window.scrollY + r.top - t.offsetHeight - padding;
  const topBelow = window.scrollY + r.bottom + padding;
  const willFitAbove = topAbove > window.scrollY + 8;
  t.style.left = (window.scrollX + r.left + padding) + 'px';
  t.style.top  = (willFitAbove ? topAbove : topBelow) + 'px';
}

// --- util: deixa um elemento arrastável pela "alça" (handle)
function makeDraggable(el, handle){
  if(!el || !handle) return;
  let sx=0, sy=0, ox=0, oy=0, dragging=false;
  handle.addEventListener('mousedown', (e)=>{
    dragging = true;
    sx = e.pageX; sy = e.pageY;
    const rect = el.getBoundingClientRect();
    ox = rect.left + window.scrollX;
    oy = rect.top  + window.scrollY;
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{
    if(!dragging) return;
    el.style.left = (ox + (e.pageX - sx)) + 'px';
    el.style.top  = (oy + (e.pageY - sy)) + 'px';
  });
  window.addEventListener('mouseup', ()=>{
    dragging=false;
    document.body.style.cursor='';
  });
}

// === SUBSTITUA seu openImgTools por este:
function openImgTools(img){
  state.selectedImg = img;
  const t = document.getElementById('imgTools');
  if(!t) return;

  // posiciona perto da imagem
  placeToolsNear(img);
  t.hidden = false;

  // ativa arraste pela alça "Imagem"
  const handle = t.querySelector('.row strong');
  makeDraggable(t, handle);

  state.natW = img.naturalWidth || img.width;
  state.natH = img.naturalHeight|| img.height;
  syncImgFields();
}

// estado salvo da ancoragem (preferência visual armazenada no cache de UI)
const DOCK_KEY = 'modelos.imgtools.docked';
function isDocked(){ try { globalThis.__UI_STORE__ = globalThis.__UI_STORE__ || {}; return globalThis.__UI_STORE__[DOCK_KEY] === '1'; } catch { return false; } }
function setDocked(on){ try { globalThis.__UI_STORE__ = globalThis.__UI_STORE__ || {}; globalThis.__UI_STORE__[DOCK_KEY] = on ? '1' : '0'; } catch {} }

function dockImgTools(on){
  const t = document.getElementById('imgTools');
  if(!t) return;
  if(on){
    t.style.position = 'fixed';
    t.style.left = '';
    t.style.top  = '';
    t.style.right = '16px';
    t.style.bottom= '16px';
  }else{
    t.style.position = 'absolute';
    t.style.right = '';
    t.style.bottom= '';
    if(state.selectedImg) placeToolsNear(state.selectedImg);
  }
  setDocked(!!on);
}

// ajusta openImgTools para respeitar o "dock"
(function patchOpenTools(){
  const _open = openImgTools;
  openImgTools = function(img){
    _open(img);
    if(isDocked()) dockImgTools(true);
  };
})();

// bind do botão 📌
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('imgDock');
  if(btn){
    btn.addEventListener('click', ()=>{
      dockImgTools(!isDocked());
    });
  }
  if(isDocked()) dockImgTools(true);
});

// --- mover imagem com Shift + arrastar dentro do editor
function enableImageDragWithinEditor(){
  const editor = document.getElementById('editorHtml');
  if(!editor) return;

  let draggingImg = null;
  let caretEl = null;

  function showCaretAt(x,y){
    const range = (document.caretRangeFromPoint?.(x,y))
      || (document.caretPositionFromPoint?.(x,y) && (()=>{
          const cp = document.caretPositionFromPoint(x,y);
          const r = document.createRange();
          r.setStart(cp.offsetNode, cp.offset);
          r.collapse(true);
          return r;
        })());
    if(!range) return;

    if(!caretEl){
      caretEl = document.createElement('div');
      caretEl.className = 'drop-caret';
      document.body.appendChild(caretEl);
    }
    const rect = range.getBoundingClientRect();
    caretEl.style.left = (rect.left + window.scrollX) + 'px';
    caretEl.style.top  = (rect.top  + window.scrollY) + 'px';
    caretEl.style.height = Math.max(18, rect.height) + 'px';
  }
  function clearCaret(){ caretEl?.remove(); caretEl = null; }

  editor.addEventListener('mousedown', (e)=>{
    const img = e.target.closest('img');
    if(img && e.shiftKey){
      draggingImg = img;
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e)=>{
    if(!draggingImg) return;
    showCaretAt(e.clientX, e.clientY);
    placeToolsNear(draggingImg);
  });

  window.addEventListener('mouseup', (e)=>{
    if(!draggingImg) return;
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if(range){
      range.insertNode(draggingImg);
      range.setStartAfter(draggingImg);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges(); sel?.addRange(range);
    }
    draggingImg = null;
    clearCaret();
    document.body.style.cursor = '';
    updatePageCounter();
    placeToolsNear(state.selectedImg || editor.querySelector('img:last-of-type'));
  });
}

function closeImgTools(){ $("#imgTools").hidden = true; state.selectedImg=null; }
function syncImgFields(){
  if(!state.selectedImg) return;
  const w = state.selectedImg.width, h = state.selectedImg.height;
  $("#imgWpx").value = Math.round(w);
  $("#imgHpx").value = Math.round(h);
  const pct = Math.round((state.selectedImg.getBoundingClientRect().width / state.selectedImg.parentElement.getBoundingClientRect().width) * 100);
  $("#imgWSlider").value = Math.min(100, Math.max(10, pct));
  $("#imgWLabel").textContent = $("#imgWSlider").value + '%';
}
function setAlignClass(img, cls){
  img.classList.remove('img-left','img-center','img-right');
  if(cls) img.classList.add(cls);
}
function bindImgTools(){
  $("#imgClose")?.addEventListener("click", closeImgTools);
  $("#imgWSlider")?.addEventListener("input", e=>{
    if(!state.selectedImg) return;
    state.selectedImg.style.width = e.target.value + '%';
    state.selectedImg.style.height = 'auto';
    $("#imgWLabel").textContent = e.target.value + '%';
    syncImgFields(); updatePageCounter();
  });
  $("#imgWpx")?.addEventListener("input", e=>{
    if(!state.selectedImg) return;
    const lock = $("#imgLock").checked;
    const w = Math.max(20, +e.target.value||0);
    state.selectedImg.style.width = w + 'px';
    if(lock){
      const r = state.natH / state.natW;
      state.selectedImg.style.height = Math.round(w*r) + 'px';
    }
    syncImgFields(); updatePageCounter();
  });
  $("#imgHpx")?.addEventListener("input", e=>{
    if(!state.selectedImg) return;
    const lock = $("#imgLock").checked;
    const h = Math.max(20, +e.target.value||0);
    state.selectedImg.style.height = h + 'px';
    if(lock){
      const r = state.natW / state.natH;
      state.selectedImg.style.width = Math.round(h*r) + 'px';
    }
    syncImgFields(); updatePageCounter();
  });
  $("#imgAlignLeft")?.addEventListener("click", ()=>{ if(state.selectedImg){ setAlignClass(state.selectedImg,'img-left'); updatePageCounter(); }});
  $("#imgAlignCenter")?.addEventListener("click",()=>{ if(state.selectedImg){ setAlignClass(state.selectedImg,'img-center'); updatePageCounter(); }});
  $("#imgAlignRight")?.addEventListener("click", ()=>{ if(state.selectedImg){ setAlignClass(state.selectedImg,'img-right'); updatePageCounter(); }});
  $("#imgRemoveFloat")?.addEventListener("click",()=>{ if(state.selectedImg){ setAlignClass(state.selectedImg,''); state.selectedImg.style.display='inline-block'; updatePageCounter(); }});

  $("#editorHtml")?.addEventListener("click", (e)=>{
    if(!state.editing) return;
    const img = e.target.closest('img');
    if (img) openImgTools(img); else closeImgTools();
  });

  document.addEventListener('mousedown', (e)=>{
    const tools = $("#imgTools");
    if(!tools || tools.hidden) return;
    if(!tools.contains(e.target) && !e.target.closest('#editorHtml img')){
      tools.hidden = true;
    }
  });
}

// ====== Page Counter ======
function updatePageCounter(){
  const wrap = $(".a4");
  if(!wrap) return;
  const pageHeight = wrap.clientWidth * 1.4142;
  const content = $("#editorHtml").scrollHeight;
  const pages = Math.max(1, Math.ceil(content / pageHeight));
  $("#pageCounter").textContent = `Estimativa: ${pages} página(s)`;
}

// ====== Preview (A4) ======
function htmlForPreview(){
  const raw = (document.getElementById('editorHtml')?.style.display !== 'none')
    ? document.getElementById('editorHtml')?.innerHTML || ''
    : document.getElementById('editorTexto')?.value || '';

  const html = replaceVars(raw, {}, true);

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Preview</title>
<style>
  @page { size: A4; margin: 20mm; }
  html, body { background:#f0f0f0; margin:0; }
  .doc {
    width: 210mm;
    margin: 10mm auto;
    background:#fff;
    border:1px solid #ddd;
    box-shadow:0 1px 4px rgba(0,0,0,.12);
    padding: 20mm;
  }
  img{ max-width:100%; height:auto; }
  .img-left  { float:left;  margin:0 12px 8px 0;  display:inline-block; }
  .img-right { float:right; margin:0 0 8px 12px; display:inline-block; }
  .img-center{ float:none;  display:block; margin:8px auto; }
  h1,h2,h3,table,blockquote,pre{ break-inside: avoid; page-break-inside: avoid; }
  .page-break{ break-after: page; page-break-after: always; }
  @media print{
    html, body { background:#fff; }
    .doc{ margin:0; border:none; box-shadow:none; }
  }
</style>
</head>
<body>
  <div class="doc">${html}</div>
</body>
</html>`;
}

function openPreview(){
  const modal = $("#previewModal");
  const frame = $("#previewFrame");
  if(!modal || !frame){ alert("Pré-visualização indisponível."); return; }
  frame.srcdoc = htmlForPreview();
  modal.hidden = false;
}

function closePreview(){
  $("#previewFrame").srcdoc = "";
  $("#previewModal").hidden = true;
}

async function salvarModeloNaNuvem(slug){
  const editor = document.getElementById('editorHtml');
  const html = editor?.innerHTML || "";

  try {
    await apiSalvarConteudo(slug, html);
    const idx = getIndex().map(m =>
      m.slug === slug ? { ...m, updatedAt: Date.now() } : m
    );
    setIndex(idx);
    renderGrid($("#buscaCards")?.value || "");
    return true;
  } catch(e){
    console.error(e);
    alert(
      'Não foi possível salvar o modelo na nuvem.\n' +
      'Verifique sua conexão ou tente novamente em alguns instantes.'
    );
    return false;
  }
}

// ================= Inicialização da página =================
async function initModelosPage(){
  try{ lucide.createIcons(); }catch{}

  await Promise.all([
    apiListarModelos(),
    apiCarregarVariaveis()
  ]);

  $("#buscaCards")?.addEventListener("input", (e)=> renderGrid(e.target.value));

  $("#btnNovoCard")?.addEventListener("click", async ()=>{
    const nome = prompt("Nome do novo modelo:");
    if(!nome) return;
    try {
      const created = await apiCriarModelo(nome);
      renderGrid($("#buscaCards")?.value || "");
      await openEditor(created.slug);
      setEditing(true);
    } catch(e){
      console.error(e);
      alert("Não foi possível criar o modelo na nuvem. Tente novamente.");
    }
  });

  renderGrid();

  bindToolbar();
  bindImgTools();
  enableImageDragWithinEditor();

  $("#btnEditar")?.addEventListener("click", ()=>{
    setEditing(true);
    updatePageCounter();
  });

  $("#btnSalvar")?.addEventListener("click", async ()=>{
    if (!state.slug){
      alert("Abra um modelo.");
      return;
    }
    const ok = await salvarModeloNaNuvem(state.slug);
    if (ok){
      setEditing(false);
      alert("Modelo salvo na nuvem.");
    }
  });

  $("#btnVisualizar")?.addEventListener("click", openPreview);
  $("#btnFechar")?.addEventListener("click", closeEditor);

  $("#btnPreviewClose")?.addEventListener("click", closePreview);
  $("#btnPreviewPrint")?.addEventListener("click", ()=>{
    const fr = $("#previewFrame");
    fr?.contentWindow?.focus();
    fr?.contentWindow?.print();
  });

  $("#editorHtml")?.addEventListener("input", updatePageCounter);
}

document.addEventListener("DOMContentLoaded", ()=>{
  initModelosPage().catch(err=>{
    console.error(err);
    alert("Erro ao carregar a Central de Modelos. Verifique sua conexão.");
  });
});

// garante atributo contenteditable
(function ensureEditable(){
  const ed = $("#editorHtml");
  if(ed && !ed.hasAttribute("contenteditable")) ed.setAttribute("contenteditable","false");
})();
document.addEventListener("DOMContentLoaded",()=>{
  const btn=document.getElementById("hamburguer");
  const menu=document.getElementById("menuLateral");
  const back=document.getElementById("menuBackdrop");
  if(!btn||!menu) return;

  btn.addEventListener("click",(e)=>{
    e.stopPropagation();
    const aberto=menu.classList.toggle("aberto");
    document.body.classList.toggle("no-scroll",aberto);
    if(back){
      back.hidden=!aberto;
      back.classList.toggle("visivel",aberto);
    }
  });

  back?.addEventListener("click",()=>menu.classList.remove("aberto"));
});
