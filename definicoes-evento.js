/* ========= Polyfills ========= */
if (typeof window.CSS === "undefined") window.CSS = {};
if (typeof window.CSS.escape !== "function") {
  window.CSS.escape = function (value) {
    return String(value).replace(/[^a-zA-Z0-9_\-]/g, s => "\\" + s);
  };
}

/* ========= Utils ========= */
const $  = (sel,doc=document)=>doc.querySelector(sel);
const $$ = (sel,doc=document)=>Array.from(doc.querySelectorAll(sel));
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
// Remove emojis/ícones do começo do texto (caso venham de algum lugar)
const noEmoji = s => String(s||'').replace(
  /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]+(?:\s*)?/gu,
  ''
);

// ========= IndexedDB robusto =========
const IDB_DB    = 'buffetLayouts';
const IDB_STORE = 'layouts';

function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IDB_DB);
    req.onerror = ()=> reject(req.error);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = ()=>{
      const db = req.result;

      const needLayouts = !db.objectStoreNames.contains(IDB_STORE);
      if (!needLayouts) { resolve(db); return; }

      const newVersion = db.version + 1;
      db.close();
      const up = indexedDB.open(IDB_DB, newVersion);
      up.onupgradeneeded = ()=>{
        const udb = up.result;
        if (!udb.objectStoreNames.contains(IDB_STORE)) udb.createObjectStore(IDB_STORE);
      };
      up.onsuccess = ()=> resolve(up.result);
      up.onerror   = ()=> reject(up.error);
    };
  });
}

async function idbSet(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = ()=> resolve(req.result ?? null);
    req.onerror = ()=> reject(req.error);
  });
}
async function idbDel(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

/* ========= Categorias ========= */
const CATS_BASE = [
  { id:'entrada',        nome:'Entrada' },
  { id:'acompanhamento', nome:'Acompanhamento' },
  { id:'massa',          nome:'Massa' },
  { id:'prato',          nome:'Prato Principal' },
  { id:'sobremesa',      nome:'Sobremesa' },
  { id:'bebida',         nome:'Bebida' },
  { id:'adicional',      nome:'Adicional' },
];

function humanizeCat(id){
  const map = {
    pratoPrincipal: 'Prato Principal',
    principal:      'Prato Principal',
    entradas:       'Entrada',
    bebidas:        'Bebida',
  };
  if (map[id]) return map[id];
  const nice = id.replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim();
  return nice ? (nice.charAt(0).toUpperCase()+nice.slice(1)) : 'Outros';
}

let cats = [...CATS_BASE];

/* ========= Estado ========= */
const eventoId = new URLSearchParams(location.search).get('id') || '';
let evento = null;
let cardapioAtual = null;
let itensBase = [];
let autosaveLigado = true;
let ativosMontagem = new Set();

const LS_DEF_PREFIX   = 'definicoes_evento_'; // + eventoId
const LS_CARD_SELEC   = 'cardapioSelecionado';
const saveKey         = () => LS_DEF_PREFIX + (eventoId || 'semid');

/* ========= Carregamento inicial ========= */
document.addEventListener('DOMContentLoaded', () => {
  carregarEvento();
  carregarCardapiosNoSelect();
  restaurarAutosaveFlag();
  bindTopo();
  bindBotoes();

  if (cardapioAtual?.id != null){
    carregarItensDaMontagem(cardapioAtual.id);
  } else {
    try{
      const ult = JSON.parse(localStorage.getItem(LS_CARD_SELEC) || 'null');
      if (ult?.id != null) {
        cardapioAtual = ult;
        $('#selCardapio').value = String(ult.id);
        carregarItensDaMontagem(ult.id);
      }
    }catch{}
  }

  initAbasDefinicoes();   // controla as abas
  initLayoutCanvas();     // ativa a aba Layout

  try{ lucide.createIcons(); }catch{}
  marcarDoSalvo();
  atualizarSaveStatus('Pronto');

  document.getElementById('preselectSugeridos')?.addEventListener('change', () => {
    renderCategorias();
    marcarDoSalvo();
  });
});

/* ========= Evento ========= */
function carregarEvento(){
  try {
    const eventos = JSON.parse(localStorage.getItem('eventos')||'[]');
    evento = eventos.find(e => String(e.id) === String(eventoId)) || null;
  } catch { evento = null; }
  const get = (obj, keys)=>{ for(const k of keys){ if(obj?.[k]!=null && String(obj[k]).trim()!=='') return obj[k]; } return ''; };
  $('#inpNomeEvento').value  = get(evento, ['nomeEvento','titulo','nome']) || '';
  const dataRaw              = get(evento, ['data','dataEvento','dataDoEvento']) || '';
  $('#inpDataEvento').value  = normalizarISO(dataRaw);
  $('#inpLocalEvento').value = get(evento, ['local','localEvento','enderecoEvento','endereco']) || '';
  $('#inpConvidados').value  = get(evento, ['quantidadeConvidados','convidados','qtdConvidados']) || 0;
  $('#inpCerimoniaLocal').value = normalizaSN( get(evento, ['cerimoniaNoLocal','cerimonia','ceremoniaNoLocal']) );
  $('#inpHoraCerimonia').value  = normalizarHora( get(evento, [
    'horarioCerimonia','horaCerimonia','horarioDaCerimonia','horario_cerimonia','hora_da_cerimonia'
  ]) );
  $('#inpHoraEvento').value     = normalizarHora( get(evento, [
    'horarioEvento','horaEvento','horaDoEvento','hora_inicio','horario_inicio'
  ]) );
  $('#inpHoraJantar').value     = normalizarHora( get(evento, [
    'horaJantar','horarioJantar','jantarHora','jantarHorario'
  ]) );
  let cardId = get(evento, ['cardapioId','idCardapio','cardapio_id']);
  let cardNome = get(evento, ['cardapioNome','cardapio','nomeCardapio']);
  if (cardId || cardNome) cardapioAtual = { id: cardId || null, nome: cardNome || 'Cardápio' };
  aplicarSessaoCarregada();
}
function normalizarISO(s){
  const v = String(s||'').trim(); if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(v); return isFinite(d) ? d.toISOString().slice(0,10) : '';
}
function normalizarHora(s){
  const v = String(s||'').trim(); if (!v) return '';
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  const m = v.match(/(\d{1,2})\D?(\d{2})/); if (!m) return '';
  const H = Math.max(0, Math.min(23, parseInt(m[1],10)||0));
  const M = Math.max(0, Math.min(59, parseInt(m[2],10)||0));
  return String(H).padStart(2,'0') + ':' + String(M).padStart(2,'0');
}
function normalizaSN(v){
  const s = String(v||'').toLowerCase();
  if (['sim','s','true','1'].includes(s)) return 'Sim';
  if (['não','nao','n','false','0'].includes(s)) return 'Não';
  return '';
}

/* ========= Seleção de cardápios / itens ========= */
function carregarCardapiosNoSelect(){
  const sel = $('#selCardapio'); if (!sel) return;
  sel.innerHTML = `<option value="">(Selecione)</option>`;
  const a = JSON.parse(localStorage.getItem('cardapiosBuffet')||'[]');
  const b = JSON.parse(localStorage.getItem('produtosBuffet')||'[]').filter(p=>p?.tipo==='cardapio');
  const map = new Map();
  [...a, ...b].forEach(c => { if (c?.id!=null) map.set(String(c.id), c); });
  for(const c of map.values()){
    const opt = document.createElement('option'); opt.value = String(c.id);
    opt.textContent = c.nome || ('Cardápio '+c.id); sel.appendChild(opt);
  }
  if (cardapioAtual?.id != null) sel.value = String(cardapioAtual.id);
  sel.onchange = ()=>{
    const c = map.get(String(sel.value)); if (!c) return;
    cardapioAtual = { id: c.id, nome: c.nome || 'Cardápio', faixas: c.faixas||[] };
    try { document.getElementById('nomeCardapioDefs').textContent = cardapioAtual?.nome || '—'; } catch {}
    try{ localStorage.setItem(LS_CARD_SELEC, JSON.stringify(cardapioAtual)); }catch{}
    carregarItensDaMontagem(c.id); salvarSessaoDebounced();
  };
}
function carregarItensDaMontagem(cardapioId){
  try{
    const arr = JSON.parse(localStorage.getItem('composicaoCardapio_'+cardapioId) || '[]');
    ativosMontagem = new Set((arr || [])
      .filter(i => i && i.ativo !== false)
      .map(i => i.id || i.nome));
    const genId = () => (crypto?.randomUUID?.() || ('id_' + Math.random().toString(36).slice(2)));
    itensBase = (arr || []).map(i => ({
      id: i.id || i.nome || genId(),
      nome: i.nome || i.id || 'Item',
      categoria: (i.categoria || 'adicional').toString().trim()
    }));
  }catch{ itensBase = []; }
  const wrap = $('#categoriasContainer');
  if (!itensBase.length) {
    if (wrap) wrap.innerHTML = `<div class="card" style="border:1px dashed #e3d6c8; background:#fffdf8;">
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <i data-lucide="info" style="color:#a67c37;"></i>
        <div><strong>Nenhum prato encontrado para este cardápio.</strong><br>
        Abra a <a href="montagem-cardapio.html" target="_blank" rel="noopener">Montagem do Cardápio</a>,
        salve a composição desse cardápio e volte aqui.</div>
      </div></div>`;
    try{ lucide.createIcons(); }catch{}; return;
  }
  const catIdsBase = new Set(CATS_BASE.map(c=>c.id));
  const extras = [...new Set(itensBase.map(i=>i.categoria).filter(c=>c && !catIdsBase.has(c)))];
  const catsDyn = extras.map(id => ({ id, nome: humanizeCat(id) }));
  cats = [...CATS_BASE, ...catsDyn];

  // importar limites da Montagem uma única vez, se não houver locais
  try {
    const key = `cardapio_limits_${cardapioId}`;
    const mont = JSON.parse(localStorage.getItem(key) || 'null');
    const sess = carregarSessao() || {};
    const jaTemLimitesLocais = sess.limites && Object.keys(sess.limites).length > 0;
    if (mont && !jaTemLimitesLocais) {
      const limitesImportados = {};
      cats.forEach(c => { if (mont[c.id] != null) limitesImportados[c.id] = Number(mont[c.id]) || 0; });
      sess.limites = limitesImportados;
      salvarSessao(sess);
    }
  } catch {}
  try { document.getElementById('nomeCardapioDefs').textContent = cardapioAtual?.nome || '—'; } catch {}

  renderCategorias(); marcarDoSalvo();
}
function renderCategorias(){
  const wrap = $('#categoriasContainer'); if (!wrap) return;
  wrap.innerHTML = '';
  cats.forEach(c => {
    const itensCat = itensBase.filter(i => i.categoria === c.id);

    const limiteVal = getLimite(c.id);
    const infoText = limiteVal > 0
      ? `Você pode escolher até ${limiteVal} opção(ões) nesta categoria.`
      : `Sem limite definido nesta categoria.`;

    const catBox = document.createElement('div'); catBox.className = 'categoria-card'; catBox.dataset.cat = c.id;
    catBox.innerHTML = `
      <div class="categoria-header">
        <h3 style="margin:0;">${noEmoji(c.nome)}</h3>
        <div class="limite">
          <label for="lim_${c.id}">Máximo de escolhas</label>
          <input id="lim_${c.id}" type="number" min="0" step="1" class="input" style="width:110px" value="${limiteVal}">
        </div>
      </div>
      <ul class="lista-itens"></ul>
      <div class="muted" style="margin-top:6px;">${esc(infoText)}</div>`;
    wrap.appendChild(catBox);

    const ul = $('ul.lista-itens', catBox);
    if (!itensCat.length){
      ul.innerHTML = `<li class="muted">— Sem itens cadastrados para esta categoria.</li>`;
    } else {
      itensCat.forEach(it => {
        const li = document.createElement('li');
        li.innerHTML = `
          <label style="display:inline-flex; align-items:center; gap:10px;">
            <input type="checkbox" data-id="${esc(it.id)}" data-cat="${esc(it.categoria)}">
            <span><strong>${esc(it.nome)}</strong></span>
          </label>
          <div></div>
          <input class="obs-input" type="text" placeholder="Observação (opcional)" disabled>`;
        ul.appendChild(li);
        const pre = document.getElementById('preselectSugeridos');
        if (pre && pre.checked) {
          const chk = li.querySelector('input[type="checkbox"]');
          if (chk && ativosMontagem.has(chk.dataset.id)) {
            chk.checked = true;
            const obs = li.querySelector('.obs-input');
            if (obs) obs.disabled = false;
          }
        }
      });
    }
  });

  // listeners
  $$('#categoriasContainer input[id^="lim_"]').forEach(inp => {
    inp.addEventListener('change', ()=>{
      const cat = inp.id.replace('lim_','');
      setLimite(cat, Math.max(0, parseInt(inp.value||'0',10)||0));
      const box = inp.closest('.categoria-card'); const info = $('.muted', box);
      const v = getLimite(cat);
      info.textContent = v>0 ? `Você pode escolher até ${v} opção(ões) nesta categoria.` : `Sem limite definido nesta categoria.`;
      salvarSessaoDebounced();
    });
  });
  $$('#categoriasContainer .lista-itens input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', (e)=>{
      const li = e.currentTarget.closest('li'); const obs = $('.obs-input', li);
      const cat = e.currentTarget.getAttribute('data-cat'); const limite = getLimite(cat);
      if (e.currentTarget.checked && limite>0){
        const marcados = $$('#categoriasContainer .lista-itens input[type="checkbox"]').filter(x=>x.checked && x.dataset.cat===cat).length;
        if (marcados > limite){ e.currentTarget.checked = false; alert(`Atenção: o limite para ${humanizeCat(cat)} é ${limite}.`); return; }
      }
      obs.disabled = !e.currentTarget.checked; salvarSessaoDebounced();
    });
  });
  $$('#categoriasContainer .obs-input').forEach(inp=> inp.addEventListener('input', ()=>salvarSessaoDebounced()));
}
function getLimite(catId){
  const s = carregarSessao(); return Number(s?.limites?.[catId] || 0);
}
function setLimite(catId, val){
  const s = carregarSessao() || {}; s.limites = s.limites || {}; s.limites[catId] = val; salvarSessao(s);
}

/* ========= Persistência do Cardápio ========= */
function carregarSessao(){ try{ return JSON.parse(localStorage.getItem(saveKey()) || 'null'); }catch{ return null; } }
function salvarSessao(sessaoParcial){
  if (sessaoParcial && typeof sessaoParcial === 'object'){ localStorage.setItem(saveKey(), JSON.stringify(sessaoParcial)); atualizarSaveStatus('Salvo'); return; }
  const sAntigo = carregarSessao() || {};
  const s = {
    idEvento: eventoId,
    cardapio: cardapioAtual ? { id: cardapioAtual.id, nome: cardapioAtual.nome } : null,
    dataSalva: new Date().toISOString(),
    limites: sAntigo.limites || {},
    obsGerais: $('#obsGerais')?.value || '',
    eventoMeta: {
      nome:  $('#inpNomeEvento')?.value || '',
      data:  $('#inpDataEvento')?.value || '',
      local: $('#inpLocalEvento')?.value || '',
      qtd:   $('#inpConvidados')?.value || '',
      cerimoniaLocal: $('#inpCerimoniaLocal')?.value || '',
      horaCer:   $('#inpHoraCerimonia')?.value || '',
      horaJantar:$('#inpHoraJantar')?.value || '',
      horaEvt:   $('#inpHoraEvento')?.value || ''
    },
    extras:{
      saborBolo:      $('#extraSaborBolo')?.value || '',
      corToalha:      $('#extraCorToalha')?.value || '',
      corGuardanapo:  $('#extraCorGuardanapo')?.value || '',
      entradasModo:   $('#extraEntradasModo')?.value || '',
      mesaPosta:      $('#extraMesaPosta')?.value || '',
      qtdMesa:        $('#extraQtdMesa')?.value || '',
      anotacoes:      $('#extraAnotacoes')?.value || ''
    },

    itens: {}
  };
  cats.forEach(c => {
    s.itens[c.id] = [];
    const box = $(`.categoria-card[data-cat="${c.id}"]`); if (!box) return;
    $$('.lista-itens li', box).forEach(li => {
      const chk = $('input[type="checkbox"]', li); if (!chk || !chk.checked) return;
      const nome = $('label span', li)?.textContent?.trim() || '';
      const obs  = $('.obs-input', li)?.value || '';
      s.itens[c.id].push({ id: chk.dataset.id, nome, obs });
    });
  });
  localStorage.setItem(saveKey(), JSON.stringify(s));
  atualizarSaveStatus('Salvo');
}
const salvarSessaoDebounced = (()=>{ let t; return ()=>{ if(!autosaveLigado) return; clearTimeout(t); t=setTimeout(()=>salvarSessao(), 450); }; })();
function aplicarSessaoCarregada(){
  const s = carregarSessao(); if (!s) return;
  try{
    if (s.eventoMeta){
      $('#inpNomeEvento').value  = s.eventoMeta.nome || $('#inpNomeEvento').value;
      $('#inpDataEvento').value  = s.eventoMeta.data || $('#inpDataEvento').value;
      $('#inpLocalEvento').value = s.eventoMeta.local || $('#inpLocalEvento').value;
      $('#inpConvidados').value  = s.eventoMeta.qtd || $('#inpConvidados').value;
      $('#inpCerimoniaLocal').value = s.eventoMeta.cerimoniaLocal || $('#inpCerimoniaLocal').value;
      $('#inpHoraCerimonia').value  = s.eventoMeta.horaCer || $('#inpHoraCerimonia').value;
      $('#inpHoraEvento').value     = s.eventoMeta.horaEvt || $('#inpHoraEvento').value;
      $('#inpHoraJantar').value     = s.eventoMeta.horaJantar || $('#inpHoraJantar').value;
    }
    if (s.cardapio?.id != null){ cardapioAtual = { id: s.cardapio.id, nome: s.cardapio.nome||'Cardápio' }; const sel = $('#selCardapio'); if (sel) sel.value = String(s.cardapio.id); }
    if (s.extras){
      const saborBolo = s.extras.saborBolo ?? s.extras.saborSuco ?? '';
      $('#extraSaborBolo').value     = saborBolo;
      $('#extraCorToalha').value     = s.extras.corToalha || '';
      $('#extraCorGuardanapo').value = s.extras.corGuardanapo || '';
      $('#extraEntradasModo').value  = s.extras.entradasModo || '';
      $('#extraMesaPosta').value     = s.extras.mesaPosta || '';
      $('#extraQtdMesa').value       = s.extras.qtdMesa || '';
      $('#extraAnotacoes').value     = s.extras.anotacoes || '';
    }
  }catch{}
}
function marcarDoSalvo(){
  const s = carregarSessao(); if (!s) return;
  Object.entries(s.limites || {}).forEach(([catId, v])=>{ const inp = $(`#lim_${catId}`); if (inp) inp.value = v; });
  if (s.obsGerais!=null) $('#obsGerais').value = s.obsGerais;
  Object.entries(s.itens || {}).forEach(([catId, lista])=>{
    (lista || []).forEach(reg=>{
      const li = $(`.categoria-card[data-cat="${catId}"] .lista-itens input[type="checkbox"][data-id="${CSS.escape(reg.id)}"]`)?.closest('li');
      if (!li) return; const chk = $('input[type="checkbox"]', li); const obs = $('.obs-input', li);
      chk.checked = true; if (obs){ obs.disabled = false; obs.value = reg.obs || ''; }
    });
  });
}

/* ========= Botões/flags ========= */
function bindTopo(){
  $('#btnSalvarSessao')?.addEventListener('click', ()=> salvarSessao());
  $('#toggleAutosave')?.addEventListener('change', (e)=>{
    autosaveLigado = !!e.target.checked;
    localStorage.setItem('def_evento_autosave', JSON.stringify(autosaveLigado));
    atualizarSaveStatus(autosaveLigado ? 'Auto-salvar ligado' : 'Auto-salvar desligado');
  });
  const ids = [
    'inpNomeEvento','inpDataEvento','inpLocalEvento','inpConvidados',
    'inpCerimoniaLocal','inpHoraCerimonia','inpHoraJantar','inpHoraEvento',
    'obsGerais',
    'extraSaborBolo','extraCorToalha','extraCorGuardanapo',
    'extraEntradasModo','extraMesaPosta','extraQtdMesa','extraAnotacoes'
  ];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    el?.addEventListener('input', salvarSessaoDebounced);
    el?.addEventListener('change', salvarSessaoDebounced);
  });
}
function bindBotoes(){
  $('#btnGerar')?.addEventListener('click', gerarA4);
  $('#btnEditar')?.addEventListener('click', ()=>{ $('#boxPreview').style.display = 'none'; $('#boxSelecao').style.display = 'block'; window.scrollTo({top:0,behavior:'smooth'}); });
  $('#btnPrint')?.addEventListener('click', ()=>window.print());
  $('#btnPNG')?.addEventListener('click', exportarPNG);
  $('#btnLimpar')?.addEventListener('click', ()=>{ if (!confirm('Deseja desmarcar todos os itens?')) return; $$('#categoriasContainer .lista-itens input[type="checkbox"]').forEach(chk=>{ chk.checked = false; const obs = $('.obs-input', chk.closest('li')); if (obs) { obs.value=''; obs.disabled = true; } }); salvarSessao(); });
}
function restaurarAutosaveFlag(){ try { autosaveLigado = JSON.parse(localStorage.getItem('def_evento_autosave')||'true'); } catch { autosaveLigado = true; } const t = $('#toggleAutosave'); if (t) t.checked = !!autosaveLigado; }

/* ========= A4 Cardápio ========= */
function gerarA4(){
  salvarSessao();
  const s = carregarSessao();
  const paper = $('#a4Paper'); if (!paper) return;

  const meta    = s?.eventoMeta || {};
  const extras  = s?.extras || {};
  const limites = s?.limites || {};

  const topoHTML = `
    <div class="a4-title">Definições do Cardápio</div>
    <div class="a4-head">
      <div class="row"><span class="label">Evento:</span><span>${esc(meta.nome||'—')}</span></div>
      <div class="row"><span class="label">Data:</span><span>${esc(formataBRData(meta.data)||'—')}</span></div>
      <div class="row"><span class="label">Local:</span><span>${esc(meta.local||'—')}</span></div>
      <div class="row"><span class="label">Convidados:</span><span>${esc(meta.qtd||'—')}</span></div>
      <div class="row"><span class="label">Cerimônia no local?</span><span>${esc(meta.cerimoniaLocal||'—')}</span></div>
      <div class="row"><span class="label">Horários:</span>
        <span>
          ${meta.horaCer ? `Cerimônia ${esc(meta.horaCer)}` : '—'}
          ${meta.horaEvt ? ` • Festa ${esc(meta.horaEvt)}` : ''}
          ${meta.horaJantar ? ` • Jantar ${esc(meta.horaJantar)}` : ''}
        </span>
      </div>
    </div>
  `;

  let definicoesHTML = '';
  Object.keys(s?.itens || {}).forEach(catId=>{
    const lista = s.itens[catId] || [];
    if (!lista.length) return;
    const bruto = (cats.find(c=>c.id===catId)?.nome) || humanizeCat(catId);
    const catNome = noEmoji(bruto);
    const lim = Number(limites[catId]||0);
    const titulo = esc(catNome) + (lim>0 ? ` (${lista.length}/${lim})` : '');
    definicoesHTML += `
      <div class="a4-section">
        <h3>${titulo}</h3>
        <ul class="a4-list">
          ${lista.map(it=>{
            const obs = it.obs ? ` — <em>${esc(it.obs)}</em>` : '';
            return `<li>${esc(it.nome)}${obs}</li>`;
          }).join('')}
        </ul>
      </div>`;
  });

  const obsGerais = (s?.obsGerais||'').trim();
  const obsHTML = `
    <div class="a4-section">
      <h3>Observações do Cardápio</h3>
      ${obsGerais ? `<div style="white-space:pre-wrap; margin-bottom:6px;">${esc(obsGerais)}</div>` : ''}
      <div class="a4-lines">
        <div class="line"></div>
        <div class="line"></div>
      </div>
    </div>`;

  const detHTML = `
    <div class="a4-section">
      <h3>Detalhes Operacionais</h3>
      <div class="a4-grid-2">
        <div class="a4-kv"><div class="k">Cor da toalha:</div><div class="v">${esc(extras.corToalha || '—')}</div></div>
        <div class="a4-kv"><div class="k">Cor do guardanapo:</div><div class="v">${esc(extras.corGuardanapo || '—')}</div></div>
        <div class="a4-kv"><div class="k">Entradas (modo):</div><div class="v">${esc(extras.entradasModo || '—')}</div></div>
        <div class="a4-kv"><div class="k">Mesa posta:</div><div class="v">${esc(extras.mesaPosta || '—')}</div></div>
        <div class="a4-kv"><div class="k">Quantidade de mesas:</div><div class="v">${esc(extras.qtdMesa || '—')}</div></div>
        <div class="a4-kv"><div class="k">Sabor do bolo:</div><div class="v">${esc(extras.saborBolo || '—')}</div></div>
      </div>
    </div>`;

  const anotHTML = `
    <div class="a4-section">
      <h3>Anotações Operacionais</h3>
      ${extras.anotacoes ? `<div style="white-space:pre-wrap; margin-bottom:6px;">${esc(extras.anotacoes)}</div>` : ''}
      <div class="a4-notearea">
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
      </div>
    </div>`;

  $('#a4Paper').innerHTML = topoHTML + definicoesHTML + obsHTML + detHTML + anotHTML;

  try {
    const sessao = carregarSessao() || {};
    sessao.previewHtml = $('#a4Paper').innerHTML;
    sessao.a4Html      = $('#a4Paper').innerHTML;
    sessao.idEvento    = eventoId || sessao.idEvento || (evento?.id ?? null);
    sessao.cardapio    = cardapioAtual ? { id: cardapioAtual.id, nome: cardapioAtual.nome } : (sessao.cardapio || null);
    localStorage.setItem(saveKey(), JSON.stringify(sessao));
    try {
      const arr = JSON.parse(localStorage.getItem('eventos') || '[]');
      const i = arr.findIndex(e => String(e.id) === String(sessao.idEvento));
      if (i > -1) {
        arr[i].definicoes = arr[i].definicoes || {};
        arr[i].definicoes.cardapio = arr[i].definicoes.cardapio || {};
        arr[i].definicoes.cardapio.cardapioDefinido = {
          html: sessao.previewHtml,
          atualizadoEm: new Date().toISOString()
        };
        localStorage.setItem('eventos', JSON.stringify(arr));
      }
    } catch {}
  } catch (e) {
    console.warn('Falha ao salvar prévia do cardápio:', e);
  }

  $('#boxSelecao').style.display = 'none';
  $('#boxPreview').style.display = 'block';
  window.scrollTo({ top: $('#boxPreview').offsetTop - 12, behavior:'smooth' });
  try{ lucide?.createIcons?.(); }catch{}
}

function exportarPNG(){ const node = $('#a4Paper'); if (!node) return;
  html2canvas(node, { scale:2, backgroundColor:'#ffffff' }).then(canvas=>{
    const link = document.createElement('a'); const dt = new Date();
    const nome = `cardapio_${(evento?.nomeEvento||'evento').toString().replace(/\s+/g,'_')}_${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}.png`;
    link.download = nome.toLowerCase(); link.href = canvas.toDataURL('image/png'); link.click();
  });
}
function formataBRData(iso){ const v = String(iso||'').trim(); if (!v) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y,m,d] = v.split('-'); return `${d}/${m}/${y}`; } return v; }
function atualizarSaveStatus(msg){ const el = $('#saveStatus'); if (!el) return; const t = new Date(); const hh=String(t.getHours()).padStart(2,'0'); const mm=String(t.getMinutes()).padStart(2,'0'); el.textContent = `✔ ${msg} às ${hh}:${mm}`; }

/* =========================
   ABAS
   ========================= */
function initAbasDefinicoes(){
  const abas    = Array.from(document.querySelectorAll('.aba'));
  const paineis = Array.from(document.querySelectorAll('[data-aba-painel]'));

  const setAba = (nome) => {
    abas.forEach(b   => b.classList.toggle('ativa', b.dataset.aba === nome));
    paineis.forEach(p=> p.style.display = (p.dataset.abaPainel === nome) ? 'block' : 'none');
    try { lucide.createIcons(); } catch {}

    if (nome === 'layout') {
      fitLayoutCanvasToWrap();
      redrawLayout(true);
    }
  };

  abas.forEach(b => b.addEventListener('click', () => setAba(b.dataset.aba)));
  setAba('cardapio');
}

/* =========================
   LAYOUT (mini-Paint)
   ========================= */
let layout = {
  canvas:null, ctx:null, wrap:null,
  tool:'select', strokeColor:'#2f2a25', strokeWidth:3,
  drawing:false, startX:0, startY:0,
  baseBitmap:null,
  objects:[],
  activeIndex:-1, dragDX:0, dragDY:0
};
const LAYOUT_KEY = ()=> `layout_evento_${eventoId || 'semid'}`;

function initLayoutCanvas(){
  layout.canvas = document.getElementById('layoutCanvas'); if (!layout.canvas) return;
  layout.ctx = layout.canvas.getContext('2d', { willReadFrequently:true });
  layout.wrap = layout.canvas.parentElement;

  const btnUpload = $('#btnUploadLayout'), inpUpload = $('#inpUploadLayout'),
        btnNovo = $('#btnNovoLayout'), btnLimpar = $('#btnLimparDesenho'),
        btnSalvar = $('#btnSalvarLayout'), btnPNG = $('#btnExportarPNGLayout'),
        colorInp = $('#strokeColor'), widthInp = $('#strokeWidth');

  document.querySelectorAll('[data-tool]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('[data-tool]').forEach(b=>b.classList.remove('botao-dourado'));
      btn.classList.add('botao-dourado');
      layout.tool = btn.dataset.tool;
      if (layout.tool !== 'select') layout.activeIndex = -1, redrawLayout();
    });
    if (btn.dataset.tool==='select') btn.classList.add('botao-dourado');
  });

  colorInp?.addEventListener('input', ()=> layout.strokeColor = colorInp.value);
  widthInp?.addEventListener('input', ()=> layout.strokeWidth = Math.max(1, Math.min(40, parseInt(widthInp.value||'3',10)||3)));

  btnUpload?.addEventListener('click', ()=> inpUpload?.click());
  inpUpload?.addEventListener('change', handleBackgroundUpload, false);

  btnNovo?.addEventListener('click', ()=>{
    if (!confirm('Começar em branco? Isso mantém apenas os objetos, o fundo será limpo.')) return;
    layout.baseBitmap = blankBitmap(); redrawLayout(true); scheduleSaveLayout();
  });
  btnLimpar?.addEventListener('click', ()=>{
    if (!confirm('Limpar desenho (mantém objetos)?')) return;
    layout.baseBitmap = blankBitmap(); redrawLayout(true); scheduleSaveLayout();
  });

  btnSalvar?.addEventListener('click', async ()=>{ await salvarLayoutLocal(); alert('Layout salvo com sucesso!'); });
  btnPNG?.addEventListener('click', baixarPNGLayout);

  bindPointerEvents(layout.canvas);
  window.addEventListener('resize', fitLayoutCanvasToWrap);

  restaurarLayoutLocal();
  if (!layout.baseBitmap) layout.baseBitmap = blankBitmap();
  fitLayoutCanvasToWrap();
  redrawLayout(true);
}

function blankBitmap(){
  const c = layout.canvas, ctx = layout.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,c.width,c.height);
  ctx.restore();
  return ctx.getImageData(0,0,c.width,c.height);
}

function handleBackgroundUpload(e){
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const img = new Image();
  img.onload = ()=>{
    const c = layout.canvas, ctx = layout.ctx;
    ctx.clearRect(0,0,c.width,c.height);
    drawImageContain(img, ctx, c.width, c.height);
    layout.baseBitmap = ctx.getImageData(0,0,c.width,c.height);
    redrawLayout(true); scheduleSaveLayout();
    try { URL.revokeObjectURL(img.src); } catch {}
  };
  img.src = URL.createObjectURL(file);
}

function bindPointerEvents(canvas){
  const getPos = (ev)=>{
    const rect = canvas.getBoundingClientRect();
    const e = ev.touches ? ev.touches[0] : ev;
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top)  * (canvas.height / rect.height);
    return {x, y};
  };

  const start = (ev)=>{
    ev.preventDefault();
    const {x,y} = getPos(ev);
    layout.startX = x; layout.startY = y;

    if (layout.tool === 'select'){
      const idx = hitTest(x,y);
      layout.activeIndex = idx;
      if (idx>-1){
        const o = layout.objects[idx];
        layout.dragDX = x - o.x; layout.dragDY = y - o.y;
        layout.drawing = true;
        redrawLayout(); drawSelection(o);
      } else {
        redrawLayout();
      }
      return;
    }

    layout.drawing = true;
    if (layout.tool === 'pencil' || layout.tool === 'eraser'){
      const ctx = layout.ctx;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = layout.strokeWidth;
      ctx.strokeStyle = layout.strokeColor;
      ctx.globalCompositeOperation = (layout.tool === 'eraser') ? 'destination-out' : 'source-over';
      ctx.beginPath(); ctx.moveTo(x,y);
    }
  };

  const move = (ev)=>{
    if (!layout.drawing) return;
    const {x,y} = getPos(ev);

    if (layout.tool === 'select' && layout.activeIndex>-1){
      const o = layout.objects[layout.activeIndex];
      o.x = x - layout.dragDX; o.y = y - layout.dragDY;
      redrawLayout(); drawSelection(o);
      scheduleSaveLayout();
      return;
    }

    if (layout.tool === 'rect' || layout.tool === 'circle'){ redrawLayout(); }

    if (layout.tool === 'pencil' || layout.tool === 'eraser'){
      layout.ctx.lineTo(x,y); layout.ctx.stroke();
    } else if (layout.tool === 'rect'){
      drawRectPreview(layout.startX, layout.startY, x, y);
    } else if (layout.tool === 'circle'){
      drawCirclePreview(layout.startX, layout.startY, x, y);
    }
  };

  const end = (ev)=>{
    if (!layout.drawing) return;
    layout.drawing = false;

    if (layout.tool === 'select'){ return; }

    if (layout.tool === 'pencil' || layout.tool === 'eraser'){
      layout.ctx.closePath(); layout.ctx.restore();
      layout.baseBitmap = layout.ctx.getImageData(0,0,layout.canvas.width,layout.canvas.height);
      scheduleSaveLayout(); return;
    }

    const pos = (ev.changedTouches? ev.changedTouches[0] : ev);
    const r = layout.canvas.getBoundingClientRect();
    const x2 = (pos.clientX - r.left) * (layout.canvas.width / r.width);
    const y2 = (pos.clientY - r.top)  * (layout.canvas.height / r.height);

    if (layout.tool === 'rect' || layout.tool === 'circle'){
      const x = Math.min(layout.startX, x2), y = Math.min(layout.startY, y2);
      const w = Math.abs(x2-layout.startX), h = Math.abs(y2-layout.startY);
      layout.objects.push({
        type: (layout.tool==='rect'?'rect':'ellipse'),
        x, y, w, h,
        color: layout.strokeColor,
        lineWidth: layout.strokeWidth
      });
      redrawLayout(); scheduleSaveLayout(); return;
    }

    if (layout.tool === 'text'){
      const txt = prompt('Digite o texto:'); if (!txt || !txt.trim()){ redrawLayout(); return; }
      const fontSize = Math.max(10, layout.strokeWidth*6);
      layout.objects.push({
        type:'text', text:txt.trim(), x:layout.startX, y:layout.startY,
        color: layout.strokeColor, font:`${fontSize}px Inter, Arial, sans-serif`
      });
      redrawLayout(); scheduleSaveLayout(); return;
    }
  };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, {passive:false});
  canvas.addEventListener('touchmove',  move,  {passive:false});
  canvas.addEventListener('touchend',   end);
  canvas.addEventListener('touchcancel',end);

  canvas.addEventListener('dblclick', (ev)=>{
    if (layout.tool!=='select') return;
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top)  * (canvas.height / rect.height);
    const idx = hitTest(x,y);
    if (idx>-1 && layout.objects[idx].type==='text'){
      const novo = prompt('Editar texto:', layout.objects[idx].text || '');
      if (novo!=null){ layout.objects[idx].text = novo; redrawLayout(); scheduleSaveLayout(); }
    }
  });
}

function drawRectPreview(x1,y1,x2,y2){
  const ctx = layout.ctx;
  ctx.save(); ctx.lineWidth = layout.strokeWidth; ctx.strokeStyle = layout.strokeColor; ctx.setLineDash([8,6]);
  ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1)); ctx.restore();
}
function drawCirclePreview(x1,y1,x2,y2){
  const ctx = layout.ctx; const w = Math.abs(x2-x1), h = Math.abs(y2-y1);
  const rx=w/2, ry=h/2, cx=Math.min(x1,x2)+rx, cy=Math.min(y1,y2)+ry;
  ctx.save(); ctx.lineWidth = layout.strokeWidth; ctx.strokeStyle = layout.strokeColor; ctx.setLineDash([8,6]);
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.stroke(); ctx.restore();
}

function hitTest(x,y){
  for (let i=layout.objects.length-1;i>=0;i--){
    const o = layout.objects[i];
    if (o.type==='rect'){
      if (x>=o.x && y>=o.y && x<=o.x+o.w && y<=o.y+o.h) return i;
    } else if (o.type==='ellipse'){
      const rx=o.w/2, ry=o.h/2, cx=o.x+rx, cy=o.y+ry;
      const nx = (x-cx)/rx, ny = (y-cy)/ry;
      if (nx*nx + ny*ny <= 1) return i;
    } else if (o.type==='text'){
      layout.ctx.save();
      layout.ctx.font = o.font || '16px Inter, Arial, sans-serif';
      const w = layout.ctx.measureText(o.text||' ').width, h = parseInt((o.font||'16px').split('px')[0],10);
      layout.ctx.restore();
      if (x>=o.x && y>=o.y && x<=o.x+w && y<=o.y+h) return i;
    }
  }
  return -1;
}
function drawSelection(o){
  const ctx = layout.ctx;
  ctx.save(); ctx.setLineDash([5,5]); ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
  if (o.type==='rect'){ ctx.strokeRect(o.x, o.y, o.w, o.h); }
  else if (o.type==='ellipse'){ ctx.beginPath(); ctx.ellipse(o.x+o.w/2, o.y+o.h/2, o.w/2, o.h/2, 0,0,Math.PI*2); ctx.stroke(); }
  else if (o.type==='text'){
    ctx.font = o.font || '16px Inter, Arial, sans-serif';
    const w = ctx.measureText(o.text||' ').width;
    const h = parseInt((o.font||'16px').split('px')[0],10);
    ctx.strokeRect(o.x-2, o.y-2, w+4, h+4);
  }
  ctx.restore();
}

function fitLayoutCanvasToWrap(){
  const wrap = layout.wrap; if (!wrap) return;
  const w = wrap.clientWidth || layout.canvas.width; const ratio = 297/210;
  layout.canvas.style.width  = w + 'px'; layout.canvas.style.height = (w*ratio) + 'px';
}

function redrawLayout(forceBase=false){
  const c = layout.canvas, ctx = layout.ctx;
  ctx.putImageData(layout.baseBitmap, 0, 0);
  layout.objects.forEach(o=>{
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    if (o.type==='rect'){
      ctx.lineWidth = o.lineWidth||2; ctx.strokeStyle = o.color||'#000'; ctx.strokeRect(o.x,o.y,o.w,o.h);
    } else if (o.type==='ellipse'){
      ctx.lineWidth = o.lineWidth||2; ctx.strokeStyle = o.color||'#000';
      ctx.beginPath(); ctx.ellipse(o.x+o.w/2, o.y+o.h/2, o.w/2, o.h/2, 0, 0, Math.PI*2); ctx.stroke();
    } else if (o.type==='text'){
      ctx.fillStyle = o.color||'#000'; ctx.font = o.font || '16px Inter, Arial, sans-serif';
      ctx.textBaseline = 'top'; ctx.fillText(o.text||'', o.x, o.y);
    }
    ctx.restore();
  });
  if (layout.activeIndex>-1) drawSelection(layout.objects[layout.activeIndex]);
}

function drawImageContain(img, ctx, W, H){
  const ir = img.width / img.height, cr = W / H;
  let dw = W, dh = H;
  if (ir > cr) { dh = W / ir; dw = W; } else { dw = H * ir; dh = H; }
  const dx = (W - dw)/2, dy = (H - dh)/2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/* ======= Salvamento do Layout (compressão adaptativa) ======= */
function exportCompositeToJPEG(quality = 0.6, targetMaxWidth = 900){
  const W = layout.canvas.width, H = layout.canvas.height;
  const ratio = H / W;
  const SW = Math.min(targetMaxWidth, W);
  const SH = Math.round(SW * ratio);

  const out = document.createElement('canvas');
  out.width = SW; out.height = SH;
  const octx = out.getContext('2d', { willReadFrequently:true });

  octx.fillStyle = '#ffffff';
  octx.fillRect(0,0,SW,SH);

  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  base.getContext('2d').putImageData(layout.baseBitmap, 0, 0);
  octx.drawImage(base, 0, 0, SW, SH);

  octx.save();
  octx.scale(SW / W, SH / H);
  layout.objects.forEach(o=>{
    octx.save();
    octx.globalCompositeOperation = 'source-over';
    if (o.type==='rect'){
      octx.lineWidth = o.lineWidth||2; octx.strokeStyle = o.color||'#000';
      octx.strokeRect(o.x,o.y,o.w,o.h);
    } else if (o.type==='ellipse'){
      octx.lineWidth = o.lineWidth||2; octx.strokeStyle = o.color||'#000';
      octx.beginPath(); octx.ellipse(o.x+o.w/2, o.y+o.h/2, o.w/2, o.h/2, 0, 0, Math.PI*2); octx.stroke();
    } else if (o.type==='text'){
      octx.fillStyle = o.color||'#000'; octx.font = o.font || '16px Inter, Arial, sans-serif';
      octx.textBaseline = 'top'; octx.fillText(o.text||'', o.x, o.y);
    }
    octx.restore();
  });
  octx.restore();

  return out.toDataURL('image/jpeg', quality);
}

let _saveTimer=null;
function scheduleSaveLayout(){ clearTimeout(_saveTimer); _saveTimer=setTimeout(()=>salvarLayoutLocal(true), 500); }

async function salvarLayoutLocal(silencioso=false){
  try{
    const dataURL = exportCompositeToJPEG(0.6, 900);
    const bin = atob(dataURL.split(',')[1]);
    const buf = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], {type:'image/jpeg'});

    const idbKey = `${LAYOUT_KEY()}_blob`;
    await idbSet(idbKey, blob);

    const payload = {
      idEvento: eventoId || null,
      atualizadoEm: new Date().toISOString(),
      idbKey,
      objects: layout.objects
    };
    localStorage.setItem(LAYOUT_KEY(), JSON.stringify(payload));

    try {
      const arr = JSON.parse(localStorage.getItem('eventos')||'[]');
      const idx = arr.findIndex(e => String(e.id) === String(payload.idEvento));
      if (idx > -1) {
        arr[idx].definicoes = arr[idx].definicoes || {};
        arr[idx].definicoes.layout = {
          idbKey: payload.idbKey,
          atualizadoEm: payload.atualizadoEm,
          objects: payload.objects
        };
        localStorage.setItem('eventos', JSON.stringify(arr));
      }
    } catch {}

    if (!silencioso) atualizarSaveStatus('Layout salvo');
  }catch(e){
    console.warn('Falha ao salvar layout:', e);
    if (!silencioso) alert('Não foi possível salvar o layout (cota de armazenamento).');
  }
}

function restaurarLayoutLocal(){
  (async ()=>{
    try{
      const payload = JSON.parse(localStorage.getItem(LAYOUT_KEY()) || 'null');
      layout.objects = Array.isArray(payload?.objects) ? payload.objects : [];
      if (payload?.idbKey){
        const blob = await idbGet(payload.idbKey);
        if (blob){
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = ()=>{
            const ctx = layout.ctx;
            ctx.clearRect(0,0,layout.canvas.width, layout.canvas.height);
            drawImageContain(img, ctx, layout.canvas.width, layout.canvas.height);
            layout.baseBitmap = ctx.getImageData(0,0,layout.canvas.width, layout.canvas.height);
            URL.revokeObjectURL(url);
            redrawLayout(true);
          };
          img.src = url;
          return;
        }
      }
      layout.baseBitmap = blankBitmap();
      redrawLayout(true);
    }catch(e){
      console.warn('Falha ao restaurar layout:', e);
      layout.baseBitmap = blankBitmap();
      redrawLayout(true);
    }
  })();
}

function baixarPNGLayout(){
  const data = exportCompositeToJPEG(0.9).replace('image/jpeg','image/png');
  const dt = new Date();
  const nome = `layout_${(evento?.nomeEvento || 'evento')}`
    .replace(/\s+/g,'_')+`_${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}.png`;
  const a = document.createElement('a'); a.download = nome.toLowerCase(); a.href = data; a.click();
}
