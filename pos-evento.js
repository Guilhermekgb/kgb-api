/* =================== Helpers & Storage =================== */
const getJSON = (k, fb)=>{ try{ const v = JSON.parse(localStorage.getItem(k)||'null'); return v??fb; }catch{ return fb; } };
const setJSON = (k, v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };

const keySaida   = (id)=> `checklist:saida:${id}`;
const keyRetorno = (id)=> `checklist:retorno:${id}`;

/* ========= Config / tema ========= */
function getAppConfig(){
  try { return JSON.parse(localStorage.getItem('app_config') || '{}'); }
  catch { return {}; }
}
function formatMoney(v){
  const n = Number(v||0);
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}
/* =================== API / Backend (eventos) =================== */
const IS_REMOTE = !!(window.__API_BASE__ && String(window.__API_BASE__).trim());

function callApi(endpoint, method = 'GET', body = {}) {
  // mesmo padrão usado nos outros módulos (lista-evento, itens-evento, checklist)
  return import('./api/routes.js').then(({ handleRequest }) =>
    new Promise(resolve => handleRequest(endpoint, { method, body }, resolve))
  );
}

// Carrega um evento da API, com fallback pro localStorage "eventos"
async function carregarEventoDoBackend(evtId) {
  if (!evtId) return null;

  if (!IS_REMOTE) {
    const lista = getJSON('eventos', []);
    return (lista || []).find(e => String(e.id) === String(evtId)) || null;
  }

  try {
    const resp = await callApi(`/eventos/${encodeURIComponent(String(evtId))}`, 'GET', {});
    const ev = resp?.data || resp;

    if (ev && ev.id) {
      // reforça o cache local
      try {
        const lista = getJSON('eventos', []);
        const i = lista.findIndex(e => String(e.id) === String(ev.id));
        if (i > -1) lista[i] = ev; else lista.push(ev);
        setJSON('eventos', lista);
      } catch {}
    }

    return ev || null;
  } catch (e) {
    console.warn('[pos-evento] Falha ao carregar evento da API, usando cache local', e);
    const lista = getJSON('eventos', []);
    return (lista || []).find(e => String(e.id) === String(evtId)) || null;
  }
}

// busca custo de reposição no catálogo de materiais, caso a linha venha sem custo
function findCustoReposicao(nomeItem){
  try{
    const mats = JSON.parse(localStorage.getItem('estoque:materiais') || '[]');
    const hit = mats.find(m => String(m?.nome||'').trim().toLowerCase() === String(nomeItem||'').trim().toLowerCase());
    return Number(hit?.custoReposicao || hit?.custoReposição || hit?.custo || 0);
  }catch{ return 0; }
}

/* ========= Setores / Materiais ========= */
function loadSetores(){
  const a = getJSON('estoque.setores', []);
  const b = getJSON('estoque:setores', []);
  // dedup por id ou nome
  const map = new Map();
  [...a, ...b].forEach(s=>{
    if(!s) return;
    const key = (s.id!=null? String(s.id) : (s.nome||'').trim().toLowerCase());
    if(!map.has(key)) map.set(key, s);
  });
  return [...map.values()].filter(s => s && s.ativo !== false);
}
function loadMateriais(){
  const a = getJSON('estoque.materiais', []);
  const b = getJSON('estoque:materiais', []);
  const m = new Map(); 
  [...a, ...b].forEach(x=>{ 
    if(x?.id!=null) m.set(String(x.id), x); 
    else if (x?.nome) m.set((x.nome||'').trim().toLowerCase(), x);
  });
  return Array.from(m.values());
}
function nomeSetor(id){
  const s = loadSetores().find(x => String(x.id)===String(id));
  return s?.nome || '-';
}

/* =================== Carregar dados de saída/retorno =================== */
const evtId = new URLSearchParams(location.search).get('id') || '';
document.getElementById('lblEvtId') &&
  (document.getElementById('lblEvtId').textContent = evtId ? `Evento: ${evtId}` : '—');

// vamos usar a API se estivermos no modo remoto
const HAS_API = IS_REMOTE && typeof window.callApi === 'function';

// serão preenchidos no boot
let saida   = { itens: [] };
let retorno = { itens: [] };
let linhas  = [];

// Carrega checklist de saída/retorno, preferindo a API e caindo para o localStorage se preciso
async function carregarSaidaERetorno(){
  // 1) Começa com o que já existe no navegador
  let locSaida   = getJSON(keySaida(evtId),   null) || { itens: [] };
  let locRetorno = getJSON(keyRetorno(evtId), null) || { itens: [] };

  // 2) Se tiver API e evento, tenta buscar da nuvem
  if (HAS_API && evtId){
    try{
      const [respSaida, respRet] = await Promise.all([
        callApi(`/eventos/${encodeURIComponent(String(evtId))}/checklist-saida`,   'GET', {}),
        callApi(`/eventos/${encodeURIComponent(String(evtId))}/checklist-retorno`, 'GET', {})
      ]);

      const apiSaida = respSaida?.data ?? respSaida;
      const apiRet   = respRet?.data   ?? respRet;

      if (apiSaida && Array.isArray(apiSaida.itens)) {
        locSaida = apiSaida;
        setJSON(keySaida(evtId), locSaida);   // reforça o cache local
      }

      if (apiRet && Array.isArray(apiRet.itens)) {
        locRetorno = apiRet;
        setJSON(keyRetorno(evtId), locRetorno); // reforça o cache local
      }
    }catch(e){
      console.warn('[pos-evento] Falha ao buscar saída/retorno na API, usando localStorage', e);
      // se der erro, segue com o que já havia no navegador
    }
  }

  saida   = locSaida;
  retorno = locRetorno;

  // 3) Índice de retorno por material
  const retByMid = {};
  (retorno.itens || []).forEach(i => {
    const mid = String(i.m || i.materialId || '');
    if (mid) retByMid[mid] = i;
  });

  // 4) Materiais (pra custo de reposição)
  const materiais = loadMateriais();
  const matsById  = Object.fromEntries(
    (materiais || []).map(m => [
      (m.id != null ? String(m.id) : (m.nome || '').trim().toLowerCase()),
      m
    ])
  );

  // 5) Monta as linhas por item
  linhas = (saida.itens || []).map(i => {
    const mid   = String(i.m || i.materialId || '');
    const sent  = Number(i.e ?? i.enviado ?? 0);
    const rObj  = retByMid[mid] || i;
    const rcvd  = Number((rObj?.r ?? rObj?.retornado ?? 0) || 0);
    const falt  = Math.max(0, sent - rcvd);

    const matKey = mid || (i.nome ? (i.nome || '').trim().toLowerCase() : '');
    const mat    = matsById[matKey] || {};
    const setorId = i.s || i.setorId || mat.setorId || '';
    const nome    = mat.nome || i.nome || mid || '(sem nome)';

    const custo   = Number(
      mat.custoReposicao ||
      mat.custoReposição ||
      findCustoReposicao(nome) ||
      0
    );

    const sub     = Number(falt) * Number(custo);

    return {
      setorId,
      setorNome: nomeSetor(setorId),
      nome,
      enviado: sent,
      retornado: rcvd,
      faltaram: falt,
      custoUnit: custo,
      subtotal: sub
    };
  });

  // expõe global para o botão "Enviar ao cliente" e para o salvamento do pós-evento
  window.__linhasPosEvento = linhas;
}


/* título do evento (se quiser mostrar em algum lugar da página) */
(function setTitulo(){
  const h = document.getElementById('tituloEvento');
  if (!h) return;

  (async () => {
    let ev = null;

    try {
      ev = await carregarEventoDoBackend(evtId);
    } catch (e) {
      console.warn('[pos-evento] Erro ao buscar evento para título', e);
    }

    if (!ev) {
      const eventos = getJSON('eventos', []);
      ev = (eventos || []).find(e => String(e.id) === String(evtId)) || null;
    }

    const nome =
      (ev?.nomeEvento || ev?.titulo || ev?.nome || ev?.cliente || ev?.evento || '') ||
      evtId ||
      'Evento';

    h.textContent = `Evento: ${nome}`;
  })();
})();


/* =================== Filtros (setores/mostrar) =================== */
const setorIds = Array.from(new Set(linhas.map(l => String(l.setorId)).filter(Boolean)));
const setores  = loadSetores().filter(s => setorIds.includes(String(s.id)));
const listSet  = document.getElementById('listSetores');
let filtroSet  = new Set(setorIds.length ? setorIds : (loadSetores().map(s=>String(s.id))));

function renderSetoresCheck(){
  if (!listSet) return;
  listSet.innerHTML = '';
  if (!setorIds.length){
    listSet.innerHTML = '<span class="muted">Não há setores envolvidos.</span>';
    return;
  }
  setores.forEach(s=>{
    const id = String(s.id);
    const lab = document.createElement('label');
    lab.innerHTML = `
      <input type="checkbox" class="f-setor" value="${id}" ${filtroSet.has(id)?'checked':''}>
      <span>${s.nome}</span>
    `;
    listSet.appendChild(lab);
  });

  listSet.querySelectorAll('.f-setor').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const id = String(cb.value);
      if (cb.checked) filtroSet.add(id); else filtroSet.delete(id);
      renderTabela();
    });
  });
}

/* =================== Tabela (com setores para uso interno) =================== */
function renderTabela(){
  const wrap = document.getElementById('tblWrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const selMostrar = document.getElementById('selMostrar');
  const mostrar = selMostrar ? selMostrar.value : 'comfaltas'; // 'comfaltas' | 'todos'
  let view = linhas.slice();
  if (filtroSet.size){ view = view.filter(l => filtroSet.has(String(l.setorId))); }
  if (mostrar === 'comfaltas'){ view = view.filter(l => Number(l.faltaram||0) > 0); }

  // agrupa por setor
  const bySetor = new Map();
  for (const row of view){
    const k = String(row.setorId)||'_';
    if (!bySetor.has(k)) bySetor.set(k, []);
    bySetor.get(k).push(row);
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Setor</th>
        <th>Item</th>
        <th style="text-align:right">Saída</th>
        <th style="text-align:right">Retorno</th>
        <th style="text-align:right">Faltaram</th>
        <th style="text-align:right">Custo unit.</th>
        <th style="text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody></tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="text-align:right">Total</td>
        <td id="tdTotal" style="text-align:right"></td>
      </tr>
    </tfoot>
  `;
  const tb = table.querySelector('tbody');

  let total = 0;
  for (const [sid, rows] of bySetor.entries()){
    const trHead = document.createElement('tr');
    trHead.innerHTML = `<td colspan="7" style="background:#fffdf6; color:#5a3e2b; font-weight:700">${nomeSetor(sid)}</td>`;
    tb.appendChild(trHead);

    rows.forEach(r=>{
      total += Number(r.subtotal||0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.setorNome}</td>
        <td>${r.nome}</td>
        <td style="text-align:right">${r.enviado}</td>
        <td style="text-align:right">${r.retornado}</td>
        <td style="text-align:right">${r.faltaram}</td>
        <td style="text-align:right">${formatMoney(r.custoUnit)}</td>
        <td style="text-align:right">${formatMoney(r.subtotal)}</td>
      `;
      tb.appendChild(tr);
    });
  }

  const cel = table.querySelector('#tdTotal');
  if (cel) cel.textContent = formatMoney(total);
  wrap.dataset.total = String(total); // total exposto p/ modal de cobrança, se quiser
  wrap.appendChild(table);
}

/* Retorna o total atual (R$) lendo a célula de total da tabela */
function getTotalAtual(){
  const cel = document.getElementById('tdTotal');
  if (!cel) return 0;
  const txt = cel.textContent.replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',', '.');
  const num = Number(txt);
  return Number.isFinite(num) ? num : 0;
}

/* =================== Fotos (preview local) =================== */
const inpFotos = document.getElementById('inpFotos');
if (inpFotos){
  inpFotos.addEventListener('change', (e)=>{
    const gal = document.getElementById('fotosPreview');
    if (!gal) return;
    gal.innerHTML = '';
    const files = Array.from(e.target.files||[]);
    files.forEach(f=>{
      const url = URL.createObjectURL(f);
      const img = document.createElement('img');
      img.src = url; img.onload = ()=> URL.revokeObjectURL(url);
      gal.appendChild(img);
    });
  });
}
// Converte arquivos do input em DataURL (base64) p/ embutir no HTML
async function filesToDataURLs(inputEl){
  const files = Array.from(inputEl?.files || []);
  const urls = [];
  for (const f of files){
    const data = await new Promise(res=>{
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(f);
    });
    urls.push(data);
  }
  return urls;
}

/* =================== Documento do cliente (sem setores) =================== */
function aggregateForClient(list){
  const byItem = new Map();
  (list||[]).forEach(L=>{
    const nome = (L.nome || L.item || '').trim();
    if(!nome) return;
    const key = nome.toLowerCase();
    const base = byItem.get(key) || { nome, saida:0, retorno:0, faltaram:0, custoUnit:0 };
    base.saida    += Number(L.enviado ?? L.saida ?? 0);
    base.retorno  += Number(L.retornado ?? L.retorno ?? 0);
    base.faltaram += Number(L.faltaram ?? 0);

    // custo: prioriza da linha; se zero, usa catálogo
    const cuLinha = Number(L.custoUnit ?? L.custo ?? 0);
    const cuCat   = findCustoReposicao(nome);
    base.custoUnit = cuLinha || base.custoUnit || cuCat;

    byItem.set(key, base);
  });

  const out = [...byItem.values()].map(r => ({
    ...r,
    subtotal: Number(r.faltaram||0) * Number(r.custoUnit||0),
  }));

  out.sort((a,b)=> (b.subtotal||0) - (a.subtotal||0));
  return out;
}

function gerarHTMLDocumentoCliente(evtInfo, clientRows, fotosDataURLs = []){
  const cfg = getAppConfig(); // {nome, logo, brand, brand2, bg}
  const brand  = cfg.brand  || '#5a3e2b';
  const brand2 = cfg.brand2 || '#c29a5d';
  const bg     = cfg.bg     || '#f8f1e8';
  const nomeEmpresa = cfg.nome || 'Seu Buffet';
  const logo = cfg.logo || '';

  const total = (clientRows||[]).reduce((acc, r)=> acc + Number(r.subtotal||0), 0);

  const styles = `
  <style>
    :root{ --brand:${brand}; --gold:${brand2}; --bg:${bg}; --ink:#2d2730; --line:#eadfcd; }
    html,body{ background:var(--bg); color:var(--ink); font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    .sheet{ max-width: 980px; margin: 24px auto; background:#fff; border:1px solid var(--line); border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.06); overflow:hidden; }
    .hero{
      display:flex; gap:16px; align-items:center; padding:18px; color:#fff;
      background: linear-gradient(100deg, var(--brand), var(--gold));
    }
    .logo-wrap{ width:110px; height:110px; background:#fff; border-radius:14px; display:grid; place-items:center; overflow:hidden; box-shadow: inset 0 0 0 1px rgba(0,0,0,.05); }
    .logo-wrap img{ max-width:100%; max-height:100%; object-fit:contain; }
    .hero h1{ font-family: "Playfair Display", Georgia, serif; font-size:24px; margin:0; }
    .hero .sub{ opacity:.95; font-size:13px; margin-top:4px; }
    .hero .ev{ font-size:14px; margin-top:8px; font-weight:600; }

    .pad{ padding:18px; }
    .tbl{ width:100%; border-collapse: collapse; }
    .tbl th, .tbl td{ padding:10px 12px; border-bottom:1px solid var(--line); }
    .tbl thead th{ background:#fff8ef; color:#4a3c2f; font-weight:800; border-bottom:2px solid var(--line); text-align:left; }
    .num{ text-align:right; white-space:nowrap; }
    .zebra tbody tr:nth-child(odd){ background:#fffdf8; }
    .hint{ font-size:12px; color:#7a6a5c; margin-top:10px; }

    .total{
      display:flex; justify-content:flex-end; gap:10px; align-items:center;
      margin:14px 0 0; padding:12px 14px; background:#fff8ef; border:1px solid var(--line); border-radius:10px;
      font-weight:800;
    }

    .section-title{ font-family: "Playfair Display", Georgia, serif; font-size:18px; color:#3b2a21; margin:16px 0 8px; }
    .galeria{ display:flex; flex-wrap:wrap; gap:12px; }
    .galeria img{ max-width:180px; max-height:180px; border-radius:10px; border:1px solid var(--line); object-fit:cover; }

    @media print{
      .sheet{ box-shadow:none; }
      .galeria img{ max-width:140px; max-height:140px; }
    }
  </style>`;

  const header = `
  <div class="hero">
    <div class="logo-wrap">${logo ? `<img src="${logo}" alt="Logo">` : ''}</div>
    <div>
      <h1>${nomeEmpresa}</h1>
      <div class="sub">Relatório de perdas e quebras · documento para o cliente</div>
      <div class="ev">${evtInfo?.titulo || 'Evento'} — ${evtInfo?.dataBR || ''}</div>
    </div>
  </div>`;

  const bodyTable = `
  <div class="pad">
    <table class="tbl zebra">
      <thead>
        <tr>
          <th>Item</th>
          <th class="num">Saída</th>
          <th class="num">Retorno</th>
          <th class="num">Faltaram</th>
          <th class="num">Valor unit.</th>
          <th class="num">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${
          (clientRows && clientRows.length)
          ? clientRows.map(r=>`
              <tr>
                <td>${r.nome}</td>
                <td class="num">${r.saida}</td>
                <td class="num">${r.retorno}</td>
                <td class="num">${r.faltaram}</td>
                <td class="num">${formatMoney(r.custoUnit)}</td>
                <td class="num">${formatMoney(r.subtotal)}</td>
              </tr>
            `).join('')
          : `<tr><td colspan="6" style="text-align:center;color:#7a6a5c;padding:14px">Sem faltas para cobrar.</td></tr>`
        }
      </tbody>
    </table>

    <div class="hint">* Valores calculados pelo custo de reposição cadastrado em cada material.</div>

    <div class="total">
      <div>Total</div>
      <div class="num" style="font-size:18px">${formatMoney(total)}</div>
    </div>

    ${
      (fotosDataURLs && fotosDataURLs.length)
      ? `
        <div class="section-title">Evidências fotográficas</div>
        <div class="galeria">
          ${fotosDataURLs.map(u=>`<img src="${u}" alt="Evidência">`).join('')}
        </div>
      `
      : ''
    }
  </div>`;

  return `${styles}<div class="sheet">${header}${bodyTable}</div>`;
}

/* =================== Enviar / Imprimir / Baixar =================== */
document.getElementById('btnImprimir')?.addEventListener('click', ()=> window.print());

document.getElementById('btnEnviar')?.addEventListener('click', async ()=>{
  let ev = null;

  // tenta buscar pela API primeiro
  try {
    ev = await carregarEventoDoBackend(evtId);
  } catch (e) {
    console.warn('[pos-evento] Erro ao carregar evento para envio ao cliente', e);
  }

  // se não conseguiu, cai pro localStorage
  if (!ev) {
    const eventos = getJSON('eventos', []);
    ev = (eventos || []).find(e => String(e.id) === String(evtId)) || {};
  }

  const evtInfo = {
    titulo: ev?.nomeEvento || ev?.titulo || ev?.nome || ev?.cliente || ('Evento ' + (ev?.id || evtId)),
    dataBR: (() => {
      const d = new Date(ev?.data || ev?.dataEvento || ev?.dataDoEvento);
      return isFinite(d) ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';
    })()
  };

  const rowsClient = aggregateForClient(window.__linhasPosEvento || linhas || []);

  // fotos (se anexadas) viram dataURL embutidas
  const fotosInput = document.getElementById('inpFotos');
  const fotosDataURLs = await filesToDataURLs(fotosInput);

  const html = gerarHTMLDocumentoCliente(evtInfo, rowsClient, fotosDataURLs);
  const host = document.getElementById('modalDoc');
  if (host) host.innerHTML = html;

  document.getElementById('modalSend')?.style.setProperty('display', 'block');
});


document.getElementById('btnFecharModal')?.addEventListener('click', ()=>{
  document.getElementById('modalSend')?.style.setProperty('display','none');
});

document.getElementById('btnModalImprimir')?.addEventListener('click', ()=>{
  const html = document.getElementById('modalDoc')?.innerHTML || '';
  const w = window.open('', '_blank');
  if (!w){ alert('Bloqueado pelo navegador. Permita pop-ups para imprimir.'); return; }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório Pós-Evento</title></head><body>${html}</body></html>`);
  w.document.close();
  try{ w.focus(); w.print(); }catch{}
});

document.getElementById('btnModalBaixar')?.addEventListener('click', ()=>{
  const html = document.getElementById('modalDoc')?.innerHTML || '';
  const blob = new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>Relatório Pós-Evento</title></head><body>${html}</body></html>`],{ type:'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pos-evento-relatorio.html';
  a.click();
  URL.revokeObjectURL(a.href);
});

/* =================== Interações de filtros =================== */
document.getElementById('selMostrar')?.addEventListener('change', renderTabela);

/* =================== Inicialização =================== */
async function init(){
  // 1) Carrega saída/retorno (API + fallback localStorage)
  await carregarSaidaERetorno();

  // 2) Monta filtros de setores e tabela de itens
  renderSetoresCheck();
  renderTabela();
}

// dispara o boot
init();


/* ===== SALVAR PÓS-EVENTO (perdas/quebras) DENTRO DO EVENTO ===== */
async function salvarPosEvento() {
  if (!evtId) {
    alert('Não foi possível identificar o evento deste pós-evento.');
    return;
  }

  // 1) Monta o resumo das perdas/quebras a partir da tabela
  const linhasBrutas   = window.__linhasPosEvento || linhas || [];
  const linhasCliente  = aggregateForClient(linhasBrutas);
  const totalPerdas    = Number(getTotalAtual() || 0);
  const agoraISO       = new Date().toISOString();

  const payloadPos = {
    atualizadoEm: agoraISO,
    totalPerdas,
    itens: linhasCliente
    // depois podemos acrescentar NPS, feedback, etc.
  };

  // 2) Prepara movimentos de estoque (perdas/faltas definitivas)
  //    Aqui usamos as linhas brutas: cada linha que tiver "faltaram" > 0 gera um movimento.
  const movimentos = (linhasBrutas || [])
    .filter(row => Number(row.faltaram || 0) > 0)
    .map(row => ({
      tipo: 'perda_pos_evento',
      eventoId: String(evtId),
      dataISO: agoraISO,
      setorId: row.setorId || '',
      setorNome: row.setorNome || '',
      itemNome: row.nome || '',
      qtd: Number(row.faltaram || 0),
      motivo: 'faltou_no_retorno'
    }));

  // 3) Carrega o evento (API -> cache local)
  let ev = null;
  try {
    ev = await carregarEventoDoBackend(evtId);
  } catch (e) {
    console.warn('[pos-evento] Erro ao carregar evento p/ salvar pós-evento', e);
  }

  // fallback puro local, se a API não responder
  if (!ev) {
    const lista = getJSON('eventos', []);
    ev = (lista || []).find(e => String(e.id) === String(evtId)) || null;
  }

  if (!ev) {
    alert('Não foi possível encontrar o evento para salvar o pós-evento.');
    return;
  }

  // 4) Grava o pós-evento dentro do objeto do evento
  ev.posEvento = ev.posEvento || {};
  ev.posEvento.perdasQuebras = payloadPos;

  // 5) Atualiza o cache local de "eventos"
  try {
    const lista = getJSON('eventos', []);
    const i = lista.findIndex(e => String(e.id) === String(ev.id));
    if (i > -1) lista[i] = ev; else lista.push(ev);
    setJSON('eventos', lista);
  } catch (e) {
    console.warn('[pos-evento] Falha ao atualizar cache local com posEvento', e);
  }

  // 6) Tenta mandar o pós-evento para a API ( PUT /eventos/{id} )
  if (IS_REMOTE) {
    try {
      await callApi(`/eventos/${encodeURIComponent(String(ev.id))}`, 'PUT', ev);

      // 7) Se tiver movimentos de perda, registra também em /estoque/movimentos
      if (movimentos.length > 0) {
        try {
          await callApi('/estoque/movimentos', 'POST', {
            eventoId: String(evtId),
            tipo: 'perdas_pos_evento',
            dataISO: agoraISO,
            itens: movimentos
          });
        } catch (eMov) {
          console.warn('[pos-evento] Falha ao registrar movimentos de estoque', eMov);
          // não bloqueia o salvamento do pós-evento; só loga no console
        }
      }

      alert('Pós-evento salvo com sucesso na ficha do evento (nuvem) e movimentos de estoque registrados.');
      return;
    } catch (e) {
      console.warn('[pos-evento] Falha ao salvar pós-evento na API', e);
      alert('Salvei neste computador, mas não consegui mandar para a nuvem agora.');
      return;
    }
  } else {
    alert('Pós-evento salvo apenas neste computador (API não configurada).');
  }
}


// Liga o botão "Salvar pós-evento" à função acima
document
  .getElementById('btnSalvarPosEvento')
  ?.addEventListener('click', salvarPosEvento);

/* ——— Abertura/fechamento do modal de cobrança ——— */
function abrirModalCobranca(){
  const eventos = (()=>{ 
    try{ return JSON.parse(localStorage.getItem('eventos')||'[]'); }
    catch{ return []; }
  })();

  const ev = (eventos||[]).find(e => String(e.id)===String(evtId)) || {};
  const nomeEv = ev.nomeEvento || ev.titulo || ev.nome || ev.cliente || ('Evento '+(ev.id||evtId));

  const totalAtual = Number(document.getElementById('tblWrap')?.dataset?.total || 0);

  document.getElementById('cobEventoChip').textContent = nomeEv;
  document.getElementById('cobEvtNome').value = nomeEv;
  document.getElementById('cobDesc').value = 'Quebras e danos';

  // mostra valor já formatado em pt-BR
  document.getElementById('cobValor').value =
    Number(totalAtual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('cobVenc').value = new Date().toISOString().slice(0,10);
  document.getElementById('modalCob').style.display = 'flex';
}

function fecharModalCobranca(){
  document.getElementById('modalCob').style.display = 'none';
}

/* ——— Persistência no Financeiro Global e redirecionamento ——— */
function fg_read(){ 
  try{ return JSON.parse(localStorage.getItem('financeiroGlobal'))||{}; }
  catch{ return {}; }
}
function fg_write(G){
  localStorage.setItem('financeiroGlobal', JSON.stringify(G||{}));
  localStorage.setItem('financeiroGlobal:ping', String(Date.now()));
}

async function criarCobrancaFinanceiro({ eventoId, descricao, valor, vencimentoISO, meio='PIX', contaNome='' }){
  if (!IS_REMOTE || typeof callApi !== 'function') {
    alert('API financeira não disponível. Verifique a conexão e tente novamente.');
    return null;
  }

  const body = {
    eventoId   : String(eventoId),
    descricao  : String(descricao || 'Cobrança pós-evento'),
    valor      : Number(valor || 0),
    vencimentoISO: vencimentoISO || new Date().toISOString().slice(0,10),
    meio,
    contaNome
  };

  try {
    await callApi('/fin/lancamentos', 'POST', body);
  } catch (e) {
    console.error('[pos-evento] falha ao criar lançamento financeiro na nuvem:', e);
    alert('Não foi possível criar o lançamento financeiro na nuvem.');
    return null;
  }

  const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
  return `${base}financeiro-evento.html?id=${encodeURIComponent(eventoId)}`;
}


// ——— Liga os botões de cobrança ———
document.getElementById('btnAbrirModalCobranca')?.addEventListener('click', abrirModalCobranca);
document.getElementById('cobFechar')?.addEventListener('click', fecharModalCobranca);
document.getElementById('cobCancelar')?.addEventListener('click', fecharModalCobranca);
document.getElementById('cobSalvar')?.addEventListener('click', async () => {
  const descEl = document.getElementById('cobDesc');
  const vencEl = document.getElementById('cobVenc');
  const valEl  = document.getElementById('cobValor');

  const desc = (descEl?.value || '').trim() || 'Cobrança pós-evento';
  const venc = (vencEl?.value || '').trim() || new Date().toISOString().slice(0,10);

  const bruto = String(valEl?.value || '0');
  const valor = parseFloat(bruto.replace(/\./g, '').replace(',', '.')) || 0;

  if (!(valor > 0)) {
    alert('Informe um valor maior que zero.');
    return;
  }

  const url = await criarCobrancaFinanceiro({
    eventoId: evtId,
    descricao: desc,
    valor,
    vencimentoISO: venc,
    meio: 'PIX'
  });

  if (url) {
    window.location.href = url;
  }
});
