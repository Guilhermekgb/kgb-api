// === INÍCIO PATCH API-READY (custos-fixo.js) ===
// Se o kgb-common.js já estiver carregado, usa apiFetch/alertas globais
// Senão, mantém tudo localStorage como fallback (modo atual)
const useRemote = false; // trocaremos para true na Fase F (sync remoto)

async function apiGetCustosFixos() {
  if (!useRemote) {
    try { return JSON.parse(localStorage.getItem('custosFixosBuffet') || '[]') || []; }
    catch { return []; }
  }
  try {
    const r = await apiFetch('/custosfixos');
    return r.data || [];
  } catch (e) {
    console.warn('[custos-fixo] Falha apiGetCustosFixos:', e);
    return [];
  }
}

async function apiSaveCustosFixos(arr) {
  if (!useRemote) {
    localStorage.setItem('custosFixosBuffet', JSON.stringify(arr || []));
    return { ok: true, modo: 'local' };
  }
  try {
    const r = await apiFetch('/custosfixos', { method: 'POST', body: arr });
    return { ok: true, modo: 'api', data: r };
  } catch (e) {
    console.error('[custos-fixo] Falha apiSaveCustosFixos:', e);
    alert('Erro ao salvar custos fixos no servidor.');
    return { ok: false, error: e };
  }
}
// === FIM PATCH API-READY (custos-fixo.js) ===
// ====== Config & Estado ======
const LS_KEY = 'custosFixosBuffet';
let itens = [];           // catálogo (persistido)
let editIndex = null;     // índice em edição

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const toNum = v => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/\./g,'').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const CATEGORIAS = {
  mao_obra: 'Mão de Obra',
  logistica: 'Logística',
  locacao: 'Locação',
  taxas: 'Taxas & Impostos',
  outros: 'Outros'
};

const REGRAS = {
  fixo_evento: 'Fixo por evento',
  por_pessoa: 'Por pessoa',
  por_equipe: 'Por equipe',
  por_hora: 'Por hora',
  por_km: 'Por km'
};

document.addEventListener('DOMContentLoaded', () => {
  window.lucide?.createIcons?.();
  carregar();
  migrarEstruturaAntiga();
  salvar();              // garante persistência pós-migração
  renderTabela();
  renderPlanilha();

  // Form
  document.getElementById('formCustoFixo')?.addEventListener('submit', onSalvar);
  document.getElementById('btnLimpar')?.addEventListener('click', limparFormulario);
  document.getElementById('regra')?.addEventListener('change', atualizarCamposRegra);

  // Exportar/Importar
  document.getElementById('btnExportar')?.addEventListener('click', exportarJSON);
  document.getElementById('inputImportar')?.addEventListener('change', importarJSON);
});

function carregar() {
  try { itens = JSON.parse(localStorage.getItem(LS_KEY) || '[]') || []; }
  catch { itens = []; }
}

function salvar() {
  localStorage.setItem(LS_KEY, JSON.stringify(itens));
}

// ====== Migração de dados antigos ({nome, valor}) ======
function migrarEstruturaAntiga() {
  let mudou = false;
  itens = (itens || []).map((it, idx) => {
    if (it && typeof it === 'object' && 'valor' in it && !('valorUnitario' in it)) {
      mudou = true;
      return {
        id: it.id ?? ('cx_' + Date.now() + '_' + idx),
        nome: it.nome ?? 'Item',
        categoria: 'outros',
        unidade: 'item',
        regra: 'fixo_evento',
        parametros: { qtdFixa: 1 },
        valorUnitario: Number(it.valor) || 0,
        fornecedor: it.fornecedor ?? '',
        responsavel: it.responsavel ?? '',
        obs: it.obs ?? '',
        ativo: true
      };
    }
    // garantir campos mínimos
    return {
      id: it.id ?? ('cx_' + Date.now() + '_' + idx),
      nome: it.nome ?? 'Item',
      categoria: it.categoria ?? 'outros',
      unidade: it.unidade ?? 'item',
      regra: it.regra ?? 'fixo_evento',
      parametros: it.parametros ?? { qtdFixa: 1 },
      valorUnitario: Number(it.valorUnitario ?? it.valor ?? 0) || 0,
      fornecedor: it.fornecedor ?? '',
      responsavel: it.responsavel ?? '',
      obs: it.obs ?? '',
      ativo: typeof it.ativo === 'boolean' ? it.ativo : true
    };
  });
  if (mudou) console.info('Catálogo migrado para a nova estrutura.');
}

// ====== Form Helpers ======
function atualizarCamposRegra() {
  const regra = document.getElementById('regra').value;
  document.querySelectorAll('.param-box').forEach(box => box.classList.remove('active'));
  const alvo = document.querySelector(`.param-box[data-regra="${regra}"]`);
  if (alvo) alvo.classList.add('active');
}

function limparFormulario() {
  editIndex = null;
  document.getElementById('formCustoFixo')?.reset();
  document.getElementById('ativo').checked = true;
  document.getElementById('btnSalvar').querySelector('span').textContent = 'Salvar';
  document.getElementById('hintEdicao').style.display = 'none';
  atualizarCamposRegra();
  window.lucide?.createIcons?.();
}

function onSalvar(e) {
  e.preventDefault();

  const nome = document.getElementById('nome').value.trim();
  const categoria = document.getElementById('categoria').value;
  const unidade = document.getElementById('unidade').value;
  const regra = document.getElementById('regra').value;
  const valorUnitario = toNum(document.getElementById('valorUnitario').value);
  const ativo = document.getElementById('ativo').checked;
  const fornecedor = document.getElementById('fornecedor').value.trim();
  const responsavel = document.getElementById('responsavel').value.trim();
  const obs = document.getElementById('obs').value.trim();

  if (!nome || !Number.isFinite(valorUnitario)) {
    alert('Preencha nome e valor unitário corretamente.');
    return;
  }

  // parâmetros por regra
  let parametros = {};
  if (regra === 'fixo_evento') {
    parametros.qtdFixa = toNum(document.getElementById('p_qtdFixa').value) || 1;
  } else if (regra === 'por_pessoa') {
    parametros.coef = toNum(document.getElementById('p_coef').value) || 1;
  } else if (regra === 'por_equipe') {
    parametros.razao = Math.max(1, toNum(document.getElementById('p_razao').value) || 25);
    parametros.min = Math.max(0, toNum(document.getElementById('p_min').value) || 0);
    parametros.horas = Math.max(0, toNum(document.getElementById('p_horas').value) || 0);
    parametros.pessoas = Math.max(0, toNum(document.getElementById('p_pessoas').value) || 1);
  } else if (regra === 'por_hora') {
    parametros.pessoas = Math.max(0, toNum(document.getElementById('h_pessoas').value) || 1);
    parametros.horas = Math.max(0, toNum(document.getElementById('h_horas').value) || 1);
  } else if (regra === 'por_km') {
    parametros.km = Math.max(0, toNum(document.getElementById('k_km').value) || 0);
    parametros.viagens = Math.max(0, toNum(document.getElementById('k_viagens').value) || 1);
  }

  const novo = {
    id: editIndex !== null ? (itens[editIndex]?.id ?? ('cx_' + Date.now())) : ('cx_' + Date.now()),
    nome, categoria, unidade, regra, parametros,
    valorUnitario: Number(valorUnitario),
    fornecedor, responsavel, obs, ativo
  };

  // evitar duplicado por nome (case-insensitive)
  const idxDup = itens.findIndex((i, idx) => i.nome.toLowerCase() === nome.toLowerCase() && idx !== editIndex);
  if (idxDup !== -1) {
    alert('Já existe um item com este nome no catálogo.');
    return;
  }

  if (editIndex === null) {
    itens.push(novo);
  } else {
    itens[editIndex] = novo;
    editIndex = null;
    document.getElementById('btnSalvar').querySelector('span').textContent = 'Salvar';
    document.getElementById('hintEdicao').style.display = 'none';
  }

  salvar();
  renderTabela();
  renderPlanilha();
  limparFormulario();
}
function __hasComprovante({ lancId, parcelaId } = {}){
  try {
    const fg = readLS('financeiroGlobal', {}) || {};

    // parcela primeiro
    if (parcelaId){
      const p = (fg.parcelas||[]).find(x => String(x.id) === String(parcelaId));
      if (p){
        if (p.comprovante && p.comprovante !== '[separado]') return true;
        try { if (localStorage.getItem(`fg.comp.parc:${p.id}`)) return true; } catch {}
      }
    }

    // depois lançamento
    if (lancId){
      const l = (fg.lancamentos||[]).find(x => String(x.id) === String(lancId));
      if (l){
        if (l.comprovante && l.comprovante !== '[separado]') return true;
        if (l.hasComprovante){
          const sep = (typeof loadComp==='function')
            ? loadComp(l.id)
            : (localStorage.getItem(`fg.comp:${l.id}`)||null);
          return !!sep;
        }
      }
    }
  } catch {}
  return false;
}

// ====== Tabela ======
function renderTabela() {
  const tbody = document.querySelector('#tabelaCustosFixos tbody');
  tbody.innerHTML = '';

  if (!itens.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" class="muted" style="text-align:center;">Nenhum item cadastrado.</td>`;
    tbody.appendChild(tr);
  } else {
    itens.forEach((it, index) => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td><strong>${esc(it.nome)}</strong><br><span class="muted">${esc(it.obs || '')}</span></td>
        <td>${esc(CATEGORIAS[it.categoria] || '-')}</td>
        <td>${esc(REGRAS[it.regra])}<br><span class="muted">${esc(descreverParametros(it))}</span></td>
        <td>${esc(it.unidade)}</td>
        <td>${fmtBRL.format(Number(it.valorUnitario) || 0)}</td>
        <td>
          <span class="status-dot ${it.ativo ? 'on' : 'off'}"></span>
          ${it.ativo ? 'Ativo' : 'Inativo'}
        </td>
        <td style="text-align:center;">
          <div class="acoes-inline">
            <button class="botao-editar" data-edit="${index}">Editar</button>
            <button class="btn btn-ghost" data-dup="${index}"><i data-lucide="copy"></i> Duplicar</button>
            <button class="btn btn-ghost" data-toggle="${index}">${it.ativo ? 'Desativar' : 'Ativar'}</button>
            <button class="botao-excluir" data-del="${index}">Excluir</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  tbody.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const iEdit = btn.getAttribute('data-edit');
    const iDel  = btn.getAttribute('data-del');
    const iDup  = btn.getAttribute('data-dup');
    const iTog  = btn.getAttribute('data-toggle');

    if (iEdit !== null) editarItem(Number(iEdit));
    else if (iDel !== null) excluirItem(Number(iDel));
    else if (iDup !== null) duplicarItem(Number(iDup));
    else if (iTog !== null) toggleAtivo(Number(iTog));
  };

  window.lucide?.createIcons?.();
}

function descreverParametros(it) {
  const p = it.parametros || {};
  switch (it.regra) {
    case 'fixo_evento': return `Qtd fixa: ${p.qtdFixa ?? 1}`;
    case 'por_pessoa':  return `Coef.: ${p.coef ?? 1} por pessoa`;
    case 'por_equipe':  return `Razão: 1/${p.razao ?? 25}${p.min?`, mín: ${p.min}`:''}${p.horas?`, horas: ${p.horas}`:''}${p.pessoas?`, por time: ${p.pessoas}`:''}`;
    case 'por_hora':    return `Pessoas: ${p.pessoas ?? 1}, horas: ${p.horas ?? 1}`;
    case 'por_km':      return `Km: ${p.km ?? 0}, viagens: ${p.viagens ?? 1}`;
    default: return '';
  }
}

function editarItem(index) {
  const it = itens[index];
  if (!it) return;

  editIndex = index;
  document.getElementById('nome').value = it.nome || '';
  document.getElementById('categoria').value = it.categoria || 'outros';
  document.getElementById('unidade').value = it.unidade || 'item';
  document.getElementById('regra').value = it.regra || 'fixo_evento';
  document.getElementById('valorUnitario').value = it.valorUnitario ?? 0;
  document.getElementById('ativo').checked = !!it.ativo;
  document.getElementById('fornecedor').value = it.fornecedor || '';
  document.getElementById('responsavel').value = it.responsavel || '';
  document.getElementById('obs').value = it.obs || '';

  atualizarCamposRegra();
  const p = it.parametros || {};
  // preencher campos por regra
  if (it.regra === 'fixo_evento') {
    document.getElementById('p_qtdFixa').value = p.qtdFixa ?? 1;
  } else if (it.regra === 'por_pessoa') {
    document.getElementById('p_coef').value = p.coef ?? 1;
  } else if (it.regra === 'por_equipe') {
    document.getElementById('p_razao').value = p.razao ?? 25;
    document.getElementById('p_min').value = p.min ?? 0;
    document.getElementById('p_horas').value = p.horas ?? 0;
    document.getElementById('p_pessoas').value = p.pessoas ?? 1;
  } else if (it.regra === 'por_hora') {
    document.getElementById('h_pessoas').value = p.pessoas ?? 1;
    document.getElementById('h_horas').value = p.horas ?? 1;
  } else if (it.regra === 'por_km') {
    document.getElementById('k_km').value = p.km ?? 0;
    document.getElementById('k_viagens').value = p.viagens ?? 1;
  }

  document.getElementById('btnSalvar').querySelector('span').textContent = 'Atualizar';
  document.getElementById('hintEdicao').style.display = 'inline';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function excluirItem(index) {
  if (!Number.isFinite(index)) return;
  if (!confirm('Deseja realmente excluir este item do catálogo?')) return;
  itens.splice(index, 1);
  salvar();
  renderTabela();
  renderPlanilha();
}

function duplicarItem(index) {
  const base = itens[index];
  if (!base) return;
  // garante nome único
  let novoNome = base.nome + ' (cópia)';
  let contador = 2;
  while (itens.some(i => i.nome.toLowerCase() === novoNome.toLowerCase())) {
    novoNome = base.nome + ` (cópia ${contador++})`;
  }
  const copia = JSON.parse(JSON.stringify(base));
  copia.id = 'cx_' + Date.now();
  copia.nome = novoNome;
  itens.push(copia);
  salvar();
  renderTabela();
  renderPlanilha();
}

function toggleAtivo(index) {
  const it = itens[index];
  if (!it) return;
  it.ativo = !it.ativo;
  salvar();
  renderTabela();
}

// ====== Planilha rápida (simulação) ======
function renderPlanilha() {
  const tbody = document.querySelector('#tabelaPlanilha tbody');
  tbody.innerHTML = '';

  if (!itens.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="muted" style="text-align:center;">Nenhum item cadastrado.</td>`;
    tbody.appendChild(tr);
  } else {
    itens.forEach((it, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(it.nome)}</td>
        <td data-unit="${Number(it.valorUnitario)||0}">${fmtBRL.format(Number(it.valorUnitario)||0)}</td>
        <td><input type="number" class="input qtd-sim" data-index="${index}" min="0" step="0.01" value="0" style="width: 90px;" /></td>
        <td class="total-item">R$ 0,00</td>
      `;
      tbody.appendChild(tr);
    });
  }

  tbody.oninput = (e) => {
    if (e.target.matches('input.qtd-sim')) calcularTotaisPlanilha();
  };
  calcularTotaisPlanilha();
}

function calcularTotaisPlanilha() {
  const linhas = document.querySelectorAll('#tabelaPlanilha tbody tr');
  let soma = 0;
  linhas.forEach(tr => {
    const qtd = toNum(tr.querySelector('input.qtd-sim')?.value || 0);
    const unit = toNum(tr.querySelector('[data-unit]')?.getAttribute('data-unit') || 0);
    const total = qtd * unit;
    tr.querySelector('.total-item').textContent = fmtBRL.format(total);
    soma += total;
  });
  document.getElementById('totalGeralPlanilha').textContent = fmtBRL.format(soma);
}

// ====== Exportar / Importar ======
function exportarJSON() {
  const dataStr = JSON.stringify(itens, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'custosFixosBuffet.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function importarJSON(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const arr = JSON.parse(reader.result);
      if (!Array.isArray(arr)) throw new Error('JSON inválido.');
      // mescla por nome (se existir, substitui; se não, adiciona)
      arr.forEach((raw, idx) => {
        const it = normalizarImportado(raw, idx);
        const pos = itens.findIndex(i => i.nome.toLowerCase() === String(it.nome).toLowerCase());
        if (pos === -1) itens.push(it); else itens[pos] = it;
      });
      salvar();
      renderTabela();
      renderPlanilha();
      alert('Importação concluída.');
    } catch (err) {
      alert('Falha ao importar JSON: ' + err.message);
    } finally {
      e.target.value = ''; // reset input
    }
  };
  reader.readAsText(file);
}

function normalizarImportado(it, idx=0) {
  return {
    id: it.id ?? ('cx_' + Date.now() + '_' + idx),
    nome: it.nome ?? 'Item',
    categoria: it.categoria ?? 'outros',
    unidade: it.unidade ?? 'item',
    regra: it.regra ?? 'fixo_evento',
    parametros: it.parametros ?? { qtdFixa: 1 },
    valorUnitario: Number(it.valorUnitario ?? it.valor ?? 0) || 0,
    fornecedor: it.fornecedor ?? '',
    responsavel: it.responsavel ?? '',
    obs: it.obs ?? '',
    ativo: typeof it.ativo === 'boolean' ? it.ativo : true
  };
}

// === Salvar total da planilha para o evento atual (usando ?id=) ===
(function(){
  const btn = document.getElementById('btnSalvarParaEvento');
  if (!btn) return;

  function toNumBR(v){
    if (typeof v === 'number') return v;
    // remove "R$", espaços e qualquer letra/símbolo que não seja dígito, ponto, vírgula ou sinal
    const cleaned = String(v ?? '')
      .replace(/[^\d,.\-]/g, '')   // tira "R$", espaços etc.
      .replace(/\s+/g, '')
      .trim();
    const n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function getTotalPlanilhaNumber(){
    const el = document.getElementById('totalGeralPlanilha'); // deve existir no HTML
    if (!el) return 0;
    const raw = el.textContent || el.innerText || '0'; // ex.: "R$ 1.234,56"
    return toNumBR(raw);
  }

  btn.addEventListener('click', ()=>{
    const params = new URLSearchParams(location.search);
    let eventoId = params.get('id') || localStorage.getItem('eventoSelecionado') || '';
    if (!eventoId){ alert('Evento não informado (sem id). Abra este cadastro a partir do evento.'); return; }
    localStorage.setItem('eventoSelecionado', String(eventoId));

    const total = Number(getTotalPlanilhaNumber().toFixed(2));

    try{
      // 1) salva na chave específica do evento
      localStorage.setItem(
        'custosFixosEvento_'+eventoId,
        JSON.stringify({ total, savedAt: new Date().toISOString() })
      );

      // 2) espelha no array "eventos" para fallback do Financeiro
      const eventos = JSON.parse(localStorage.getItem('eventos') || '[]');
      const i = eventos.findIndex(e => String(e.id) === String(eventoId));
      if (i > -1) {
        eventos[i].financeiro = eventos[i].financeiro || {};
        eventos[i].financeiro.custosFixos = total;
        localStorage.setItem('eventos', JSON.stringify(eventos));
      }

      alert('Custos fixos salvos para o evento!');
      // opcional: já voltar para o financeiro do mesmo evento
      // window.location.href = `financeiro-evento.html?id=${encodeURIComponent(eventoId)}#custos-fixos`;
    }catch(e){
      console.error(e);
      alert('Não foi possível salvar os custos para o evento.');
    }
  });
})();
