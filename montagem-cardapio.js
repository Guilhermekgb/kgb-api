// ===== Utils =====
const fmtBRL = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const toNum = v => (typeof v==='number') ? v : (parseFloat(String(v??'').replace(/\./g,'').replace(',', '.')) || 0);
const ceilDiv = (a,b)=>Math.ceil((toNum(a)||0)/(toNum(b)||1));
const slug = (s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');

// ====== Fichas Técnicas (compat) ======
const FT_KEYS = { INS: 'ft:insumos', PRT: 'ft:pratos' };
const FT_getLS = (k, fb=[]) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };

// unidades base (un, g, ml)
const FT_toBaseQty = (qty, unit)=>{
  qty = Number(qty||0);
  switch(String(unit).toLowerCase()){
    case 'kg': return qty*1000;
    case 'l':  return qty*1000;
    default:   return qty;
  }
};
const FT_precoUnitarioBase = (ins)=>{
  const qBase = FT_toBaseQty(ins?.qtdPack||0, ins?.unid||'un');
  return qBase ? Number(ins?.precoPack||0) / qBase : 0;
};
// Lista de pratos (novo ft:pratos ou legado fichasTecnicas)
function FT_listarPratosCompat(){
  const novos = FT_getLS(FT_KEYS.PRT, []);
  if (Array.isArray(novos) && novos.length) return { lista: novos, modo: 'novo' };
  const antigos = FT_getLS('fichasTecnicas', []); // legado
  return { lista: antigos, modo: 'antigo' };
}
// Custo por porção
function FT_custoPorPorcao(prato){
  if (prato?.itens){
    const insumos = FT_getLS(FT_KEYS.INS, []);
    const total = (prato.itens||[]).reduce((s,it)=>{
      const ins = insumos.find(x=>x.id===it.insumoId);
      const r$Base = FT_precoUnitarioBase(ins);
      return s + Number(it.qtdBase||0) * r$Base;
    }, 0);
    const porcoes = Math.max(1, Number(prato.porcoes||1));
    return total / porcoes;
  }
  // legado
  return (prato?.ingredientes||[]).reduce((s,ing)=> s + (ing.custoPorPessoa||0), 0);
}

// ===== LocalStorage seguro (quota) =====
function sanitizeCardapioForStorage(c){
  if (!c || typeof c !== 'object') return null;
  const faixas = Array.isArray(c.faixas)
    ? c.faixas.map(f => ({
        de:   f.de ?? f.min ?? 0,
        ate:  f.ate ?? f.max ?? '',
        valor: toNum(f.valor)
      }))
    : [];
  const out = {
    id:   c.id ?? null,
    nome: c.nome ?? '',
    faixas
  };
  if (c.categorias && typeof c.categorias === 'object'){
    out.categorias = {};
    Object.keys(c.categorias).forEach(k=>{
      const max = c.categorias[k]?.max;
      if (max != null) out.categorias[k] = { max: Number(max)||0 };
    });
  }
  return out;
}
function trySetLS(key, value){
  try{
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }catch(e){
    if (key === 'cardapioSelecionado'){
      const v2 = {
        id: value?.id ?? null,
        nome: value?.nome ?? '',
        faixas: Array.isArray(value?.faixas)
          ? value.faixas.map(f=>({ de:f.de??f.min??0, ate:f.ate??f.max??'', valor: toNum(f.valor) }))
          : []
      };
      try{
        localStorage.setItem(key, JSON.stringify(v2));
        console.warn('LocalStorage cheio: salvei cardapioSelecionado em formato reduzido.');
        return 'reduced';
      }catch(e2){
        console.warn('Falhou mesmo em formato reduzido:', e2);
        return false;
      }
    }
    console.warn('Falha ao salvar em localStorage:', e);
    return false;
  }
}
function tryGetLS(key){
  try{
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  }catch{
    return null;
  }
}

// ===== Estado =====
let cardapioSelecionado = {};
let composicao = [];
let adicionaisDisponiveis = [];
let autosaveLigado = true;

// Tipos (seções do cardápio)
const TIPOS_KEY = 'tiposCardapioCatalogo';
let tiposCatalogo = [];
let tiposSelecionados = []; // ids (sem incluir 'adicional')

const SESSAO_PREFIX = 'sessaoMontagem_';

// ===== DOM refs =====
const nomeCardapioSpan = () => document.getElementById('nomeCardapio');
const selectCardapioBase = () => document.getElementById('selectCardapioBase');
const inputQtd = () => document.getElementById('qtdConvidados');
const inputHoras = () => document.getElementById('horasEvento');
const selectFaixaManual = () => document.getElementById('selectFaixaManual');
const faixasCardsDiv = () => document.getElementById('faixasCards');
const saveStatus = () => document.getElementById('saveStatus');

// ===== Inicialização =====
document.addEventListener('DOMContentLoaded', () => {
  // Ícones
  try { window.lucide?.createIcons?.(); } catch {}

  // ACORDEÃO: liga abrir/fechar dos cards com cabeçalho
  try {
    document.querySelectorAll('.card[data-collapsible] .card-head').forEach(head=>{
      head.addEventListener('click', () => {
        const pai = head.parentElement;
        if (!pai) return;
        pai.classList.toggle('aberto');
      });
    });
  } catch {}

  // Restaura cardápio previamente selecionado
  try {
    const dados = typeof tryGetLS === 'function'
      ? tryGetLS('cardapioSelecionado')
      : JSON.parse(localStorage.getItem('cardapioSelecionado') || 'null');
    if (dados) {
      cardapioSelecionado = dados;
      try { document.getElementById('nomeCardapio').textContent = (cardapioSelecionado?.nome || 'Cardápio'); } catch {}
    }
  } catch {}

  // Tipos (catálogo + UI)
  try { typeof carregarTiposCatalogo === 'function' && carregarTiposCatalogo(); } catch {}
  try { typeof renderizarTiposSelecionar === 'function' && renderizarTiposSelecionar(); } catch {}

  // Selects base
  try { typeof carregarCardapiosNoSelect === 'function' && carregarCardapiosNoSelect(); } catch {}

  // Preferir Ficha Técnica nova; se não houver, usa a função antiga
  try {
    if (typeof carregarPratosFTnoSelect === 'function') {
      carregarPratosFTnoSelect();
    } else if (typeof carregarPratosNoSelect === 'function') {
      carregarPratosNoSelect();
    }
  } catch {}

  try { typeof carregarAdicionaisNoSelect === 'function' && carregarAdicionaisNoSelect(); } catch {}
  try { typeof preencherFaixasDoCardapio === 'function' && preencherFaixasDoCardapio(cardapioSelecionado); } catch {}

  // Composição (itens)
  try {
    const chave = 'composicaoCardapio_' + (cardapioSelecionado?.id ?? 'draft');
    composicao = JSON.parse(localStorage.getItem(chave) || '[]');
  } catch { composicao = composicao || []; }

  // Sessão salva
  try {
    if (cardapioSelecionado?.id != null && typeof carregarSessao === 'function') {
      carregarSessao(cardapioSelecionado.id);
    }
  } catch {}

  // Seções padrão, se nada marcado
  try {
    if (!Array.isArray(tiposSelecionados) || !tiposSelecionados.length) {
      const base = ['entrada','acompanhamento','prato','sobremesa'];
      tiposSelecionados = base.filter(id => (Array.isArray(tiposCatalogo) ? tiposCatalogo.some(t => t.id === id) : true));
    }
  } catch {}

  // Monta blocos + custos fixos
  try { typeof montarBlocosDinamicos === 'function' && montarBlocosDinamicos(); } catch {}
  try { typeof montarTabelaCustosFixos === 'function' && montarTabelaCustosFixos({ autosugerir:false }); } catch {}

  // Eventos base (null-safe)
  const on = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el && typeof fn === 'function') el.addEventListener(ev, fn);
  };
  on('btnAddFaixaRascunho', 'click', typeof adicionarFaixaRascunho === 'function' ? adicionarFaixaRascunho : null);
  on('btnUsarRascunho',     'click', typeof usarRascunho === 'function' ? usarRascunho : null);
  on('btnAdicionarPrato',   'click', typeof adicionarPratoDaFicha === 'function' ? adicionarPratoDaFicha : null);
  on('btnAdicionarAdicional','click', typeof adicionarAdicionalCadastrado === 'function' ? adicionarAdicionalCadastrado : null);
  on('btnCalcularTotais',   'click', typeof atualizarTotais === 'function' ? atualizarTotais : null);
  on('btnSugerirCustos',    'click', () => typeof montarTabelaCustosFixos === 'function' && montarTabelaCustosFixos({ autosugerir:true }));
  on('btnRecalcularSugestoes','click', () => typeof montarTabelaCustosFixos === 'function' && montarTabelaCustosFixos({ autosugerir:true }));
  on('btnLimparCustos',     'click', typeof limparQuantidadesCustos === 'function' ? limparQuantidadesCustos : null);
  on('btnSalvarSessao',     'click', () => typeof salvarSessao === 'function' && salvarSessao(true));
  on('btnResetarSessao',    'click', typeof resetarSessao === 'function' ? resetarSessao : null);

  // Botões do diálogo "Gerenciar tipos"
  on('btnGerenciarTipos', 'click', typeof abrirDialogTipos === 'function' ? abrirDialogTipos : null);
  on('btnFecharDlgTipos', 'click', typeof fecharDialogTipos === 'function' ? fecharDialogTipos : null);
  on('btnFecharDlgTipos2','click', typeof fecharDialogTipos === 'function' ? fecharDialogTipos : null);
  on('btnAdicionarTipo',  'click', typeof adicionarTipoCatalogo === 'function' ? adicionarTipoCatalogo : null);

  // Autosave
  const autosaveToggle = document.getElementById('toggleAutosave');
  if (autosaveToggle) autosaveToggle.onchange = (e)=>{
    try { autosaveLigado = !!e.target.checked; typeof salvarAutosaveFlag === 'function' && salvarAutosaveFlag(); } catch {}
  };

  const selOnly = document.getElementById('toggleSelecionados');
  if (selOnly && typeof aplicarFiltroSelecionados === 'function') selOnly.onchange = aplicarFiltroSelecionados;

  // Qtd / Horas (debounce)
  const debounce = (fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  try {
    const q = document.getElementById('qtdConvidados');
    if (q) {
      q.addEventListener('input', debounce(()=>{ typeof atualizarTotais === 'function' && atualizarTotais(); typeof salvarSessaoDebounced === 'function' && salvarSessaoDebounced(); },300));
      q.addEventListener('change', ()=>{ typeof atualizarTotais === 'function' && atualizarTotais(); typeof salvarSessaoDebounced === 'function' && salvarSessaoDebounced(); });
    }
  } catch {}
  try {
    const h = document.getElementById('horasEvento');
    if (h) {
      h.addEventListener('input', debounce(()=>{ typeof atualizarTotais === 'function' && atualizarTotais(); },300));
      h.addEventListener('change', ()=>{ typeof atualizarTotais === 'function' && atualizarTotais(); typeof salvarSessaoDebounced === 'function' && salvarSessaoDebounced(); });
    }
  } catch {}

  // Busca
  try { typeof bindBuscaPratoFT === 'function' && bindBuscaPratoFT(); } catch {}

  try { typeof atualizarTotais === 'function' && atualizarTotais(); } catch {}
  try { typeof atualizarSaveStatus === 'function' && atualizarSaveStatus('Pronto'); } catch {}
});

// Atualiza select se a Ficha Técnica mudar em outra aba
window.addEventListener('storage', (e) => {
  try {
    if (e.key === 'ft:pratos' || e.key === 'fichasTecnicas') {
      if (typeof carregarPratosFTnoSelect === 'function') carregarPratosFTnoSelect();
      else if (typeof carregarPratosNoSelect === 'function') carregarPratosNoSelect();
    }
  } catch {}
});
// Ao focar esta aba, recarrega a lista
window.addEventListener('focus', () => {
  try {
    if (typeof carregarPratosFTnoSelect === 'function') carregarPratosFTnoSelect();
    else if (typeof carregarPratosNoSelect === 'function') carregarPratosNoSelect();
  } catch {}
});

// ========= Tipos (seções) =========
const DEFAULT_TIPOS = [
  { id:'entrada',        nome:'Entrada' },
  { id:'acompanhamento', nome:'Acompanhamento' },
  { id:'massa',          nome:'Massa' },
  { id:'prato',          nome:'Prato Principal' },
  { id:'sobremesa',      nome:'Sobremesa' },
  { id:'bebida',         nome:'Bebida' },
  { id:'molho',          nome:'Molho' },
  { id:'petit-menu',     nome:'Petit Menu' },
  { id:'cafe-manha',     nome:'Café da Manhã' },
  { id:'coffee-break',   nome:'Coffee Break' },
];

function carregarTiposCatalogo(){
  try {
    const raw = JSON.parse(localStorage.getItem(TIPOS_KEY) || 'null');
    const base = (Array.isArray(raw) && raw.length) ? raw
               : (Array.isArray(DEFAULT_TIPOS) ? DEFAULT_TIPOS : []);
    const seen = new Set();
    tiposCatalogo = base.map(t => {
      const nome = String(t?.nome || '').trim();
      const id   = String(t?.id || slug(nome)).trim();
      return { id, nome };
    })
    .filter(t => t.id && t.nome)
    .filter(t => !seen.has(t.id) && seen.add(t.id));
    localStorage.setItem(TIPOS_KEY, JSON.stringify(tiposCatalogo));
  } catch {
    try {
      tiposCatalogo = (Array.isArray(DEFAULT_TIPOS) ? DEFAULT_TIPOS : [])
        .map(t => ({ id: t?.id || slug(t?.nome || ''), nome: String(t?.nome || '').trim() }))
        .filter(t => t.id && t.nome);
      localStorage.setItem(TIPOS_KEY, JSON.stringify(tiposCatalogo));
    } catch {
      tiposCatalogo = [];
    }
  }
}
function salvarTiposCatalogo(){ localStorage.setItem(TIPOS_KEY, JSON.stringify(tiposCatalogo)); }

function renderizarTiposSelecionar(){
  const wrap = document.getElementById('tiposSelecionar');
  if (!wrap) return;
  wrap.innerHTML = '';

  const lista = Array.isArray(tiposCatalogo) ? [...tiposCatalogo] : [];
  tiposSelecionados = (Array.isArray(tiposSelecionados) ? tiposSelecionados : [])
    .filter(id => lista.some(t => t.id === id));

  if (!lista.length){
    wrap.innerHTML = '<span class="muted">Nenhum tipo cadastrado.</span>';
    return;
  }

  lista.sort((a,b) => String(a.nome||'').localeCompare(String(b.nome||''), 'pt-BR'));

  lista.forEach(t => {
    const id   = String(t.id || '');
    const nome = String(t.nome || id);

    const lbl = document.createElement('label');
    lbl.className = 'tipo-chip';
    lbl.innerHTML = `
      <input type="checkbox" value="${esc(id)}" ${tiposSelecionados.includes(id)?'checked':''} />
      <strong>${esc(nome)}</strong>
    `;
    if (tiposSelecionados.includes(id)) lbl.classList.add('ativo');

    lbl.querySelector('input').addEventListener('change', (e) => {
      const val = e.target.value;
      if (e.target.checked) {
        if (!tiposSelecionados.includes(val)) tiposSelecionados.push(val);
      } else {
        tiposSelecionados = tiposSelecionados.filter(x => x !== val);
      }
      lbl.classList.toggle('ativo', e.target.checked);
      if (typeof onTiposSelecionadosMudou === 'function') onTiposSelecionadosMudou();
    });

    wrap.appendChild(lbl);
  });
}
function onTiposSelecionadosMudou(){
  renderSelectCategoria();
  montarBlocosDinamicos();
  aplicarLimitesCategoria();
  renderizarComposicao();
  salvarSessaoDebounced();
}

// Dialog: gerenciar tipos (com fallback simples)
function abrirDialogTipos(){
  try { renderTabelaTipos(); } catch {}
  const dlg = document.getElementById('dlgTipos');
  if (!dlg) return;
  try {
    dlg.showModal();
  } catch {
    dlg.setAttribute('open','');
  }
}
function fecharDialogTipos(){
  const dlg = document.getElementById('dlgTipos');
  if (!dlg) return;
  try {
    dlg.close();
  } catch {
    dlg.removeAttribute('open');
  }
}
function renderTabelaTipos(){
  const tb = document.querySelector('#tabelaTipos tbody'); if(!tb) return;
  tb.innerHTML = '';
  tiposCatalogo.forEach(t=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(t.nome)}</td>
      <td>
        <button class="icon-btn" data-act="edit" data-id="${esc(t.id)}">Editar</button>
        <button class="icon-btn" data-act="del" data-id="${esc(t.id)}">Excluir</button>
      </td>
    `;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('button[data-act="edit"]').forEach(b=>b.onclick = ()=>{
    const id = b.dataset.id;
    const t = tiposCatalogo.find(x=>x.id===id); if(!t) return;
    const novoNome = prompt('Novo nome da seção:', t.nome);
    if (!novoNome) return;
    t.nome = novoNome.trim();
    salvarTiposCatalogo();
    renderTabelaTipos();
    renderizarTiposSelecionar();
    renderSelectCategoria();
    montarBlocosDinamicos();
    window.lucide?.createIcons?.();
  });
  tb.querySelectorAll('button[data-act="del"]').forEach(b=>b.onclick = ()=>{
    const id = b.dataset.id;
    if(!confirm('Excluir este tipo?')) return;
    tiposCatalogo = tiposCatalogo.filter(x=>x.id!==id);
    tiposSelecionados = tiposSelecionados.filter(x=>x!==id);
    salvarTiposCatalogo();
    renderTabelaTipos();
    renderizarTiposSelecionar();
    renderSelectCategoria();
    montarBlocosDinamicos();
    window.lucide?.createIcons?.();
    salvarSessaoDebounced();
  });
  window.lucide?.createIcons?.();
}
function adicionarTipoCatalogo(){
  const nomeInp = document.getElementById('novoTipoNome');
  const nome = (nomeInp?.value || '').trim();
  if (!nome){ alert('Informe o nome da seção.'); return; }
  const id = slug(nome);
  if (tiposCatalogo.some(t=>t.id===id)){ alert('Já existe uma seção com esse nome.'); return; }
  tiposCatalogo.push({ id, nome });
  salvarTiposCatalogo();
  if (nomeInp) nomeInp.value = '';
  renderTabelaTipos();
  renderizarTiposSelecionar();
  renderSelectCategoria();
  montarBlocosDinamicos();
  window.lucide?.createIcons?.();
}

// Helper: lista de categorias ativas (inclui 'adicional')
function getCats(){ return [...tiposSelecionados, 'adicional']; }

// ========= LIMITES POR CATEGORIA =========
function keyLimitesDoCardapio(id){ return `cardapio_limits_${id}`; }
function lerLimitesDoCatalogo(c){
  if (c && typeof c.categorias === 'object'){
    const out = {};
    getCats().forEach(cat=>{
      const v = c.categorias?.[cat]?.max;
      if (v != null) out[cat] = Number(v) || 0;
    });
    if (Object.keys(out).length) return out;
  }
  if (c && typeof c.limites === 'object'){
    const out = {};
    getCats().forEach(cat=>{
      const v = c.limites?.[cat];
      if (v != null) out[cat] = Number(v) || 0;
    });
    if (Object.keys(out).length) return out;
  }
  return null;
}
function lerLimitesGlobais(){
  try{
    const g = JSON.parse(localStorage.getItem('limitesCategoriaMontagem')||'null');
    if (!g) return null;
    const out = {};
    getCats().forEach(cat=>{ if (g[cat]!=null) out[cat] = Number(g[cat])||0; });
    return Object.keys(out).length ? out : null;
  }catch{ return null; }
}
function lerLimitesSalvos(id){
  if (id==null) return null;
  try{
    const m = JSON.parse(localStorage.getItem(keyLimitesDoCardapio(id))||'null');
    if (!m) return null;
    const out = {};
    getCats().forEach(cat=>{ if (m[cat]!=null) out[cat] = Number(m[cat])||0; });
    return Object.keys(out).length ? out : null;
  }catch{ return null; }
}
function limitesResolvidos(){
  const id = cardapioSelecionado?.id;
  const salvos = lerLimitesSalvos(id) || {};
  const doCatalogo = lerLimitesDoCatalogo(cardapioSelecionado) || {};
  const globais = lerLimitesGlobais() || {};
  const out = {};
  getCats().forEach(cat=>{
    out[cat] = (salvos[cat] ?? doCatalogo[cat] ?? globais[cat] ?? 0) | 0;
  });
  return out;
}
function carregarLimitesNosInputs(){
  const lims = limitesResolvidos();
  document.querySelectorAll('.limite-cat').forEach(inp=>{
    const cat = inp.dataset.cat;
    inp.value = String(lims[cat] ?? 0);
  });
  atualizarIndicadoresLimite();
}
function salvarLimiteCategoria(cat, n){
  const id = cardapioSelecionado?.id;
  if (id == null) return;
  const atual = lerLimitesSalvos(id) || {};
  atual[cat] = Number(n)||0;
  localStorage.setItem(keyLimitesDoCardapio(id), JSON.stringify(atual));
  atualizarIndicadoresLimite();
}
function countSelecionados(cat){
  let c = 0;
  document.querySelectorAll(`#bloco-${cat} input[type="checkbox"]`).forEach(chk=>{
    if (chk.checked) c++;
  });
  return c;
}
function atualizarIndicadoresLimite(){
  const lims = limitesResolvidos();
  getCats().forEach(cat=>{
    const max = Number(lims[cat]||0);
    const el = document.querySelector(`[data-restam="${cat}"]`);
    if (!el) return;
    if (max <= 0){
      el.textContent = 'Sem limite';
    } else {
      const sel = countSelecionados(cat);
      const restam = Math.max(0, max - sel);
      el.textContent = `Máx ${max} • Restam ${restam}`;
    }
  });
}
function aplicarLimitesCategoria(){
  const lims = limitesResolvidos();
  getCats().forEach(cat=>{
    const max = Number(lims[cat]||0);
    const chks = [...document.querySelectorAll(`#bloco-${cat} input[type="checkbox"]`)];
    if (max <= 0){
      chks.forEach(chk=>{ chk.disabled = false; });
      return;
    }
    const marcados = chks.filter(chk=>chk.checked);
    const livres = chks.filter(chk=>!chk.checked);
    if (marcados.length >= max){
      livres.forEach(chk=>{ chk.disabled = true; });
    } else {
      chks.forEach(chk=>{ chk.disabled = false; });
    }
  });
  atualizarIndicadoresLimite();
}

// ===== Cardápios cadastrados / faixas =====
function carregarCardapiosNoSelect(){
  const sel = selectCardapioBase(); if (!sel) return;
  sel.innerHTML = '<option value="">Selecione um cardápio</option>';

  const cardapiosA = JSON.parse(localStorage.getItem('cardapiosBuffet')||'[]');
  const produtos   = JSON.parse(localStorage.getItem('produtosBuffet')||'[]');
  const cardapiosB = produtos.filter(p=>p?.tipo==='cardapio');

  const map = new Map();
  [...cardapiosA, ...cardapiosB].forEach(c=>{ if(c?.id!=null) map.set(String(c.id), c); });

  for(const c of map.values()){
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.nome || ('Cardápio '+c.id);
    sel.appendChild(opt);
  }

  if (cardapioSelecionado?.id != null) sel.value = String(cardapioSelecionado.id);

  sel.onchange = ()=>{
    const id = sel.value;
    if(!id) return;
    const c = map.get(id);
    if (!c) return;
    usarCardapioExistente(c);
  };
}
function usarCardapioExistente(c){
  cardapioSelecionado = sanitizeCardapioForStorage(c) || { id:c.id, nome:c.nome, faixas:c.faixas||[] };
  trySetLS('cardapioSelecionado', cardapioSelecionado);

  nomeCardapioSpan().textContent = c.nome || 'Cardápio';
  preencherFaixasDoCardapio(c);

  const chave = 'composicaoCardapio_' + c.id;
  composicao = JSON.parse(localStorage.getItem(chave) || '[]');

  carregarSessao(c.id);

  montarBlocosDinamicos();
  renderizarComposicao();
  montarTabelaCustosFixos({ autosugerir:false });

  carregarLimitesNosInputs();
  aplicarLimitesCategoria();

  atualizarTotais();
  atualizarSaveStatus('Cardápio carregado');
}
function preencherFaixasDoCardapio(c){
  const sel = selectFaixaManual(); const cont = faixasCardsDiv();
  sel.innerHTML = '<option value="">Selecione faixa</option>';
  cont.innerHTML = '';

  if (!c || !Array.isArray(c.faixas)) return;

  c.faixas.forEach((fx, idx)=>{
    const de  = fx.de ?? fx.min ?? '';
    const ate = fx.ate ?? fx.max ?? '';
    const val = toNum(fx.valor);
    const id = 'faixa_'+idx;

    const card = document.createElement('label');
    card.className = 'faixa';
    card.innerHTML = `
      <input type="radio" name="faixaPreco" id="${id}" data-de="${de}" data-ate="${ate}" value="${val}">
      <span class="tag">${ate!=='' ? `${de}–${ate}` : `${de}+`}</span>
      <strong>${fmtBRL.format(val)}</strong>
    `;
    card.onclick = ()=>{
      cont.querySelectorAll('.faixa').forEach(f=>f.classList.remove('ativa'));
      card.classList.add('ativa');
      sel.value = String(val);
      salvarSessaoDebounced();
      atualizarTotais();
    };
    cont.appendChild(card);

    const opt = document.createElement('option');
    opt.value = String(val);
    opt.textContent = ate!=='' ? `${de} a ${ate} convidados — R$ ${val.toFixed(2)}` : `${de}+ convidados — R$ ${val.toFixed(2)}`;
    opt.dataset.de = String(de);
    opt.dataset.ate = String(ate);
    sel.appendChild(opt);
  });
}

// ===== Rascunho =====
function linhaFaixaRascunho(min='', max='', val=''){
  const wrap = document.createElement('div');
  wrap.className = 'linha';
  wrap.innerHTML = `
    <input type="number" class="input fx-min" placeholder="mín." min="0" value="${esc(min)}" />
    <input type="number" class="input fx-max" placeholder="máx." min="0" value="${esc(max)}" />
    <input type="number" class="input fx-valor" placeholder="valor R$" step="0.01" min="0" value="${esc(val)}" />
    <button type="button" class="botao botao-ghost btn-rem-faixa"><i data-lucide="x"></i></button>
  `;
  wrap.querySelector('.btn-rem-faixa').onclick = ()=>wrap.remove();
  return wrap;
}
function adicionarFaixaRascunho(){ document.getElementById('faixasRascunhoContainer').appendChild(linhaFaixaRascunho()); window.lucide?.createIcons?.(); }
function usarRascunho(){
  const nome = document.getElementById('nomeRascunho').value.trim() || `Rascunho ${new Date().toLocaleString()}`;
  const linhas = [...document.querySelectorAll('#faixasRascunhoContainer .linha')];
  const faixas = linhas.map(l=>({
    min: toNum(l.querySelector('.fx-min')?.value),
    max: toNum(l.querySelector('.fx-max')?.value) || undefined,
    valor: toNum(l.querySelector('.fx-valor')?.value)
  })).filter(f=>toNum(f.valor)>0);

  const draft = { id:'draft_'+Date.now(), nome, faixas };
  cardapioSelecionado = draft;
  trySetLS('cardapioSelecionado', sanitizeCardapioForStorage(draft) || draft);
  nomeCardapioSpan().textContent = draft.nome;
  preencherFaixasDoCardapio(draft);

  composicao = [];
  renderizarComposicao();
  montarTabelaCustosFixos({ autosugerir:false });

  carregarLimitesNosInputs();
  aplicarLimitesCategoria();

  atualizarTotais();
  atualizarSaveStatus('Rascunho em uso');
}

/* ========= Ficha Técnica: carregar pratos ========= */
let FT_cacheLista = [];
function carregarPratosFTnoSelect() {
  const sel = document.querySelector('#selPratoFT') || document.querySelector('#selectPrato');
  if (!sel) return;
  const { lista } = FT_listarPratosCompat();
  FT_cacheLista = (lista || []).map(p => ({
    id: p.id ?? p.nome,
    nome: p.nome ?? 'Prato',
    custo: Number(FT_custoPorPorcao(p) || 0)
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  renderSelectPratos('');
}
function renderSelectPratos(filtro) {
  const sel = document.querySelector('#selPratoFT') || document.querySelector('#selectPrato');
  if (!sel) return;
  const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v||0));
  const lista = FT_cacheLista.filter(p =>
    !filtro || p.nome.toLowerCase().includes(filtro.toLowerCase())
  );
  if (!lista.length) {
    sel.innerHTML = `<option value="">— Nenhum prato encontrado —</option>`;
    return;
  }
  sel.innerHTML = `<option value="">(Selecione)</option>` +
    lista.map(p => `<option value="${p.id}">${p.nome} — ${moeda(p.custo)}/porção</option>`).join('');
}
function bindBuscaPratoFT(){
  const inp = document.getElementById('buscaPratoFT');
  if (!inp) return;
  inp.addEventListener('input', () => {
    renderSelectPratos(inp.value || '');
  });
}

/* ========= Adicionais / categorias ========= */
function carregarAdicionaisNoSelect(){
  const sel = document.getElementById('selectAdicional'); if(!sel) return;
  adicionaisDisponiveis = JSON.parse(localStorage.getItem('adicionaisBuffet')||'[]');
  sel.innerHTML = '<option value="">Selecione um adicional cadastrado</option>';
  adicionaisDisponiveis.forEach(a=>{
    if (a?.nome) {
      const opt = document.createElement('option');
      opt.value = a.nome; opt.textContent = a.nome;
      sel.appendChild(opt);
    }
  });
}
function renderSelectCategoria(){
  const sel = document.getElementById('selectCategoria'); if(!sel) return;
  sel.innerHTML = '<option value="">Categoria</option>';
  tiposSelecionados.forEach(id=>{
    const tipo = tiposCatalogo.find(t=>t.id===id);
    const label = `${tipo?.nome||id}`.trim();
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = label;
    sel.appendChild(opt);
  });
}
function adicionarPratoDaFicha(){
  const idPrato  = document.getElementById('selectPrato').value;
  const categoria= document.getElementById('selectCategoria').value;
  if (!idPrato || !categoria) { alert('Selecione um prato e uma categoria!'); return; }

  const { lista } = FT_listarPratosCompat();
  const prato = lista.find(p => (p.id && p.id===idPrato) || p.nome===idPrato);
  if (!prato){ alert('Prato não encontrado.'); return; }

  const jaExiste = composicao.some(i => i.id===prato.nome && i.categoria===categoria);
  if (jaExiste){ alert('Este prato já foi adicionado nesta categoria.'); return; }

  const item = {
    id: prato.nome,
    nome: prato.nome,
    categoria,
    custo: FT_custoPorPorcao(prato),
    ativo: true
  };

  const lims = limitesResolvidos();
  if ((Number(lims[categoria]||0) > 0) && countSelecionados(categoria) >= Number(lims[categoria])){
    alert(`Limite de ${categoria} já foi alcançado.`);
  }
  composicao.push(item);
  salvarComposicao();
  renderizarComposicao();
  aplicarLimitesCategoria();
  salvarSessaoDebounced();
}
function adicionarAdicionalCadastrado(){
  const nomeAd = document.getElementById('selectAdicional').value;
  if(!nomeAd){ alert('Selecione um adicional cadastrado!'); return; }
  const jaExiste = composicao.some(i=>i.id===nomeAd && i.categoria==='adicional');
  if(jaExiste){ alert('Este adicional já foi adicionado.'); return; }

  const { lista } = FT_listarPratosCompat();
  const ficha = lista.find(p => p.nome===nomeAd || p.id===nomeAd);
  const custo = ficha ? FT_custoPorPorcao(ficha) : 0;

  composicao.push({ id:nomeAd, nome:nomeAd, categoria:'adicional', custo, ativo:true });
  salvarComposicao();
  renderizarComposicao();
  aplicarLimitesCategoria();
  salvarSessaoDebounced();
}

// ===== Blocos dinâmicos =====
function montarBlocosDinamicos(){
  const cont = document.getElementById('blocosMontagem'); if(!cont) return;
  cont.innerHTML = '';

  tiposSelecionados.forEach(id=>{
    const tipo = tiposCatalogo.find(t=>t.id===id) || { id, nome:id, emoji:'' };
    const bloco = document.createElement('div');
    bloco.className = 'bloco-cat';
    bloco.id = `bloco-${id}`;
    bloco.dataset.cat = id;
    bloco.innerHTML = `
      <div class="cabecalho-cat">
        <h3>${esc(tipo.nome)}</h3>
        <span class="limite-ui">
          Máx.
          <input class="limite-cat" data-cat="${esc(id)}" type="number" min="0" step="1" value="0" title="0 = sem limite" />
        </span>
        <span class="restam" data-restam="${esc(id)}">—</span>
      </div>
      <ul class="lista-pratos"></ul>
    `;
    cont.appendChild(bloco);
  });

  const blocoAd = document.createElement('div');
  blocoAd.className = 'bloco-cat';
  blocoAd.id = 'bloco-adicional';
  blocoAd.dataset.cat = 'adicional';
  blocoAd.innerHTML = `
    <div class="cabecalho-cat">
      <h3>Adicional</h3>
      <span class="limite-ui">
        Máx.
        <input class="limite-cat" data-cat="adicional" type="number" min="0" step="1" value="0" title="0 = sem limite" />
      </span>
      <span class="restam" data-restam="adicional">—</span>
    </div>
    <ul class="lista-pratos"></ul>
  `;
  cont.appendChild(blocoAd);

  document.querySelectorAll('.limite-cat').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const cat = inp.dataset.cat;
      const val = Math.max(0, parseInt(inp.value||'0',10) || 0);
      inp.value = String(val);
      salvarLimiteCategoria(cat, val);
      aplicarLimitesCategoria();
      salvarSessaoDebounced();
    });
  });

  renderSelectCategoria();
  renderizarComposicao();

  carregarLimitesNosInputs();
  aplicarLimitesCategoria();
  window.lucide?.createIcons?.();
}

// ===== Render dos blocos =====
function renderizarComposicao(){
  getCats().forEach(cat=>{
    const ul = document.querySelector(`#bloco-${cat} ul`); if(!ul) return;
    ul.innerHTML = '';

    composicao.filter(i=>i.categoria===cat).forEach(i=>{
      const li = document.createElement('li');
      let badge = '';
      if (cat==='adicional') {
        const ad = (adicionaisDisponiveis||[]).find(a=>a.nome===i.nome);
        const tipo = (ad?.cobranca||'').toLowerCase();
        if (tipo==='pessoa') badge = `<span class="chip pessoa">por pessoa</span>`;
        else if (tipo==='total') badge = `<span class="chip total">total</span>`;
      }

      li.innerHTML = `
        <label style="display:inline-flex; align-items:center; gap:8px;">
          <input type="checkbox" ${i.ativo!==false?'checked':''} data-id="${esc(i.id)}" data-cat="${esc(cat)}" />
          ${esc(i.nome)} — <strong>${fmtBRL.format(i.custo)}</strong> ${badge}
        </label>
        <button class="btn-icon excluir-item" title="Remover" data-id="${esc(i.id)}" data-cat="${esc(cat)}">🗑️</button>
      `;
      ul.appendChild(li);
    });
  });

  document.querySelectorAll('.excluir-item').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute('data-id');
      const cat = btn.getAttribute('data-cat');
      composicao = composicao.filter(i=>!(i.id===id && i.categoria===cat));
      salvarComposicao(); renderizarComposicao(); aplicarLimitesCategoria(); salvarSessaoDebounced();
    };
  });

  document.querySelectorAll('#blocosMontagem input[type="checkbox"]').forEach(chk=>{
    chk.onchange = ()=>{
      const id = chk.getAttribute('data-id');
      const cat = chk.getAttribute('data-cat');

      if (chk.checked){
        const lims = limitesResolvidos();
        const max = Number(lims[cat]||0);
        const sel = countSelecionados(cat);
        if (max>0 && sel > max){
          chk.checked = false;
          alert(`Você atingiu o limite de ${max} itens para ${cat}.`);
          return;
        }
      }

      const it = composicao.find(i=>i.id===id && i.categoria===cat);
      if (it) it.ativo = chk.checked;
      salvarComposicao(); atualizarTotais(); salvarSessaoDebounced();
      aplicarLimitesCategoria();
      aplicarFiltroSelecionados();
    };
  });

  aplicarFiltroSelecionados();
  aplicarLimitesCategoria();
  atualizarTotais();
}

// Filtro "somente selecionados"
function aplicarFiltroSelecionados(){
  const somente = document.getElementById('toggleSelecionados')?.checked;
  document.querySelectorAll('#blocosMontagem .lista-pratos li').forEach(li=>{
    const chk = li.querySelector('input[type="checkbox"]');
    li.style.display = (!somente || (chk && chk.checked)) ? '' : 'none';
  });
  const linhas = document.querySelectorAll('#tabelaCustosFixosMontagem tr');
  linhas.forEach(tr=>{
    const qtd = toNum(tr.querySelector('.qtd-custo')?.value || 0);
    tr.style.display = (!somente || qtd>0) ? '' : 'none';
  });
}

// ===== Custos fixos =====
const CATEGORIAS_REGRAS = {
  fixo_evento: 'Fixo por evento',
  por_pessoa:  'Por pessoa',
  por_equipe:  'Por equipe',
  por_hora:    'Por hora',
  por_km:      'Por km'
};
function lerCatalogo(){
  let arr = []; try{ arr = JSON.parse(localStorage.getItem('custosFixosBuffet')||'[]')||[]; }catch{}
  return arr.map((raw,idx)=>({
    id: raw.id ?? ('cx_'+Date.now()+'_'+idx),
    nome: raw.nome ?? 'Item',
    categoria: raw.categoria ?? 'outros',
    unidade: raw.unidade ?? 'item',
    regra: raw.regra ?? 'fixo_evento',
    parametros: raw.parametros ?? { qtdFixa:1 },
    valorUnitario: Number(raw.valorUnitario ?? raw.valor ?? 0) || 0,
    ativo: typeof raw.ativo === 'boolean' ? raw.ativo : true
  }));
}
function descreverParametros(it){
  const p = it.parametros || {};
  switch (it.regra) {
    case 'fixo_evento': return `Qtd fixa: ${p.qtdFixa ?? 1}`;
    case 'por_pessoa':  return `Coef.: ${p.coef ?? 1} por pessoa`;
    case 'por_equipe':  return `Razão: 1/${p.razao ?? 25}${p.min?`, mín: ${p.min}`:''}${p.horas?`, horas: ${p.horas}`:''}${p.pessoas?`, por time: ${p.pessoas}`:''}`;
    case 'por_hora':    return `Pessoas: ${p.pessoas ?? 1}, horas: ${p.horas ?? 1}`;
    case 'por_km':      return `Preencher manualmente (km)`;
    default: return '';
  }
}
function sugerirQtd(it, { convidados, horas }){
  const p = it.parametros || {};
  if (it.regra==='fixo_evento') return Math.max(0, toNum(p.qtdFixa)||1);
  if (it.regra==='por_pessoa')  return Math.max(0, toNum(convidados) * (toNum(p.coef)||1));
  if (it.regra==='por_equipe'){
    const razao  = Math.max(1, toNum(p.razao)||25);
    const minimo = Math.max(0, toNum(p.min)||0);
    const pessoas= Math.max(1, toNum(p.pessoas)||1);
    const blocos = Math.max(minimo, ceilDiv(convidados, razao));
    let qtd = blocos * pessoas;
    if ((it.unidade||'').toLowerCase()==='hora') {
      const h = (toNum(p.horas)||toNum(horas)||1); qtd *= h;
    }
    return Math.max(0, qtd);
  }
  if (it.regra==='por_hora'){
    const pessoas = Math.max(1, toNum(p.pessoas)||1);
    const h = (toNum(p.horas)||toNum(horas)||1);
    return Math.max(0, pessoas*h);
  }
  if (it.regra==='por_km') return 0;
  return 0;
}
function montarTabelaCustosFixos({ autosugerir=false }={}){
  const tbody = document.getElementById('tabelaCustosFixosMontagem'); if (!tbody) return;
  const convidados = toNum(inputQtd().value||0);
  const horas = toNum(inputHoras().value||0);

  const catalogo = lerCatalogo().filter(i=>i.ativo);
  tbody.innerHTML = '';

  const sess = obterSessao(cardapioSelecionado?.id);

  catalogo.forEach((it)=>{
    const sugerida = autosugerir ? sugerirQtd(it,{ convidados, horas }) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${esc(it.nome)}</strong><br>
        <small class="muted">${esc(CATEGORIAS_REGRAS[it.regra]||it.regra)} — ${esc(descreverParametros(it))}</small>
      </td>
      <td><input type="number" class="input qtd-custo" min="0" step="0.01" value="${sugerida}" data-nome="${esc(it.nome)}" data-unit="${toNum(it.valorUnitario)}"/></td>
      <td>${fmtBRL.format(toNum(it.valorUnitario))}</td>
      <td class="total-item">${fmtBRL.format(sugerida*toNum(it.valorUnitario))}</td>
    `;
    tbody.appendChild(tr);
  });

  if (sess?.custosFixosQtd) {
    [...tbody.querySelectorAll('.qtd-custo')].forEach(inp=>{
      const nome = inp.getAttribute('data-nome');
      if (sess.custosFixosQtd[nome] != null) inp.value = sess.custosFixosQtd[nome];
    });
  }

  tbody.oninput = (e)=>{
    const inp = e.target.closest('.qtd-custo'); if(!inp) return;
    const unit = toNum(inp.getAttribute('data-unit')); const qtd = toNum(inp.value);
    const totalCell = inp.closest('tr')?.querySelector('.total-item');
    if (totalCell) totalCell.textContent = fmtBRL.format(unit*qtd);
    atualizarTotais(); salvarSessaoDebounced(); aplicarFiltroSelecionados();
  };

  atualizarTotais(); aplicarFiltroSelecionados();
}
function limparQuantidadesCustos(){
  const tbody = document.getElementById('tabelaCustosFixosMontagem'); if(!tbody) return;
  tbody.querySelectorAll('.qtd-custo').forEach(inp=>{
    inp.value = 0;
    const totalCell = inp.closest('tr')?.querySelector('.total-item');
    if (totalCell) totalCell.textContent = fmtBRL.format(0);
  });
  atualizarTotais(); salvarSessaoDebounced(); aplicarFiltroSelecionados();
}

// ===== Totais / Resumo =====
function atualizarTotais(){
  const totalIngredientesEl  = document.getElementById('totalIngredientes');
  const valorCardapioEl      = document.getElementById('valorVendaCardapio');
  const valorVendaAdicionalEl= document.getElementById('valorVendaAdicional');
  const custoAdicionalTotalEl= document.getElementById('custoAdicional');
  const totalCustosFixosEl   = document.getElementById('totalCustosFixos');
  const custoCardapioPPEl    = document.getElementById('custoCardapioPorPessoa');
  const custoAdicionalPPEl   = document.getElementById('custoAdicionalPorPessoa');
  const custoFixoPPEl        = document.getElementById('custoFixoPorPessoa');
  const gastoTotalPPEl       = document.getElementById('gastoTotalPorPessoa');
  const precoMinPPEl         = document.getElementById('precoMinPP'); // opcional
  const lucroEstimadoEl      = document.getElementById('lucroEstimado');
  const avisoLucroEl         = document.getElementById('avisoLucro');

  const qtd = Math.max(0, parseInt(inputQtd().value||'0'));

  let custoCardapioPorPessoa = 0;
  let custoAdicionaisTotal = 0;
  let valorVendaAdicionais = 0;

  const adicionais = JSON.parse(localStorage.getItem('adicionaisBuffet')||'[]');
  const fichas = JSON.parse(localStorage.getItem('fichasTecnicas')||'[]');

  getCats().forEach(cat=>{
    document.querySelectorAll(`#bloco-${cat} input[type='checkbox']`).forEach(chk=>{
      const item = composicao.find(i=>i.id===chk.dataset.id && i.categoria===cat);
      if (chk.checked && item) {
        if (cat==='adicional') {
          const adicional = adicionais.find(a=>a.nome===item.nome);
          if (adicional) {
            const tipo = (adicional.cobranca||'fixo').toLowerCase();
            const valorVenda = toNum(adicional.valor||0);
            const ficha = fichas.find(f=>f.nome===item.nome);
            const custoUnit = ficha ? (ficha.ingredientes||[]).reduce((s,ing)=>s+(ing.custoPorPessoa||0),0) : item.custo;
            if (tipo==='pessoa') {
              valorVendaAdicionais += valorVenda * qtd;
              custoAdicionaisTotal += custoUnit * qtd;
            } else {
              valorVendaAdicionais += valorVenda;
              custoAdicionaisTotal += item.custo;
            }
          } else {
            custoAdicionaisTotal += item.custo;
          }
        } else {
          custoCardapioPorPessoa += item.custo;
        }
      }
    });
  });

  const custoCardapioTotal = custoCardapioPorPessoa * qtd;
  totalIngredientesEl && (totalIngredientesEl.textContent = fmtBRL.format(custoCardapioTotal));

  let totalFixos = 0;
  document.querySelectorAll('#tabelaCustosFixosMontagem tr').forEach(tr=>{
    const inp = tr.querySelector('.qtd-custo'); if(!inp) return;
    const unit = toNum(inp.getAttribute('data-unit')); const q = toNum(inp.value);
    totalFixos += unit*q;
    const totalCell = tr.querySelector('.total-item');
    if (totalCell) totalCell.textContent = fmtBRL.format(unit*q);
  });
  totalCustosFixosEl && (totalCustosFixosEl.textContent = fmtBRL.format(totalFixos));

  let valorVendaUnit = 0;
  if (selectFaixaManual().value) {
    valorVendaUnit = toNum(selectFaixaManual().value);
  } else if (cardapioSelecionado?.faixas?.length) {
    const fx = cardapioSelecionado.faixas.find(f=>{
      const de = Number(f.de ?? f.min ?? 0);
      const ate= Number(f.ate ?? f.max ?? Number.POSITIVE_INFINITY);
      return qtd>=de && qtd<=ate;
    });
    if (fx) valorVendaUnit = toNum(fx.valor);
  }

  const valorVendaCardapioTotal = valorVendaUnit * qtd;
  valorCardapioEl && (valorCardapioEl.textContent = fmtBRL.format(valorVendaCardapioTotal));
  valorVendaAdicionalEl && (valorVendaAdicionalEl.textContent = fmtBRL.format(valorVendaAdicionais));
  custoAdicionalTotalEl && (custoAdicionalTotalEl.textContent = fmtBRL.format(custoAdicionaisTotal));

  const adPP = qtd>0 ? (custoAdicionaisTotal / qtd) : 0;
  const fxPP = qtd>0 ? (totalFixos / qtd) : 0;
  custoCardapioPPEl && (custoCardapioPPEl.textContent = fmtBRL.format(custoCardapioPorPessoa));
  custoAdicionalPPEl && (custoAdicionalPPEl.textContent = fmtBRL.format(adPP));
  custoFixoPPEl && (custoFixoPPEl.textContent = fmtBRL.format(fxPP));

  const precoMinPP = (custoCardapioPorPessoa + adPP + fxPP);
  if (precoMinPPEl) precoMinPPEl.textContent = fmtBRL.format(precoMinPP);

  const gastoPP = precoMinPP;
  gastoTotalPPEl && (gastoTotalPPEl.textContent = fmtBRL.format(gastoPP));

  const receita = valorVendaCardapioTotal + valorVendaAdicionais;
  const custosTotais = custoCardapioTotal + custoAdicionaisTotal + totalFixos;
  const lucro = receita - custosTotais;
  lucroEstimadoEl && (lucroEstimadoEl.textContent = fmtBRL.format(lucro));
  if (lucroEstimadoEl) lucroEstimadoEl.style.color = lucro < 0 ? '#c94f4f' : '#b1762d';

  if (avisoLucroEl) avisoLucroEl.style.display = lucro < 0 ? 'block' : 'none';
}

// ===== Persistência =====
function salvarComposicao(){
  const id = cardapioSelecionado?.id ?? 'draft';
  localStorage.setItem('composicaoCardapio_'+id, JSON.stringify(composicao));
}
function salvarAutosaveFlag(){
  localStorage.setItem('autosaveMontagem', JSON.stringify(!!autosaveLigado));
  atualizarSaveStatus(autosaveLigado ? 'Auto-salvar ligado' : 'Auto-salvar desligado');
}
(function carregarAutosaveFlag(){
  try{
    const flag = JSON.parse(localStorage.getItem('autosaveMontagem')||'true');
    autosaveLigado = !!flag;
    const t = document.getElementById('toggleAutosave');
    if (t) t.checked = autosaveLigado;
  }catch{}
})();

function obterSessao(id){
  if (id==null) return null;
  try { return JSON.parse(localStorage.getItem(SESSAO_PREFIX+id) || 'null'); } catch { return null; }
}
function coletarItensAtivos(){
  const itens = [];
  document.querySelectorAll('#blocosMontagem input[type="checkbox"]').forEach(chk=>{
    itens.push({ id: chk.getAttribute('data-id'), categoria: chk.getAttribute('data-cat'), ativo: chk.checked });
  });
  return itens;
}
function salvarSessao(manual=false){
  if (cardapioSelecionado?.id == null) return;
  const id = cardapioSelecionado.id;

  const v = toNum(selectFaixaManual().value || 0);
  const custosFixosQtd = {};
  document.querySelectorAll('#tabelaCustosFixosMontagem .qtd-custo').forEach(inp=>{
    const nome = inp.getAttribute('data-nome');
    const q = toNum(inp.value);
    if (q>0) custosFixosQtd[nome] = q;
  });

  const sessao = {
    idCardapio: id,
    nome: cardapioSelecionado?.nome || '',
    salvoEm: new Date().toISOString(),
    qtdConvidados: toNum(inputQtd().value||0),
    horas: toNum(inputHoras().value||0),
    faixa: v>0 ? { valor:v, selecionadaManualmente:true } : null,
    itensAtivos: coletarItensAtivos(),
    custosFixosQtd,
    tiposSelecionados: [...tiposSelecionados],
  };

  localStorage.setItem(SESSAO_PREFIX+id, JSON.stringify(sessao));
  atualizarSaveStatus(manual ? 'Sessão salva' : 'Auto-salvo');
}
const salvarSessaoDebounced = (()=>{ let t; return ()=>{ if(!autosaveLigado) return; clearTimeout(t); t=setTimeout(()=>salvarSessao(false), 500); }; })();

function carregarSessao(id){
  const s = obterSessao(id);
  if (!s) return;
  try{
    if (s.qtdConvidados!=null) inputQtd().value = s.qtdConvidados;
    if (s.horas!=null) inputHoras().value = s.horas;

    if (Array.isArray(s.tiposSelecionados) && s.tiposSelecionados.length){
      tiposSelecionados = s.tiposSelecionados.filter(id=>tiposCatalogo.some(t=>t.id===id));
      renderizarTiposSelecionar();
      montarBlocosDinamicos();
    }

    if (s.faixa?.valor>0) {
      selectFaixaManual().value = String(s.faixa.valor);
      document.querySelectorAll('#faixasCards .faixa').forEach(l=>{
        const val = toNum(l.querySelector('input')?.value||0);
        l.classList.toggle('ativa', val===toNum(s.faixa.valor));
      });
    } else {
      selectFaixaManual().value = '';
      document.querySelectorAll('#faixasCards .faixa').forEach(l=>l.classList.remove('ativa'));
    }

    document.querySelectorAll('#tabelaCustosFixosMontagem .qtd-custo').forEach(inp=>{
      const nome = inp.getAttribute('data-nome');
      if (s.custosFixosQtd && s.custosFixosQtd[nome]!=null) inp.value = s.custosFixosQtd[nome];
    });

    if (Array.isArray(s.itensAtivos) && s.itensAtivos.length){
      s.itensAtivos.forEach(sa=>{
        const it = composicao.find(x=>x.id===sa.id && x.categoria===sa.categoria);
        if (it) it.ativo = !!sa.ativo;
      });
      renderizarComposicao();
    }

    atualizarTotais();
    atualizarSaveStatus('Sessão carregada');
  }catch{}
}

function resetarSessao(){
  if (cardapioSelecionado?.id == null) return;
  if (!confirm('Limpar valores salvos deste cardápio?')) return;
  localStorage.removeItem(SESSAO_PREFIX+cardapioSelecionado.id);
  inputQtd().value = 1;
  inputHoras().value = 5;
  selectFaixaManual().value = '';
  document.querySelectorAll('#faixasCards .faixa').forEach(l=>l.classList.remove('ativa'));
  limparQuantidadesCustos();
  composicao.forEach(i=>i.ativo=true);
  renderizarComposicao();
  document.querySelectorAll('.limite-cat').forEach(inp=>inp.value='0');
  localStorage.removeItem(keyLimitesDoCardapio(cardapioSelecionado.id));
  carregarLimitesNosInputs();
  aplicarLimitesCategoria();
  atualizarTotais();
  atualizarSaveStatus('Sessão resetada');
}

function atualizarSaveStatus(msg){
  const el = saveStatus(); if (!el) return;
  const t = new Date();
  const hh = String(t.getHours()).padStart(2,'0');
  const mm = String(t.getMinutes()).padStart(2,'0');
  el.textContent = `✔ ${msg} às ${hh}:${mm}`;
}

// Ações rápidas da seção "Seções do cardápio"
(function(){
  const btnAll = document.getElementById('selecionarTudoTipos');
  const btnNone= document.getElementById('limparTudoTipos');
  if (btnAll) btnAll.onclick = ()=>{
    tiposSelecionados = Array.isArray(tiposCatalogo) ? tiposCatalogo.map(t=>t.id) : [];
    if (typeof renderizarTiposSelecionar==='function') renderizarTiposSelecionar();
    if (typeof onTiposSelecionadosMudou==='function') onTiposSelecionadosMudou();
  };
  if (btnNone) btnNone.onclick = ()=>{
    tiposSelecionados = [];
    if (typeof renderizarTiposSelecionar==='function') renderizarTiposSelecionar();
    if (typeof onTiposSelecionadosMudou==='function') onTiposSelecionadosMudou();
  };
})();
