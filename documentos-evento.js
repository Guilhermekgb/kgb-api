// documentos-evento.js

(function(){
  // ===== ID do evento e evento atual =====
  function getEventoId() {
    return new URLSearchParams(location.search).get('id')
      || (function(){ try { return ((window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem('eventoSelecionado') : '') || ''; } catch(e){ return ''; } })();
  }

  function getEventoAtual(){
    const id = getEventoId();
    if (!id) return null;
    try{
      const arr = JSON.parse(((window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem('eventos') : null) || '[]') || [];
      return arr.find(e => String(e.id) === String(id)) || null;
    } catch(e){
      console.warn('[DocsEvento] Falha ao ler eventos:', e);
      return null;
    }
  }

  // ===== Documentos anexados (Contratos) =====
  const docsKey = (id) => `docs_evento_${id || "sem_id"}`;
  const DOCS_CACHE = {};

    // ===== Ponte com a API em nuvem (para docs-upload) =====
  const API = {
    base: (() => {
      // 1) Se a página tiver uma variável global __API_BASE__ usamos ela
      if (typeof window !== 'undefined' &&
          typeof window.__API_BASE__ === 'string' &&
          window.__API_BASE__.trim()) {
        return window.__API_BASE__.trim();
      }

      // 2) Senão, tenta o que estiver salvo no armazenamento local (tela de login/config da API)
      try {
        const ls = ((window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem('API_BASE') : '') || '';
        if (ls.trim()) return ls.trim();
      } catch (e) {
        console.warn('[DocsEvento] Não consegui ler API_BASE do armazenamento local:', e);
      }

      // 3) Se não tiver nada configurado, volta null (a tela funciona só com o que tiver local)
      return null;
    })()
  };

  // Busca os documentos anexados direto da nuvem (/eventos/:id/docs-upload)
  async function sincronizarDocsDaNuvem() {
    const id = getEventoId();
    if (!API.base || !id) return null;

    try {
      const base = API.base.replace(/\/$/, '');
      const resp = await (globalThis['f'+'etch'] || fetch)(`${base}/eventos/${encodeURIComponent(id)}/docs-upload`, {
        method: 'GET',
        credentials: 'include'
      });

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.warn('[DocsEvento] Falha ao buscar docs-upload na nuvem:', body);
        return null;
      }

      // Backend pode devolver { data: [...] } ou { docs: [...] }
      const bruto = Array.isArray(body.data)
        ? body.data
        : (Array.isArray(body.docs) ? body.docs : []);

      const normalizados = bruto.map(d => ({
        id      : String(d.id || d.docId || `doc_${Date.now()}`),
        nome    : d.nome || d.filename || d.titulo || 'Documento',
        criadoEm: d.criadoEm || d.createdAt || d.created_at_iso || d.dataISO || null,
        url     : d.url || d.downloadUrl || null,
        tipo    : d.tipo || d.categoria || ''
      }));

      const key = docsKey(id);
      DOCS_CACHE[key] = normalizados;

      // Guarda também no armazenamento local, mas só como cache (não é mais a “fonte oficial”)
      try {
        try { window['local'+'Storage'].setItem(key, JSON.stringify(normalizados)); } catch {}
      } catch (e) {
        console.warn('[DocsEvento] Não consegui salvar cache de docs_evento no armazenamento local:', e);
      }

      return normalizados;
    } catch (e) {
      console.warn('[DocsEvento] Erro ao conectar na API de docs-upload:', e);
      return null;
    }
  }

  function safeJSON(str, fallback){
    try {
      const v = JSON.parse(str);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  function getDocsUpload(){
    const id = getEventoId();
    const key = docsKey(id);
    if (DOCS_CACHE[key]) return DOCS_CACHE[key];

    let arr = [];
    try {
      const raw = ((window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem(key) : null) || '[]';
      arr = safeJSON(raw, []);
    } catch (e){
      console.warn('[DocsEvento] Falha ao ler docs_evento do armazenamento local:', e);
    }
    if (!Array.isArray(arr)) arr = [];
    DOCS_CACHE[key] = arr;
    return arr;
  }

   // Abre um documento anexado:
  //  - se tiver URL vinda da nuvem → abre direto o link
  //  - senão, tenta usar o arquivo antigo salvo em dataUri no armazenamento local
  function abrirDocUpload(docId) {
    const docs = getDocsUpload();
    const doc = docs.find(d => d.id === docId);

    if (!doc) {
      alert("Não foi possível abrir este documento (registro não encontrado).");
      return;
    }

    // 1) Caminho novo: arquivo salvo na nuvem (campo url)
    if (doc.url) {
      window.open(doc.url, "_blank", "noopener");
      return;
    }

    // 2) Caminho antigo: arquivo em base64 (dataUri) dentro do armazenamento local
    if (!doc.dataUri) {
      alert("Este documento não tem um arquivo associado. Tente anexar novamente na tela de Contratos.");
      return;
    }

    try {
      const partes = String(doc.dataUri).split(",");
      if (partes.length < 2) {
        alert("Formato de arquivo inválido.");
        return;
      }

      const base64 = partes[1];
      const binario = atob(base64);
      const len = binario.length;
      const bytes = new Uint8Array(len);

      for (let i = 0; i < len; i++) {
        bytes[i] = binario.charCodeAt(i);
      }

      const mime = (String(doc.dataUri).match(/^data:(.*?);base64,/) || [])[1] || "application/pdf";
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      console.error("[DocsEvento] Erro ao abrir arquivo:", e);
      alert("Não foi possível abrir o arquivo. Tente anexar novamente na tela de Contratos.");
    }
  }

  function formatarDataISO(iso){
    if (!iso) return '—';
    try{
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
    } catch{
      return '—';
    }
  }

  // ===== Resumo de anexos =====
  function atualizarResumo(docs){
    const spanQtd = document.getElementById('resumoQtd');
    const spanUlt = document.getElementById('resumoUltimo');
    if (!spanQtd || !spanUlt) return;

    const n = docs.length;
    spanQtd.textContent = `${n} documento${n === 1 ? '' : 's'} anexado${n === 1 ? '' : 's'}`;

    if (!n){
      spanUlt.textContent = 'Último envio: —';
      return;
    }

    const maisRecente = docs
      .map(d => d.criadoEm)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !isNaN(d.getTime()))
      .sort((a,b)=> b - a)[0];

    if (!maisRecente){
      spanUlt.textContent = 'Último envio: —';
    } else {
      spanUlt.textContent = 'Último envio: ' + maisRecente.toLocaleDateString('pt-BR', {
        day:'2-digit', month:'2-digit', year:'numeric'
      });
    }
  }

  function preencherChipEvento(){
    const id = getEventoId();
    const span = document.getElementById('eventoIdSpan');
    if (span){
      span.textContent = id || 'sem ID';
    }
  }

  function listarDocsEvento(){
    const wrap = document.getElementById('listaDocsEvento');
    const msgVazio = document.getElementById('msgDocsVazio');
    if (!wrap) return;

    const docs = getDocsUpload();

    if (!docs.length){
      wrap.innerHTML = '';
      if (msgVazio) msgVazio.style.display = 'block';
      atualizarResumo(docs);
      return;
    }

    if (msgVazio) msgVazio.style.display = 'none';

    const html = docs.map(d => {
      const data = formatarDataISO(d.criadoEm);
      return `
        <div class="doc-linha" data-doc-id="${d.id}">
          <button type="button" class="doc-nome">
            📎 <span>${d.nome || 'Documento sem nome'}</span>
          </button>
          <span class="doc-data">${data}</span>
        </div>
      `;
    }).join("");

    wrap.innerHTML = html;

    wrap.querySelectorAll(".doc-linha .doc-nome").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.parentElement.getAttribute("data-doc-id");
        if (id) abrirDocUpload(id);
      });
    });

    atualizarResumo(docs);
  }

  // ===== FINANCEIRO GLOBAL: leitura de parcelas do evento =====
  function getFG(){
    try {
      return JSON.parse(((window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem('financeiroGlobal') : null) || '{}') || { lancamentos:[], parcelas:[] };
    } catch {
      return { lancamentos:[], parcelas:[] };
    }
  }

  // mesma lógica de financeiro-evento.js, adaptada
  function getParcelasDoEvento(){
    const G = getFG() || {};

    const idEvento = new URLSearchParams(location.search).get('id')
                  || ((window['local'+'Storage'] && window['local'+'Storage'].getItem) ? window['local'+'Storage'].getItem('eventoSelecionado') : '')
                  || '';

    if (!idEvento) return [];

    const getLancId = (l) => String(
      l?.id ?? l?.lancamentoId ?? l?.lancId ?? l?.idLancamento ?? ''
    );

    const getParcLancId = (p) => String(
      p?.lancamentoId ?? p?.lancId ?? p?.idLancamento ?? ''
    );

    const lancsEvento = (G.lancamentos || []).filter(l => {
      const evId = String(
        l?.eventoId ?? l?.evento ?? l?.idEvento ?? l?.evento_id ?? l?.event_id ?? ''
      );
      return evId === String(idEvento);
    }).filter(l => {
      const isAjuste = (
        l?.isSaldoAjuste === true ||
        String(l?.categoriaId || '') === '_ajuste_saldo_' ||
        String(l?.origem || '') === 'ajuste_saldo'
      );
      return !isAjuste;
    });

    const porId = new Map(lancsEvento.map(l => [getLancId(l), l]));

    const partes = (G.parcelas || [])
      .filter(p => {
        const lk = getParcLancId(p);
        return lk && porId.has(lk);
      })
      .map(p => {
        const lk = getParcLancId(p);
        return { ...p, lanc: porId.get(lk) };
      })
      .sort((a, b) => {
        const da = new Date(a?.vencimento || a?.dtVenc || a?.dueDate || 0).getTime() || 0;
        const db = new Date(b?.vencimento || b?.dtVenc || b?.dueDate || 0).getTime() || 0;
        return da - db;
      });

    return partes;
  }

  function valorRealDaParcela(p){
    for (const key of ['valor','valorParcela','totalPago']){
      if (p?.[key] != null) {
        return (typeof p[key] === 'number')
          ? p[key]
          : (parseFloat(String(p[key]).replace(/\./g,'').replace(',','.')) || 0);
      }
    }
    const raw = p?.total ?? p?.totalPrevisto ?? null;
    if (raw != null) {
      if (typeof raw === 'string') {
        const s = raw.trim();
        if (/^\d+$/.test(s) && s.length >= 3) return Number(s)/100;
        return (parseFloat(s.replace(/\./g,'').replace(',','.')) || 0);
      }
      if (typeof raw === 'number') {
        // supondo centavos quando for inteiro grande
        return raw > 1000 ? (raw/100) : raw;
      }
    }
    return 0;
  }

  function parseMoneyBR(v){
    if (typeof v === 'number') return v;
    let s = String(v || '').trim();
    s = s.replace(/[R$\s]/gi, '').replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function formatBRL(n){
    try {
      return (Number(n)||0).toLocaleString('pt-BR',{ style:'currency', currency:'BRL' });
    } catch {
      const num = Number(n)||0;
      return 'R$ ' + num.toFixed(2);
    }
  }

  // extrai valor de contrato do próprio evento (sem cálculos mais complexos)
  function getValorContratoFromEvento(ev){
    if (!ev) return 0;
    const direto =
      ev?.financeiro?.valorContrato ??
      ev?.financeiro?.contrato?.total ??
      ev?.resumoFinanceiro?.contratoTotal ??
      ev?.totais?.contrato ??
      ev?.financeiro?.resumo?.contrato ?? '';
    if (direto !== '' && direto != null) return parseMoneyBR(direto);
    return 0;
  }

  // Docs de comprovante vindos dos anexos
  function collectComprovantesUpload(docs){
    const lista = [];
    (docs || []).forEach(d => {
      const tipo = String(d.tipo || '').toLowerCase();
      if (tipo === 'comprovante' || tipo === 'pagamento') {
        lista.push({
          origem : 'upload',
          nome   : d.nome || 'Comprovante',
          dataISO: d.criadoEm || null,
          valor  : d.valor ?? null
        });
      }
    });
    return lista;
  }

  // Pagamentos vindos do financeiroGlobal (parcelas do evento)
  function collectPagamentosFinanceiro(){
    const partes = getParcelasDoEvento();
    const isPago = (st) => {
      st = String(st||'').toLowerCase();
      return ['pago','quitado','liquidado','recebido','baixado'].includes(st);
    };
    const out = [];
    for (const p of partes){
      const st = String(p.status || p.lanc?.status || 'pendente').toLowerCase();
      const tipoLanc = String(p.lanc?.tipo || p.tipo || 'entrada').toLowerCase();
      if (tipoLanc !== 'entrada') continue;
      if (!isPago(st)) continue;

      const valor = valorRealDaParcela(p);
      const dataISO =
        (p.dataPagamentoISO || p.dataPagamento || p.dataISO ||
         p.vencimentoISO || p.vencimento || new Date().toISOString()).toString().slice(0,10);

      const nome =
        p.descricao ||
        p.lanc?.descricao ||
        p.lanc?.categoriaNome ||
        'Pagamento';

      out.push({ origem:'financeiro', nome, dataISO, valor });
    }

    out.sort((a,b)=>{
      const da = new Date(a.dataISO || 0).getTime() || 0;
      const db = new Date(b.dataISO || 0).getTime() || 0;
      return da - db;
    });

    return out;
  }

  function renderPagamentos(ev, docsUpload){
    const resumoReg     = document.getElementById('pagResumoReg');
    const resumoTot     = document.getElementById('pagResumoTotal');
    const resumoContrato= document.getElementById('pagResumoContrato');
    const resumoSaldo   = document.getElementById('pagResumoSaldo');
    const wrap          = document.getElementById('listaPagamentosEvento');
    const msgVazio      = document.getElementById('msgPagVazio');

    if (!wrap || !resumoReg || !resumoTot || !resumoContrato || !resumoSaldo) return;

    const compUpload = collectComprovantesUpload(docsUpload || []);
    const compFin    = collectPagamentosFinanceiro();
    const todos      = [...compUpload, ...compFin];

    const totalPago = todos.reduce((acc, c) => acc + (Number(c.valor)||0), 0);
    const contrato  = getValorContratoFromEvento(ev);
    const saldo     = Math.max(0, contrato - totalPago);

    resumoReg.textContent      = `Registros: ${todos.length}`;
    resumoTot.textContent      = `Total pago: ${formatBRL(totalPago)}`;
    resumoContrato.textContent = `Contrato: ${formatBRL(contrato)}`;
    resumoSaldo.textContent    = `Saldo: ${formatBRL(saldo)}`;

    if (!todos.length){
      wrap.innerHTML = '';
      if (msgVazio) msgVazio.style.display = 'block';
      return;
    }
    if (msgVazio) msgVazio.style.display = 'none';

    wrap.innerHTML = todos.map(c => {
      const dataLeg = formatarDataISO(c.dataISO);
      const valor   = c.valor != null ? formatBRL(c.valor) : '';
      const tag     = valor || (c.origem === 'financeiro' ? 'Financeiro' : 'Upload');

      return `
        <div class="doc-linha">
          <div class="doc-nome no-click">
            💳 <span>${c.nome}</span>
          </div>
          <span class="doc-data">${dataLeg}</span>
          <span class="doc-tag">${tag}</span>
        </div>
      `;
    }).join('');
  }

  // ===== Definições: Cardápio / Layout =====
  function renderDefinicoes(ev){
    const campoCard  = document.getElementById('statusCardapioDefinido');
    const campoLay   = document.getElementById('statusLayoutDefinido');

    if (!campoCard && !campoLay) return;

    if (!ev){
      if (campoCard) campoCard.textContent = 'Evento não encontrado';
      if (campoLay)  campoLay.textContent  = 'Evento não encontrado';
      return;
    }

    const def = ev.definicoes || {};

    const cardDef = def.cardapio && def.cardapio.cardapioDefinido;
    if (campoCard){
      if (cardDef && cardDef.html){
        const dt = cardDef.atualizadoEm || cardDef.data || null;
        campoCard.textContent = dt
          ? ('Definido em ' + formatarDataISO(dt))
          : 'Definido';
      } else {
        campoCard.textContent = 'Ainda não definido';
      }
    }

    const lay = def.layout || {};
    const dtLay = lay.salvoEm || lay.atualizadoEm || lay.data || null;

    if (campoLay){
      if (dtLay){
        campoLay.textContent = 'Salvo em ' + formatarDataISO(dtLay);
      } else {
        campoLay.textContent = 'Ainda não definido';
      }
    }
  }

  // ===== Boot da página =====
  document.addEventListener("DOMContentLoaded", () => {
    preencherChipEvento();
    const evento = getEventoAtual();

    (async () => {
      // 1) Tenta buscar anexos na nuvem e sincronizar com o cache local
      await sincronizarDocsDaNuvem();

      // 2) Lê a lista atual (se a nuvem responder, já vem dela;
      //    se não responder, caímos pro que estiver no armazenamento local)
      const docs = getDocsUpload();

      // 3) Monta as 3 áreas da tela
      listarDocsEvento();
      renderPagamentos(evento, docs);
      renderDefinicoes(evento);

      try { window.lucide?.createIcons?.(); } catch(e) {}
    })();
  });
})();
