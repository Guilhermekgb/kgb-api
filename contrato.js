/* contrato.js */
(() => {
  const $ = (s, p = document) => p.querySelector(s);
  const qp = new URLSearchParams(location.search);
  const eventoId = qp.get("id");

  const safeJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const setJSON  = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  // === Limpa PDFs antigos guardados dentro de eventos/clientes (para evitar lotar localStorage) ===
  function limparPdfsAntigos() {
    try {
      let eventos = safeJSON("eventos", []);
      let alterou = false;
      eventos.forEach(ev => {
        if (Array.isArray(ev.documentos)) {
          ev.documentos.forEach(doc => {
            if (!doc) return;
            if (doc.dataUri || doc.pdfDataUri || doc.pdfBase64) {
              delete doc.dataUri;
              delete doc.pdfDataUri;
              delete doc.pdfBase64;
              alterou = true;
            }
          });
        }
      });
      if (alterou) {
        console.log("[Assinatura] Limpando PDFs antigos de eventos...");
        setJSON("eventos", eventos);
      }
    } catch (e) {
      console.warn("[Assinatura] Falha ao limpar PDFs antigos de eventos:", e);
    }

    try {
      let clientes = safeJSON("clientes", []);
      let alterou = false;
      clientes.forEach(cli => {
        if (Array.isArray(cli.documentos)) {
          cli.documentos.forEach(doc => {
            if (!doc) return;
            if (doc.dataUri || doc.pdfDataUri || doc.pdfBase64) {
              delete doc.dataUri;
              delete doc.pdfDataUri;
              delete doc.pdfBase64;
              alterou = true;
            }
          });
        }
      });
      if (alterou) {
        console.log("[Assinatura] Limpando PDFs antigos de clientes...");
        setJSON("clientes", clientes);
      }
    } catch (e) {
      console.warn("[Assinatura] Falha ao limpar PDFs antigos de clientes:", e);
    }
  }
  // Roda uma vez para apagar PDFs antigos dentro de eventos/clientes
  limparPdfsAntigos();

  // ===== Shim de toast (não quebra se não existir) =====
  if (!window.toast) {
    window.toast = {
      ok: (m) => alert(m),
      err: (m) => alert(m),
    };
  } else {
    if (typeof window.toast.ok !== 'function') window.toast.ok = (m)=>alert(m);
    if (typeof window.toast.err !== 'function') window.toast.err = (m)=>alert(m);
  }

  // ===== Backend helper com detecção automática (silenciosa) =====
  const API = {
    base: (() => {
      if (typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim()) return window.__API_BASE__.trim();
      try {
        const ls = localStorage.getItem('API_BASE') || '';
        if (ls) return ls.trim();
      } catch {}
      return null;
    })(),
    online: false
  };

  // === Base do microserviço de contratos + sender ===
  window.CONTRACTS_BASE = window.__CONTRACTS_BASE__ || window.CONTRACTS_BASE || 'https://kgb-contracts.onrender.com';

  async function sendToZapSign(payload){
    const base = (typeof window.CONTRACTS_BASE === 'string' && window.CONTRACTS_BASE) ? window.CONTRACTS_BASE : '';
    const url  = base.replace(/\/$/,'') + '/contracts/send';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      throw new Error('Falha ZapSign: HTTP ' + r.status + (txt ? ' — ' + txt : ''));
    }
    return r.json();
  }

  async function probeApiBase() {
    // Se não tiver base configurada, não tenta request nenhum → nenhum erro vermelho
    if (!API.base) { API.online = false; return; }
    try {
      const r = await fetch(`${API.base}/health`, { method: 'GET' });
      API.online = !!r.ok || r.status > 0;
    } catch {
      API.online = false;
    }
    if (!API.online) console.info('[Contratos] API offline — operando no modo local.');
  }

  // helper de requisição com suporte a query string
  async function handleRequest(path, { method = 'GET', body = undefined, qs = undefined } = {}) {
    if (!API.online || !API.base) return { data: null, status: 0 }; // modo local: no-op
    try {
      const u = new URL(API.base + path);
      if (qs && typeof qs === 'object') {
        Object.entries(qs).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
        });
      }
      const resp = await fetch(u.toString(), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method.toUpperCase() === 'GET' ? undefined : (body ? JSON.stringify(body) : undefined)
      });
      const out = await resp.json().catch(() => ({}));
      return { data: out?.data ?? out ?? null, status: resp.status };
    } catch (e) {
      return { data: null, status: 0, error: e?.message || String(e) };
    }
  }

  // ========= Variáveis/modelos util =========
  function __getVarsSeed() {
    try { return JSON.parse(localStorage.getItem('variaveis_modelos') || '[]'); }
    catch { return []; }
  }
  function __replaceVars(html, values = {}, useExemplos = true) {
    const vars = __getVarsSeed();
    const base = useExemplos ? Object.fromEntries(vars.map(v => [v.chave, v.exemplo || ''])) : {};
    const map = { ...base, ...values };
    for (const [k, v] of Object.entries(map)) {
      const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
      html = html.replace(re, v ?? '');
    }
    return html;
  }

  let MODELO_ATUAL_SLUG = "";
  let EVENTO = null;

  let assinouEmpresa = false, assinouCliente = false;
  let assinaturaEmpresaEm = null, assinaturaClienteEm = null;

  let CONTRATO_ATUAL = null;

  $("#hamburguer")?.addEventListener("click", () => {
    $("#menuLateral")?.classList.toggle("aberto");
  });
  document.addEventListener("DOMContentLoaded", () => { try { lucide.createIcons(); } catch {} });

  function seedModelosDemoSeNecessario(){
    const lista = safeJSON("modelos_documentos", []);
    if (Array.isArray(lista) && lista.length) return;
    localStorage.setItem('modelos_documentos', JSON.stringify([{ slug:'demo', nome:'Contrato simples (demo)' }]));
    localStorage.setItem('modelo_padrao_demo', [
      '<h2>Contrato do Evento: {{nomeEvento}}</h2>',
      '<p>Cliente: {{nomeCliente}} – {{emailCliente}} – WhatsApp: {{whatsappCliente}}</p>',
      '<p>Data: {{dataEvento}} • Local: {{localEvento}} • Convidados: {{qtdConvidados}}</p>',
      '<p>Cardápio: {{cardapio}}</p>',
      '<p>Contratada: {{empresaNome}} – {{empresaEmail}} – {{empresaWhats}}</p>'
    ].join('\n'));
  }

  function carregarEvento(){
    const eventos = safeJSON("eventos", []);
    EVENTO = eventos.find(e => String(e.id) === String(eventoId)) || null;
    if (!EVENTO) {
      $("#editorContrato").innerHTML = "<p style='color:#c00'>Evento não encontrado.</p>";
      desabilitarAcoes(true);
      return;
    }
    const empresa = safeJSON("empresa", {});
    $("#nomeEmpresaLbl").textContent = empresa?.nomeComercial || empresa?.razaoSocial || "Empresa";
    $("#nomeClienteLbl").textContent = EVENTO?.nomeCliente || "Cliente";
    atualizarAlerta();
  }

  function desabilitarAcoes(bloq){
    ["btnCarregarModelo","btnVisualizar","btnGerarESalvar","btnZapSign","btnWhatsapp","btnEmail","btnAssinarPresencial","btnSalvar","btnVerDocs"]
      .forEach(id => { const el = $("#"+id); if (el) el.disabled = !!bloq; });
  }

  // ===== Lista de modelos (Central / legados) =====
  const LEGACY_LIST_KEYS = ["lista_modelos_personalizados","modelos_docs"];
  const CONTENT_PREFIX = "modelo_";
  const mTime = (m)=> Number(m?.updatedAt||0) || 0;

  function getListaModelos(){
    const idx = safeJSON("modelos_index", []);
    if (Array.isArray(idx) && idx.length){
      return idx
        .filter(m => m && m.slug && m.nome)
        .sort((a,b)=>{ const dA = mTime(a), dB = mTime(b); if (dA !== dB) return dB - dA; return a.nome.localeCompare(b.nome, 'pt-BR'); });
    }
    const out = []; const seen = new Set();
    const add = (m)=>{ if (!m || !m.slug || !m.nome) return; if (seen.has(m.slug)) return; seen.add(m.slug); out.push({ slug:m.slug, nome:m.nome }); };
    const canonical = safeJSON("modelos_documentos", []); if (Array.isArray(canonical)) canonical.forEach(add);
    for (const key of LEGACY_LIST_KEYS){ const arr = safeJSON(key, []); if (Array.isArray(arr)) arr.forEach(add); }
    try{
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (k && k.startsWith(CONTENT_PREFIX)){
          const slug = k.slice(CONTENT_PREFIX.length);
          const nome = slug.replace(/_/g," ").replace(/\b\w/g, c => c.toUpperCase());
          add({ slug, nome });
        }
      }
    }catch{}
    out.sort((a,b)=> a.nome.localeCompare(b.nome,'pt-BR'));
    return out;
  }

  function popularSelectModelos(){
    const sel = $("#selModelo");
    const modelos = getListaModelos();
    sel.innerHTML =
      `<option value="" disabled selected>Selecione um modelo…</option>` +
      modelos.map(m => `<option value="${m.slug}">${m.nome}</option>`).join("");
  }

  function placeholders(){
    const ev = EVENTO || {};
    const empresa = safeJSON("empresa", {});
    const whats = (ev.telefoneCliente || ev.whatsappCliente || ev.whatsapp || "").replace(/\D/g,"");
    const base = {
      nomeCliente: ev.nomeCliente || ev.cliente || "",
      whatsappCliente: whats,
      emailCliente: ev.emailCliente || ev.email || "",
      nomeEvento: ev.nomeEvento || ev.titulo || "",
      tipoEvento: ev.tipoEvento || "",
      dataEvento: ev.data || ev.dataEvento || ev.dataDoEvento || "",
      horaEvento: ev.horarioEvento || "",
      localEvento: ev.local || ev.localEvento || "",
      qtdConvidados: ev.quantidadeConvidados || ev.qtdConvidados || "",
      cardapio: ev.cardapio || ev.cardapioSelecionado || ev.obsCardapio || "",
      empresaNome: empresa?.nomeComercial || empresa?.razaoSocial || "",
      empresaWhats: (empresa?.whatsapp || "").replace(/\D/g,""),
      empresaEmail: empresa?.email || ""
    };
    const map = {};
    Object.entries(base).forEach(([k,v]) => { map[`{{${k}}}`] = v ?? ""; });
    return { base, map };
  }

  function obterModeloContrato(slug){
    const mapsKeys = ["modelos_contrato","modelosContrato","kgb:modelos_contrato"];
    for (const key of mapsKeys){
      const map = safeJSON(key, null);
      if (map && map[slug]?.conteudo) return String(map[slug].conteudo);
    }
    const user   = localStorage.getItem(`modelo_${slug}`) || "";
    const padrao = localStorage.getItem(`modelo_padrao_${slug}`) || "";
    return (user.trim() || padrao.trim() || "");
  }

  function aplicarModelo(){
    const sel = $("#selModelo");
    if (!sel || !sel.value) { alert("Selecione um modelo."); return; }
    window.MODELO_ATUAL_SLUG = sel.value;

    const tpl = (typeof obterModeloContrato === "function") ? obterModeloContrato(window.MODELO_ATUAL_SLUG) : "";
    if (!tpl) { alert("Conteúdo do modelo não encontrado."); return; }

    // Evento + Empresa
    const eid = new URLSearchParams(location.search).get("id") || localStorage.getItem("eventoSelecionado") || "";
    let ev = {};
    try {
      const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
      ev = eventos.find(e => String(e.id) === String(eid)) || {};
    } catch {}
    let empresa = {};
    try { empresa = JSON.parse(localStorage.getItem("empresa") || "{}"); } catch {}

    // Helpers
    const pad2 = n => String(n).padStart(2, "0");
    const onlyDigits = s => String(s || "").replace(/\D/g, "");
    const hoje = new Date();
    const dataAtual = `${pad2(hoje.getDate())}/${pad2(hoje.getMonth()+1)}/${hoje.getFullYear()}`;
    const horaAtual = `${pad2(hoje.getHours())}:${pad2(hoje.getMinutes())}`;
    let usuarioAtual = "Usuário";
    try { usuarioAtual = JSON.parse(localStorage.getItem("usuarioLogado") || "{}")?.nome || "Usuário"; } catch {}

    // Itens → string
    function normalizaItens(ev){
      const cand = []
        .concat(Array.isArray(ev.itensSelecionados) ? ev.itensSelecionados : [])
        .concat(Array.isArray(ev.itensContratados) ? ev.itensContratados : [])
        .concat(Array.isArray(ev.servicosContratados) ? ev.servicosContratados : [])
        .concat(Array.isArray(ev.adicionaisContratados) ? ev.adicionaisContratados : []);
      if (!cand.length) return "";
      const toBRL = v => {
        const n = Number(v ?? 0) || Number(String(v).replace(/\./g,'').replace(',','.')) || 0;
        return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
      };
      const linhas = cand.map(x=>{
        const nome = x?.nome || x?.titulo || x?.item || "";
        const qtd  = x?.qtd ?? x?.quantidade ?? x?.qte ?? "";
        const val  = x?.valor ?? x?.preco ?? x?.preço ?? "";
        const pedacos = [];
        if (nome) pedacos.push(String(nome));
        if (qtd) pedacos.push(`Qtd: ${qtd}`);
        if (val) pedacos.push(toBRL(val));
        return pedacos.join(" — ");
      }).filter(Boolean);
      return linhas.join(" • ");
    }

    function somaEntradas(ev){
      const listas = []
        .concat(Array.isArray(ev.entradas) ? ev.entradas : [])
        .concat(Array.isArray(ev.financeiro?.entradas) ? ev.financeiro.entradas : [])
        .concat(Array.isArray(ev.financeiroEvento?.entradas) ? ev.financeiroEvento.entradas : []);
      if (!listas.length) return 0;
      return listas.reduce((acc, cur)=>{
        const bruto = (cur?.valor != null ? cur.valor : cur?.v);
        const num = typeof bruto === "number"
          ? bruto
          : (Number(String(bruto || "0").replace(/\s/g,'').replace(/\./g,'').replace(',','.')) || 0);
        return acc + num;
      }, 0);
    }

    const values = {
      // Cliente
      nomeCliente: ev.nomeCliente || ev.cliente || "",
      enderecoCliente: ev.enderecoCliente || ev.endereco || ev.logradouroCliente || ev.clienteEndereco || "",
      rgCliente: ev.rgCliente || ev.rg || "",
      cpfCliente: ev.cpfCliente || ev.cpf || "",
      whatsappCliente: onlyDigits(ev.telefoneCliente || ev.whatsappCliente || ev.whatsapp || ""),
      emailCliente: ev.emailCliente || ev.email || "",

      // Evento
      nomeEvento: ev.nomeEvento || ev.titulo || "",
      tipoEvento: ev.tipoEvento || "",
      dataEvento: ev.data || ev.dataEvento || ev.dataDoEvento || "",
      horarioInicioEvento: ev.horarioInicio || ev.horaInicio || ev.inicio || "",
      horarioTerminoEvento: ev.horarioTermino || ev.horaTermino || ev.termino || ev.fim || "",
      horaEvento: ev.horarioEvento || ev.horaEvento || "",
      localEvento: ev.local || ev.localEvento || "",
      qtdConvidados: ev.quantidadeConvidados || ev.qtdConvidados || "",
      cardapio: ev.cardapio || ev.cardapioSelecionado || ev.obsCardapio || "",

      // Empresa
      empresaNome: (empresa.nomeComercial || empresa.razaoSocial || ""),
      empresaEmail: (empresa.email || ""),
      empresaWhats: onlyDigits(empresa.whatsapp || ""),

      // Sistema
      dataAtual, horaAtual,
      usuarioAtual,

      // Contrato/Financeiro
      numeroContrato: ev.numeroContrato || ev.contratoNumero || "",
      dataAssinatura: ev.dataAssinatura || "",
      referente: ev.referente || "",
      valorTotal: ev.valorContrato || ev.totalContrato || (ev?.financeiro?.contrato?.total ?? ""),
      formaPagamento: ev.formaPagamento || "",
      parcelas: ev.parcelas || "",
      valorParcela: ev.valorParcela || "",

      // Novos
      itensContratados: normalizaItens(ev),
      valorEntrada: somaEntradas(ev)
    };

    // Fallback exemplos
    let exemplosArr = [];
    try { exemplosArr = JSON.parse(localStorage.getItem("variaveis_modelos") || "[]"); } catch {}
    const exemplosMap = Object.fromEntries(exemplosArr.map(v => [v.chave, v.exemplo || ""]));

    // Tokens
    const tokens = Array.from(new Set(
      Array.from(tpl.matchAll(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g)).map(m => m[1])
    ));
    const getDeep = (obj, path) => path?.split('.').reduce((a,k)=>(a?.[k]), undefined) ?? undefined;

    let html = tpl;
    for (const key of tokens) {
      let val = (key in values ? values[key] : undefined);
      if (val === undefined) val = getDeep(ev, key);
      if (val === undefined) val = getDeep(empresa, key);
      if (val === undefined) val = (key in exemplosMap) ? exemplosMap[key] : "";

      if (["valorEntrada","valorParcela","valorTotal"].includes(key)) {
        if (typeof val === "number") val = val.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
        else if (typeof val === "string" && /^[\d\s.,]+$/.test(val)) {
          const num = Number(val.replace(/\s/g,'').replace(/\./g,'').replace(',','.'));
          if (!isNaN(num)) val = num.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
        }
      }
      const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`{{\\s*${esc}\\s*}}`, 'g'), val ?? "");
    }

    // Bloco de assinaturas, se faltar
    if (!/data-assinaturas-bloco/.test(html)) {
      const nomeEmp = values.empresaNome || getDeep(empresa,'nomeComercial') || getDeep(empresa,'razaoSocial') || "Empresa";
      const nomeCli = values.nomeCliente || getDeep(ev,'nomeCliente') || getDeep(ev,'cliente') || "Cliente";
      html += [
        '<div class="bloco-assinaturas" data-assinaturas-bloco>',
        '  <div class="assinatura-slot" data-slot="empresa">',
        `    <div class="assinatura-label">Assinatura da Contratada — ${nomeEmp}</div>`,
        '    <div class="linha">______________________________</div>',
        '  </div>',
        '  <div class="assinatura-slot" data-slot="cliente">',
        `    <div class="assinatura-label">Assinatura do Cliente — ${nomeCli}</div>`,
        '    <div class="linha">______________________________</div>',
        '  </div>',
        '</div>'
      ].join("\n");
    }

    $("#editorContrato").innerHTML = html;
    try { window.lucide?.createIcons?.(); } catch {}
  }

  function visualizarContrato(){
    const w = window.open("", "_blank");
    const css = [
      '<style>',
      "  body { font-family: 'Playfair Display', serif; line-height:1.45; padding:28px; max-width:800px; margin:auto; color:#2b211a; }",
      '  h1,h2,h3 { margin-top:0; }',
      '  hr { margin:24px 0; }',
      '</style>'
    ].join('\n');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${$("#editorContrato").innerHTML}</body></html>`);
    w.document.close();
  }

  // === Nome do PDF (Contrato / Adendo) — padronizado
  function nomePdf(tipo, adendoSeq){
    const slug = (s) => String(s||'').toString().replace(/[^\w\-\.]+/g,"_");
    const nomeEvt = slug((EVENTO?.nomeEvento || EVENTO?.titulo || "Evento"));
    const idEvt = String(eventoId || '').trim();
    if (String(tipo).toLowerCase() === 'adendo'){
      const nn = String(adendoSeq || 1).padStart(2,'0');
      return `Adendo_${nn}_${nomeEvt}_${idEvt}.pdf`;
    }
    return `Contrato_${nomeEvt}_${idEvt}.pdf`;
  }
  // === NOVO: gerar PDF a partir do conteúdo do editor ===
// retorna { dataUri, nome } e, se "baixar" for true, dispara o download
async function gerarPdfDataUri(baixar, tipo, adendoSeq) {
  const editor = document.querySelector('#editorContrato');
  if (!editor) {
    alert('Área do contrato (#editorContrato) não encontrada.');
    throw new Error('editorContrato não encontrado');
  }

  // Nome do arquivo (Contrato_... ou Adendo_...)
  const nomeArquivo = nomePdf(tipo || 'contrato', adendoSeq);

  // Criamos um contêiner só para o html2pdf (não mexe no editor da tela)
  const area = document.createElement('div');

  // Largura pensada para A4 (210mm) menos margens
  // Isso ajuda a não “explodir” o conteúdo pra fora da página
  area.style.width = '190mm';          // área útil
  area.style.maxWidth = '190mm';
  area.style.margin = '0 auto';

  // Estilo de texto
  area.style.padding = '15mm 15mm';
  area.style.fontFamily = "'Playfair Display', serif";
  area.style.fontSize = '12pt';
  area.style.lineHeight = '1.4';
  area.style.color = '#2b211a';

  // Regras para melhorar a quebra de página
  const style = document.createElement('style');
  style.textContent = `
    /* Evita cortes muito feios dentro de blocos grandes */
    p, h1, h2, h3, h4, h5, h6 {
      page-break-inside: avoid;
      break-inside: avoid-page;
    }
    .no-break {
      page-break-inside: avoid;
      break-inside: avoid-page;
    }
    /* Remove margens exageradas que estouram a página */
    body, html {
      margin: 0;
      padding: 0;
    }
  `;
  area.appendChild(style);

  // Copia o conteúdo do editor
  const wrapper = document.createElement('div');
  wrapper.innerHTML = editor.innerHTML;
  area.appendChild(wrapper);

  const opt = {
    margin:       [10, 10, 15, 10], // [top, left, bottom, right] em mm
    filename:     nomeArquivo,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  {
      scale: 2,
      useCORS: true,
      scrollY: 0       // importante para não “repetir” pedaços entre páginas
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    {
      mode: ['css', 'legacy'] // usa as regras de CSS (page-break / break-inside)
    }
  };

  // Gera o PDF como dataURL (uma vez só)
  const worker  = window.html2pdf().set(opt).from(area);
  const dataUri = await worker.outputPdf('datauristring');

  // Se for para baixar, usamos o próprio dataUri
  if (baixar) {
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return { dataUri, nome: nomeArquivo };
}


  // === Helper moeda BRL (seguro p/ string/number) ===
  function fmtBRL(v){
    if (typeof v === 'number') return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const num = Number(String(v ?? '0').replace(/\s/g,'').replace(/\./g,'').replace(',','.')) || 0;
    return num.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  // === Mapeamento de variáveis padrão (preenche modelo de contrato) ===
  function preencherTemplateContrato(html){
    if (!EVENTO) return html;

    // Normaliza acesso
    const cliente = EVENTO.cliente || {};
    const financeiro = EVENTO.financeiro || {};
    const local = EVENTO.local || {};

    // Dicionário de substituições padrão
    const vars = {
      NOME_CLIENTE: cliente.nome || EVENTO.nomeCliente || '',
      RG_CLIENTE: cliente.rg || EVENTO.rgCliente || '',
      CPF_CNPJ_CLIENTE: cliente.cpf || cliente.cnpj || EVENTO.cpfCliente || '',
      ENDERECO_CLIENTE: cliente.endereco || EVENTO.enderecoCliente || '',
      TELEFONE_CLIENTE: cliente.telefone || EVENTO.telefoneCliente || '',
      EMAIL_CLIENTE: cliente.email || EVENTO.emailCliente || '',
      ITENS_CONTRATADOS: (EVENTO.itensContratados || EVENTO.cardapioSelecionado || []).join(', '),
      VALOR_CONTRATO: fmtBRL(EVENTO.valorTotal || financeiro.total || 0),
      VALOR_ENTRADA: fmtBRL(financeiro.valorEntrada || 0),
      FORMA_PAGAMENTO_ENTRADA: financeiro.formaEntrada || '',
      DATA_EVENTO: EVENTO.dataEvento || EVENTO.data || '',
      HORA_EVENTO: EVENTO.horaEvento || '',
      LOCAL_EVENTO: local.nome || EVENTO.localEvento || '',
      ENDERECO_EVENTO: local.endereco || '',
    };

    // Faz a substituição (insensível a maiúsculas/minúsculas)
    let out = html;
    for (const [k,v] of Object.entries(vars)){
      const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`,'gi');
      out = out.replace(re, v ?? '');
    }

    return out;
  }


  function setChipOk(el, ok){
    if (!el) return;
    el.classList.toggle("ok", !!ok);
    // Garante que o ".dot" existe
    let dot = el.querySelector(".dot");
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "dot";
      el.prepend(dot);
    }
    dot.style.background = ok ? "#10b981" : "#8f7b6c";
  }

  function atualizarChipsEnvio(){
    const el = document.querySelector("#chipStatus");
    if (!el) return;
    const st = (CONTRATO_ATUAL?.status || "rascunho").toLowerCase();
    el.innerHTML = `<span class="dot"></span> ${st}`;
    setChipOk(el, st === "assinado");
  }

  function atualizarAlerta(){
    const alerta = $("#alertaAss");
    const badge = $("#badgeQuem");
    const cEmp = $("#chipEmpresa"), cCli = $("#chipCliente");
    const pendEmp = !assinouEmpresa;
    const pendCli = !assinouCliente;

    cEmp.innerHTML = `<span class="dot"></span> Empresa: ${pendEmp ? "pendente" : "ok"}`;
    cCli.innerHTML = `<span class="dot"></span> Cliente: ${pendCli ? "pendente" : "ok"}`;
    setChipOk(cEmp, !pendEmp);
    setChipOk(cCli, !pendCli);

    if (pendEmp || pendCli) {
      alerta.classList.remove("ok"); alerta.classList.add("info");
      alerta.style.display = "block";
      badge.textContent = pendEmp && pendCli ? "Empresa e Cliente" : (pendEmp ? "Empresa" : "Cliente");
      if (alerta.childNodes[0]?.nodeType === Node.TEXT_NODE) alerta.childNodes[0].textContent = "Pendente de assinaturas";
      else alerta.prepend(document.createTextNode("Pendente de assinaturas"));
    } else {
      alerta.classList.remove("info"); alerta.classList.add("ok");
      alerta.style.display = "block"; badge.textContent = "Completo";
      if (alerta.childNodes[0]?.nodeType === Node.TEXT_NODE) alerta.childNodes[0].textContent = "Assinaturas concluídas";
      else alerta.prepend(document.createTextNode("Assinaturas concluídas"));
    }
  }
    // === Documentos manuais (uploads de PDF por evento) — NUVEM + fallback local ===
  const docsKey = (id) => `docs_evento_${id || "sem_id"}`;
  const DOCS_CACHE = {};

  
  function docsKeyAtual() {
    return docsKey(eventoId);
  }

  // Lê lista de documentos do evento atual
  // 1) se vier da nuvem, fica em DOCS_CACHE
  // 2) se não tiver cache, tenta o localStorage (modo antigo)
  function getDocsUpload() {
    const key = docsKeyAtual();

    if (Array.isArray(DOCS_CACHE[key])) {
      return DOCS_CACHE[key];
    }

    // Modo antigo: busca no localStorage
    const raw = safeJSON(key, null);
    if (Array.isArray(raw)) {
      DOCS_CACHE[key] = raw;
      return raw;
    }

    return [];
  }

  // Atualiza cache + localStorage (usado no fallback antigo)
  function setDocsUpload(docs) {
    const key = docsKeyAtual();
    DOCS_CACHE[key] = docs || [];
    try {
      setJSON(key, DOCS_CACHE[key]);
    } catch (e) {
      console.warn("[Contratos] Falha ao salvar PDFs no localStorage (provavelmente cheio):", e);
    }
  }

  // Carrega lista da NUVEM (se API estiver online)
async function carregarDocsDaNuvem() {
  if (!API.base || !API.online) return;
  try {
    const { data, status } = await handleRequest(
      `/eventos/${eventoId}/docs-upload`,
      { method: 'GET' }
    );

    if (status === 200 && Array.isArray(data)) {
      const key = docsKeyAtual();
      DOCS_CACHE[key] = data;
    }
  } catch (e) {
    console.warn("[Contratos] Não foi possível carregar documentos da nuvem:", e);
  }
}


  // Salva um novo PDF (tenta nuvem; se não der, volta pro modo antigo localStorage)
  async function salvarDocUpload(file) {
    if (!file) return;

    // 1) Tenta enviar para a nuvem
    if (API.base && API.online) {
      try {
        const form = new FormData();
        form.append('file', file);

        const url = API.base.replace(/\/$/, '') + `/eventos/${encodeURIComponent(eventoId)}/docs-upload`;
        const resp = await fetch(url, { method: 'POST', body: form });
        const out = await resp.json().catch(() => ({}));

        if (resp.ok && out && out.data) {
          // Recarrega da nuvem e encerra
          await carregarDocsDaNuvem();
          return;
        }

        if (out && out.error === 'storage_desativado') {
          console.warn('[Contratos] Storage desativado no backend — usando fallback local.');
        } else {
          console.warn('[Contratos] Erro ao enviar PDF para nuvem — usando fallback local:', out);
        }
      } catch (e) {
        console.warn('[Contratos] Falha ao conectar na API de upload — usando fallback local:', e);
      }
    }

    // 2) Fallback: comportamento antigo usando localStorage (dataUri)
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result;
        if (!dataUri) { resolve(); return; }

        const docs = getDocsUpload();
        const doc = {
          id: `doc_${Date.now()}`,
          nome: file.name || "Documento.pdf",
          dataUri,
          criadoEm: new Date().toISOString()
        };
        setDocsUpload([ ...(docs || []), doc ]);
        resolve();
      };
      reader.onerror = () => resolve();
      reader.readAsDataURL(file);
    });
  }

  // Abre um documento pelo id
  async function abrirDocUpload(docId) {
    const docs = getDocsUpload();
    const doc = docs.find(d => String(d.id) === String(docId));

    if (!doc) {
      alert("Não foi possível abrir este documento (não encontrado).");
      return;
    }

    // Se veio da nuvem, usa URL direto
    if (doc.url) {
      window.open(doc.url, "_blank", "noopener");
      return;
    }

    // Fallback antigo (dataUri em localStorage)
    if (!doc.dataUri) {
      alert("Não foi possível abrir este documento (PDF não encontrado).");
      return;
    }

    try {
      const partes = String(doc.dataUri).split(",");
      if (partes.length < 2) {
        alert("Formato de PDF inválido.");
        return;
      }

      const base64 = partes[1];
      const binario = atob(base64);
      const len = binario.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binario.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      // a.download = doc.nome || "Documento.pdf"; // se quiser forçar download

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      console.error("Erro ao abrir PDF:", e);
      alert("Não foi possível abrir o PDF. Tente anexar novamente.");
    }
  }

  // Remove um documento
  async function apagarDocUpload(docId) {
    if (!docId) return;

    const docsAtuais = getDocsUpload();
    const doc = docsAtuais.find(d => String(d.id) === String(docId));

    // Se temos um doc com URL (nuvem) e API configurada, tenta excluir na API
    if (doc && doc.url && API.base && API.online) {
      try {
        const url = API.base.replace(/\/$/, '') +
          `/eventos/${encodeURIComponent(eventoId)}/docs-upload/${encodeURIComponent(docId)}`;
        await fetch(url, { method: 'DELETE' });
      } catch (e) {
        console.warn('[Contratos] Erro ao remover documento na nuvem:', e);
      }
    }

    // Atualiza lista em memória / localStorage (modo antigo)
    let docs = getDocsUpload();
    docs = docs.filter(d => String(d.id) !== String(docId));
    setDocsUpload(docs);
  }

  // Mostra lista no painel "Documentos"
  async function listarDocsUploads() {
    const wrap = document.querySelector("#listaDocs");
    if (!wrap) return;

    // Tenta carregar da nuvem (se possível)
    await carregarDocsDaNuvem();

    const docs = getDocsUpload();

    if (!docs.length) {
      wrap.innerHTML = '<em>Nenhum documento ainda.</em>';
      wrap.style.display = "block";
      return;
    }

    const html = docs.map(d => `
      <div class="linha base" data-doc-id="${d.id}" style="display:flex;align-items:center;gap:8px;">
        <span style="cursor:pointer;flex:1;">📎 ${d.nome || 'Documento.pdf'}</span>
        <button type="button" class="btnDelDoc" data-doc-id="${d.id}" style="border:none;background:#f5f5f5;border-radius:4px;padding:2px 6px;cursor:pointer;">🗑</button>
      </div>
    `).join("");

    wrap.innerHTML = html;
    wrap.style.display = "block";

    // Clique no nome → abre o PDF
    wrap.querySelectorAll(".linha.base span").forEach(span => {
      span.addEventListener("click", () => {
        const id = span.parentElement.getAttribute("data-doc-id");
        if (id) abrirDocUpload(id);
      });
    });

    // Clique na lixeira → exclui
    wrap.querySelectorAll(".btnDelDoc").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute("data-doc-id");
        if (id && confirm("Remover este documento?")) {
          await apagarDocUpload(id);
          await listarDocsUploads();
        }
      });
    });
  }

  
  // === Salvar (apenas gerar o PDF, sem mexer nos Documentos) ===
  async function salvarTudo(baixar) {
    if (!EVENTO) {
      alert("Evento não encontrado.");
      return;
    }

    // Descobre se é contrato ou adendo só para usar o nome certinho
    const ehAdendo = /\badendo\b/i.test($("#selModelo")?.selectedOptions?.[0]?.text || "");
    const tipo = ehAdendo ? "adendo" : "contrato";

    // Gera o PDF (se baixar=true, já baixa o arquivo)
    await gerarPdfDataUri(!!baixar, tipo, null);

    if (baixar) {
      window.toast?.ok?.("PDF gerado e baixado.");
    } else {
      window.toast?.ok?.("Contrato salvo (sem histórico automático de PDF).");
    }
  }

    // Último link de assinatura gerado (usado nos botões de WhatsApp/E-mail)
  window.ULTIMO_LINK_ASSINATURA = window.ULTIMO_LINK_ASSINATURA || null;

  function abrirWhatsapp(){
    const nomeEvt = EVENTO?.nomeEvento || EVENTO?.titulo || "evento";
    let msg = `Olá! Segue o contrato do ${nomeEvt}.`;

    if (window.ULTIMO_LINK_ASSINATURA) {
      msg += `\n\nLink para assinatura eletrônica:\n${window.ULTIMO_LINK_ASSINATURA}`;
    }

    const tel = (EVENTO?.whatsappCliente || EVENTO?.whatsapp || "").replace(/\D/g,"");
    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(url, "_blank");
  }

  function abrirEmail(){
    const nomeEvt = EVENTO?.nomeEvento || EVENTO?.titulo || "evento";
    const assunto = `Contrato do ${nomeEvt}`;

    let corpo = `Olá! Segue o contrato do ${nomeEvt}.`;
    if (window.ULTIMO_LINK_ASSINATURA) {
      corpo += `\n\nLink para assinatura eletrônica:\n${window.ULTIMO_LINK_ASSINATURA}`;
    }

    const mail = (EVENTO?.emailCliente || EVENTO?.email || "").trim();
    location.href = `mailto:${encodeURIComponent(mail)}`
      + `?subject=${encodeURIComponent(assunto)}`
      + `&body=${encodeURIComponent(corpo)}`;
  }

     // === NOVO: gerar link de assinatura simples (mandando dados do cliente/evento) ===
    // === NOVO: gerar link de assinatura simples (mandando dados do cliente/evento, inclusive CPF/RG/endereço) ===
    // === NOVO: gerar link de assinatura usando o BACKEND ===
  async function gerarLinkAssinatura() {
    try {
      if (!EVENTO) {
        alert("Evento não encontrado. Abra o contrato a partir de um evento válido.");
        return;
      }

      if (!eventoId) {
        alert("ID do evento ausente na URL.");
        return;
      }

      const editor = document.querySelector("#editorContrato");
      if (!editor) {
        alert("editorContrato não encontrado na página.");
        return;
      }

      const htmlContrato = editor.innerHTML;
      if (!htmlContrato || !htmlContrato.trim()) {
        const prosseguir = confirm("O contrato está em branco. Deseja mesmo gerar um link de assinatura?");
        if (!prosseguir) return;
      }

      // Helpers de base (nome, email, data, local…)
      const { base } = placeholders();

      // === PEGAR DADOS COMPLETOS DO CLIENTE (igual já fazia antes) ===
      let cli = EVENTO.cliente || null;

      if (!cli) {
        const clientes = safeJSON("clientes", []);
        const byId = EVENTO.clienteId
          ? clientes.find(c => String(c.id) === String(EVENTO.clienteId))
          : null;

        const byNome = !byId && EVENTO.nomeCliente
          ? clientes.find(c =>
              String(c.nome || "").trim().toLowerCase() ===
              String(EVENTO.nomeCliente || "").trim().toLowerCase()
            )
          : null;

        cli = byId || byNome || {};
      }

      // Monta endereço em texto, se tiver
      const endCli = cli.endereco || {};
      let enderecoStr =
        cli.enderecoCliente ||
        EVENTO.enderecoCliente ||
        "";

      if (!enderecoStr) {
        const partes = [];
        const rua = endCli.rua || endCli.logradouro || "";
        const numero = endCli.numero || "";
        const bairro = endCli.bairro || "";
        const cidade = endCli.cidade || "";
        const uf = endCli.uf || endCli.estado || "";

        if (rua) {
          partes.push(rua);
          if (numero) partes[0] += ", " + numero;
        }
        if (bairro) partes.push(bairro);
        if (cidade || uf) {
          partes.push([cidade, uf].filter(Boolean).join(" / "));
        }
        enderecoStr = partes.join(" - ");
      }

      // Converte data iso (2026-01-28) -> 28/01/2026
      const paraDataBR = (s) => {
        if (!s) return "";
        const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return s;
        const [, ano, mes, dia] = m;
        return `${dia}/${mes}/${ano}`;
      };

      const dataEvIso =
        base.dataEvento ||
        EVENTO.dataEvento ||
        EVENTO.data ||
        "";

      const dadosCliente = {
        nome: base.nomeCliente || cli.nome || "",
        cpf: cli.cpf || EVENTO.cpfCliente || "",
        rg:  cli.rg  || EVENTO.rgCliente  || "",
        email: base.emailCliente || cli.email || "",
        whatsapp:
          cli.whatsapp ||
          base.whatsappCliente ||
          EVENTO.whatsappCliente ||
          EVENTO.telefoneCliente ||
          "",
        dataEvento: paraDataBR(dataEvIso),
        horaEvento: base.horaEvento || EVENTO.horarioEvento || "",
        localEvento: base.localEvento || EVENTO.local || EVENTO.localEvento || "",
        enderecoCliente: enderecoStr
      };

      // Monta payload para o backend
      const body = {
        eventoId: String(eventoId),
        contratoHtml: htmlContrato,
        dadosCliente
      };

      // Usa a helper handleRequest (já existe no topo do arquivo)
      const { data, status, error } = await handleRequest('/api/assinaturas/contratos', {
        method: 'POST',
        body
      });

      if (!data || !data.token || !(status === 200 || status === 201)) {
        console.error('[Assinatura] Falha ao criar registro no backend:', status, error, data);
        alert('Não foi possível criar o link de assinatura no servidor. Verifique se o backend está online (API_BASE).');
        return;
      }

      const token = data.token;

      // Monta o link público (assinatura.html na mesma pasta do contrato.html)
      const baseUrl = window.location.origin + window.location.pathname.replace(/contrato\.html.*$/i, "");
      const link = baseUrl.replace(/\/$/, "") + "/assinatura.html?token=" + encodeURIComponent(token);

      window.ULTIMO_LINK_ASSINATURA = link;

      prompt("Link de assinatura gerado. Copie e envie para o cliente:", link);
      console.log("[Assinatura] Link gerado:", link, "payload enviado:", body);
      window.toast.ok("Link de assinatura gerado. Use os botões de WhatsApp/E-mail para enviar.");

    } catch (e) {
      console.error("[Assinatura] erro ao gerar link:", e);
      alert("Erro ao gerar link de assinatura. Veja o console para mais detalhes.");
    }
  }

   // Assinatura presencial
  function setupPad(canvasSel){
    const canvas = $(canvasSel);
    const ctx = canvas.getContext("2d");
    let desenhando=false, last=null;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    };
    requestAnimationFrame(resize);
    window.addEventListener("resize", resize);

    const pos = e => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const start = e => { desenhando=true; last=pos(e); e.preventDefault(); };
    const move  = e => { if(!desenhando) return; const p=pos(e); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; e.preventDefault(); };
    const end   = () => { desenhando=false; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, {passive:false});
    canvas.addEventListener("touchmove",  move,  {passive:false});
    window.addEventListener("touchend",   end);

    return {
      clear(){ ctx.clearRect(0,0,canvas.width,canvas.height); requestAnimationFrame(resize); },
      toDataURL(){ return canvas.toDataURL("image/png"); }
    };
  }
  function inserirAssinatura(dataUrl, quem){
    const bloco = document.querySelector('[data-assinaturas-bloco]');
    if (!bloco) return alert("Bloco de assinaturas não encontrado no contrato.");
    const slot = bloco.querySelector(`[data-slot="${quem}"]`) || bloco;

    slot.querySelector(".linha")?.remove();
    slot.querySelectorAll("img.assinatura-img").forEach(img => img.remove());
    slot.querySelectorAll(".assinatura-carimbo").forEach(c => c.remove());

    const img = new Image();
    img.src = dataUrl;
    img.className = "assinatura-img";
    img.alt = `Assinatura ${quem}`;
    slot.appendChild(img);

    const carimbo = document.createElement("div");
    carimbo.className = "assinatura-carimbo";
    const agora = new Date();
    carimbo.textContent = `Assinado em ${agora.toLocaleString('pt-BR')}`;
    slot.appendChild(carimbo);

    if (quem === "empresa") { assinouEmpresa = true; assinaturaEmpresaEm = agora.toISOString(); }
    else { assinouCliente = true; assinaturaClienteEm = agora.toISOString(); }

    atualizarAlerta();
    if (assinouEmpresa && assinouCliente) salvarTudo(false);
  }
  function habilitarAssinatura(){
    $("#boxAssinatura").hidden = false;
    const padEmp = setupPad("#padEmpresa");
    const padCli = setupPad("#padCliente");
    $("#limparEmpresa").onclick  = () => padEmp.clear();
    $("#limparCliente").onclick  = () => padCli.clear();
    $("#inserirEmpresa").onclick = () => inserirAssinatura(padEmp.toDataURL(), "empresa");
    $("#inserirCliente").onclick = () => inserirAssinatura(padCli.toDataURL(), "cliente");
  }

  // ===== Carregar contrato atual (sem erro se API vazia) =====
  async function carregarContratoAtual(){
    try {
      await probeApiBase(); // se __API_BASE__ vazio, não faz fetch nenhum
      if (API.online) {
        // GET com query string
        const res = await handleRequest('/contratos', { method:'GET', qs:{ eventoId } });
        CONTRATO_ATUAL = (res?.data || [])[0] || null;
      } else if (window.ZapSignClient?.listarPorEvento) {
        const lista = await window.ZapSignClient.listarPorEvento(eventoId);
        CONTRATO_ATUAL = (lista || [])[0] || null;
      } else {
        CONTRATO_ATUAL = null;
      }
      atualizarChipsEnvio();
    } catch {
      CONTRATO_ATUAL = null;
      atualizarChipsEnvio();
    }
  }

  // Polling de status (só se API estiver configurada e online)
  async function atualizarStatusDoBackend(){
    try{
      if (!API.online || !CONTRATO_ATUAL?.id) return;
      const r = await handleRequest('/contratos/status', { method:'GET', qs:{ id: CONTRATO_ATUAL.id } });
      if (!r?.data) return;
      CONTRATO_ATUAL.status = r.data.status || CONTRATO_ATUAL.status;
      atualizarChipsEnvio();
    }catch{}
  }
  setInterval(atualizarStatusDoBackend, 15000);

  
document.addEventListener("DOMContentLoaded", async () => {
  seedModelosDemoSeNecessario();
  carregarEvento();
  popularSelectModelos();
  await probeApiBase(); // com __API_BASE__='', não faz rede
  await carregarContratoAtual();

  $("#selModelo")?.addEventListener("change", (e) => {
    MODELO_ATUAL_SLUG = e.target.value;
  });

  $("#btnCarregarModelo")?.addEventListener("click", aplicarModelo);

  $("#btnVisualizar")?.addEventListener("click", visualizarContrato);
  $("#btnGerarESalvar")?.addEventListener("click", () => salvarTudo(true)); // faz download do PDF

  // NOVO: gerar link de assinatura simples
  $("#btnZapSign")?.addEventListener("click", gerarLinkAssinatura);
  $("#btnWhatsapp")?.addEventListener("click", abrirWhatsapp);
  $("#btnEmail")?.addEventListener("click", abrirEmail);
  $("#btnAssinarPresencial")?.addEventListener("click", habilitarAssinatura);
  $("#btnSalvar")?.addEventListener("click", () => salvarTudo(false)); // salva só metadados

  // Botão DOCUMENTOS → lista os PDFs do evento
  $("#btnVerDocs")?.addEventListener("click", listarDocsUploads);

  // Botão ANEXAR PDF
  const btnUploadPdf = $("#btnUploadPdf");
  const inputUploadPdf = $("#inputUploadPdf");

  if (btnUploadPdf && inputUploadPdf) {
    // Abre o seletor de arquivos
    btnUploadPdf.addEventListener("click", () => {
      inputUploadPdf.click();
    });

    // Quando o arquivo for escolhido
    inputUploadPdf.addEventListener("change", async () => {
      const file = inputUploadPdf.files?.[0];
      if (!file) return;

      if (file.type !== "application/pdf") {
        alert("Por favor, selecione um arquivo PDF.");
        inputUploadPdf.value = "";
        return;
      }

      try {
        await salvarDocUpload(file);
        await listarDocsUploads();

        try {
          window.toast?.ok?.("PDF anexado em Documentos.");
        } catch {
          alert("PDF anexado em Documentos.");
        }
      } catch (e) {
        console.error("Erro ao anexar PDF:", e);
        alert("Não foi possível anexar o PDF.");
      } finally {
        // limpa o input pra permitir anexar o mesmo arquivo de novo se precisar
        inputUploadPdf.value = "";
      }
    });
  }
});

})();

