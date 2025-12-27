// ===== FEIRAS – Lado cliente (LocalStorage-first) =====
(() => {
  // ---------- Helpers ----------
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const read = (k, fb=null) => { try{ return JSON.parse(localStorage.getItem(k)) ?? fb; }catch{ return fb; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const uid = (p='id_') => (crypto.randomUUID?.() || (p + Math.random().toString(36).slice(2,10)));
  const soDig = (s='') => String(s).replace(/\D+/g,'');
  const norm  = (s) => String(s||'').trim().toLowerCase();
function getUsuarioLogado(){
  try{
    return JSON.parse(localStorage.getItem('usuarioLogado') || sessionStorage.getItem('usuarioLogado') || '{}');
  }catch{ return {}; }
}
function getPerfil(){
  const u = getUsuarioLogado();
  return (u?.perfil || u?.role || u?.tipo || '').toLowerCase(); // ex.: 'admin', 'vendas', 'marketing'
}
function canVerLeads(){
  const p = getPerfil();
  return p === 'admin' || p === 'vendas' || p === 'gestor';
}

  function dPlus(days=1){
    const d=new Date(); d.setDate(d.getDate()+days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function formatBR(dateStr){
    if(!dateStr) return '–';
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return `${m[3]}/${m[2]}/${m[1]}`;
    return dateStr;
  }

  // ---------- Usuário / Perfil ----------
  function getUsuarioAtual(){
    try{
      return JSON.parse(localStorage.getItem("usuarioLogado") || sessionStorage.getItem("usuarioLogado") || "{}") || {};
    }catch{ return {}; }
  }
  function isAdmin(u){
    const p = String(u?.perfil||'').toLowerCase().trim();
    return ['administrador','administradora','admin','adm'].includes(p);
  }
  function vendedorId(u){
    return String(u?.nome || u?.email || '').trim().toLowerCase();
  }

  // ---------- Keys ----------
  const KEY_FEIRAS     = 'feiras';
  const KEY_FEIRA_LEAD = 'feiraLeads';
  const KEY_LEADS      = 'leads';
  const KEY_EVENTOS    = 'eventos';

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    window.lucide?.createIcons?.();
    bindTopbar();
    bindFormCaptura();
    bindDialogs();
    popularFeiras();
    popularVendedoresFiltro();
    renderTabela();
   renderFeiraAnalytics(); // NOVO
   renderFeiraRetorno(); 

    window.lucide?.createIcons?.();
  });

  // ---------- Topbar / Feiras ----------
  function bindTopbar(){
    $('#btnNovaFeira')?.addEventListener('click', () => {
      $('#dlgFeira')?.showModal();
      $('#f_nome')?.focus();
    });
    $('#selFeira')?.addEventListener('change', () => {
      write('feiraSelecionada', $('#selFeira').value || '');
      renderInfoFeira();
      renderTabela();
    });

    $('#busca')?.addEventListener('input', renderTabela);
    $('#filtroEnvio')?.addEventListener('change', renderTabela);
    $('#filtroVendedor')?.addEventListener('change', renderTabela);
  }

  function popularFeiras(){
    const arr = read(KEY_FEIRAS, []);
    const sel = $('#selFeira');
    if(!sel) return;

    sel.innerHTML = `<option value="">— selecione uma feira —</option>` + arr
      .sort((a,b)=>String(a.nome).localeCompare(String(b.nome)))
      .map(f => `<option value="${f.id}">${escapeHtml(f.nome)}${f.dataFeira?` — ${formatBR(f.dataFeira)}`:''}</option>`)
      .join('');

    const last = localStorage.getItem('feiraSelecionada') || '';
    if(last && arr.some(f=>String(f.id)===String(last))) sel.value = last;

    renderInfoFeira();
  }

function renderInfoFeira(){
  const feira = getFeiraSelecionada();
  const el = $('#infoFeira'); if(!el) return;
  el.textContent = feira ? `${feira.nome} ${feira.dataFeira?`• ${formatBR(feira.dataFeira)}`:''}` : 'Nenhuma feira selecionada.';

  // >>> NOVO: log de analytics por feira (não mexe na UI)
  if (feira){
    const a = getAnalyticsFeira(feira.id);
    console.log('[Analytics feira]', feira.nome, a);
  }
}


  function getFeiraSelecionada(){
    const id = $('#selFeira')?.value || '';
    if(!id) return null;
    const all = read(KEY_FEIRAS, []);
    return all.find(f => String(f.id)===String(id)) || null;
  }

  // ---------- Dialogs ----------
  function bindDialogs(){
    // Nova Feira
    $('#btnSalvarFeira')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const nome = String($('#f_nome').value || '').trim();
      const data = $('#f_data').value || '';
      if(!nome){ $('#f_nome')?.focus(); return; }
      const u = getUsuarioAtual();
      const feira = { id: uid('fx_'), nome, dataFeira: data || '', criadoEm: new Date().toISOString(), criadoPor: vendedorId(u) };
      const arr = read(KEY_FEIRAS, []);
      arr.push(feira); write(KEY_FEIRAS, arr);
      $('#dlgFeira')?.close();
      popularFeiras();
      const sel = $('#selFeira');
      if(sel){ sel.value = feira.id; write('feiraSelecionada', feira.id); }
      renderInfoFeira(); renderTabela();
    });

    // Modal de Data — fecha no X ou clicando fora
    $('#btnFecharData')?.addEventListener('click', ()=> $('#dlgData')?.close());
    const dlg = $('#dlgData');
    if(dlg){
      dlg.addEventListener('click', (e)=>{ if(e.target === dlg) dlg.close(); });
    }
  }

  // ---------- Captação Rápida ----------
  function bindFormCaptura(){
    // Auto-vendedor
    const u = getUsuarioAtual();
    const baseNome  = String(u?.nome || u?.email || 'Usuário').trim();
    const perfil    = String(u?.perfil || '').trim();
    const vendedorDisplayAuto = perfil ? `${baseNome} (${perfil})` : baseNome;
    const vendedorKeyAuto     = String(u?.nome || u?.email || 'usuario').trim().toLowerCase();

    const vendInput = $('#c_vendedor');
    if (vendInput){ vendInput.value = vendedorDisplayAuto; vendInput.readOnly = true; }

    // Ao escolher a data -> abre MODAL centralizado
    $('#c_data')?.addEventListener('change', () => {
      const dt = $('#c_data')?.value || '';
      if(!dt) return;
      abrirModalData(dt); // mostra sempre (mesmo vazio), para conferência
    });

    // Submit
    $('#formCaptura')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const feira = getFeiraSelecionada();
      if(!feira){ alert('Selecione uma feira no topo antes de captar.'); return; }

      const nome     = String($('#c_nome')?.value || '').trim();
      const tel      = soDig($('#c_tel')?.value || '');
      const data     = $('#c_data')?.value || '';
      const tipo     = String($('#c_tipo')?.value || '').trim();
      const qtd      = Number($('#c_qtd')?.value || 0) || 0;
      const local_   = String($('#c_local')?.value || '').trim();
      const cardapio = String($('#c_cardapio')?.value || '').trim();
      const obs      = String($('#c_obs')?.value || '').trim();

      if(!nome){
        if(!confirm('Salvar apenas com o nome? Você poderá complementar depois.')) return;
      }

      const vendCampo       = String($('#c_vendedor')?.value || '').trim();
      const vendedorDisplay = vendCampo || vendedorDisplayAuto;
      const vendedorKey     = (vendCampo ? vendCampo.split('(')[0] : baseNome).trim().toLowerCase() || vendedorKeyAuto;

      // 1) FEIRA_LEAD
      const arr = read(KEY_FEIRA_LEAD, []);
      const idLeadFeira = uid('fl_');
      arr.push({
        id: idLeadFeira,
        feiraId: feira.id,
        feiraNome: feira.nome,
        nome,
        telefone: tel,
        dataEvento: data,
        tipoEvento: tipo,
        convidados: qtd,
        local: local_,
        tipoCardapio: cardapio,
        observacoes: obs,
        vendedor: vendedorDisplay,
        vendedorKey,
        cardapioEnviado: 'NÃO',
        leadIdNoFunil: '',
        criadoEm: new Date().toISOString()
      });
      write(KEY_FEIRA_LEAD, arr);

      // 2) FUNIL
      const leadId = upsertLeadFunil({
        nome, telefone: tel, dataEvento: data, tipoEvento: tipo, qtd,
        local: local_, tipoCardapio: cardapio,
        observacoes: obs, responsavel: vendedorDisplay,
        origemTipo: 'feira', feiraId: feira.id, feiraNome: feira.nome
      });

      // 3) Referência ao funil
      const arr2 = read(KEY_FEIRA_LEAD, []);
      const idx = arr2.findIndex(x => x.id === idLeadFeira);
      if(idx > -1){ arr2[idx].leadIdNoFunil = leadId; write(KEY_FEIRA_LEAD, arr2); }

      localStorage.setItem('funil_focus_lead', leadId);
localStorage.setItem('funil_reset_filters', '1');
      // limpar UI
      $('#formCaptura')?.reset();
      if (vendInput) vendInput.value = vendedorDisplayAuto;

      // resetar filtros para NÃO esconder o novo lead
      const b = $('#busca');           if (b) b.value = '';
      const fe = $('#filtroEnvio');    if (fe) fe.value = 'todos';
      const fv = $('#filtroVendedor'); if (fv) fv.value = 'todos';

      renderTabela();
      document.querySelector('.fr-card .tabela')?.scrollIntoView({behavior:'smooth', block:'start'});
      toast('Lead salvo e enviado ao Funil.');
    });
  }

  // ---------- Funil (upsert) ----------
  function upsertLeadFunil(payload){
  const leads = read(KEY_LEADS, []);
  const tel = soDig(payload.telefone || '');
  const agora = new Date().toISOString();

  // tenta achar por telefone (whatsapp/telefone), senão por nome normalizado
  let foundIdx = -1;
  if (tel) {
    foundIdx = leads.findIndex(l => soDig(l.whatsapp || l.telefone || '') === tel);
  } else if (payload.nome) {
    foundIdx = leads.findIndex(l => norm(l.nome) === norm(payload.nome));
  }

  // helperzinho para número seguro (mantém compat com seu padrão)
  const toNum = (v) => (typeof v === 'number') ? v :
    (parseFloat(String(v ?? '').replace(/\./g,'').replace(',','.')) || 0);

  if (foundIdx > -1) {
    const prev = leads[foundIdx] || {};

    leads[foundIdx] = {
      ...prev,

      // --------- dados base (mantém o que já tinha) ----------
      nome:        payload.nome       || prev.nome,
      telefone:    tel                || prev.telefone,
      whatsapp:    tel                || prev.whatsapp,
      dataEvento:  payload.dataEvento || prev.dataEvento,
      tipoEvento:  payload.tipoEvento || prev.tipoEvento,
      qtd:         (payload.qtd != null ? toNum(payload.qtd) : prev.qtd),
      local:       payload.local      || prev.local,
      observacoes: mergeObs(prev.observacoes, payload.observacoes, payload.feiraNome),

      responsavel:       payload.responsavel || prev.responsavel,
      responsavel_nome:  payload.responsavel || prev.responsavel_nome,

      origemTipo: 'feira',
      feiraId:    payload.feiraId,
      feiraNome:  payload.feiraNome,

      status:          prev.status || 'Novo Lead',
      proximoContato:  prev.proximoContato || dPlus(1),
      dataCriacao:     prev.dataCriacao || agora,
      dataAtualizacao: agora,

      // --------- coleções já existentes (garante arrays) ----------
      cardapios_enviados: Array.isArray(prev.cardapios_enviados) ? prev.cardapios_enviados : [],
      orcamentos_enviados: Array.isArray(prev.orcamentos_enviados) ? prev.orcamentos_enviados : [],

      // --------- NOVO: campos para analytics/fechamento ----------
      // (opcionais — se não vierem no payload, mantém o que havia)
      valorFechado:   (payload.valorFechado != null ? toNum(payload.valorFechado) : (prev.valorFechado ?? null)),
      dataFechamento: (payload.dataFechamento != null ? payload.dataFechamento : (prev.dataFechamento ?? '')),
    };

    write(KEY_LEADS, leads);
    return String(leads[foundIdx].id || foundIdx);
  }

  // novo lead
  const novoId = uid('ld_');
  leads.push({
    id: novoId,
    token: Math.random().toString(36).slice(2,10),

    nome:        payload.nome || '',
    telefone:    tel || '',
    whatsapp:    tel || '',
    email:       '',

    dataEvento:  payload.dataEvento || '',
    horarioEvento: '',

    tipoEvento:  payload.tipoEvento || '',
    local:       payload.local || '',
    qtd:         toNum(payload.qtd),

    observacoes: payload.observacoes || '',

    status: 'Novo Lead',
    responsavel: payload.responsavel || '',
    responsavel_nome: payload.responsavel || '',

    proximoContato: dPlus(1),
    dataCriacao:    agora,
    dataAtualizacao: agora,

    origemTipo: 'feira',
    feiraId:    payload.feiraId,
    feiraNome:  payload.feiraNome,

    // coleções padrão
    cardapios_enviados: [],
    orcamentos_enviados: [],
    adicionaisSelecionados: [],
    servicosSelecionados: [],
    historico: [],

    // --------- NOVO: campos para analytics/fechamento ----------
    valorFechado:   (payload.valorFechado != null ? toNum(payload.valorFechado) : null),
    dataFechamento: (payload.dataFechamento || ''),
  });

  write(KEY_LEADS, leads);
  return novoId;
}

  function mergeObs(prev='', add='', feiraNome=''){
    const p = String(prev||'').trim();
    const a = String(add||'').trim();
    const tag = feiraNome ? ` [captado na feira: ${feiraNome}]` : '';
    if(!p) return a + tag;
    if(!a) return p + tag;
    if(p.includes(a)) return p + tag;
    return `${p} • ${a}${tag}`;
  }

  // ---------- Tabela ----------
  function getAllFeiraLeads(){ return read(KEY_FEIRA_LEAD, []); }
// === Analytics por feira (captados, enviados, fechados, conversão e ticket) ===
function getAnalyticsFeira(feiraId){
  const leads = (read('leads', []) || []).filter(l => String(l.feiraId) === String(feiraId));

  const captados = leads.length;

  // “enviado” seguindo a mesma regra da tabela
  const enviados = leads.filter(l => {
    const temArray = Array.isArray(l.cardapios_enviados) && l.cardapios_enviados.length > 0;
    const temFlag  = String(l.cardapioEnviado || '').toUpperCase() === 'SIM';
    const temOrc   = Array.isArray(l.orcamentos_enviados) && l.orcamentos_enviados.length > 0;
    return temArray || temFlag || temOrc;
  }).length;

  // fechados por status (ajuste os nomes se seu funil usar rótulos diferentes)
  const nomesFechado = ['Fechado','Ganho','Contrato assinado'];
  const isFechado = l => nomesFechado.includes(String(l.status||'').trim());
  const fechados = leads.filter(isFechado).length;

  const percEnviados   = captados ? Math.round((enviados/captados)*100) : 0;
  const percConversao  = captados ? Math.round((fechados/captados)*100) : 0;

  // ticket médio a partir de valorFechado (ou outros campos se existirem)
  const toNum = v => (typeof v === 'number') ? v :
    (parseFloat(String(v ?? '').replace(/\./g,'').replace(',','.')) || 0);

  const somaFechados = leads.filter(isFechado).reduce((acc,l)=>{
    const v = l.valorFechado ?? l.valor_contrato ?? l.ticket ?? 0;
    return acc + toNum(v);
  },0);

  const ticketMedio = fechados ? Math.round(somaFechados/fechados) : 0;

  return { captados, enviados, fechados, percEnviados, percConversao, ticketMedio };
}
// === Série de envios por dia (últimos N dias) ===
// Conta envios a partir de cardapios_enviados/orcamentos_enviados (se não tiver, cai para 0).
function getSerieEnviosPorDia(feiraId, days=14){
  const leads = (read('leads', []) || []).filter(l => String(l.feiraId) === String(feiraId));
  const today = new Date(); today.setHours(0,0,0,0);

  // mapa 'YYYY-MM-DD' -> contagem
  const map = new Map();
  for(let i=days-1;i>=0;i--){
    const d = new Date(today); d.setDate(today.getDate()-i);
    const iso = d.toISOString().slice(0,10);
    map.set(iso, 0);
  }

  const inc = (dateStr) => {
    if(!dateStr) return;
    const iso = String(dateStr).slice(0,10);
    if(map.has(iso)){
      map.set(iso, (map.get(iso) || 0) + 1);
    }
  };

  for(const l of leads){
    const cards = Array.isArray(l.cardapios_enviados) ? l.cardapios_enviados : [];
    const orcs  = Array.isArray(l.orcamentos_enviados) ? l.orcamentos_enviados : [];
    // tenta usar datas declaradas em objetos; se for string simples, ainda cai no slice
    cards.forEach(c => inc(c?.data || c?.dt || c));
    orcs.forEach(o => inc(o?.data || o?.dt || o));
  }

  // retorna arrays alinhados
  return Array.from(map.entries()).map(([iso, qtd]) => ({ iso, qtd }));
}
function renderFeiraAnalytics(){
  const wrap = document.getElementById('feira-analytics');
  if(!wrap) return;

  const feira = getFeiraSelecionada?.();
  if(!feira){ wrap.classList.add('hidden'); return; }

  // calcula
  const a = getAnalyticsFeira(feira.id); // já existente
  wrap.classList.remove('hidden');

  // números
  const fmtBRL = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
  const el = (id) => document.getElementById(id);
  if(el('faConv'))          el('faConv').textContent = `${a.percConversao || 0}%`;
  if(el('faConvBar'))       el('faConvBar').style.width = `${Math.min(100, a.percConversao||0)}%`;
  if(el('faFechadosMini'))  el('faFechadosMini').textContent = a.fechados || 0;
  if(el('faCaptadosMini'))  el('faCaptadosMini').textContent = a.captados || 0;
  if(el('faTicket'))        el('faTicket').textContent = a.ticketMedio ? fmtBRL.format(a.ticketMedio) : '—';
  if(el('faFechados'))      el('faFechados').textContent = a.fechados || 0;

  // série de envios
  const serie = getSerieEnviosPorDia(feira.id, 14);
  const chartWrap = document.getElementById('faChartWrap');
  if(chartWrap) renderMiniChartEnvios(chartWrap, serie);
}
function renderFeiraRetorno(){
  const wrap = document.getElementById('feira-retorno');
  if(!wrap) return;
  const feira = getFeiraSelecionada?.();
  if(!feira){ wrap.classList.add('hidden'); return; }

  const a = getAnalyticsFeira(feira.id);
  const feiraInfo = getFeiraById(feira.id) || {};
  const custo = brToNum(feiraInfo.custoFeira || 0);

  const receita = (a.ticketMedio * (a.fechados || 0)) || 0; // somaFechados também pode ser guardado; aqui tá ok
  const retorno = receita - custo;
  const roas = custo > 0 ? (receita / custo) : 0; // ROAS (x vezes)
  const conv = a.percConversao || 0;

  const fmtBRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

  set('retFechados', a.fechados || 0);
  set('retConv', `${conv}%`);
  set('retReceita', a.fechados ? fmtBRL.format(receita) : '—');
  set('retCusto', custo ? fmtBRL.format(custo) : '—');
  set('retROI', fmtBRL.format(retorno));
  const roasTxt = custo ? `ROAS: ${roas.toFixed(2)}x` : 'ROAS: –';
  set('retROAS', roasTxt);

  // barra: limite de 200% (se passar, fixa em 100%)
  const fill = document.getElementById('roiFill');
  const lblMax = document.getElementById('lblMax');
  if(fill && lblMax){
    const perc = custo > 0 ? Math.min(100, Math.round((receita/custo)*100)) : 0;
    fill.style.width = `${perc}%`;
    lblMax.textContent = custo ? `${fmtBRL.format(custo)}` : 'Meta';
  }

  // mostra e pré-carrega input de custo
  const inp = document.getElementById('inpCustoFeira');
  if(inp){
    inp.value = custo ? new Intl.NumberFormat('pt-BR').format(custo) : '';
  }

  wrap.classList.remove('hidden');
}

function exportAnalyticsCSV(){
  const feira = getFeiraSelecionada?.();
  if(!feira) return;

  const a = getAnalyticsFeira(feira.id);
  const serie = getSerieEnviosPorDia(feira.id, 14);

  const linhas = [];
  linhas.push(`Feira;${(feira.nome||'')} (${feira.id})`);
  linhas.push(`Captados;${a.captados}`);
  linhas.push(`Enviados;${a.enviados}`);
  linhas.push(`Fechados;${a.fechados}`);
  linhas.push(`% Enviados;${a.percEnviados}%`);
  linhas.push(`% Conversão;${a.percConversao}%`);
  linhas.push(`Ticket médio;${a.ticketMedio}`);
  linhas.push('');
  linhas.push('Dia;Envios');

  serie.forEach(p => linhas.push(`${p.iso};${p.qtd}`));

  const csv = '\uFEFF' + linhas.join('\n'); // BOM p/ Excel/PT-BR
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement('a');
  aEl.href = url;
  aEl.download = `analytics_${(feira.nome||'feira').replace(/\s+/g,'_')}.csv`;
  document.body.appendChild(aEl);
  aEl.click();
  document.body.removeChild(aEl);
  URL.revokeObjectURL(url);
}

// listener do botão
document.addEventListener('click', (ev)=>{
  const t = ev.target.closest('#btnExportAnalytics');
  if(!t) return;
  exportAnalyticsCSV();
});

// === Render do mini-gráfico SVG (barrinhas) ===
function renderMiniChartEnvios(container, serie){
  const W = container.clientWidth || 520;
  const H = container.clientHeight || 140;
  const pad = {t:12, r:12, b:22, l:28};
  const innerW = Math.max(10, W - pad.l - pad.r);
  const innerH = Math.max(10, H - pad.t - pad.b);

  const maxY = Math.max(1, Math.max(...serie.map(s=>s.qtd)));
  const barW = Math.max(4, Math.floor(innerW / Math.max(serie.length,1)) - 4);

  const xFor = (i) => pad.l + i * (innerW / Math.max(serie.length,1));
  const yFor = (v) => pad.t + (innerH * (1 - (v / maxY)));

  // eixos e barras
  let bars = '';
  serie.forEach((p, i)=>{
    const x = Math.round(xFor(i));
    const h = Math.max(0, innerH * (p.qtd / maxY));
    const y = Math.round(pad.t + innerH - h);
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(0,h)}" rx="3" ry="3" fill="#b6916a" opacity="0.9">
               <title>${p.iso}: ${p.qtd}</title>
             </rect>`;
  });

  const axis = `
    <line x1="${pad.l}" y1="${pad.t+innerH}" x2="${pad.l+innerW}" y2="${pad.t+innerH}" stroke="#eadac4"/>
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t+innerH}" stroke="#eadac4"/>
    <text x="${pad.l-6}" y="${pad.t+10}" text-anchor="end" font-size="10" fill="#7b6a57">${maxY}</text>
    <text x="${pad.l-6}" y="${pad.t+innerH}" text-anchor="end" font-size="10" fill="#7b6a57">0</text>
  `;

  const svg = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Envios por dia">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#fff" rx="10" ry="10"></rect>
      ${axis}
      ${bars}
    </svg>
  `;
  container.innerHTML = svg;
}
// === custo por feira: ler/salvar no storage ===
function readFeiras(){ return read('feiras', []) || []; }
function writeFeiras(arr){ write('feiras', arr || []); }

function getFeiraById(feiraId){
  const fs = readFeiras();
  return fs.find(f => String(f.id) === String(feiraId));
}

function setCustoFeira(feiraId, custoNumber){
  const fs = readFeiras();
  const i = fs.findIndex(f => String(f.id) === String(feiraId));
  if(i >= 0){
    fs[i].custoFeira = custoNumber;
  } else {
    fs.push({ id: feiraId, nome: '', custoFeira: custoNumber });
  }
  writeFeiras(fs);
}

// normalizador pt-BR -> number
function brToNum(v){
  if (typeof v === 'number') return v;
  return parseFloat(String(v||'').replace(/\./g,'').replace(',','.')) || 0;
}

  function renderTabela(){
    // Permissão: marketing não vê leads individuais
const tabelaWrap = document.querySelector('.tabela')?.parentElement || document.querySelector('.tabela');
if (!canVerLeads()) {
  // esconde tabela de leads
  if (tabelaWrap) tabelaWrap.classList.add('hidden');
} else {
  if (tabelaWrap) tabelaWrap.classList.remove('hidden');
}

    const el = $('#tbody'); if(!el) return;
    const feira = getFeiraSelecionada();
    const user  = getUsuarioAtual();

    const todos = getAllFeiraLeads();
    let arr = feira ? todos.filter(x => String(x.feiraId) === String(feira.id)) : [];

    // visibilidade por perfil
    const admin = isAdmin(user);
    const vid   = vendedorId(user);
    if(!admin && vid){
      arr = arr.filter(x => {
        if (x.vendedorKey) return norm(x.vendedorKey) === norm(vid);
        return norm(String(x.vendedor||'')).startsWith(norm(vid));
      });
      $('#wrapFiltroVendedor')?.classList.add('hidden');
    } else {
      $('#wrapFiltroVendedor')?.classList.remove('hidden');
    }

    // espelha “Cardápio Enviado”
    const leads = read(KEY_LEADS, []);
    arr = arr.map(x => {
      const lead = leads.find(l => String(l.id)===String(x.leadIdNoFunil))
             || leads.find(l => soDig(l.whatsapp||l.telefone||'') === soDig(x.telefone));
      const enviado = lead && Array.isArray(lead.cardapios_enviados) && lead.cardapios_enviados.length>0;
      return { ...x, cardapioEnviado: enviado ? 'SIM' : 'NÃO' };
    });

    // filtros
    const q = norm($('#busca')?.value || '');
    if(q){
      arr = arr.filter(x =>
        norm(x.nome).includes(q) ||
        soDig(x.telefone).includes(soDig(q)) ||
        norm(x.tipoEvento).includes(q) ||
        norm(x.local).includes(q) ||
        norm(x.tipoCardapio).includes(q) ||
        norm(x.observacoes).includes(q)
      );
    }
    const fEnv = ($('#filtroEnvio')?.value || 'todos').toUpperCase();
    if(fEnv !== 'TODOS'){ arr = arr.filter(x => (x.cardapioEnviado || 'NÃO').toUpperCase() === fEnv); }

    const fv = ($('#filtroVendedor')?.value || 'todos');
    if (admin && fv !== 'todos') {
      const alvo = norm(fv);
      arr = arr.filter(x => norm(x.vendedorKey || x.vendedor || '') === alvo);
    }

    // render
    el.innerHTML = '';
    arr.forEach(x => {
      const row = document.createElement('div');
      row.className = 'row';
    row.innerHTML = `
  <div class="cell" data-label="Nome"        title="${escapeHtml(x.nome||'')}">${escapeHtml(x.nome||'—')}</div>
  <div class="cell" data-label="Telefone"    title="${formatPhone(x.telefone)}">${formatPhone(x.telefone)}</div>
  <div class="cell" data-label="Data"        title="${formatBR(x.dataEvento)}">${formatBR(x.dataEvento)}</div>
  <div class="cell" data-label="Tipo"        title="${escapeHtml(x.tipoEvento||'')}">${escapeHtml(x.tipoEvento||'—')}</div>
  <div class="cell" data-label="Convid."     title="${x.convidados||''}">${x.convidados||'—'}</div>
  <div class="cell" data-label="Local"       title="${escapeHtml(x.local||'')}">${escapeHtml(x.local||'—')}</div>
  <div class="cell" data-label="Cardápio"    title="${escapeHtml(x.tipoCardapio||'')}">${escapeHtml(x.tipoCardapio||'—')}</div>
  <div class="cell" data-label="Observações" title="${escapeHtml(x.observacoes||'')}">${escapeHtml(short(x.observacoes||'—', 90))}</div>
  <div class="cell" data-label="Vendedor"    title="${escapeHtml(x.vendedor||'')}">${escapeHtml(x.vendedor||'—')}</div>
  <div class="cell" data-label="Enviado"><span class="badge ${x.cardapioEnviado==='SIM'?'sim':'nao'}">${x.cardapioEnviado}</span></div>
  <div class="cell c" data-label="Ações">
    <button class="btn sec btn-sm" data-acao="orc" data-id="${x.leadIdNoFunil||''}" title="Abrir Orçamento">
      <i data-lucide="file-text"></i>
    </button>
  </div>`;

      el.appendChild(row);
    });
    window.lucide?.createIcons?.();

    // ação única: orçamento detalhado
    el.querySelectorAll('button[data-acao="orc"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.id;
        if(id) location.href = `orcamento-detalhado.html?id=${encodeURIComponent(id)}`;
        else   location.href = `orcamento.html`;
      });
    });

    // indicadores
    const total = arr.length;
    const enviados = arr.filter(x=>x.cardapioEnviado==='SIM').length;
    const pend = total - enviados;
    $('#indCaptados') && ($('#indCaptados').textContent = total);
    $('#indEnviados') && ($('#indEnviados').textContent = enviados);
    $('#indPendentes') && ($('#indPendentes').textContent = pend);
    $('#indPerc') && ($('#indPerc').textContent = total? `${Math.round((enviados/total)*100)}%` : '–');
  }
// === NOVO: preencher Fechados, % Conversão e Ticket médio por FEIRA ===
const feiraSel = getFeiraSelecionada();
if (feiraSel){
  const a = getAnalyticsFeira(feiraSel.id);

  // já tínhamos captados/enviados/pendentes/perc; mantemos
  $('#indFechados') && ($('#indFechados').textContent = a.fechados);
  $('#indConv')     && ($('#indConv').textContent     = `${a.percConversao || 0}%`);

  // formata BRL (sem depender de lib externa)
  const fmtBRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  $('#indTicket')   && ($('#indTicket').textContent   = a.ticketMedio ? fmtBRL.format(a.ticketMedio) : '—');
} else {
  // sem feira selecionada, mostra traço
  ['indFechados','indConv','indTicket'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
}

// === SUBSTITUA a função popularVendedoresFiltro atual por esta versão ===
function popularVendedoresFiltro(){
  const user = getUsuarioAtual();
  // só admins enxergam esse filtro (mantém sua regra atual)
  if(!isAdmin(user)){
    $('#wrapFiltroVendedor')?.classList.add('hidden');
    return;
  }
  $('#wrapFiltroVendedor')?.classList.remove('hidden');

  // 1) tenta ler da área de Usuários do sistema
  const usuarios = getUsuariosCadastrados(); // <- helper logo abaixo
  let options = [];

  if (usuarios.length){
    // monta opções a partir de "usuarios"
    options = usuarios
      .filter(u => isVendOuAdmin(u.perfil)) // <- helper logo abaixo
      .map(u => {
        const nome   = String(u?.nome || u?.email || 'Usuário').trim();
        const perfil = String(u?.perfil || '').trim();
        const label  = perfil ? `${nome} (${perfil})` : nome;      // texto visível
        const value  = String(u?.nome || u?.email || 'usuario')     // chave técnica
                         .trim().toLowerCase();
        return { value, label };
      });
  } else {
    // 2) Fallback: se não houver usuários salvos, usa responsáveis do FUNIL (lógica antiga)
    const leads = read('leads', []);
    const nomes = Array.from(
      new Set(leads.map(l => (l.responsavel || l.responsavel_nome || '').toString().trim()))
    ).values();
    options = Array.from(nomes)
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b))
      .map(label => ({ value: label.toLowerCase(), label }));
  }

  // remove duplicados por "value"
  const uniq = new Map();
  options.forEach(o => { if(o.value) uniq.set(o.value, o); });
  const finalOptions = Array.from(uniq.values())
    .sort((a,b)=>a.label.localeCompare(b.label));

  const sel = $('#filtroVendedor');
  if(!sel) return;
  sel.innerHTML =
    `<option value="todos">Todos</option>` +
    finalOptions.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
}

// === COLE ESTES DOIS HELPERS ABAIXO DA FUNÇÃO ACIMA ===

// Lê usuários de chaves comuns do localStorage e deduplica por nome/email minúsculo
function getUsuariosCadastrados(){
  const keysPossiveis = [
    'usuarios', 'usuariosSistema', 'usuariosPerfis', 'cadastroUsuarios'
  ];
  const todos = [];
  for (const k of keysPossiveis){
    const arr = read(k, []);
    if (Array.isArray(arr)) todos.push(...arr);
  }
  // inclui o usuário logado (garante que ele apareça)
  const u = getUsuarioAtual();
  if (u && (u.nome || u.email)) todos.push(u);

  // dedupe por chave técnica (nome/email minúsculo)
  const byKey = new Map();
  todos.forEach(u => {
    const key = String(u?.nome || u?.email || '').trim().toLowerCase();
    if(!key) return;
    if(!byKey.has(key)) byKey.set(key, {
      nome: String(u?.nome || u?.email || 'Usuário').trim(),
      email: String(u?.email || '').trim(),
      perfil: String(u?.perfil || '').trim()
    });
  });
  return Array.from(byKey.values());
}

// Testa se perfil é “vendedor(a)” ou “admin”
function isVendOuAdmin(perfil){
  const p = String(perfil||'').trim().toLowerCase();
  const admins = ['admin','adm','administrador','administradora'];
  const vends  = ['vendedor','vendedora','vendas','comercial','sd r','sdr'];
  return admins.includes(p) || vends.includes(p);
}

  // ---------- Data summary ----------
 function montarResumoData(isoDate){
  const eventos = (read(KEY_EVENTOS, []) || []).filter(e =>
    String(e?.data || e?.dataEvento || '') === isoDate
  );

  const leads = (read(KEY_LEADS, []) || []);

  // Considera orçamentos enviados quando:
  // - cardapios_enviados é array com 1+ itens
  // - OU cardapioEnviado === 'SIM' (string usada em algumas telas)
  // - OU orcamentos_enviados é array (caso exista em outro fluxo)
  const orcs = leads.filter(l => {
    const mesmaData = String(l?.dataEvento || '') === isoDate;
    const temArray = Array.isArray(l.cardapios_enviados) && l.cardapios_enviados.length > 0;
    const temFlag  = String(l.cardapioEnviado || '').toUpperCase() === 'SIM';
    const temOrc   = Array.isArray(l.orcamentos_enviados) && l.orcamentos_enviados.length > 0;
    return mesmaData && (temArray || temFlag || temOrc);
  });

  return { totalEventos: eventos.length, totalOrcs: orcs.length, eventos, orcs };
}

 // Tenta extrair o NOME COMPLETO do evento a partir de várias chaves.
// Se não achar, monta algo com tipo + cliente / contratante.
function getNomeEventoCompleto(e){
  const candidatos = [
    'nomeArquivo','tituloArquivo','arquivo','fileName','nome_do_arquivo',
    'titulo','nome','nomeEvento','tituloEvento','evento',
    'descricao','assunto','nome_planilha'
  ];
  for (const k of candidatos){
    const v = e && e[k];
    if (v && String(v).trim()) return String(v).trim();
  }

  // Monta um nome “inteligente” caso os campos acima não existam
  const partes = [
    e?.tipoEvento || e?.tipo || 'Evento',
    e?.cliente || e?.contratante || e?.noiva || e?.noivo || e?.aniversariante || e?.empresa || e?.responsavel
  ].filter(Boolean);

  const nomeComposto = partes.join(' — ').trim();
  return nomeComposto || 'Evento';
}

// Modal central com tabela (usa #dataGridBody do HTML)
function abrirModalData(isoDate){
  const { eventos, orcs } = montarResumoData(isoDate);

  // escolhe o melhor nome (prioriza campos de “nome do evento/arquivo”)
  const pick = (obj, keys, fallback='—') => {
    for (const k of keys) {
      const v = (obj?.[k] ?? '').toString().trim();
      if (v) return v;
    }
    return fallback;
  };

  // resumo do topo
  const resumo = $('#dataResumo');
  if(resumo){
    resumo.innerHTML = `${formatBR(isoDate)} — <strong>${eventos.length}</strong> evento(s), <strong>${orcs.length}</strong> orçamento(s) enviados`;
  }

  const body = $('#dataGridBody');
  if(!body){
    $('#dlgData')?.showModal();
    return;
  }

  const linhas = [];

  // eventos já agendados
// eventos já agendados
eventos.forEach(e => {
  linhas.push({
    origem: 'Evento',
    nome:  getNomeEventoCompleto(e),   // <-- AQUI!
    qtd:   e?.qtd ?? e?.convidados ?? e?.qtdConvidados ?? '—',
    local: e?.local ?? e?.endereco ?? '—',
    link:  '' // sem link específico de evento
  });
});


  // orçamentos enviados
  orcs.forEach(o => {
    linhas.push({
      origem: 'Orçamento',
      nome:  pick(o, ['nome','cliente','contato'], 'Lead'),
      qtd:   o?.qtd ?? o?.convidados ?? '—',
      local: o?.local ?? '—',
      link:  o?.id ? `orcamento-detalhado.html?id=${encodeURIComponent(o.id)}` : ''
    });
  });

  // preenche a tabela
  if(!linhas.length){
    body.innerHTML = `
      <div style="grid-column: 1 / -1; padding:10px; text-align:center; color:#7b6a57;">
        Nada encontrado para ${escapeHtml(formatBR(isoDate))}.
      </div>`;
  } else {
    body.innerHTML = linhas.map(l => `
      <div class="data-grid__row">
        <div class="chip">${escapeHtml(l.origem)}</div>
        <div class="item-titulo" title="${escapeHtml(l.nome)}">${escapeHtml(l.nome)}</div>
        <div class="chip">${escapeHtml(String(l.qtd))}</div>
        <div class="chip" title="${escapeHtml(String(l.local))}">${escapeHtml(String(l.local))}</div>
        <div class="item-acao">${l.link ? `<a href="${l.link}" target="_blank">abrir</a>` : ''}</div>
      </div>
    `).join('');
  }

  // abre modal
  $('#dlgData')?.showModal();
}


  // ---------- Utils ----------
  function short(s,max){ s=String(s||''); return s.length>max? (s.slice(0,max-1)+'…') : s; }
  function formatPhone(s){
    const d=soDig(s||''); if(!d) return '—';
    if(d.length===11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if(d.length===10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return d;
  }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }
  function toast(msg){
    const t=document.createElement('div'); t.className='toast fr'; t.textContent=msg;
    Object.assign(t.style,{position:'fixed',right:'20px',top:'20px',background:'#c29a5d',color:'#fff',padding:'10px 14px',borderRadius:'10px',boxShadow:'0 6px 18px rgba(0,0,0,.18)',zIndex:9999,fontWeight:800});
    document.body.appendChild(t); setTimeout(()=>t.remove(),2200);
  }

})();
function getAnalyticsFeira(feiraId){
  const leads = (JSON.parse(localStorage.getItem('leads')||'[]')||[])
    .filter(l => String(l.feiraId) === String(feiraId));

  const captados = leads.length;

  // “Enviado” = já enviado cardápio/orçamento (a mesma regra que você usa na tabela)
  const enviados = leads.filter(l => {
    const temArray = Array.isArray(l.cardapios_enviados) && l.cardapios_enviados.length>0;
    const temFlag  = String(l.cardapioEnviado||'').toUpperCase()==='SIM';
    const temOrc   = Array.isArray(l.orcamentos_enviados) && l.orcamentos_enviados.length>0;
    return temArray || temFlag || temOrc;
  }).length;

  // “Fechados” – considere status do seu funil; ajuste os nomes conforme usar
  const nomesFechado = ['Fechado', 'Ganho', 'Contrato assinado'];
  const fechados = leads.filter(l => nomesFechado.includes(String(l.status||'').trim())).length;

  const taxaEnvio = captados ? Math.round((enviados/captados)*100) : 0;
  const taxaConversao = captados ? Math.round((fechados/captados)*100) : 0;

  // Ticket médio (usa l.valorFechado, valor_contrato, etc. Se não tiver, ignora)
  const pegarValor = l => Number(
    l.valorFechado ?? l.valor_contrato ?? l.ticket ?? 0
  ) || 0;

  const somaFechados = leads
    .filter(l => nomesFechado.includes(String(l.status||'').trim()))
    .reduce((acc,l)=> acc + pegarValor(l), 0);

  const ticketMedio = fechados ? Math.round(somaFechados/fechados) : 0;

  return { captados, enviados, fechados, taxaEnvio, taxaConversao, somaFechados, ticketMedio };
}
document.addEventListener('click', (ev)=>{
  const btn = ev.target.closest('#btnSalvarCustoFeira');
  if(!btn) return;
  const feira = getFeiraSelecionada?.();
  if(!feira) return;

  const inp = document.getElementById('inpCustoFeira');
  const valor = brToNum(inp?.value);
  setCustoFeira(feira.id, valor);
   renderFeiraAnalytics();  // re-render geral
  renderFeiraRetorno(); 
});
function getLeadsDaFeiraAtual(){
  const feira = getFeiraSelecionada?.();
  const leads = read('leads', []) || [];
  if(!feira) return [];
  return leads.filter(l => String(l.feiraId) === String(feira.id));
}

function exportFeiraCSV(){
  const feira = getFeiraSelecionada?.();
  const leads = getLeadsDaFeiraAtual();
  if(!feira) return;

  const head = ['ID','Nome','Telefone','Data','Tipo','Qtd','Local','Cardápio enviado','Responsável','Status','Valor Fechado','Data Fechamento','Observações'];
  const rows = leads.map(l => [
    l.id || '',
    (l.nome||'').replace(/;/g, ','),
    l.telefone || l.whatsapp || '',
    l.dataEvento || '',
    l.tipoEvento || '',
    l.qtd || 0,
    (l.local||'').replace(/;/g, ','),
    String(l.cardapioEnviado||'NÃO').toUpperCase(),
    l.responsavel || l.responsavel_nome || '',
    l.status || '',
    l.valorFechado || '',
    l.dataFechamento || '',
    (l.observacoes||'').replace(/[\r\n]+/g,' ').replace(/;/g, ',')
  ]);

  const linhas = [head.join(';'), ...rows.map(r => r.join(';'))];
  const csv = '\uFEFF' + linhas.join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_${(feira.nome||'feira').replace(/\s+/g,'_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// “Excel”: gera um .xls simples (Excel abre de boa)
function exportFeiraXLS(){
  const feira = getFeiraSelecionada?.();
  const leads = getLeadsDaFeiraAtual();
  if(!feira) return;

  const escapeHTML = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const th = ['ID','Nome','Telefone','Data','Tipo','Qtd','Local','Cardápio enviado','Responsável','Status','Valor Fechado','Data Fechamento','Observações']
    .map(h => `<th>${h}</th>`).join('');

  const trs = leads.map(l => `
    <tr>
      <td>${escapeHTML(l.id||'')}</td>
      <td>${escapeHTML(l.nome||'')}</td>
      <td>${escapeHTML(l.telefone||l.whatsapp||'')}</td>
      <td>${escapeHTML(l.dataEvento||'')}</td>
      <td>${escapeHTML(l.tipoEvento||'')}</td>
      <td>${escapeHTML(l.qtd||0)}</td>
      <td>${escapeHTML(l.local||'')}</td>
      <td>${escapeHTML(String(l.cardapioEnviado||'NÃO').toUpperCase())}</td>
      <td>${escapeHTML(l.responsavel||l.responsavel_nome||'')}</td>
      <td>${escapeHTML(l.status||'')}</td>
      <td>${escapeHTML(l.valorFechado||'')}</td>
      <td>${escapeHTML(l.dataFechamento||'')}</td>
      <td>${escapeHTML(l.observacoes||'').replace(/\n/g,' ')}</td>
    </tr>`).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"></head>
      <body><table border="1"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body>
    </html>`;

  const blob = new Blob([html], { type:'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_${(feira.nome||'feira').replace(/\s+/g,'_')}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// listeners
document.addEventListener('click', (ev)=>{
  const t = ev.target;
  if (t.closest('#btnExportFeiraCSV')) return exportFeiraCSV();
  if (t.closest('#btnExportFeiraXLS')) return exportFeiraXLS();
});
