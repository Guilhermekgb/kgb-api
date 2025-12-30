// ==== Orçamento – Sistema Buffet (JS unificado, limpo) ====

// --------- utilidades básicas ----------
function mostrarToast(msg){
  try{
    const el = document.createElement("div");
    el.className = "popup-sucesso";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(()=> el.remove(), 2200);
  }catch{}
}

const $ = (id) => document.getElementById(id);
const getJSON = (k, def = []) => {
  try {
    // chaves relacionadas a orçamentos usam sessionStorage como cache
    const ORC = ['leads','propostasIndex','notificacoes','propostaLogs','orcamentos'];
    if (ORC.includes(k)) {
      try { return JSON.parse(sessionStorage.getItem(k) || (Array.isArray(def) ? '[]' : '{}')) || def; } catch {}
      // background fetch
      try {
        if (window.__API_BASE__) {
          (async ()=>{
            try {
              const base = window.__API_BASE__;
              if (k === 'leads' || k === 'propostasIndex') {
                const r = await fetch(base + '/leads', { credentials: 'same-origin' });
                if (r.ok) {
                  const d = await r.json();
                  sessionStorage.setItem('leads', JSON.stringify(Array.isArray(d) ? d : (d?.data||[])));
                  sessionStorage.setItem('propostasIndex', JSON.stringify(Array.isArray(d) ? d : (d?.data||[])));
                }
              } else if (k === 'orcamentos') {
                const r = await fetch(base + '/orcamentos', { credentials: 'same-origin' });
                if (r.ok) {
                  const d = await r.json();
                  sessionStorage.setItem('orcamentos', JSON.stringify(Array.isArray(d) ? d : (d?.data||[])));
                }
              }
            } catch(e){}
          })();
        }
      } catch(e){}
      return def;
    }
    const raw = localStorage.getItem(k) || (Array.isArray(def) ? "[]" : "{}");
    const v = JSON.parse(raw);
    return v ?? def;
  } catch {
    return def;
  }
};

// Helpers para persistência de leads (sessionStorage + sync com API)
function readLeadsCache(){ try { return JSON.parse(sessionStorage.getItem('leads') || '[]') || []; } catch { return []; } }
function persistLeadsArray(leads){ try { sessionStorage.setItem('leads', JSON.stringify(leads)); } catch {};
  try { if (window.__API_BASE__) {
    (async ()=>{ try { const base = window.__API_BASE__; for(const l of Array.isArray(leads)?leads:[leads]){ await fetch(base + '/leads', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(l) }); } } catch(e){} })(); } } catch(e){} }
function persistLead(l){ persistLeadsArray([l]); }
// === API – salvar lead no backend ===
const API_BASE = window.__API_BASE__ || localStorage.getItem("API_BASE") || "";

async function salvarLeadNaApi(novoLead) {
  const base = window.__API_BASE__ || API_BASE || "";
  if (!base) return null;

  try {
    // usa window.apiFetch quando disponível (serializa body automaticamente)
    if (window.apiFetch) {
      const payload = await window.apiFetch(base + '/leads', { method: 'POST', body: novoLead });
      return payload?.data || payload || null;
    }

    // fallback: fetch com credentials para enviar cookie httpOnly
    const resp = await fetch(base + '/leads', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novoLead)
    });

    if (!resp.ok) {
      console.warn('[ORÇAMENTO] Erro ao salvar lead na API:', resp.status);
      return null;
    }

    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    return data?.data || data || null;
  } catch (e) {
    console.warn('[ORÇAMENTO] Falha ao chamar /leads:', e);
    return null;
  }
}

// === API – salvar orçamento no backend ===
async function salvarOrcamentoNaApi(leadId, dadosOrcamento) {
  const base = window.__API_BASE__ || API_BASE || "";
  if (!base || !leadId) return null;

  try {
    if (window.apiFetch) {
      const payload = await window.apiFetch(base + '/orcamentos', { method: 'POST', body: { leadId: String(leadId), dados: dadosOrcamento } });
      return payload?.orcamento || payload || null;
    }

    const resp = await fetch(base + '/orcamentos', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: String(leadId), dados: dadosOrcamento })
    });

    if (!resp.ok) {
      console.warn('[ORÇAMENTO] Erro ao salvar orçamento na API:', resp.status);
      return null;
    }

    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    return data?.orcamento || data || null;
  } catch (e) {
    console.warn('[ORÇAMENTO] Falha ao chamar /orcamentos:', e);
    return null;
  }
}

// Helper seguro para strings que podem OU NÃO ser JSON
function parseMaybeJSON(raw, fb) {
  if (raw == null || raw === "") return fb;
  try { return JSON.parse(raw); } catch { return fb; }
}
// === helper de validade (hoje + N dias) em ISO YYYY-MM-DD ===
function addDaysISO(baseISO, days=7){
  const base = baseISO && /^\d{4}-\d{2}-\d{2}$/.test(baseISO) ? new Date(baseISO+"T00:00:00") : new Date();
  base.setDate(base.getDate() + days);
  const y = base.getFullYear(), m = String(base.getMonth()+1).padStart(2,'0'), d = String(base.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

// ==== helpers p/ salvar leads com tolerância de cota ====
function minimizeLead(l){
  // guarda só o essencial (evita estourar a cota com objetos enormes/imagens)
  return {
    id: String(l.id || Date.now()),
    token: l.token || "",
    nome: (l.nome||"").trim(),
    telefone: (l.telefone||"").trim(),
    whatsapp: (l.whatsapp||"").trim(),
    email: (l.email||"").trim(),
    dataEvento: l.dataEvento || "",
    horarioEvento: l.horarioEvento || "",
    tipoEvento: l.tipoEvento || "",
    local: (l.local||"").trim(),
    qtd: Number(l.qtd||0) || 0,
    descontoReais: Number(l.descontoReais||0) || 0,
    descontoPorcentagem: Number(l.descontoPorcentagem||0) || 0,
    valorTotal: Number(l.valorTotal||0) || 0,
    comoConheceu: l.comoConheceu || "",
    observacoes: (l.observacoes||"").slice(0, 2000), // limita texto grande
    status: l.status || "Novo Lead",
    responsavel: l.responsavel || l.responsavel_nome || "",
    responsavel_nome: l.responsavel_nome || l.responsavel || "",
    // listas, só com dados leves
    cardapios_enviados: (l.cardapios_enviados||[]).map(c=>({ id:c.id||"", nome:c.nome||"", valor:Number(c.valor||0)||0 })),
    adicionaisSelecionados: (l.adicionaisSelecionados||[]).map(a=>({ nome:a.nome||"", valor:Number(a.valor||0)||0, cobranca:a.cobranca||"pessoa" })),
    servicosSelecionados: (l.servicosSelecionados||[]).map(s=>({ nome:s.nome||"", valor:Number(s.valor||0)||0, cobranca:s.cobranca||"fixo" })),
    proximoContato: l.proximoContato || "",
    dataCriacao: l.dataCriacao || new Date().toISOString(),
    historico: Array.isArray(l.historico) ? l.historico.slice(-30) : [] // mantém só os últimos itens
  };
}

// === PATCH B1: SUBMIT do Orçamento chama salvarLeadFunil ===
document.getElementById("form-orcamento")?.addEventListener("submit", (e) => {
  e.preventDefault();
  try { salvarLeadFunil(); } catch (err) {
    console.error("Falha ao salvar lead do orçamento:", err);
    alert("Não foi possível salvar. Confira os campos e tente novamente.");
  }
});

function trySetLS(key, value){
  // tenta gravar; se falhar, lança erro pra quem chamou lidar
  localStorage.setItem(key, value);
}

function safeWriteLeads(leadsArr){
  // sempre grava enxuto e com limite de quantidade
  let arr = leadsArr.map(minimizeLead);

  // limite “saudável” de quantidade para não lotar o storage
  const HARD_LIMIT = 600;   // ajuste se quiser
  if (arr.length > HARD_LIMIT) arr = arr.slice(-HARD_LIMIT);

  // 1ª tentativa
  try {
    trySetLS("leads", JSON.stringify(arr));
    return;
  } catch (e1) {
    // 2ª: poda mais e tenta de novo
    arr = arr.slice(-200).map(l => ({ ...l, historico: (l.historico||[]).slice(-10) }));
    try {
      trySetLS("leads", JSON.stringify(arr));
      return;
    } catch (e2) {
      // 3ª: salva só o último (garante que o lead atual não se perca)
      const lastOnly = [ arr[arr.length-1] ];
      try {
        trySetLS("leads", JSON.stringify(lastOnly));
        alert("O armazenamento local está cheio. Mantive apenas o último lead salvo. Considere exportar/limpar dados antigos.");
      } catch (e3) {
        // fallback: sessionStorage (temporário na aba)
        try {
          sessionStorage.setItem("leads_buffer", JSON.stringify(lastOnly));
          alert("O armazenamento local está cheio. Salvei este lead temporariamente (sessionStorage).");
        } catch {
          alert("Não foi possível salvar o lead: armazenamento do navegador está cheio.");
        }
      }
    }
  }
}

function saveLead(novoLead){
  let leads = [];
  try { leads = JSON.parse(sessionStorage.getItem('leads') || '[]') || []; } catch {}
  leads.push(novoLead);
  try { persistLeadsArray(leads); } catch { safeWriteLeads(leads); }
}

/* ===== Compactação e salvamento seguro dos LEADS ===== */
function compactLead(l){
  const out = {
    id: String(l.id || Date.now()),
    token: l.token || "",
    nome: l.nome || l.cliente || "",
    telefone: l.telefone || "",
    whatsapp: l.whatsapp || "",
    email: l.email || "",
    dataEvento: l.dataEvento || l.data_evento || "",
    horarioEvento: l.horarioEvento || l.horario || "",
    tipoEvento: l.tipoEvento || l.tipo_evento || "",
    local: l.local || "",
    qtd: +(l.qtd || l.convidados || 0) || 0,
    status: l.status || "Novo Lead",
    responsavel: l.responsavel || l.responsavel_nome || "",
    responsavel_nome: l.responsavel_nome || l.responsavel || "",
    proximoContato: l.proximoContato || "",
    dataCriacao: l.dataCriacao || l.criadoEm || new Date().toISOString(),
    descontoReais: +l.descontoReais || 0,
    descontoPorcentagem: +l.descontoPorcentagem || 0,
    valorTotal: +l.valorTotal || 0,
    cardapios_enviados: (l.cardapios_enviados || []).map(c => ({
      id: c.id || "", nome: c.nome || "", valor: +c.valor || 0
    })),
    adicionaisSelecionados: (l.adicionaisSelecionados || []).map(a => ({
      nome: a.nome || "", valor: +a.valor || 0, cobranca: a.cobranca || "pessoa"
    })),
    servicosSelecionados: (l.servicosSelecionados || []).map(s => ({
      nome: s.nome || "", valor: +s.valor || 0, cobranca: s.cobranca || "fixo"
    })),
    historico: (Array.isArray(l.historico) ? l.historico.slice(-5) : []).map(h => ({
      data: h.data || "", dataISO: h.dataISO || "", tipo: h.tipo || "",
      observacao: String(h.observacao || "").slice(0, 300),
      responsavel: h.responsavel || ""
    }))
  };
  return out;
}

function migrateLeadsStorage(){
  let leads = [];
  try { leads = JSON.parse(localStorage.getItem("leads") || "[]") || []; } catch {}
  if (!Array.isArray(leads) || leads.length === 0) return [];

  const compacted = leads.map(compactLead);
  try { persistLeadsArray(compacted); } catch {}
  return compacted;
}

function safeSaveLeads(leadsArr){
  const compactArr = leadsArr.map(compactLead);
  try {
    persistLeadsArray(compactArr);
    return;
  } catch (e1) {
    // tenta compactar os existentes
    const existing = migrateLeadsStorage();
    try {
      const map = new Map(existing.map(l => [String(l.id), l]));
      for (const l of compactArr) map.set(String(l.id), l);
      persistLeadsArray(Array.from(map.values()));
      return;
    } catch (e2) {
      // último recurso: guarda só o mais novo localmente e joga o resto na sessão
      const last = compactLead(compactArr[compactArr.length - 1]);
      try { persistLeadsArray([last]); } catch {}
      try {
        const idx = JSON.parse(sessionStorage.getItem("leadsOverflowIndex") || "[]");
        idx.push(last.id);
        sessionStorage.setItem("leadsOverflowIndex", JSON.stringify(idx));
        sessionStorage.setItem("lead:"+last.id, JSON.stringify(last));
      } catch {}
      alert("O armazenamento local estava cheio. Compactei os leads e mantive o mais recente.");
    }
  }
}

// opcional: acesso pelo console para rodar manualmente
window._compactLeads = migrateLeadsStorage;

// >>> CORRIGIDO: usuário logado pode estar salvo como string simples
const usuarioLogado = parseMaybeJSON(
  localStorage.getItem("usuarioLogado") ?? sessionStorage.getItem("usuarioLogado"),
  {} // fallback objeto vazio
);

function notificarResponsavel(destinatarioNomeOuEmail, titulo, leadId){
  const notificacoes = getJSON("notificacoes", []);
  notificacoes.push({
    id: Date.now().toString(),
    tipo: "responsavel",
    titulo,
    descricao: `Lead #${leadId} — você é o responsável por este lead.`,
    data: new Date().toLocaleString("pt-BR"),
    destino: "funil-leads.html",
    lido: false,
    leadId,
    destinatarioNome: destinatarioNomeOuEmail
  });
  try { sessionStorage.setItem("notificacoes", JSON.stringify(notificacoes)); } catch {}

  const quem = (usuarioLogado?.nome || usuarioLogado?.email || "").trim();
  if(quem && destinatarioNomeOuEmail && quem === destinatarioNomeOuEmail){
    mostrarToast("Você foi definido como responsável por um lead.");
  }
}

function formatarDataBR(iso){
  if(!iso) return "-";
  const [y,m,d] = String(iso).split("-");
  return (d && m && y) ? `${d}/${m}/${y}` : iso;
}

// --------- catálogos ----------
let cardapiosDisponiveis = (getJSON("produtosBuffet", []) || [])
  .filter(p => String(p?.tipo || "").toLowerCase() === "cardapio");
let adicionaisDisponiveis = getJSON("adicionaisBuffet", []);
let servicosDisponiveis   = getJSON("servicosBuffet", []);

// =========================================
//      Render: Cardápios / Faixas
// =========================================
function preencherCardapios() {
  const container = $("cardapiosLista");
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(cardapiosDisponiveis) || !cardapiosDisponiveis.length) {
    container.innerHTML = `<div class="muted">Nenhum cardápio cadastrado.</div>`;
    return;
  }

  cardapiosDisponiveis.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card-cardapio";

    const header = document.createElement("div");
    header.className = "cc-header";
    header.innerHTML = `<span class="nome">${c.nome}</span><span class="hint">Escolha a faixa</span>`;
    card.appendChild(header);

    const wrap = document.createElement("div");
    wrap.className = "cc-faixas";

    const faixas = Array.isArray(c.faixas) ? c.faixas : [];
    if (!faixas.length) {
      wrap.innerHTML = `<div class="muted">Sem faixas cadastradas.</div>`;
    } else {
      faixas.forEach((f, i) => {
        const id = `${c.id}_${i}`;
        const valor = parseFloat(String(f.valor ?? "0").replace(/\./g, "").replace(",", ".")) || 0;

        const chip = document.createElement("label");
        chip.className = "chip";
        chip.innerHTML = `
          <input type="radio"
                 name="cardapio_${c.id}"
                 id="${id}"
                 data-id="${c.id}"
                 data-nome="${c.nome}"
                 data-valor="${valor}"
                 data-min="${f.min}"
                 data-max="${f.max ?? ''}">
          ${(f.max != null && f.max !== "") ? `${f.min}–${f.max}` : `${f.min}+`} • R$ ${valor.toFixed(2).replace(".", ",")}
        `;
        const input = chip.querySelector("input");

        input.addEventListener("change", () => {
          wrap.querySelectorAll(".chip").forEach(ch => ch.classList.remove("selected"));
          if (input.checked) chip.classList.add("selected");
          calcularValorTotal();
        });

        // toggle manual no label
        chip.addEventListener("click", (e) => {
          e.preventDefault();
          const estava = input.checked;
          if (estava) {
            input.checked = false;
            chip.classList.remove("selected");
          } else {
            wrap.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
            wrap.querySelectorAll(".chip").forEach(ch => ch.classList.remove("selected"));
            input.checked = true;
            chip.classList.add("selected");
          }
          calcularValorTotal();
        });

        wrap.appendChild(chip);
      });
    }

    card.appendChild(wrap);
    container.appendChild(card);
  });

  // força começar sem nada marcado
  container.querySelectorAll('.cc-faixas input[type="radio"]').forEach(r => { r.checked = false; });
  container.querySelectorAll('.cc-faixas .chip').forEach(ch => ch.classList.remove('selected'));

  window.lucide?.createIcons?.();
}

// =========================================
//            Render: Adicionais
// =========================================
function preencherAdicionais() {
  const container = $("adicionaisLista");
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(adicionaisDisponiveis) || !adicionaisDisponiveis.length) {
    container.innerHTML = `<div class="muted">Nenhum adicional cadastrado.</div>`;
    atualizarBadgeAdicionais();
    return;
  }

  adicionaisDisponiveis.forEach((a, i) => {
    const valor = parseFloat(String(a?.valor ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
    const cobranca = String(a?.cobranca || "pessoa").toLowerCase();

    const div = document.createElement("div");
    div.className = "card-item check";
    div.innerHTML = `
      <label for="add_${i}">
        <input id="add_${i}" type="checkbox"
               data-nome="${a?.nome || ""}"
               data-valor="${valor}"
               data-cobranca="${cobranca}">
        ${a?.nome || "Adicional"}
      </label>
      <div class="preco">R$ ${valor.toFixed(2).replace(".", ",")}${cobranca === "pessoa" ? ' <span class="muted">/ pessoa</span>' : ''}</div>
    `;

    const chk = div.querySelector("input");
    chk.addEventListener("change", () => {
      div.classList.toggle("selected", chk.checked);
      atualizarTagsAdicionais();
      atualizarBadgeAdicionais();
      calcularValorTotal();
    });

    container.appendChild(div);
  });

  atualizarBadgeAdicionais();
}
function atualizarTagsAdicionais() {
  const tagContainer = $("tagAdicional");
  if (!tagContainer) return;
  tagContainer.innerHTML = "";
  const selecionados = document.querySelectorAll("#adicionaisLista input[type='checkbox']:checked");
  selecionados.forEach(input => {
    const nome = input.dataset.nome;
    const tag = document.createElement("div");
    tag.className = "tag-item";
    tag.innerHTML = `${nome} <button type="button">×</button>`;
  tag.querySelector("button").addEventListener("click", () => {
   input.checked = false;
   input.closest('.card-item')?.classList.remove('selected');
   atualizarTagsAdicionais();
   atualizarBadgeAdicionais();
   calcularValorTotal();
 });
    tagContainer.appendChild(tag);
  });
}

// =========================================
//         Render: Serviços/Pacotes
// =========================================
function preencherServicos() {
  const container = $("servicosLista");
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(servicosDisponiveis) || !servicosDisponiveis.length) {
    container.innerHTML = `<div class="muted">Nenhum serviço/pacote cadastrado.</div>`;
    atualizarBadgeServicos();
    return;
  }

  servicosDisponiveis.forEach((s, i) => {
    const valor = parseFloat(String(s?.valor ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
    const cobranca = String(s?.cobranca || "fixo").toLowerCase();

    const div = document.createElement("div");
    div.className = "card-item check";
    div.innerHTML = `
      <label for="srv_${i}">
        <input id="srv_${i}" type="checkbox"
               data-nome="${s?.nome || ""}"
               data-valor="${valor}"
               data-cobranca="${cobranca}">
        ${s?.nome || "Serviço"}
      </label>
      <div class="preco">R$ ${valor.toFixed(2).replace(".", ",")}${cobranca === "pessoa" ? ' <span class="muted">/ pessoa</span>' : ''}</div>
    `;

    const chk = div.querySelector("input");
    chk.addEventListener("change", () => {
      div.classList.toggle("selected", chk.checked);
      atualizarTagsServicos();
      atualizarBadgeServicos();
      calcularValorTotal();
    });

    container.appendChild(div);
  });

  atualizarBadgeServicos();
}
function atualizarTagsServicos() {
  const tagContainer = $("tagPacote");
  if (!tagContainer) return;
  tagContainer.innerHTML = "";
  const selecionados = document.querySelectorAll("#servicosLista input[type='checkbox']:checked");
  selecionados.forEach(input => {
    const nome = input.dataset.nome;
    const tag = document.createElement("div");
    tag.className = "tag-item";
    tag.innerHTML = `${nome} <button type="button">×</button>`;
tag.querySelector("button").addEventListener("click", () => {
   input.checked = false;
   input.closest('.card-item')?.classList.remove('selected');
   atualizarTagsServicos();
   atualizarBadgeServicos();
   calcularValorTotal();
 });
    tagContainer.appendChild(tag);
  });
}

// =========================================
//                Cálculo
// =========================================
function calcularValorTotal(returnNumber = false){
  const fmt = (n)=> Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const qtd = parseInt((document.getElementById('convidados')?.value||'0').replace(/\D/g,''),10) || 0;

  // Cardápios selecionados (radios marcados)
  const cardapios = Array.from(document.querySelectorAll('#cardapiosLista input[type="radio"]:checked')).map(el=>{
    const nome  = (el.dataset.nome||'').trim();
    const unit  = parseFloat(el.dataset.valor||'0')||0;
    return { nome, unit, total: unit*qtd };
  });

  // Adicionais (por pessoa) e Pacotes/Serviços (fixos ou por pessoa)
  const adicionais = Array.from(document.querySelectorAll('#adicionaisLista input[type="checkbox"]:checked')).map(el=>{
    const unit = parseFloat(el.dataset.valor||'0')||0;
    const cobr = String(el.dataset.cobranca||'pessoa').toLowerCase();
    return (cobr==='pessoa') ? unit*qtd : unit;
  }).reduce((a,b)=>a+b,0);

  const servicos = Array.from(document.querySelectorAll('#servicosLista input[type="checkbox"]:checked')).map(el=>{
    const unit = parseFloat(el.dataset.valor||'0')||0;
    const cobr = String(el.dataset.cobranca||'fixo').toLowerCase();
    return (cobr==='pessoa') ? unit*qtd : unit;
  }).reduce((a,b)=>a+b,0);

  // Descontos aplicados apenas no bloco "extras" quando houver 2+ cardápios (evita distorcer comparação)
  const descR = parseFloat(document.getElementById('desconto_reais')?.value||'0')||0;
  let   descP = parseFloat(document.getElementById('desconto_porcentagem')?.value||'0')||0;
  if (!isFinite(descP)) descP=0; descP = Math.max(0,Math.min(100,descP));

  const extrasBruto = adicionais + servicos;
  const extrasComDesc = Math.max(0, (extrasBruto*(1 - descP/100)) - descR);

  const alvoValor = document.getElementById('valor_total');
  const boxCmp   = document.getElementById('comparativo_cardapios_resumo');
  const listaCmp = document.getElementById('comparativo_lista_resumo');

  if (cardapios.length <= 1){
    // Modo "1 cardápio": total geral normal
    const baseCardapio = (cardapios[0]?.total||0);
    const total = Math.max(0, (baseCardapio + extrasBruto)*(1 - descP/100) - descR);
    if (alvoValor) alvoValor.textContent = fmt(total);
    if (boxCmp){ boxCmp.style.display='none'; if (listaCmp) listaCmp.innerHTML=''; }
    return returnNumber ? total : total;
  } else {
    // Modo "comparação": não somar cardápios; mostrar cada um separado + extras abaixo
    if (listaCmp){
      listaCmp.innerHTML = cardapios.map(c => `
        <div style="display:flex; justify-content:space-between; gap:8px;">
          <div>${c.nome} <span style="color:#7a7a7a;">(por pessoa)</span></div>
          <div><b>${fmt(c.total)}</b></div>
        </div>
      `).join('');
    }
    if (boxCmp) boxCmp.style.display='block';

    // Campo de "Valor Total" passa a refletir só os extras comuns às opções
    if (alvoValor) alvoValor.textContent = fmt(extrasComDesc);
    // Para quem usa o retorno numérico (ex.: salvar lead), devolvemos apenas os extras
    return returnNumber ? extrasComDesc : extrasComDesc;
  }
}


// =========================================
//        Badges
// =========================================
function atualizarBadgeAdicionais(){
  const count = document.querySelectorAll('#adicionaisLista input[type="checkbox"]:checked').length;
  const badge = document.getElementById('badgeAdd');
  if (badge) badge.textContent = count ? `${count}` : 'Nenhum';
}
function atualizarBadgeServicos(){
  const count = document.querySelectorAll('#servicosLista input[type="checkbox"]:checked').length;
  const badge = document.getElementById('badgeServ');
  if (badge) badge.textContent = count ? `${count}` : 'Nenhum';
}

// =========================================
//   Selects / Responsável / Combos
// =========================================
function preencherSelects() {
  // Como conheceu
  const opcoesConheceu = getJSON("comoConheceu", []);
  const selectConheceu = $("como_conheceu");
  if (selectConheceu) {
    selectConheceu.innerHTML = `<option value="">Selecione</option>`;
    opcoesConheceu.forEach(op => {
      const opt = document.createElement("option");
      opt.value = op; opt.textContent = op;
      selectConheceu.appendChild(opt);
    });
  }

  // Tipos de evento
  const tipos = getJSON("tiposEvento", []);
  const tipoSel = $("tipo_evento");
  if (tipoSel) {
    tipoSel.innerHTML = `<option value="">Selecione</option>`;
    tipos.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      tipoSel.appendChild(opt);
    });
  }

  // Responsáveis
  const campoResp = $("responsavel_lead");
  const usuarios = getJSON("usuarios", []);
  if (campoResp) {
    campoResp.innerHTML = `<option value="">Selecione o responsável</option>`;
    usuarios.forEach(u => {
      const option = document.createElement("option");
      const valor = u.nome || u.email;
      option.value = valor;
      option.textContent = `${valor} (${u.perfil || "sem perfil"})`;
      campoResp.appendChild(option);
    });

    if (usuarioLogado?.nome) campoResp.value = usuarioLogado.nome;
    const perfilAtual = (usuarioLogado?.perfil || "").toLowerCase();
    if (perfilAtual !== "administrador") {
      if (usuarioLogado?.nome || usuarioLogado?.email) {
        campoResp.value = (usuarioLogado.nome || usuarioLogado.email);
      }
      campoResp.disabled = true;
      campoResp.title = "Somente administradores podem alterar o responsável";
    }
  }
}
// === helper: monta preview e abre proposta.html ===
function __abrirPropostaPreview(novoLead){
  // coleta seleções atuais da tela
  const qtd = parseInt((document.getElementById("convidados")?.value || "0").replace(/\D/g,''), 10) || 0;

  const cardapiosSelecionados = Array.from(
    document.querySelectorAll("#cardapiosLista input[type='radio']:checked")
  ).map(input => {
    const idOriginal = input.dataset.id || input.id || "";
    const id   = idOriginal.split("_")[0];
    const nome = (input.dataset.nome || "").trim();
    const valor = parseFloat(input.dataset.valor || "0") || 0;
    return { id, nome, valor };
  });

  const adicionaisSelecionados = Array.from(
    document.querySelectorAll("#adicionaisLista input[type='checkbox']:checked")
  ).map(i => ({
    nome: i.dataset.nome || i.value || "",
    valor: parseFloat(i.dataset.valor || "0") || 0,
    cobranca: i.dataset.cobranca || "pessoa"
  }));

  const servicosSelecionados = Array.from(
    document.querySelectorAll("#servicosLista input[type='checkbox']:checked")
  ).map(i => ({
    nome: i.dataset.nome || i.value || "",
    valor: parseFloat(i.dataset.valor || "0") || 0,
    cobranca: i.dataset.cobranca || "fixo"
  }));

  // token para identificar o preview
  const token = (crypto.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36)))
              + "-" + Math.random().toString(36).slice(2,6);

  // lead leve para a página de proposta (mantém o lead salvo completo em localStorage)
  const payloadLead = {
    id: String(novoLead.id),
    token,
    nome: novoLead.nome || "",
    dataEvento: novoLead.dataEvento || "",
    tipoEvento: novoLead.tipoEvento || "",
    local: novoLead.local || "",
    qtd,
    observacoes: novoLead.observacoes || "",
    informacoesAdicionais: novoLead.informacoesAdicionais || "",
    descontoReais: Number(novoLead.descontoReais || 0),
    descontoPorcentagem: Number(novoLead.descontoPorcentagem || 0),
    cardapios_enviados: cardapiosSelecionados,
    adicionaisSelecionados,
    servicosSelecionados,
    whatsapp: novoLead.whatsapp || "",
    email: novoLead.email || ""
  };

  // guarda o pacote em sessionStorage para a proposta ler
  sessionStorage.setItem(`proposta:${token}`, JSON.stringify({ lead: payloadLead }));

  // também guarda um link público simples (se quiser compartilhar depois)
  const payloadPublico = btoa(unescape(encodeURIComponent(JSON.stringify({
    id: novoLead.id,
    token
  }))));
  const urlPublico = new URL("proposta.html", location.href);
  urlPublico.searchParams.set("t", token);
  urlPublico.searchParams.set("p", payloadPublico);
  urlPublico.searchParams.delete("preview");
  try { sessionStorage.setItem(`linkPublico:${novoLead.id}`, urlPublico.toString()); } catch {}

  // abre a página de proposta em modo preview
  const urlPreview = new URL("proposta.html", location.href);
  urlPreview.searchParams.set("t", token);
  urlPreview.searchParams.set("preview", "1");
  window.location.href = urlPreview.toString();
}

// =========================================
//        Fluxo: Salvar Lead simples
// =========================================
async function salvarLeadFunil(nextAction) {

  // ===== helpers locais =====
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };
  const toISO = (s) => {
    const v = String(s || "").trim();
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/aaaa
    return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
  };
  const val = (sel) => (document.querySelector(sel)?.value || "").trim();

  // ===== coleta campos =====
  const qtd = parseInt((val("#convidados") || "0").replace(/\D/g, ""), 10) || 0;

  // usa a constante já parseada (não window.usuarioLogado)
  const responsavelFinal =
    val("#responsavel_lead") ||
    (usuarioLogado?.nome || usuarioLogado?.email) ||
    "administrador";

  // Descontos saneados
  const __descR = parseFloat(val("#desconto_reais") || "0") || 0;
  let   __descP = parseFloat(val("#desconto_porcentagem") || "0") || 0;
  if (!isFinite(__descP)) __descP = 0;
  __descP = Math.max(0, Math.min(100, __descP));

  // ===== monta o lead =====
  const dataEventoRaw = val("#data_evento");            // pode vir em DD/MM/AAAA
  const dataEventoISO = toISO(dataEventoRaw) || "";     // normalizamos para ISO

    const origemBase =
    val("#como_conheceu") ||     // se o usuário preencheu
    "Cadastro interno";          // fallback (origem padrão)

  const novoLead = {
    id: Date.now().toString(),
    nome: val("#nome"),
    telefone: val("#telefone"),
    whatsapp: val("#whatsapp"),
    email: val("#email"),

    dataEvento: dataEventoRaw,           // mantemos como o usuário digitou
    dataEventoISO,                       // e guardamos ISO para ordenações
    horarioEvento: val("#horario_evento"),
    tipoEvento: val("#tipo_evento"),
    local: val("#local_evento"),
    qtd,

      comoConheceu: val("#como_conheceu"),
    observacoes: val("#observacoes"),
    origem: origemBase,

    status: "Novo Lead",                 // cai na 1ª coluna do funil
    responsavel: responsavelFinal,

    responsavel_nome: responsavelFinal,

    cardapios_enviados: Array.from(
      document.querySelectorAll("#cardapiosLista input[type='radio']:checked")
    ).map(i => ({
      id: (i.dataset.id || "").split("_")[0],
      nome: i.dataset.nome || "",
      valor: parseFloat(i.dataset.valor || "0") || 0
    })),

    adicionaisSelecionados: Array.from(
      document.querySelectorAll("#adicionaisLista input[type='checkbox']:checked")
    ).map(i => ({
      nome: i.dataset.nome || i.value || "",
      valor: parseFloat(i.dataset.valor || "0") || 0,
      cobranca: i.dataset.cobranca || "pessoa"
    })),

    servicosSelecionados: Array.from(
      document.querySelectorAll("#servicosLista input[type='checkbox']:checked")
    ).map(i => ({
      nome: i.dataset.nome || i.value || "",
      valor: parseFloat(i.dataset.valor || "0") || 0,
      cobranca: i.dataset.cobranca || "fixo"
    })),

    // descontos já saneados
    descontoReais: (__descR > 0 ? __descR : 0),
    descontoPorcentagem: (__descP > 0 ? __descP : 0),
    valorTotal: (typeof calcularValorTotal === "function" ? calcularValorTotal(true) : 0),

    proximoContato: "",
    dataCriacao: todayISO(), // local (YYYY-MM-DD)
    historico: [{
      data: new Date().toLocaleString("pt-BR"),
      dataISO: new Date().toISOString(),
      tipo: "Cadastro",
      observacao: "Lead cadastrado manualmente.",
      responsavel: responsavelFinal
    }]
  };
   // Token público (gerado ANTES de enviar para API)
  novoLead.token =
    (crypto.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36))) +
    "-" + Math.random().toString(36).slice(2,6);

  // --- NOVO: salvar também na API /leads ---
  try {
    const salvoApi = await salvarLeadNaApi(novoLead);
    if (salvoApi) {
      // se a API devolveu id/token, atualizamos o objeto local
      if (salvoApi.id)    novoLead.id = salvoApi.id;
      if (salvoApi.token) novoLead.token = salvoApi.token; // em geral será o mesmo
    }
  } catch (e) {
    console.warn("[ORÇAMENTO] Erro ao salvar lead na API (gerarProposta):", e);
  }

  // Observações iniciais como anotação


  // Observações iniciais como anotação
  if (novoLead.observacoes) {
    (novoLead.historico ||= []).push({
      data: new Date().toLocaleString("pt-BR"),
      tipo: "Anotação",
      observacao: novoLead.observacoes,
      dataISO: new Date().toISOString(),
      fav: false
    });
  }

  // ===== persistência segura =====
    // ===== persistência via API (sem usar localStorage) =====
    // Se não houver `API_BASE` configurado, mantemos em sessionStorage temporariamente
    if (!API_BASE) {
      try {
        const buf = JSON.parse(sessionStorage.getItem('leads_buffer') || '[]');
        buf.unshift(novoLead);
        sessionStorage.setItem('leads_buffer', JSON.stringify(buf.slice(0,200)));
        alert('API não configurada: lead salvo temporariamente na sessão. Configure a API para persistência permanente.');
      } catch (e) {
        console.warn('Não foi possível salvar lead temporariamente na sessão', e);
        alert('Não foi possível salvar o lead: API não configurada e armazenamento temporário indisponível.');
      }
    }

  // Fallback: garante que ficou em localStorage.leads
  try {
    const k = "leads";
    const arr = JSON.parse(localStorage.getItem(k) || "[]") || [];
    const ix = arr.findIndex(l => String(l.id) === String(novoLead.id));
    if (ix >= 0) arr[ix] = { ...arr[ix], ...novoLead };
    else arr.unshift(novoLead);
    localStorage.setItem(k, JSON.stringify(arr));
  } catch(e){ console.warn("fallback write leads:", e); }
  // >>> NOVO: salvar orçamento na API quando for "Gerar Proposta"
  if (String(nextAction || '').toLowerCase() === 'proposta') {
    try {
      const snap = {
        leadId: String(novoLead.id),
        nome: novoLead.nome,
        tipoEvento: novoLead.tipoEvento,
        dataEventoISO: novoLead.dataEventoISO,
        horarioEvento: novoLead.horarioEvento,
        local: novoLead.local,
        qtd: novoLead.qtd,
        cardapios: novoLead.cardapios_enviados || [],
        adicionaisSelecionados: novoLead.adicionaisSelecionados || [],
        servicosSelecionados: novoLead.servicosSelecionados || [],
        descontoReais: novoLead.descontoReais,
        descontoPorcentagem: novoLead.descontoPorcentagem,
        valorTotal: novoLead.valorTotal,
        observacoes: novoLead.observacoes
      };

      const salvoOrc = await salvarOrcamentoNaApi(novoLead.id, snap);
      if (salvoOrc && salvoOrc.id) {
        // guarda o id do orçamento junto ao lead (localmente)
        novoLead.orcamentoId = salvoOrc.id;
      }
    } catch (e) {
      console.warn("[ORÇAMENTO] Erro ao salvar orçamento na API:", e);
    }
  }
  // ===== Notificações Internas (Agenda + Feed) =====
  try {
    // Agenda Unificada
    window.__agendaBridge?.upsertUnifiedItem({
      id: `lead:new:${novoLead.id}`,
      src: 'lead',
      title: `Novo lead: ${novoLead.nome || '—'}`,
      date: todayISO(),
      status: 'scheduled',
      audience: 'vendas',
      entity: { type:'lead', id: String(novoLead.id) },
      desc: novoLead.tipoEvento ? `Tipo: ${novoLead.tipoEvento}` : ''
    });

    // Feed curto (Recentes)
    window.__agendaBridge?.publishNotificationFeed?.({
      id:`feed:lead:new:${novoLead.id}`,
      title:`Novo lead criado: ${novoLead.nome || '—'}`,
      level:'info',
      createdAtISO:new Date().toISOString(),
      audience:'vendas'
    });
  } catch(e){ console.warn('hook lead:new', e); }

  // ===== Lista de Propostas (índice) — sem duplicar =====
  // Observação: índice de propostas agora é servido pela API; não gravamos mais em localStorage.

  // ===== notificações locais =====
  try {
    const notificacoes = readLS('notificacoes', []) || [];
    notificacoes.push({
      id: Date.now().toString(),
      tipo: "formulario",
      titulo: "Novo Lead Cadastrado Manualmente",
      descricao: `Lead ${novoLead.nome} foi inserido e aguarda ação.`,
      data: new Date().toLocaleString("pt-BR"),
      destino: "funil-leads.html",
      lido: false,
      leadId: novoLead.id,
      destinatarioPerfil: "administrador"
    }, {
      id: (Date.now()+1).toString(),
      tipo: "responsavel",
      titulo: "Você foi definido como responsável por um lead",
      descricao: `Lead ${novoLead.nome} atribuído a você.`,
      data: new Date().toLocaleString("pt-BR"),
      destino: "funil-leads.html",
      lido: false,
      leadId: novoLead.id,
      destinatarioNome: novoLead.responsavel
    });
    // Notificações: a API/agenda deve cuidar, evitamos gravar localmente.
    try { writeLS('notificacoes', notificacoes); } catch {}
  } catch (e) {
    console.warn('[ORÇAMENTO] Erro ao gravar notificacoes locais', e);
  }

  switch (String(nextAction || '').toLowerCase()) {
    case 'evento':
      window.location.href = `orcamento-detalhado.html?id=${encodeURIComponent(novoLead.id)}`;
      break;

    case 'proposta':
      // M33: publicar "Proposta enviada" (antes de abrir o preview)
      try {
        const validadeISO = addDaysISO(novoLead.dataEventoISO || "", 7);
        notifyPropostaEnviada({
          id: `prop_${novoLead.id}`,        // id de proposta local
          leadId: novoLead.id,              // vínculo do feed com o lead
          clienteNome: novoLead.nome || 'Cliente',
          total: Number(novoLead.valorTotal || 0),
          validadeISO                       // hoje+7 (ou baseado na data do evento, se houver)
        });
      } catch(e) { console.warn('M33: notifyPropostaEnviada (via salvarLeadFunil) falhou', e); }

      __abrirPropostaPreview(novoLead);
      break;

    case 'degustacao': {
      let iso = novoLead.dataEventoISO || "";
      if (!iso) {
        const v = String(novoLead.dataEvento || "");
        const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) iso = `${m[3]}-${m[2]}-${m[1]}`;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) iso = v;
      }
      const url = new URL("degustacoes-disponiveis.html", location.href);
      if (iso) url.searchParams.set("data", iso);
      window.location.href = url.toString();
      break;
    }

    default:
      window.location.href = "funil-leads.html";
  }

  // === PATCH B2: fallback de persistência do lead (se saveLead não existir) ===
  if (typeof window.saveLead !== "function") {
    window.saveLead = function(lead){
      try {
        const arr = JSON.parse(sessionStorage.getItem("leads") || "[]") || [];
        const ix = arr.findIndex(l => String(l.id) === String(lead.id));
        if (ix >= 0) arr[ix] = { ...arr[ix], ...lead };
        else arr.unshift(lead);
        try { persistLeadsArray(arr); } catch {}
      } catch (e) { console.warn("fallback saveLead:", e); }
    };
  }
}

// =========================================
//   Fluxo: Gerar Proposta + preview
//   (reaproveitando salvarLeadFunil)
// =========================================
async function gerarProposta() {
  // 1) Garante que tem pelo menos um cardápio selecionado
  const radiosSel = document.querySelectorAll("#cardapiosLista input[type='radio']:checked");
  if (!radiosSel.length) {
    alert("Selecione ao menos uma faixa de um cardápio para gerar a proposta.");
    return;
  }

  // 2) Usa o mesmo fluxo de salvarLeadFunil,
  //    mas pedindo a ação 'proposta'
  try {
    salvarLeadFunil("proposta");
  } catch (e) {
    console.error("Erro ao gerar proposta:", e);
    alert("Não foi possível gerar a proposta. Confira os campos e tente novamente.");
  }
}


// =========================================
//   Modais & stubs auxiliares
// =========================================
function abrirModalPacotes() {
  const modal = $("modalPacotes");
  const lista = $("listaPacotesModal");
  if (!modal || !lista) return;

  lista.innerHTML = "";
  const pacotes = getJSON("pacotes", []);
  pacotes.forEach(p => {
    if (p.ativo !== false) {
      const item = document.createElement("div");
      item.className = "flex items-center gap-3";
      item.innerHTML = `
        <input type="checkbox" id="pacote_${p.nome}" value="${p.nome}" data-preco="${p.preco}">
        <label for="pacote_${p.nome}">${p.nome} – R$ ${parseFloat(p.preco).toFixed(2)}</label>
      `;
      lista.appendChild(item);
    }
  });

  modal.classList.remove("hidden");
}
function fecharModalPacotes(){ $("modalPacotes")?.classList.add("hidden"); }
function adicionarPacotesSelecionados() {
  const checkboxes = document.querySelectorAll("#listaPacotesModal input[type='checkbox']:checked");
  const container = $("tagPacote");
  if (!container) return;

  checkboxes.forEach(cb => {
    const nome = cb.value;
    const tag = document.createElement("div");
    tag.className = "tag-item";
    tag.innerHTML = `${nome} <button type="button" onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(tag);
  });

  fecharModalPacotes();
  calcularValorTotal();
}

// ===== Degustação via Orçamento =====
(function(){
  function $(id){ return document.getElementById(id); }
  function getLS(k, fb){ try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(fb)); } catch { return fb; } }
  function setLS(k, v){ localStorage.setItem(k, JSON.stringify(v)); }

  function toBR(iso){
    var m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3]+'/'+m[2]+'/'+m[1]) : String(iso||'');
  }

  // Abre o modal e carrega as datas de 'degustacoesDisponiveis'
  window.abrirModalDegustacao = function(){
    var modal = $('modalDeg'), sel = $('selDeg'), extra = $('degCamposExtra');
    if (!modal || !sel) return;

    var slots = getLS('degustacoesDisponiveis', []);
    if (!Array.isArray(slots)) slots = [];

    sel.innerHTML = slots.length
      ? '<option value="">Selecione…</option>' + slots.map(function(s){
          var label = toBR(s.data)+' • '+(s.hora||'')+' • '+(s.local||'')+' • '+(s.cardapio||'-');
          var val   = [s.data, s.hora, s.local, s.cardapio||''].join('|');
          return '<option value="'+val+'">'+label+'</option>';
        }).join('')
      : '<option value="">— não há datas cadastradas —</option>';

    if (extra) extra.style.display = 'none';

    // pré-preenche nome (se existir no formulário do orçamento)
    var nomePadrao = ($('nome') && $('nome').value) || ($('clienteNome') && $('clienteNome').value) || '';
    var nomeI = $('degNomeCasal'), acompI = $('degAcomp');
    if (nomeI) nomeI.value = nomePadrao;
    if (acompI) acompI.value = '0';

    sel.onchange = function(){
      if (extra) extra.style.display = sel.value ? 'block' : 'none';
    };

    modal.style.display = 'flex';
  };

  window.fecharModalDeg = function(){
    var modal = $('modalDeg');
    if (modal) modal.style.display = 'none';
  };

 })();

function confirmarDegustacao(){
  const getJSON = (k, fb=[]) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb; } catch { return fb; } };
  const setJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const pad = n => String(n).padStart(2,'0');
  const toISO = (s) => {
    // aceita "YYYY-MM-DD" ou "DD/MM/YYYY"
    const v = String(s||'').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
  };
  const toHora = (h) => {
    const v = String(h||'').trim();
    if (!v) return '';
    if (/^\d{1,2}$/.test(v)) return `${pad(Math.min(23, parseInt(v,10)||0))}:00`;
    const m = v.match(/(\d{1,2})\D?(\d{2})/);
    if (!m) return v;
    const H = pad(Math.min(23, Math.max(0, parseInt(m[1],10)||0)));
    const M = pad(Math.min(59, Math.max(0, parseInt(m[2],10)||0)));
    return `${H}:${M}`;
  };

  const select = document.getElementById("selDeg");
  if(!select){ alert("Seleção de degustação não encontrada."); return; }
  const o = select.options[select.selectedIndex];
  if(!o || (!o.dataset.data && !o.value)){
    alert("Escolha uma data/slot de degustação.");
    return;
  }

  // suporta os dois formatos: via dataset.* (novo) ou via value "data|hora|local|cardapio" (antigo)
  let dataISO = o.dataset.data || '';
  let hora    = o.dataset.hora || '';
  let local   = o.dataset.local || '';
  let cardapio= o.dataset.cardapio || '';
  if (!dataISO && o.value && o.value.includes("|")){
    const [d,h,l,c] = o.value.split("|");
    dataISO = d||''; hora=h||''; local=l||''; cardapio=c||'';
  }
  dataISO = toISO(dataISO);
  hora    = toHora(hora);

  // dados do formulário de orçamento (para contexto)
  const nomeLead = (document.getElementById("nome")?.value || "Lead").trim();
  const qtdEvento = parseInt((document.getElementById("convidados")?.value || "0").replace(/\D/g,''),10) || 0;

  // campos extras do modal
  const nomeCasal = (document.getElementById("degNomeCasal")?.value || nomeLead).trim();
  let zap = (document.getElementById("degWhats")?.value ||
             document.getElementById("whatsapp")?.value ||
             document.getElementById("telefone")?.value || "").replace(/\D/g,'');
  const acompanhantes = Math.max(0, parseInt(document.getElementById("degAcomp")?.value || "0",10) || 0);
  const pessoasTotal = 2 + acompanhantes; // casal + extras

  // salva no 'agenda' (compromissos)
  const agenda = getJSON("agenda", []);
  const idAgd = "agd_"+Date.now().toString(36);
  agenda.push({
    id: idAgd,
    tipo: "degustacao",
    titulo: `Degustação – ${nomeCasal || nomeLead}`,
    data: dataISO,
    hora,
    local,
    cardapio,
    criadoEm: new Date().toISOString(),
    status: "pendente",

    // gestão da degustação
    casalNome: nomeCasal,
    casalWhats: zap,
    acompanhantes,
    pessoasTotal,
    compareceu: "pendente",

    // contexto do orçamento
    qtd: qtdEvento,
    observacao: `Cardápio: ${cardapio || "-"}`
  });
  setJSON("agenda", agenda);

  // publica na Agenda Unificada (+ feed curto) se a ponte estiver carregada
  try {
    // card na agenda unificada
    window.__agendaBridge?.upsertUnifiedItem({
      id: `deg:${idAgd}`,
      src: 'degustacao',
      title: `Degustação • ${nomeCasal || nomeLead}`,
      date: dataISO,
      timeStart: hora,
      status: 'scheduled',
      audience: 'operacao',
      entity: { type:'interno', id: idAgd },
      desc: local ? `Local: ${local}` : (cardapio ? `Cardápio: ${cardapio}` : '')
    });

    // feed curto (recentes)
    window.__agendaBridge?.publishNotificationFeed?.({
      id:`feed:deg:new:${idAgd}`,
      title:`Degustação agendada — ${nomeCasal || nomeLead}`,
      level:'info',
      createdAtISO:new Date().toISOString(),
      audience:'operacao',
      meta:{ data: dataISO, hora, local, cardapio }
    });
  } catch (e) {
    console.warn("agendaBridge (degustação) indisponível:", e);
  }

  // fecha modal + feedback
  try { fecharModalDeg(); } catch {}
  try { mostrarToast("Degustação adicionada na agenda (pendente)."); } catch {}

  // opcional: se quiser focar na aba de degustações da Agenda depois:
  // window.location.href = "degustacoes-disponiveis.html";
}

function agendarDegustacao(){ abrirModalDegustacao(); }
// Converte "YYYY-MM-DD" OU "DD/MM/YYYY" para ISO "YYYY-MM-DD".
// Se não reconhecer, retorna a string original (para não quebrar fluxos legados).
function toISODateLoose(s){
  const v = String(s || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;      // já ISO
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/aaaa
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}

// =========================================
//           Conflitos por data
// =========================================
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function lerLeads(){  try{ return readLS('leads', []) || []; }catch{ return []; } }
function lerAgenda(){ try{ return JSON.parse(localStorage.getItem('agenda') || '[]'); }catch{ return []; } }
function lerEventos(){try{ return JSON.parse(localStorage.getItem('eventos')|| '[]'); }catch{ return []; } }

function montarListaConflitos(conf){
  const lista = $('listaConflitosData');
  if (!lista) return;
  const itens = [];
  conf.leads.forEach(l => itens.push(
    `<li><b>Orçamento</b> — ${escapeHtml(l.nome||'Sem nome')} • ${escapeHtml(l.tipoEvento||l.tipo_evento||'')} • ${escapeHtml(l.qtd ? (l.qtd + ' pessoas') : '')}</li>`
  ));
  conf.eventos.forEach(e => itens.push(
    `<li><b>Evento</b> — ${escapeHtml(e.cliente||e.nome||'Sem nome')} • ${escapeHtml(e.titulo||e.tipo||'')} • ${escapeHtml(e.hora||e.horario||'')}</li>`
  ));
  conf.agenda.forEach(a => itens.push(
    `<li><b>Agenda</b> — ${escapeHtml(a.titulo||'Compromisso')} • ${escapeHtml(a.hora||a.horario||'')}</li>`
  ));

  lista.innerHTML = itens.length
    ? `<ul style="display:grid; gap:8px; padding-left:18px;">${itens.join('')}</ul>`
    : `<em>Nenhum conflito nesta data.</em>`;
}
function checarConflitosData(dataISO){
  const alvo = toISODateLoose(dataISO);
  const leads   = lerLeads().filter(l => {
    const iso = l.dataEventoISO || toISODateLoose(l.dataEvento || l.data_evento);
    return iso === alvo;
  });
  const agenda  = lerAgenda().filter(a => toISODateLoose(a.data) === alvo);
  const eventos = lerEventos().filter(e => toISODateLoose(e.data) === alvo);
  return { leads, agenda, eventos };
}

document.getElementById("data_evento")?.addEventListener('change', (e) => {
  const iso = toISODateLoose(e.target.value);
  if (iso) atualizarConflitosParaData(iso);
});
function abrirModalConflitos(){ const m = $('modalConflitosData'); if (m) m.style.display = 'flex'; }
function fecharModalConflitos(){ const m = $('modalConflitosData'); if (m) m.style.display = 'none'; }
function atualizarConflitosParaData(dataISO){
  const conf = checarConflitosData(dataISO);
  const total = conf.leads.length + conf.agenda.length + conf.eventos.length;
  if (total > 0){
    montarListaConflitos(conf);
    abrirModalConflitos();
  } else {
    fecharModalConflitos();
  }
}

// =========================================
//           Mensagem (WhatsApp)
// =========================================
function getModelo(slug, padrao = "") {
  const v = localStorage.getItem(`modelo_${slug}`);
  return (v ?? padrao);
}
function htmlToText(s){
  const div = document.createElement('div');
  div.innerHTML = s || "";
  return (div.textContent || div.innerText || "").trim();
}
function leadFromForm(){
  const qtd = parseInt(($("convidados")?.value || "0").replace(/\D/g,''),10) || 0;
  const total = (typeof calcularValorTotal === "function") ? calcularValorTotal(true) : 0;

  return {
    nome: ($("nome")?.value || "").trim(),
    whatsapp: ($("whatsapp")?.value || "").trim(),
    telefone: ($("telefone")?.value || "").trim(),
    email: ($("email")?.value || "").trim(),
    dataEvento: $("data_evento")?.value || "",
    horarioEvento: $("horario_evento")?.value || "",
    tipoEvento: $("tipo_evento")?.value || "",
    local: ($("local_evento")?.value || "").trim(),
    qtd,
    valorTotal: total
  };
}
function leadToValues(lead){
  return {
    nomeCliente: lead.nome || "",
    dataEvento: lead.dataEvento || "",
    horaEvento: lead.horarioEvento || "",
    tipoEvento: lead.tipoEvento || "",
    localEvento: lead.local || "",
    qtdConvidados: String(lead.qtd || ""),
    valorTotal: Number(lead.valorTotal || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }),
    whatsappCliente: lead.whatsapp || "",
    emailCliente: lead.email || "",
    dataAtual: new Date().toLocaleDateString('pt-BR'),
    linkProposta: ""
  };
}
function enviarMensagemOrcamento(){
  const lead = leadFromForm();

  if(!lead.whatsapp && !lead.telefone){
    alert("Preencha o WhatsApp ou Telefone para enviar a mensagem.");
    return;
  }

  const values = leadToValues(lead);

  try{
    const leads = readLS('leads', []) || [];
    const ultimo = leads[leads.length-1];
    const link = ultimo ? sessionStorage.getItem(`linkPublico:${ultimo.id}`) : "";
    if(link) values.linkProposta = link;
  }catch{}

  const modelo = getModelo('mensagem_orcamento_whats',
    'Olá {{nomeCliente}}, tudo bem? Seu orçamento estimado é de {{valorTotal}} para {{dataEvento}}. '+
    'Qualquer dúvida fico à disposição. {{linkProposta}}'
  );

  const base = /<[^>]+>/.test(modelo) ? htmlToText(modelo) : modelo;
  const msg = (window.replaceVars ? window.replaceVars(base, values, true) : base);

  let tel = (lead.whatsapp || lead.telefone || "").replace(/\D/g,'');
  if (tel.length <= 11) tel = '55' + tel;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

// =========================================
function initTabs(){
  document.querySelectorAll('.tabs .tab').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      document.querySelectorAll('.tabs .tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(btn.dataset.target);
      if (pane) pane.classList.add('active');
    });
  });
}

// =========================================
//                 Boot
// =========================================
document.addEventListener("DOMContentLoaded", () => {
  window.lucide?.createIcons?.();

  preencherSelects();
  preencherCardapios();
  preencherAdicionais();
  preencherServicos();

  atualizarBadgeAdicionais();
  atualizarBadgeServicos();
  calcularValorTotal();
  initTabs();

  // listeners dos botões (além dos onclicks do HTML)
  $("btnSalvarLead")?.addEventListener("click", salvarLeadFunil);
  $("btnGerarProposta")?.addEventListener("click", gerarProposta);

  // recalcular quando mudar descontos/quantidade
  ["desconto_reais","desconto_porcentagem"].forEach(id => {
    $(id)?.addEventListener("input", () => calcularValorTotal());
  });
  $("convidados")?.addEventListener("input", () => calcularValorTotal());

  $("desconto_porcentagem")?.addEventListener("input", (e) => {
    let v = parseFloat(e.target.value) || 0;
    v = Math.min(100, Math.max(0, v));
    e.target.value = v;
    calcularValorTotal();
  });

// ===== Expor funções para onclick no HTML =====
window.salvarLeadFunil = salvarLeadFunil;
window.gerarProposta = gerarProposta;
window.enviarMensagemOrcamento = enviarMensagemOrcamento;

window.abrirModalPacotes = abrirModalPacotes;
window.fecharModalPacotes = fecharModalPacotes;
window.adicionarPacotesSelecionados = adicionarPacotesSelecionados;

window.agendarDegustacao = agendarDegustacao;
window.fecharModalDeg = fecharModalDeg;
window.confirmarDegustacao = confirmarDegustacao;

// ==== INSERIR MODELOS NAS OBSERVAÇÕES (picker embutido) ====

// tenta achar seu botão (aceita alguns ids comuns)
(function attachModeloPicker(){
  const IDS = ['btnInserirModelo','btnInserirModeloEnviado','btnInserirModeloObs'];
  const btn = IDS.map(id => document.getElementById(id)).find(Boolean);
  if (!btn) return;
  // renomeia o rótulo (opcional)
  try { if (!btn.dataset.keepLabel) btn.textContent = 'Inserir modelo'; } catch {}
  btn.addEventListener('click', openModelPicker);
})();

const MODELOS_INDEX_KEY = 'modelos_index';
const MODELOS_PREFIX    = 'modelo_';

function readModelIndex(){
  try {
    const arr = JSON.parse(localStorage.getItem(MODELOS_INDEX_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function getModelContent(slug){
  return localStorage.getItem(MODELOS_PREFIX + slug) || '';
}


function openModelPicker(){
  const has = readModelIndex();
  if (!has.length){
    alert('Nenhum modelo cadastrado ainda. Abra a página "Modelos" para criar.');
    return;
  }

  // cria o <dialog> só uma vez
  let dlg = document.getElementById('mp-dialog');
  if (!dlg){
    dlg = document.createElement('dialog');
    dlg.id = 'mp-dialog';
    dlg.innerHTML = `
      <form method="dialog" class="mp-wrap">
        <div class="mp-head">
          <h3 style="margin:0">Inserir modelo nas observações</h3>
          <input id="mp-search" placeholder="Buscar modelo..." />
        </div>

        <div class="mp-body">
          <div class="mp-list" id="mp-list"></div>
          <div class="mp-preview" id="mp-preview"><em>Selecione um modelo para visualizar</em></div>
        </div>

        <div class="mp-foot">
          <label style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" id="mp-append" checked>
            <span>Adicionar ao final das observações existentes</span>
          </label>
          <div style="flex:1"></div>
          <button value="cancel" class="mp-btn light">Cancelar</button>
          <button id="mp-insert" value="default" class="mp-btn" disabled>Inserir</button>
        </div>
      </form>
    `;
    const css = document.createElement('style');
    css.textContent = `
      #mp-dialog::backdrop{background:rgba(0,0,0,.25)}
      .mp-wrap{width:min(900px,90vw);}
      .mp-head{display:flex;gap:10px;align-items:center;margin-bottom:8px}
      .mp-head input{flex:1;padding:8px 10px;border:1px solid #eadfd1;border-radius:8px}
      .mp-body{display:grid;grid-template-columns: 1fr 1.4fr;gap:12px;min-height:340px}
      .mp-list{border:1px solid #eadfd1;border-radius:8px;overflow:auto;background:#fff}
      .mp-item{padding:10px 12px;border-bottom:1px solid #f1e8da;cursor:pointer}
      .mp-item:last-child{border-bottom:none}
      .mp-item.active{background:#fff7ee}
      .mp-preview{border:1px solid #eadfd1;border-radius:8px;padding:12px;background:#fff;overflow:auto}
      .mp-foot{display:flex;gap:10px;align-items:center;margin-top:12px}
      .mp-btn{background:#c29a5d;color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer}
      .mp-btn.light{background:#e6ded2;color:#5a4b3f}
    `;
    document.head.appendChild(css);
    document.body.appendChild(dlg);
  }

  const listEl    = dlg.querySelector('#mp-list');
  const prevEl    = dlg.querySelector('#mp-preview');
  const searchEl  = dlg.querySelector('#mp-search');
  const insertBtn = dlg.querySelector('#mp-insert');
  let selectedSlug = null;

  function renderList(q=''){
    const termo = q.trim().toLowerCase();
    const itens = readModelIndex()
      .slice()
      .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))
      .filter(m => String(m.nome||'').toLowerCase().includes(termo));
    listEl.innerHTML = itens.map(m => `<div class="mp-item" data-slug="${m.slug}">${m.nome}</div>`).join('');
    // estado vazio
    if (!itens.length){
      prevEl.innerHTML = '<em>Nenhum modelo encontrado para esse filtro.</em>';
      insertBtn.disabled = true;
      selectedSlug = null;
    }
  }

  listEl.onclick = (ev)=>{
    const item = ev.target.closest('.mp-item');
    if(!item) return;
    listEl.querySelectorAll('.mp-item.active').forEach(el=>el.classList.remove('active'));
    item.classList.add('active');
    selectedSlug = item.dataset.slug;
    const html = getModelContent(selectedSlug);
    prevEl.innerHTML = html || '<em>(vazio)</em>';
    insertBtn.disabled = !html;
  };
  searchEl.oninput = ()=>renderList(searchEl.value);

  renderList();
  dlg.showModal();

  insertBtn.onclick = ()=>{
    const html = getModelContent(selectedSlug || '');
    if (!html) return;
    const texto = htmlToText(html); // Observações é texto simples
    const obs = document.getElementById('observacoes');
    if (!obs){ alert('Campo "Observações" não encontrado.'); return; }

    const append = dlg.querySelector('#mp-append').checked;
    if (append && obs.value.trim()){
      obs.value = obs.value.replace(/\s*$/,'') + '\n\n' + texto;
    } else {
      obs.value = texto;
    }
    // dispara evento para qualquer lógica que dependa do input
    obs.dispatchEvent(new Event('input', {bubbles:true}));
    dlg.close();
  };
}
  });