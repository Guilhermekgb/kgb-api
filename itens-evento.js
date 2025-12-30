// === CONFIG API / EVENTOS (NUVEM) PARA ITENS DO EVENTO ===
const IS_REMOTE = !!(window.__API_BASE__ && String(window.__API_BASE__).trim());

function callApi(endpoint, method = 'GET', body = {}) {
  return import('./api/routes.js').then(({ handleRequest }) =>
    new Promise(resolve => handleRequest(endpoint, { method, body }, resolve))
  );
}

// Carrega um evento do backend (com fallback para o localStorage)
async function carregarEventoDoBackend(evId) {
  if (!evId) return null;

  if (!IS_REMOTE) {
    // modo antigo: só local
    try {
      const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
      return eventos.find(e => String(e.id) === String(evId)) || null;
    } catch {
      return null;
    }
  }

  try {
    const resp = await callApi(`/eventos/${encodeURIComponent(evId)}`, 'GET', {});
    const evento = resp?.data || resp;

    // Atualiza cache local
    try {
      const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
      const idx = eventos.findIndex(e => String(e.id) === String(evento.id));
      if (idx > -1) eventos[idx] = evento; else eventos.push(evento);
      localStorage.setItem("eventos", JSON.stringify(eventos));
    } catch {}

    return evento;
  } catch (err) {
    console.warn('[itens-evento] Falha ao carregar evento da API, usando cache local', err);
    try {
      const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
      return eventos.find(e => String(e.id) === String(evId)) || null;
    } catch {
      return null;
    }
  }
}

// Salva o evento no backend (e mantém o cache do navegador atualizado)
async function salvarEventoNoBackend(evAtualizado) {
  if (!evAtualizado || !evAtualizado.id) return evAtualizado;

  // 1) Atualiza cache local primeiro
  try {
    const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
    const idx = eventos.findIndex(e => String(e.id) === String(evAtualizado.id));
    if (idx > -1) eventos[idx] = evAtualizado; else eventos.push(evAtualizado);
    localStorage.setItem("eventos", JSON.stringify(eventos));
  } catch {}

  // 2) Se não tiver API, para por aqui mesmo
  if (!IS_REMOTE) {
    return evAtualizado;
  }

  // 3) Tenta salvar na nuvem
  try {
    const resp = await callApi(`/eventos/${encodeURIComponent(evAtualizado.id)}`, 'PUT', evAtualizado);
    const fromApi = resp?.data || evAtualizado;

    // reforça cache com o que veio da API
    try {
      const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
      const idx = eventos.findIndex(e => String(e.id) === String(fromApi.id));
      if (idx > -1) eventos[idx] = fromApi; else eventos.push(fromApi);
      localStorage.setItem("eventos", JSON.stringify(eventos));
    } catch {}

    return fromApi;
  } catch (err) {
    console.error('[itens-evento] Erro ao salvar evento na API', err);
    alert('Não foi possível salvar os itens na nuvem agora. As alterações ficaram salvas neste navegador.');
    return evAtualizado;
  }
}

// === SALVAR SELEÇÃO DO ITENS-EVENTO → helpers ===
function _ie_normalizarItem(it, categoriaPadrao, cobrancaPadrao){
  return {
    id: it.id ?? it.idItem ?? it.codigo ?? it.slug ?? ("it_" + Math.random().toString(36).slice(2)),
    nomeItem: it.nomeItem ?? it.nome ?? it.titulo ?? it.label ?? "Item",
    valor: it.valor ?? it.preco ?? it.preço ?? it.total ?? 0,
    tipoCobranca:(()=>{
      const v = it.tipoCobranca ?? it.cobranca ?? cobrancaPadrao ?? "fixo";
      return /pessoa/i.test(String(v)) ? "porPessoa" : "fixo";
    })(),
    desconto: it.desconto ?? it.descontoValor ?? "",
    descontoPorcentagem: it.descontoPorcentagem ?? it.percentualDesconto ?? it.descontoPercentual ?? "",
    descontoTipo: it.descontoTipo ?? "",
    categoria: (it.categoria || it.tipo || categoriaPadrao || "").toString().toLowerCase()
  };
}

async function salvarSelecaoItensEvento(){
  const usp = new URLSearchParams(location.search);
  const eid = (typeof window.getEventoId === 'function') ? (window.getEventoId() || '') : (usp.get("id") || localStorage.getItem("eventoSelecionado") || "");

  // 1) Coletar itens diretamente da UI (checkboxes marcados)
  const marcados = Array.from(document.querySelectorAll("input[type='checkbox'][data-key]:checked"));
  let itens = marcados.map(chk => {
    const key   = chk.dataset.key || "";
    const tipo  = (chk.dataset.tipo || "").toLowerCase();       // "cardapio" | "adicional" | "servico"
    const label = chk.dataset.label || "Item";
    const vEl   = document.querySelector(`input[data-valor='${CSS.escape(key)}']`);
    const dEl   = document.querySelector(`input[data-desconto='${CSS.escape(key)}']`);
    const cobr  = (chk.dataset.cobranca || (
      tipo === "servico" ? "fixo" : "porPessoa"                 // padrão: cardápio/adicional = porPessoa
    ));

    const it = {
      id: key || ("it_" + Math.random().toString(36).slice(2)),
      nomeItem: label,
      valor: Number((vEl?.value || "0").replace(/\./g,'').replace(',','.')) || 0,
      desconto: dEl?.value || "",
      tipoCobranca: (/pessoa/i.test(String(cobr)) ? "porPessoa" : "fixo"),
      categoria: tipo || "servico"
    };
    return it;
  });

  // 2) Se nada marcado agora, preserva o que já existe (evento ou rascunho)
  try {
    if (itens.length === 0) {
      if (eid) {
        const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
        const ev = eventos.find(e => String(e.id) === String(eid));
        if (ev?.itensSelecionados?.length) itens = ev.itensSelecionados.slice();
      }
      if (!itens.length) {
        const temp = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
        if (temp?.itensSelecionados?.length) itens = temp.itensSelecionados.slice();
      }
    }
  } catch {}

  // 3) Ponte (para o cadastro ler na volta) — NÃO limpar aqui
  try { localStorage.setItem("itensSelecionadosEvento", JSON.stringify(itens)); } catch {}

  // 4) Convidados (input -> LS)
  const qtdInput = document.getElementById("quantidadeConvidados")?.value ?? "";
  const qtdStr   = qtdInput !== "" ? String(qtdInput) : (localStorage.getItem("quantidadeConvidadosEvento") || "");
  if (qtdStr !== "") { try { localStorage.setItem("quantidadeConvidadosEvento", qtdStr); } catch {} }
  const qtd = Number(qtdStr) || 0;

  // 5) Persistir seleção no evento (nuvem ou rascunho)
  try {
    if (eid) {
      // Evento já existe -> salva dentro do próprio evento
      let ev = await carregarEventoDoBackend(eid);
      if (!ev) {
        // fallback: tenta pegar só do localStorage
        const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
        ev = eventos.find(e => String(e.id) === String(eid)) || null;
      }

      if (ev) {
        ev.itensSelecionados = itens;
        if (qtd > 0) {
          ev.quantidadeConvidados = qtd;
          ev.qtdConvidados = qtd;
        }

        ev = await salvarEventoNoBackend(ev);
        window.evento = ev;
        window.eventoSelecionado = ev;
      }
    } else {
      // ainda não tem evento criado -> mantém somente no rascunho (eventoTemp)
      const temp = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
      temp.itensSelecionados = itens;
      if (qtd > 0) {
        temp.quantidadeConvidados = qtd;
        temp.qtdConvidados = qtd;
      }
      localStorage.setItem("eventoTemp", JSON.stringify(temp));
    }
  } catch (err) {
    console.warn("[itens-evento] Erro ao salvar itens do evento", err);
    alert("Não foi possível salvar os itens na nuvem agora. As alterações ficaram salvas neste navegador.");
  }

  // 6) Voltar para a tela correta
  const qsFrom = usp.get("from") || usp.get("origem");
  let memFrom = ""; try { memFrom = localStorage.getItem("itensEvento:returnTo") || ""; } catch {}
  const ref = document.referrer || "";
  const veioDoDetalhado = (qsFrom && /detalhado/i.test(qsFrom))
    || /evento-detalhado\.html/i.test(ref)
    || /detalhado/i.test(memFrom);

  const back = veioDoDetalhado
    ? `evento-detalhado.html?id=${encodeURIComponent(eid)}`
    : `cadastro-evento.html?id=${encodeURIComponent(eid)}`;

  try { localStorage.removeItem("itensEvento:returnTo"); } catch {}
  // ⚠️ NÃO remover "itensSelecionadosEvento" aqui — o cadastro lê na volta
  window.location.href = back;
}


// === Totais / utilidades ===
function ie_toNumber(s){
  return Number(String(s ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3,})/g,'')
    .replace(',', '.')) || 0;
}

function ie_recalcTotais(){
  const itens = Array.isArray(window.itensSelecionados) ? window.itensSelecionados : [];

  let bruto = 0, desc = 0, liquido = 0, porPessoa = 0;
  const qtd = Number(window.evento?.quantidadeConvidados || window.evento?.qtdConvidados || 0) || 0;

  for (const it of itens){
    const tipoCob = String(it.tipoCobranca || it.cobranca || 'valorTotal').toLowerCase();
    const base    = Number(it.valor ?? it.preco ?? it.precoUnit ?? 0) || 0;
    let sub       = (tipoCob.includes('pessoa')) ? base * qtd : base;

    const dStr   = String(it.desconto ?? '');
    const dVal   = ie_toNumber(it.desconto);
    const dPctF  = Number(it.descontoPorcentagem ?? it.descontoPercentual ?? 0) || 0;
    const hasPct = /%\s*$/.test(dStr);
    let pct      = 0;

    if (String(it.descontoTipo||'').toLowerCase()==='percentual' || hasPct || (!dVal && dPctF)){
      pct = hasPct
        ? (parseFloat(dStr.replace(/[^\d.,-]/g,'').replace(',','.'))||0)
        : (dPctF || dVal);
      pct = Math.max(0, Math.min(100, pct));
    }

    const subDesc = pct > 0 ? sub * (pct/100) : Math.min(sub, dVal);
    bruto   += sub;
    desc    += subDesc;
    liquido += (sub - subDesc);

    if (tipoCob.includes('pessoa')) porPessoa += base;
  }

  const brl = (n)=> (n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  const elBruto   = document.getElementById('ieTotBruto');
  const elDesc    = document.getElementById('ieTotDesc');
  const elLiquido = document.getElementById('ieTotLiquido');
  const elPP      = document.getElementById('ieTotPP');

  if (elBruto)   elBruto.textContent   = brl(bruto);
  if (elDesc)    elDesc.textContent    = `− ${brl(desc)}`;
  if (elLiquido) elLiquido.textContent = brl(liquido);
  if (elPP)      elPP.textContent      = brl(porPessoa);
}

// === Listeners (uma vez só) ===
document.addEventListener("DOMContentLoaded", () => {
  // Botão “Salvar e Voltar para o Evento”
  (document.getElementById("salvarItensSelecionados") ||
   document.getElementById("btnSalvarItens") ||
   document.querySelector("[data-salvar-itens]"))
   ?.addEventListener("click", (e) => { e.preventDefault(); salvarSelecaoItensEvento(); });

(function hydrateSelecionadosFromEvento(){
  const usp = new URLSearchParams(location.search);
  const eid = usp.get("id") || localStorage.getItem("eventoSelecionado") || "";
  if (!eid) return;

  function cat(it){
    const s = String(it?.categoria || it?.tipo || "").toLowerCase();
    if (s.includes("card")) return "cardapio";
    if (s.includes("adic")) return "adicional";
    if (s.includes("serv")) return "servico";
    return (s || "servico");
  }

  function aplicarNaTela(ev){
    if (!ev) return;

    // convidados
    const qtd = parseInt(ev.quantidadeConvidados ?? ev.qtdConvidados ?? 0, 10) || 0;
    const inputQtd = document.getElementById("quantidadeConvidados");
    if (inputQtd) inputQtd.value = String(qtd);
    window.evento = { ...(window.evento||{}), quantidadeConvidados: qtd, qtdConvidados: qtd };

    // itens
    const itens = Array.isArray(ev.itensSelecionados) ? ev.itensSelecionados : [];
    const card   = itens.find(i => cat(i) === "cardapio") || null;
    const adds   = itens.filter(i => cat(i) === "adicional");
    const servs  = itens.filter(i => cat(i) === "servico");

    window.selecionadoCardapio    = card || null;
    window.selecionadosAdicionais = adds || [];
    window.selecionadosServicos   = servs || [];
    window.itensSelecionados      = itens || [];

    ie_recalcTotais();
  }

  // Se tiver API configurada, tenta buscar da nuvem primeiro
  if (typeof carregarEventoDoBackend === "function" && IS_REMOTE) {
    carregarEventoDoBackend(eid)
      .then(evFromApi => {
        if (evFromApi) {
          aplicarNaTela(evFromApi);
        } else {
          // fallback para o cache local
          try {
            const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
            const evLocal = eventos.find(e => String(e.id) === String(eid)) || null;
            aplicarNaTela(evLocal);
          } catch {
            aplicarNaTela(null);
          }
        }
      })
      .catch(err => {
        console.warn("[itens-evento] erro ao carregar evento da API", err);
        try {
          const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
          const evLocal = eventos.find(e => String(e.id) === String(eid)) || null;
          aplicarNaTela(evLocal);
        } catch {
          aplicarNaTela(null);
        }
      });
  } else {
    // modo antigo: apenas localStorage
    try {
      const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
      const evLocal = eventos.find(e => String(e.id) === String(eid)) || null;
      aplicarNaTela(evLocal);
    } catch {
      aplicarNaTela(null);
    }
  }
})();


  ie_recalcTotais();
});

// Atualiza totais quando usuário interage na tela
document.addEventListener('change', (e)=>{
  if (e.target.closest('#listaItens, .form-itens, table, .grid-itens')) ie_recalcTotais();
});
document.addEventListener('input', (e)=>{
  if (e.target.closest('#listaItens, .form-itens, table, .grid-itens')) ie_recalcTotais();
});
window.addEventListener('storage', (e)=>{
  const k = String(e.key||'');
  if (k==='eventos' || k.startsWith('itensSelecionados')) ie_recalcTotais();
});
