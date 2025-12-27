// ===== Util =====
const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
const BRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

// storage keys
const K_INS = 'ft:insumos';
const K_PRT = 'ft:pratos';
const CATS_KEY = 'insumos.categorias';

const getLS = (k, fb)=>{ try{ return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const setLS = (k, v)=> localStorage.setItem(k, JSON.stringify(v));
const getCats = ()=>{ try { return JSON.parse(localStorage.getItem(CATS_KEY)||'[]'); } catch { return []; } };
const uid   = ()=> 'id_'+Math.random().toString(36).slice(2)+Date.now().toString(36);

// ===== Unidades & conversão =====
const familyOf = (u)=>{
  u = String(u||'').toLowerCase();
  if (u==='un') return 'count';
  if (u==='g' || u==='kg') return 'mass';
  if (u==='ml' || u==='l') return 'vol';
  return 'count';
};
const toBaseQty = (qty, unit)=>{ // base: un, g, ml
  qty = Number(qty||0);
  switch(String(unit||'').toLowerCase()){
    case 'kg': return qty*1000; // g
    case 'l' : return qty*1000; // ml
    default  : return qty;      // un, g, ml já base
  }
};
const baseUnit = (unit)=>{
  const fam = familyOf(unit);
  return fam==='mass' ? 'g' : fam==='vol' ? 'ml' : 'un';
};
const displayBase = (u)=> baseUnit(u);

// ===== Estado =====
let editInsumoId = null;
let editPratoId  = null;
let pratoItensTmp = [];

// ===== Tabs =====
$('#tabInsumos')?.addEventListener('click', ()=>{
  $('#tabInsumos').classList.add('ativo'); $('#tabPratos').classList.remove('ativo');
  $('#secInsumos').style.display=''; $('#secPratos').style.display='none';
});
$('#tabPratos')?.addEventListener('click', ()=>{
  $('#tabPratos').classList.add('ativo'); $('#tabInsumos').classList.remove('ativo');
  $('#secPratos').style.display=''; $('#secInsumos').style.display='none';
});

// ===== INSUMOS =====
function precoUnitarioBase(ins){
  if (!ins) return 0;
  const qBase = toBaseQty(ins.qtdPack, ins.unid);
  if (!qBase) return 0;
  const precoPack = Number(ins.precoPack)||0;
  return precoPack / qBase;
}

function catName(categoriaId){
  const cats = getCats();
  return cats.find(c=>String(c.id)===String(categoriaId))?.nome || '—';
}

function renderInsumos(){
  const tb = $('#tbInsumos');
  const list = getLS(K_INS, []);
  tb.innerHTML = '';
  if (!list.length){
    tb.innerHTML = `<tr><td colspan="7" class="muted">Nenhum insumo cadastrado.</td></tr>`;
    return;
  }
  for (const i of list){
    const uBase = displayBase(i?.unid||'un');
    const qtdPack = Number(i?.qtdPack)||0;
    const precoPack = Number(i?.precoPack)||0;
    const pUnit = precoUnitarioBase(i);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td title="${(i?.obs||'').replace(/"/g,'&quot;')}">${i?.nome||'—'}</td>
      <td>${catName(i?.categoriaId)}</td>
      <td>${i?.unid||'un'}</td>
      <td class="num">${qtdPack}</td>
      <td class="num">${BRL.format(precoPack)}</td>
      <td class="num">${BRL.format(pUnit)}/${uBase}</td>
      <td class="acoes">
        <button class="btn-ghost" data-edit="${i.id}"><i data-lucide="pencil"></i> Editar</button>
        <button class="btn-ghost" data-del="${i.id}"><i data-lucide="trash-2"></i> Excluir</button>
      </td>
    `;
    tb.appendChild(tr);
  }
  window.lucide?.createIcons?.();
}

// Modal genérico
function openModal(el){
  el.classList.add('aberto'); el.setAttribute('aria-hidden','false');
  document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
}
function closeModal(el){
  el.classList.remove('aberto'); el.setAttribute('aria-hidden','true');
  document.documentElement.style.overflow = ''; document.body.style.overflow = '';
}

// Preenche o SELECT de categorias (sempre que abrir o modal)
function populateCategoriasSelect(){
  const sel = $('#insCategoria'); if (!sel) return;
  const cats = getCats();
  if (!cats.length){
    sel.innerHTML = `<option value="">(sem categorias)</option>`;
    return;
  }
  sel.innerHTML = cats.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
}

function abrirModalInsumo(id=null){
  editInsumoId = id;
  $('#frmInsumo')?.reset?.();
  $('#ttlInsumo').textContent = id ? 'Editar insumo' : 'Novo insumo';

  populateCategoriasSelect();

  if (id){
    const it = getLS(K_INS, []).find(x=>x.id===id);
    if (it){
      $('#insNome').value      = it?.nome||'';
      $('#insUnid').value      = it?.unid||'un';
      $('#insQtdPack').value   = Number(it?.qtdPack||0);
      $('#insPrecoPack').value = Number(it?.precoPack||0);
      $('#insObs').value       = it?.obs||'';
      $('#insCategoria').value = it?.categoriaId || $('#insCategoria').value;
    }
  }
  openModal($('#modalInsumo'));
}
function fecharModalInsumo(){
  closeModal($('#modalInsumo'));
  editInsumoId = null;
}
window.abrirModalInsumo = abrirModalInsumo;
window.fecharModalInsumo = fecharModalInsumo;

$('#btnCancelarInsumo')?.addEventListener('click', fecharModalInsumo);
$('#frmInsumo')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const nome      = ($('#insNome').value||'').trim();
  const unid      = $('#insUnid').value||'un';
  const qtdPack   = Math.max(0, Number($('#insQtdPack').value||'0')||0);
  const precoPack = Math.max(0, Number($('#insPrecoPack').value||'0')||0);
  const obs       = ($('#insObs').value||'').trim();
  const categoriaId = $('#insCategoria')?.value || '';

  if (!nome) return alert('Informe o nome.');
  if (!qtdPack || !precoPack) return alert('Informe quantidade e preço do pack.');

  const list = getLS(K_INS, []);
  if (editInsumoId){
    const i = list.findIndex(x=>x.id===editInsumoId);
    if (i>-1) list[i] = { ...list[i], nome, unid, qtdPack, precoPack, obs, categoriaId };
  } else {
    list.push({ id: uid(), nome, unid, qtdPack, precoPack, obs, categoriaId });
  }
  setLS(K_INS, list);
  fecharModalInsumo();
  renderInsumos();
});

// Delegação (editar/excluir/importar/exportar)
document.addEventListener('click', (ev)=>{
  const btnE = ev.target.closest('[data-edit]');
  const btnD = ev.target.closest('[data-del]');
  const btnImp = ev.target.closest('#btnImportar');
  const btnExp = ev.target.closest('#btnExportar');
  if (btnE){ abrirModalInsumo(btnE.getAttribute('data-edit')); return; }
  if (btnD){
    const id = btnD.getAttribute('data-del');
    if (!confirm('Excluir este insumo?')) return;
    setLS(K_INS, getLS(K_INS, []).filter(x=>x.id!==id));
    renderInsumos(); return;
  }
  if (btnExp){
    const data = getLS(K_INS, []);
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='insumos.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    return;
  }
  if (btnImp){
    const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange = ()=>{
      const f = inp.files?.[0]; if(!f) return;
      const rd = new FileReader();
      rd.onload = ()=>{
        try{
          const arr = JSON.parse(rd.result||'[]'); if(!Array.isArray(arr)) throw 0;
          setLS(K_INS, arr); renderInsumos();
        }catch{ alert('Arquivo inválido.'); }
      };
      rd.readAsText(f);
    };
    inp.click();
    return;
  }
});

// ===== PRATOS (inalterado estruturalmente) =====
function renderPratos(){
  const tb = $('#tbPratos');
  const pratos = getLS(K_PRT, []);
  const insumos = getLS(K_INS, []);
  tb.innerHTML = '';
  if (!pratos.length){
    tb.innerHTML = `<tr><td colspan="5" class="muted">Nenhuma ficha técnica cadastrada.</td></tr>`;
    return;
  }
  for (const p of pratos){
    const porcoes = Math.max(1, Number(p?.porcoes||1));
    let total=0;
    (p?.itens||[]).forEach(it=>{
      const ins = insumos.find(x=>x.id===it.insumoId);
      const custoBase = precoUnitarioBase(ins);
      const qtdBase   = Number(it?.qtdBase)||0;
      total += qtdBase * custoBase;
    });
    const custoPorcao = total / porcoes;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p?.nome||'—'}</td>
      <td class="num">${porcoes}</td>
      <td class="num">${BRL.format(custoPorcao||0)}</td>
      <td class="num">${BRL.format(total||0)}</td>
      <td class="acoes">
        <button class="btn-ghost" data-edit-prato="${p.id}"><i data-lucide="pencil"></i> Editar</button>
        <button class="btn-ghost" data-del-prato="${p.id}"><i data-lucide="trash-2"></i> Excluir</button>
      </td>
    `;
    tb.appendChild(tr);
  }
  window.lucide?.createIcons?.();
}
// Delegação para EDITAR / EXCLUIR PRATOS (aba Fichas Técnicas)
document.addEventListener('click', (ev) => {
  const btnEditPrato = ev.target.closest('[data-edit-prato]');
  const btnDelPrato  = ev.target.closest('[data-del-prato]');

  if (btnEditPrato) {
    const id = btnEditPrato.getAttribute('data-edit-prato');
    abrirModalPrato(id); // abre modal já preenchido
    return;
  }

  if (btnDelPrato) {
    const id = btnDelPrato.getAttribute('data-del-prato');
    if (!confirm('Excluir esta ficha técnica?')) return;
    const pratos = JSON.parse(localStorage.getItem('ft:pratos') || '[]');
    const novos  = pratos.filter(p => String(p.id) !== String(id));
    localStorage.setItem('ft:pratos', JSON.stringify(novos));
    renderPratos(); // atualiza a tabela
  }
});

function popularSelectInsumos(){
  const sel = $('#selInsumo'); if(!sel) return;
  const list = getLS(K_INS, []);
  sel.innerHTML = list.length
    ? list.map(i=>`<option value="${i.id}" data-unid="${i.unid}">${i.nome}</option>`).join('')
    : '<option value="">— cadastre insumos primeiro —</option>';
  atualizarUnidadesDoSelecionado();
}
function atualizarUnidadesDoSelecionado(){
  const sel = $('#selInsumo'); const uSel = $('#selUnidade');
  if (!sel || !uSel) return;
  const opt = sel.selectedOptions?.[0];
  const unid = (opt?.dataset?.unid) || 'un';
  const fam = familyOf(unid);
  let opts = '';
  if (fam==='count') opts = '<option value="un">un</option>';
  if (fam==='mass')  opts = '<option value="g">g</option><option value="kg">kg</option>';
  if (fam==='vol')   opts = '<option value="ml">ml</option><option value="l">l</option>';
  uSel.innerHTML = opts;
}
$('#selInsumo')?.addEventListener('change', atualizarUnidadesDoSelecionado);

function abrirModalPrato(id=null){
  editPratoId = id;
  pratoItensTmp = [];
  $('#ttlPrato').textContent = id ? 'Editar prato' : 'Novo prato';
  $('#prNome').value    = '';
  $('#prPorcoes').value = 10;
  $('#tbItensPrato').innerHTML = `<tr><td colspan="5" class="muted">Nenhum insumo adicionado.</td></tr>`;
  atualizarResumoPrato();

  if (id){
    const pr = getLS(K_PRT, []).find(p=>p.id===id);
    if (pr){
      $('#prNome').value    = pr?.nome||'';
      $('#prPorcoes').value = Number(pr?.porcoes||10);
      pratoItensTmp = Array.isArray(pr?.itens)? JSON.parse(JSON.stringify(pr.itens)) : [];
      renderItensPrato();
    }
  }

  popularSelectInsumos();
  openModal($('#modalPrato'));
}
function fecharModalPrato(){ closeModal($('#modalPrato')); editPratoId=null; pratoItensTmp=[]; }
$('#btnCancelarPrato')?.addEventListener('click', fecharModalPrato);
$('#btnNovoPrato')?.addEventListener('click', ()=> abrirModalPrato(null));

function renderItensPrato(){
  const tb = $('#tbItensPrato');
  const insumos = getLS(K_INS, []);
  tb.innerHTML = '';
  if (!pratoItensTmp.length){
    tb.innerHTML = `<tr><td colspan="5" class="muted">Nenhum insumo adicionado.</td></tr>`;
    atualizarResumoPrato(); return;
  }
  for (const it of pratoItensTmp){
    const ins = insumos.find(x=>x.id===it.insumoId);
    const nome = ins?.nome || '—';
    const uBase = displayBase(ins?.unid||'un');
    const precoBase = precoUnitarioBase(ins);
    const qtdBase = Number(it?.qtdBase)||0;
    const subtotal = qtdBase * precoBase;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${nome}</td>
      <td class="num">${Number(it?.qtd||0)} ${it?.unidUsada||'un'}</td>
      <td class="num">${BRL.format(precoBase)}/${uBase}</td>
      <td class="num">${BRL.format(subtotal)}</td>
      <td class="acoes"><button class="btn-ghost" data-del-item="${it._tmpid}"><i data-lucide="trash-2"></i> Remover</button></td>
    `;
    tb.appendChild(tr);
  }
  window.lucide?.createIcons?.();
  atualizarResumoPrato();
}
function atualizarResumoPrato(){
  const insumos = getLS(K_INS, []);
  let total = 0;
  for (const it of pratoItensTmp){
    const ins = insumos.find(x=>x.id===it.insumoId);
    const precoBase = precoUnitarioBase(ins);
    const qtdBase = Number(it?.qtdBase)||0;
    total += qtdBase * precoBase;
  }
  const porcoes = Math.max(1, Number($('#prPorcoes').value||1));
  const porcao = total / porcoes;
  $('#prResumo').textContent = `Total ${BRL.format(total)} · R$/porção ${BRL.format(porcao)}`;
}
$('#prPorcoes')?.addEventListener('input', atualizarResumoPrato);

$('#btnAddInsumo')?.addEventListener('click', ()=>{
  const insId = $('#selInsumo').value;
  const q     = Math.max(0, Number($('#inQtdUsada').value||'0')||0);
  const u     = $('#selUnidade').value||'un';
  if (!insId) return alert('Escolha um insumo.');
  if (!q)     return alert('Informe a quantidade usada.');

  const qBase = toBaseQty(q, u);
  const item = { _tmpid: uid(), insumoId: insId, qtd: q, unidUsada: u, qtdBase: qBase };
  pratoItensTmp.push(item);
  $('#inQtdUsada').value = '';
  renderItensPrato();
});

document.addEventListener('click', (ev)=>{
  const btn = ev.target.closest('[data-del-item]');
  if (!btn) return;
  const id = btn.getAttribute('data-del-item');
  pratoItensTmp = pratoItensTmp.filter(x=>x._tmpid !== id);
  renderItensPrato();
});

$('#btnSalvarPrato')?.addEventListener('click', ()=>{
  const nome = ($('#prNome').value||'').trim();
  const porcoes = Math.max(1, Number($('#prPorcoes').value||1));
  if (!nome) return alert('Informe o nome do prato.');
  if (!pratoItensTmp.length) return alert('Adicione pelo menos um insumo.');

  const pratos = getLS(K_PRT, []);
  if (editPratoId){
    const i = pratos.findIndex(p=>p.id===editPratoId);
    if (i>-1) pratos[i] = { ...pratos[i], nome, porcoes, itens: pratoItensTmp };
  } else {
    pratos.push({ id: uid(), nome, porcoes, itens: pratoItensTmp });
  }
  setLS(K_PRT, pratos);
  fecharModalPrato();
  renderPratos();
});
// Reage a mudanças nas categorias (emitido pelo HTML)
window.addEventListener('insumo:categorias:changed', () => {
  try {
    // se o modal de insumo estiver aberto, recarrega o select
    if (document.getElementById('modalInsumo')?.classList.contains('aberto')) {
      populateCategoriasSelect();
    }
    // re-renderiza a lista para mostrar o nome da categoria atualizado
    renderInsumos();
  } catch {}
});

// ===== Boot =====
document.addEventListener('DOMContentLoaded', ()=>{
  renderInsumos();
  renderPratos();
  popularSelectInsumos();
  atualizarUnidadesDoSelecionado();
  window.lucide?.createIcons?.();
});
