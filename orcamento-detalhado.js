function parseDataLocal(str){
  if(!str) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // yyyy-mm-dd
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);   // dd/mm/aaaa
  if(m) return new Date(+m[3], +m[2]-1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function formatBRDate(v){
  const d = parseDataLocal(v);
  if(!d) return "-";
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ==== Orçamento Detalhado – JS ====

// Helpers
const $ = (id) => document.getElementById(id);
const getJSON = (k, def=[]) => { try{ return JSON.parse(localStorage.getItem(k) ?? (Array.isArray(def)?"[]":"{}")) || def; } catch{ return def; } };
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const toNumber = (v) => {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (v == null) return 0;
  let s = String(v).trim();
  if (/,/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g,"").replace(/,/g,".");
  s = s.replace(/[^\d.-]/g,"");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};
const brl = n => Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const toB64Json = (o)=>{ try{ return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }catch{ return ""; } };
function getUsuarioAtual(){
  try {
    return JSON.parse(localStorage.getItem('usuarioLogado') || sessionStorage.getItem('usuarioLogado') || '{}') || {};
  } catch { return {}; }
}
function isAdmin(u){
  const p = String(u?.perfil || '').toLowerCase().trim();
  return ['administrador','administradora','admin','adm'].includes(p);
}
function getUsuariosAtivos(){
  try {
    const arr = JSON.parse(localStorage.getItem('usuarios') || '[]') || [];
    return arr.filter(u => ['administrador','vendedor'].includes(String(u?.perfil||'').toLowerCase()));
  } catch { return []; }
}
// === Helper: envia item de histórico para a API (/leads/historico) ===
function enviarHistoricoApi(tipo, observacao) {
  try {
    if (!lead || !lead.id) return;

    const agora = new Date();
    const item = {
      data: agora.toLocaleString("pt-BR"),
      dataISO: agora.toISOString(),
      tipo,
      observacao,
      responsavel: lead.responsavel
    };

    if (window.postLeadHistorico) {
      // usa helper do api-config.js
      window.postLeadHistorico(lead.id, item);
    } else if (window.handleRequest) {
      // fallback: usa o remote-adapter, se existir
       window.handleRequest('/leads/historico', {
        method: 'POST',
        body: {
          leadId: String(lead.id),
          item
        }
      });


    }
  } catch (e) {
    console.warn('[HIST] Falha ao enviar histórico para API', e);
  }
}

function consumirPropostaLogsParaLead(lead){
  if (!lead || !lead.id) return;

  let logs = [];
  try {
    logs = JSON.parse(localStorage.getItem('propostaLogs') || '[]') || [];
  } catch {
    logs = [];
  }
  if (!Array.isArray(logs) || !logs.length) return;

  const token = lead.token || null;

  const match = (e) => {
    if (String(e.leadId || e.lead_id || '') === String(lead.id)) return true;
    if (token && e.token) return String(e.token) === String(lead.token);
    return false;
  };

  const restantes = [];
  const novosHistoricos = [];

  for (const e of logs){
    if (match(e)){
      let obs = "";
      if (e.tipo === 'click-whats')
        obs = "Cliente recebeu a proposta via WhatsApp (clique na pública).";
      else if (e.tipo === 'click-email')
        obs = "Cliente recebeu a proposta por E-mail (clique na pública).";
      else
        obs = "Interação registrada na proposta pública.";

      novosHistoricos.push({
        data: new Date(e.ts || Date.now()).toLocaleString('pt-BR'),
        dataISO: new Date(e.ts || Date.now()).toISOString(),
        tipo: "Envio",
        observacao: obs,
        responsavel: lead.responsavel
      });
    } else {
      restantes.push(e);
    }
  }

  if (!novosHistoricos.length) {
    return;
  }

  // 1) Atualiza o objeto em memória
  (lead.historico ||= []).push(...novosHistoricos);

  // 2) Atualiza também no localStorage.leads (para continuar funcionando offline)
  try {
    const leads = JSON.parse(localStorage.getItem('leads') || '[]') || [];
    const idx = leads.findIndex(l => String(l.id) === String(lead.id));
    if (idx !== -1) {
      const arrHist = Array.isArray(leads[idx].historico) ? leads[idx].historico : [];
    leads[idx].historico = [...arrHist, ...novosHistoricos];

      localStorage.setItem('leads', JSON.stringify(leads));
    }
  } catch (e) {
    console.warn('[Histórico] Falha ao salvar no localStorage:', e);
  }

  // 3) Envia esses históricos para a API (/leads/historico)
  try {
    if (window.handleRequest) {
      const payload = novosHistoricos.map(h => ({
        leadId: lead.id,
        dataISO: h.dataISO,
        tipo: h.tipo,
        observacao: h.observacao,
        responsavel: h.responsavel || lead.responsavel || null
      }));
      window.handleRequest('/leads/historico', {
        method: 'POST',
        body: { historicos: payload }
      });
    }
  } catch (e) {
    console.warn('[Histórico] Falha ao enviar para /leads/historico:', e);
  }

  // 4) Limpa o buffer de logs de proposta
  try {
    localStorage.setItem('propostaLogs', JSON.stringify(restantes));
  } catch (e) {
    console.warn('[Histórico] Falha ao atualizar propostaLogs:', e);
  }
}


function pushNotificacaoAtribuicao(lead, user){
  const arr = JSON.parse(localStorage.getItem('notificacoes') || '[]') || [];
  arr.push({
    id: Date.now(),
    ts: Date.now(),
    tipo: 'atribuição',
    lido: false,
    destinatarioNome: (user?.nome || user?.email || '').trim(),
    destinatarioPerfil: String(user?.perfil||'').toLowerCase(),
    titulo: 'Novo lead atribuído',
    mensagem: `Você foi definido como responsável por “${lead?.nome || ('Lead '+lead?.id)}”.`,
    leadId: lead?.id
  });
  localStorage.setItem('notificacoes', JSON.stringify(arr));
}

// === Tabs helpers e limpeza de aviso ===
function ensureTabsCSS(){
  if(document.getElementById('modal-cardapio-css')) return;
  const st = document.createElement('style');
  st.id = 'modal-cardapio-css';
  st.textContent = `
    #modal-cardapio [id^="tab-"]{display:none}
    #modal-cardapio [id^="tab-"].on{display:block}
  `;
  document.head.appendChild(st);
}
function bindTabsModalCardapio(){
  const modal = document.getElementById("modal-cardapio");
  if (!modal) return;
  const buttons = modal.querySelectorAll(".tabs-mini [data-tab]");
  if (!buttons.length) return;

  buttons.forEach(btn=>{
    btn.onclick = ()=>{
      // ativa botão
      buttons.forEach(b=>b.classList.remove("on"));
      btn.classList.add("on");
      // troca conteúdo
      ["cardapio","adicionais","servicos"].forEach(id=>{
        const pane = modal.querySelector("#tab-"+id);
        if (pane) pane.classList.toggle("on", id === btn.dataset.tab);
      });
    };
  });
}

function activateTab(tab){
  document.querySelectorAll('#modal-cardapio .tabs-mini [data-tab]')
    .forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['cardapio','adicionais','servicos','descontos'].forEach(id=>{
    const el = document.getElementById('tab-'+id);
    if(el) el.classList.toggle('on', id===tab);
  });
}
function removeEditorCompletoAviso(){
  Array.from(document.querySelectorAll('#modal-cardapio *')).forEach(el=>{
    if(/editor completo/i.test(el.textContent||'')) el.remove();
  });
}

// Estado
let lead = null;
let shareUrl = "";
let modoEdicao = false;
let modalCardapios = [];

// --- Boot ---
// Agora tentamos SEMPRE buscar o lead (e o histórico) na API primeiro
document.addEventListener("DOMContentLoaded", async () => {
  window.lucide?.createIcons?.();

  const id = new URLSearchParams(location.search).get("id")
           || new URLSearchParams(location.search).get("leadId");

  if (!id) {
    renderErro("Link inválido: parâmetro 'id' não informado.");
    return;
  }

  // 1) Base local (backup / offline): o que já existir no navegador
  let leads = getJSON("leads", []);
  lead = leads.find(l => String(l.id) === String(id)) || null;

  // 2) Tenta buscar a versão oficial na API
  if (window.getLeadById) {
    try {
      const apiLead = await window.getLeadById(id);
      if (apiLead && apiLead.id) {
        // usa o lead que veio do backend (com histórico atualizado)
        lead = apiLead;

        // guarda uma cópia atualizada no localStorage (cache)
        const idx = leads.findIndex(l => String(l.id) === String(apiLead.id));
        if (idx >= 0) {
          leads[idx] = { ...leads[idx], ...apiLead };
        } else {
          leads.push(apiLead);
        }
        localStorage.setItem("leads", JSON.stringify(leads));
      }
    } catch (e) {
      console.warn("[LEAD] Falha ao buscar na API, usando só o localStorage", e);
    }
  }

  if (!lead) {
    renderErro("Não foi possível localizar o lead.");
    return;
  }

  // 3) Consome logs da proposta pública → gera históricos e envia para /leads/historico
  try {
    consumirPropostaLogsParaLead(lead);
  } catch (e) {
    console.warn("[Histórico] consumirPropostaLogsParaLead falhou", e);
  }

  // 4) Garante que temos token para link público
  if (!lead.token) {
    const tok = Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,6);

    try {
      const idx = leads.findIndex(l => String(l.id) === String(lead.id));
      if (idx >= 0) {
        leads[idx].token = tok;
        localStorage.setItem("leads", JSON.stringify(leads));
        lead = leads[idx];
      } else {
        lead.token = tok;
      }
    } catch (e) {
      console.warn("[LEAD] Erro ao salvar token no localStorage", e);
    }
  }

  // 5) Renderiza a tela usando o lead que veio da API
  renderLead();
  renderResponsavelUI(lead);
  bindAcoes();
  bindRelacionamento();
  renderHistorico(); // monta a timeline com base no histórico do backend

  window.lucide?.createIcons?.();
});



function renderErro(msg){
  const box = document.querySelector(".card");
  if(box) box.innerHTML = `<p style="color:#b30000; font-weight:700;">❌ ${esc(msg)}</p>`;
}

// --- Render principal ---
function renderLead(){
  $("lead-nome").textContent = lead.nome || "-";
  $("lead-whatsapp").textContent = lead.whatsapp || "-";
  $("lead-telefone").textContent = lead.telefone || "-";
  $("lead-email").textContent = lead.email || "-";

  $("lead-data").textContent = formatBRDate(lead.dataEvento);
  $("lead-horario").textContent = lead.horarioEvento || "-";
  $("lead-local").textContent = lead.local || "-";
  $("lead-qtd").textContent = lead.qtd ?? "-";
  $("lead-tipo").textContent = lead.tipoEvento || "-";
  $("lead-como").textContent = lead.comoConheceu || "-";
// usando seu helper $
const elObs = document.getElementById("lead-observacoes");
if (elObs) elObs.textContent = lead.observacoes || "-";


  // Itens inclusos (cardápios + adicionais + serviços)
  const qtd = Number(lead.qtd || 0);
  let subtotal = 0;

  const lista = $("lista-itens");
  if (lista) lista.innerHTML = "";

  (lead.cardapios_enviados||[]).forEach(c=>{
    const valor = toNumber(c.valor);
    const total = qtd>0 ? valor*qtd : valor;
    subtotal += total;
    if (lista) lista.appendChild(
      blocoItem(c.nome||"Cardápio", qtd>0 ? `${brl(valor)} por pessoa × ${qtd} = ${brl(total)}` : `Valor: ${brl(valor)}`, total)
    );
  });

  (lead.adicionaisSelecionados||[]).forEach(a=>{
    const v = toNumber(a.valor);
    const tipo = String(a.cobranca||"pessoa").toLowerCase();
    const total = tipo==="pessoa" ? v*(qtd||0) : v;
    subtotal += total;
    if (lista) lista.appendChild(
      blocoItem(a.nome||"Adicional", tipo==="pessoa" ? `${brl(v)} por pessoa × ${qtd} = ${brl(total)}` : `Valor fixo: ${brl(v)}`, total)
    );
  });

  (lead.servicosSelecionados||[]).forEach(s=>{
    const v = toNumber(s.valor);
    const tipo = String(s.cobranca||"fixo").toLowerCase();
    const total = tipo==="pessoa" ? v*(qtd||0) : v;
    subtotal += total;
    if (lista) lista.appendChild(
      blocoItem(s.nome||"Serviço", tipo==="pessoa" ? `${brl(v)} por pessoa × ${qtd} = ${brl(total)}` : `Valor fixo: ${brl(v)}`, total)
    );
  });

  // Valores
  const dR = toNumber(lead.descontoReais);
  const dP = toNumber(lead.descontoPorcentagem);
  const descPerc = dP > 0 ? subtotal * (dP / 100) : 0;
  const desc = Math.min(subtotal, (dR > 0 ? dR : 0) + descPerc);
  const total = Math.max(0, subtotal - desc);
  const porPessoa = (Number(lead.qtd || 0) > 0) ? total / Number(lead.qtd) : 0;

  if ($("val-subtotal")) $("val-subtotal").textContent = brl(subtotal);
  if ($("val-desconto")) $("val-desconto").textContent = brl(desc);
  if ($("val-total"))    $("val-total").textContent    = brl(total);
  if ($("val-porpessoa"))$("val-porpessoa").textContent= brl(porPessoa);

  atualizarStatusVisualizacaoUI();


  shareUrl = montarLinkProposta(lead);
}
function renderResponsavelUI(lead){
  const viewBox  = document.getElementById('resp-view');
  const adminBox = document.getElementById('resp-admin');
  if (!viewBox) return;

  const userAtual = getUsuarioAtual();
  const admin = isAdmin(userAtual);
  const usuarios = getUsuariosAtivos();

  // valor atual
  const atualNome  = (lead?.responsavel?.nome || lead?.responsavelNome || lead?.responsavel || '').trim();
  const atualEmail = (lead?.responsavel?.email || lead?.responsavelEmail || '').trim();
  viewBox.textContent = atualNome || atualEmail || '—';

  // mostra edição só para admin
  if (!admin || !adminBox) { if (adminBox) adminBox.style.display = 'none'; return; }
  adminBox.style.display = 'flex';

  const sel = adminBox.querySelector('#selResponsavel');
  const btn = adminBox.querySelector('#btnSalvarResp');
if (sel) {
  sel.innerHTML = [
    '<option value="">— selecione —</option>',
    usuarios.map(u => {
      const label = (u?.nome || u?.email || '').trim();
      const match = [atualEmail.toLowerCase(), atualNome.toLowerCase()]
        .includes((u?.email || u?.nome || '').trim().toLowerCase());
      return `<option value="${encodeURIComponent(JSON.stringify(u))}" ${match ? 'selected' : ''}>${label}</option>`;
    }).join('')
  ].join('');
}

  if (btn) {
    btn.onclick = ()=>{
      const raw = sel?.value;
      if (!raw) return;
      const escolhido = JSON.parse(decodeURIComponent(raw));
      const leads = JSON.parse(localStorage.getItem('leads') || '[]') || [];
      const idx = leads.findIndex(l => String(l.id) === String(lead.id));
      if (idx >= 0) {
        leads[idx].responsavel       = escolhido?.nome || escolhido?.email;
        leads[idx].responsavelNome   = escolhido?.nome || '';
        leads[idx].responsavelEmail  = escolhido?.email || '';
        localStorage.setItem('leads', JSON.stringify(leads));
        // notificação opcional
        try { pushNotificacaoAtribuicao(leads[idx], escolhido); } catch {}
        window.showToast?.({title:'Salvo', message:'Responsável atualizado.'});
        // reflete na leitura
        viewBox.textContent = leads[idx].responsavelNome || leads[idx].responsavelEmail || '—';
      }
    };
  }
}

function blocoItem(nome, detalhe, total){
  const div = document.createElement("div");
  div.className = "bloco-item";
  div.innerHTML = `
    <div>
      <h4>${esc(nome)}</h4>
      <div class="muted">${esc(detalhe)}</div>
    </div>
    <div><strong>${brl(total)}</strong></div>`;
  return div;
}

function montarLinkProposta(l){
  const u = new URL("proposta.html", location.href);
  if(l?.token) u.searchParams.set("t", l.token);
  const p = toB64Json({ id: l.id, token: l.token });
  if(p) u.searchParams.set("p", p);
  return u.toString();
}

// --- Visualização UI ---
function atualizarStatusVisualizacaoUI(){
const box = $("visualizacao-status");
  const lista = $("lista-visualizacoes");
  if (!box || !lista) return; // ← evita erro se IDs mudarem
  const views = Number(lead.visualizacoes || 0);
  const dtISO = lead.dataVisualizacao;
  const dtFmt = dtISO ? new Date(dtISO).toLocaleString("pt-BR") : null;

  if(views>0){
    box.innerHTML = `<span style="display:flex;align-items:center;gap:8px;">
      <i data-lucide="eye" style="color:#1a7f37"></i>
      Visualizado ${dtFmt?`em ${esc(dtFmt)}`:""} • ${views} visualização${views>1?"es":""}
    </span>`;
  }else{
    box.innerHTML = `<span style="display:flex;align-items:center;gap:8px;">
      <i data-lucide="eye-off" style="color:#b30000"></i>
      Ainda não visualizado pelo cliente
    </span>`;
  }

  const itens = (lead.historico||[])
    .filter(h => String(h.tipo||"").toLowerCase().includes("visualiz"))
    .sort((a,b)=> (new Date(b.dataISO||b.data)) - (new Date(a.dataISO||a.data)));

  lista.innerHTML = itens.length
    ? itens.map(h=>`<div>• ${esc(h.data||"")} — ${esc(h.observacao||"Cliente abriu a proposta.")}</div>`).join("")
    : `<em>Sem registros de visualização</em>`;
// no final de atualizarStatusVisualizacaoUI(), depois de montar a lista:
if (lista && !lista.dataset.init) {
  lista.style.display = 'none';        // inicia fechada
  lista.dataset.init = '1';
}

  window.lucide?.createIcons?.();
}

// --- Ações botões principais ---
// --- Ações botões principais ---
function bindAcoes(){
  $("hamburguer")?.addEventListener("click", ()=> $("menuLateral")?.classList.toggle("aberto"));
  $("btnAbrirProposta")?.addEventListener("click", ()=> window.open(shareUrl,"_blank"));
  $("btnCopiarLink")?.addEventListener("click", async ()=>{
    await navigator.clipboard.writeText(shareUrl);
    registrarHistorico("Envio","Link da proposta copiado.");
    alert("Link copiado!");
  });

  // ✅ Criar evento (UM listener só)
  const btnCriar = $("btnCriarEvento");
  if (btnCriar) {
    btnCriar.addEventListener("click", () => {
      if (!lead) { alert("Lead não carregado."); return; }

      // payload que o cadastro-evento entende em ?p=
      const payload = {
        leadId:        lead.id,
        nome:          lead.nome,
        email:         lead.email,
        whatsapp:      lead.whatsapp || lead.telefone,
        data_evento:   lead.dataEvento,
        horario_evento:lead.horarioEvento,
        local_evento:  lead.local,
        tipo_evento:   lead.tipoEvento,
        convidados:    lead.qtd,
        observacoes:   lead.observacoes
      };

      const p = toB64Json(payload);
      const u = new URL("cadastro-evento.html", location.href);
      if (p) u.searchParams.set("p", p);
      if (lead && lead.id != null) u.searchParams.set("leadId", String(lead.id));
      location.href = u.toString();
    });
  }

  $("btnWhats")?.addEventListener("click", ()=>{
    const numero = (lead.whatsapp||"").replace(/\D/g,"");
    const msg = `Olá ${lead.nome||"cliente"}! Segue a sua proposta:\n${shareUrl}`;
    const url = numero ? `https://wa.me/55${numero}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    registrarHistorico("Envio","Proposta enviada por WhatsApp.");
    window.open(url,"_blank");
  });

  $("btnVerTudoViews")?.addEventListener("click", ()=>{ preencherModalViews(); openModal("modal-views"); });
  $("btnArquivar")?.addEventListener("click", abrirArquivar);
  $("btnConfirmArquivar")?.addEventListener("click", confirmarArquivar);
  $("btnEditarCardapio")?.addEventListener("click", ()=>{ ensureModalMarkup(); preencherModalCardapio(); openModal("modal-cardapio"); });
  document.addEventListener("click", (ev)=>{ const btn = ev.target.closest("#btnSalvarCardapio"); if(btn) salvarCardapioModal();
                                             const closeEl = ev.target.closest("#modal-cardapio [data-close]"); if(closeEl) closeModal(document.getElementById("modal-cardapio")); });
  $("btnEditarSalvar")?.addEventListener("click", toggleEdicaoDados);
  bindModalDismiss();
}


// --- Edição de dados (um botão que alterna Editar/Salvar) ---
const mapCampos = {
  "lead-nome":        { tipo:"text",   prop:"nome" },
  "lead-whatsapp":    { tipo:"text",   prop:"whatsapp" },
  "lead-telefone":    { tipo:"text",   prop:"telefone" },
  "lead-email":       { tipo:"email",  prop:"email" },
  "lead-data":        { tipo:"date",   prop:"dataEvento" },
  "lead-horario":     { tipo:"time",   prop:"horarioEvento" },
  "lead-tipo":        { tipo:"select", prop:"tipoEvento",   fonte:"tiposEvento" },
  "lead-como":        { tipo:"select", prop:"comoConheceu", fonte:"comoConheceu" },
  "lead-local":       { tipo:"text",     prop:"local" },
  "lead-qtd":         { tipo:"number",   prop:"qtd" },
  "lead-observacoes": { tipo:"textarea", prop:"observacoes" }
};

function buildSelectFromLS(id, listKey, selectedValue){
  const itens = getJSON(listKey,[]);
  const opts = ['<option value="">Selecione</option>']
    .concat(itens.map(v=>{
      const sel = String(v).toLowerCase()===String(selectedValue||"").toLowerCase() ? " selected" : "";
      return `<option value="${esc(v)}"${sel}>${esc(v)}</option>`;
    })).join("");
  return `<select id="${id}-edit" style="width:100%">${opts}</select>`;
}

function toggleEdicaoDados(){
  const btn = $("btnEditarSalvar");
  if(!btn) return;

  // ENTRAR EM EDIÇÃO
  if(!modoEdicao){
    modoEdicao = true;
    btn.innerHTML = `<i data-lucide="save"></i> Salvar`;

    Object.entries(mapCampos).forEach(([id,cfg])=>{
      const el = $(id); if(!el) return;
      el.dataset.viewHtml = el.innerHTML;
      const v = String(lead[cfg.prop] ?? "").trim();

      if (cfg.tipo === "textarea") {
        el.innerHTML = `<textarea id="${id}-edit" rows="3" style="width:100%;">${esc(v)}</textarea>`;
      } else if (cfg.tipo === "select") {
        el.innerHTML = buildSelectFromLS(id, cfg.fonte, lead[cfg.prop]);
      } else {
        let val = v;
        // ✅ usa o valor do próprio campo (não mais lead.dataEvento)
        if (cfg.tipo === "date") val = String(lead[cfg.prop] || "").slice(0,10);
        el.innerHTML = `<input id="${id}-edit" type="${cfg.tipo}" style="width:100%;" value="${esc(val)}">`;
      }
    });

    window.lucide?.createIcons?.();
    return;
  }

  // SALVAR E SAIR DA EDIÇÃO
  modoEdicao = false;

  const leads = getJSON("leads",[]);
  const idx = leads.findIndex(l => String(l.id)===String(lead.id));
  if(idx!==-1){
    Object.entries(mapCampos).forEach(([id,cfg])=>{
      const inp = $(`${id}-edit`); if(!inp) return;
      let val = (inp.value||"").trim();
      if(cfg.tipo==="number") val = Number(val||0);
      leads[idx][cfg.prop] = val;
    });

const histItem = {
  data: new Date().toLocaleString("pt-BR"),
  dataISO: new Date().toISOString(),
  tipo: "Edição",
  observacao: "Dados do orçamento atualizados.",
  responsavel: leads[idx].responsavel
};

(leads[idx].historico ||= []).push(histItem);

try {
  // manda também para a API
  enviarHistoricoApi(histItem.tipo, histItem.observacao);
} catch (e) {
  console.warn('[HIST] Falha ao enviar edição para API', e);
}


    localStorage.setItem("leads", JSON.stringify(leads));
    lead = leads[idx];
  }

  Object.keys(mapCampos).forEach(id=>{
    const el = $(id); if(!el) return;
    el.innerHTML = el.dataset.viewHtml || el.innerHTML;
  });

  // === M33: Próxima Ação (usa helpers do bridge) ===
  try {
    const dia = String(lead?.proximoContato || "").slice(0,10); // YYYY-MM-DD
    if (dia) {
      notifyProximaAcao(lead, dia, "Atualizado em Orçamento Detalhado");
    } else {
      // se o usuário limpou a data, marcamos como concluída
      notifyProximaAcaoConcluida(lead);
    }
  } catch(e){
    console.warn('M33: notifyProximaAcao (toggleEdicaoDados) falhou', e);
  }

  btn.innerHTML = `<i data-lucide="pencil"></i> Editar`;
  renderLead();
  renderHistorico();
  window.lucide?.createIcons?.();
  alert("Alterações salvas!");
}


// --- Próximo contato (data + hora + botão salvar) ---
function bindRelacionamento(){
  const inp = $("inpProximoContato");
  const btnSalvar = $("btnSalvarProximoContato");

  // preenche campo com a data (YYYY-MM-DD)
  if (inp) inp.value = String(lead.proximoContato || "").slice(0,10);

  if (inp && btnSalvar) {
    btnSalvar.addEventListener("click", () => {
      const novoRaw = (inp.value || "").trim();

      // normaliza: aceita "DD/MM/AAAA" ou "YYYY-MM-DD"
      let novo = "";
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(novoRaw)) {
        const m = novoRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        novo = `${m[3]}-${m[2]}-${m[1]}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(novoRaw)) {
        novo = novoRaw;
      } else if (!novoRaw) {
        novo = ""; // limpar
      } else {
        // formato desconhecido: não salva
        alert("Data inválida. Use DD/MM/AAAA ou YYYY-MM-DD.");
        return;
      }

      // evita trabalho se nada mudou
      if (String(lead.proximoContato || "").slice(0,10) === novo) {
        alert("Nada para salvar.");
        return;
      }

      const leads = getJSON("leads", []);
      const idx = leads.findIndex(l => String(l.id)===String(lead.id));
      if (idx !== -1) {
        leads[idx].proximoContato = novo;

const histItem = {
  data: new Date().toLocaleString("pt-BR"),
  dataISO: new Date().toISOString(),
  tipo: "Próximo contato",
  observacao: novo ? `Definido para ${formatBRDate(novo)}` : "Removido",
  responsavel: leads[idx].responsavel
};

(leads[idx].historico ||= []).push(histItem);

try {
  enviarHistoricoApi(histItem.tipo, histItem.observacao);
} catch (e) {
  console.warn('[HIST] Falha ao enviar próximo contato para API', e);
}


          localStorage.setItem("leads", JSON.stringify(leads));
        lead = leads[idx];

        // >>> NOVO: sincroniza próximo contato com a API (PUT /leads/:id)
        try {
          if (window.handleRequest && lead && lead.id) {
            window.handleRequest(`/leads/${lead.id}`, {
              method: "PUT",
              body: {
                proximoContato: novo || null
              }
            });
          }
        } catch (e) {
          console.warn("[PCONTATO] Erro ao atualizar próximo contato na API", e);
        }

        // === M33: Próxima Ação (helpers do bridge) ===

        try {
          const dia = String(lead?.proximoContato || "").slice(0,10);
          if (dia) {
            notifyProximaAcao(lead, dia, "Definido no Orçamento Detalhado");
          } else {
            notifyProximaAcaoConcluida(lead);
          }
        } catch(e){
          console.warn('M33: notifyProximaAcao (bindRelacionamento) falhou', e);
        }

        renderHistorico();
        alert("Próximo contato salvo!");
      }
    });
  }

  const btn = $("btnAddAnotacao");
  const txt = $("inpAnotacao");
  if (btn && txt) {
    btn.addEventListener("click", () => {
      const texto = (txt.value||"").trim();
      if (!texto) return;
      const leads = getJSON("leads", []);
      const idx = leads.findIndex(l => String(l.id)===String(lead.id));
      if (idx!==-1) {
       const histItem = {
  data: new Date().toLocaleString("pt-BR"),
  dataISO: new Date().toISOString(),
  tipo: "Anotação",
  observacao: texto,
  fav: false,
  responsavel: leads[idx].responsavel
};

(leads[idx].historico ||= []).push(histItem);

try {
  enviarHistoricoApi(histItem.tipo, histItem.observacao);
} catch (e) {
  console.warn('[HIST] Falha ao enviar anotação para API', e);
}

        localStorage.setItem("leads", JSON.stringify(leads));
        lead = leads[idx];
        txt.value = "";
        renderHistorico();
      }
    });
  }

  renderHistorico();
}

function registrarHistorico(tipo, observacao){
  const leads = getJSON("leads",[]);
  const idx = leads.findIndex(l => String(l.id)===String(lead.id));
  if(idx>-1){
    const histItem = {
      data: new Date().toLocaleString("pt-BR"),
      dataISO: new Date().toISOString(),
      tipo,
      observacao,
      responsavel: leads[idx].responsavel
    };

    (leads[idx].historico ||= []).push(histItem);
    localStorage.setItem("leads", JSON.stringify(leads));
    lead = leads[idx];

    // manda também para a API
    try {
      enviarHistoricoApi(histItem.tipo, histItem.observacao);
    } catch (e) {
      console.warn('[HIST] Falha ao enviar histórico (registrarHistorico) para API', e);
    }

    renderHistorico();
  }
}


// --- Histórico ---
function histKey(h){ return [h.dataISO||"", h.data||"", h.tipo||"", h.observacao||""].join("|"); }


function renderHistorico(){
  const boxAnot = document.getElementById("listaAnotacoes");
  const boxEd   = document.getElementById("listaEdicoes");
  if(!boxAnot || !boxEd) return;

  const hist = Array.isArray(lead.historico) ? [...lead.historico] : [];

  // separa
  const anot = hist.filter(h => /Anotação/i.test(h.tipo||""));
  const edits = hist.filter(h => /Edição/i.test(h.tipo||""));

  // ordenação: anotações -> favoritos primeiro, depois por data desc
  anot.sort((a,b)=>{
    const fa = a.fav?1:0, fb = b.fav?1:0;
    if(fb!==fa) return fb-fa;
    return (new Date(b.dataISO||b.data)) - (new Date(a.dataISO||a.data));
  });

  // ordenação: edições -> por data desc
  edits.sort((a,b)=> (new Date(b.dataISO||b.data)) - (new Date(a.dataISO||a.data)));

  // render anotações
  boxAnot.innerHTML = anot.length ? anot.map(h=>{
    const k = histKey(h);
    const dataTxt = esc(h.data || new Date(h.dataISO||Date.now()).toLocaleString("pt-BR"));
    const obs = esc(h.observacao || "");
    const favClass = h.fav ? "on" : "";
    const resp = h.responsavel ? ` • por ${esc(h.responsavel)}` : ""; // <- ADICIONADO
    return `
      <div class="hist-item" data-key="${esc(k)}">
       <div class="hist-meta"><strong>Anotação</strong> • ${dataTxt}${resp}</div>
        <div class="hist-text">${obs}</div>
        <div class="hist-actions">
          <button class="hist-fav ${favClass}" title="${h.fav?"Desfavoritar":"Favoritar"}">★</button>
          <button class="icon-btn hist-edit" title="Editar"><i data-lucide="pencil"></i></button>
          <button class="icon-btn hist-del"  title="Excluir"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
  }).join("") : `<em>Sem anotações ainda.</em>`;

  // render edições (somente leitura)
  boxEd.innerHTML = edits.length ? edits.map(h=>{
    const resp = h.responsavel ? ` • por ${esc(h.responsavel)}` : "";
    const dataTxt = esc(h.data || new Date(h.dataISO||Date.now()).toLocaleString("pt-BR"));
    const obs = esc(h.observacao || "Alterações no orçamento.");
        return `
      <div class="hist-item">
        <div class="hist-meta"><strong>Edição</strong> • ${dataTxt}${resp}</div>
        <div class="hist-text">${obs}</div>
      </div>`;
  }).join("") : `<em>Sem edições registradas ainda.</em>`;

  // === Outras interações (além de Anotação/Edição) ===
const outros = hist
  .filter(h => !/Anotação|Edição/i.test(h.tipo||""))
  .sort((a,b)=> (new Date(b.dataISO||b.data)) - (new Date(a.dataISO||a.data)));

if (outros.length) {
  boxEd.innerHTML += `
    <div class="linha"></div>
    <div class="hist-meta"><strong>Outras interações</strong></div>
  ` + outros.map(h=>{
    const dataTxt = esc(h.data || new Date(h.dataISO||Date.now()).toLocaleString("pt-BR"));
    const obs  = esc(h.observacao||"");
    const resp = h.responsavel ? ` • por ${esc(h.responsavel)}` : "";
    const tipo = esc(h.tipo||"");
    return `
      <div class="hist-item">
        <div class="hist-meta"><strong>${tipo}</strong> • ${dataTxt}${resp}</div>
        <div class="hist-text">${obs}</div>
      </div>`;
  }).join("");
}

  // binds — só para a coluna de anotações
  // fav
  boxAnot.querySelectorAll(".hist-fav").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.closest(".hist-item")?.dataset?.key || "";
      const leads = getJSON("leads",[]);
      const idx = leads.findIndex(l => String(l.id)===String(lead.id));
      if(idx===-1) return;
      const arr = leads[idx].historico || [];
      const ix = arr.findIndex(h => histKey(h)===key);
      if(ix>-1){
        arr[ix].fav = !arr[ix].fav;
        localStorage.setItem("leads", JSON.stringify(leads));
        lead = leads[idx];
        renderHistorico();
      }
    });
  });

  // editar anotação
  boxAnot.querySelectorAll(".hist-edit").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const item = btn.closest(".hist-item");
      const key = item?.dataset?.key || "";
      const atual = item.querySelector(".hist-text")?.textContent || "";
      const novo = prompt("Editar anotação:", atual);
      if(novo==null) return;
      const leads = getJSON("leads",[]);
      const idx = leads.findIndex(l => String(l.id)===String(lead.id));
      if(idx===-1) return;
      const arr = leads[idx].historico || [];
      const ix = arr.findIndex(h => histKey(h)===key);
      if(ix>-1){
        arr[ix].observacao = novo;
        localStorage.setItem("leads", JSON.stringify(leads));
        lead = leads[idx];
        renderHistorico();
      }
    });
  });

  // excluir anotação
  boxAnot.querySelectorAll(".hist-del").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(!confirm("Excluir esta anotação?")) return;
      const key = btn.closest(".hist-item")?.dataset?.key || "";
      const leads = getJSON("leads",[]);
      const idx = leads.findIndex(l => String(l.id)===String(lead.id));
      if(idx===-1) return;
      const arr = leads[idx].historico || [];
      const ix = arr.findIndex(h => histKey(h)===key);
      if(ix>-1){
        arr.splice(ix,1);
        localStorage.setItem("leads", JSON.stringify(leads));
        lead = leads[idx];
        renderHistorico();
      }
    });
  });

  window.lucide?.createIcons?.();
}



// --- Modal helpers ---
function ensureModalMarkup(){
  // já existe? só garante o handler de troca de abas
  const m = document.getElementById("modal-cardapio");
  if (m) {
    // delegação: clicar em um botão de aba troca os painéis
  if (!m.dataset._tabsBound) {
      m.addEventListener("click", (ev)=>{
      const btn = ev.target.closest('.tabs-mini [data-tab]');
      if(!btn) return;
      // ativa botão
      m.querySelectorAll('.tabs-mini [data-tab]').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      // mostra painel correspondente (somente 3 abas)
      ["cardapio","adicionais","servicos"].forEach(id=>{
        const pane = m.querySelector("#tab-"+id);
        if (pane) pane.classList.toggle("on", id === btn.dataset.tab);
      });
    });
    m.dataset._tabsBound = "1";
    }
    return m;
  }
  // Se por algum motivo o modal não existisse, não criamos nada novo aqui,
  // pois você já mantém o HTML do modal estaticamente no arquivo.
  return null;
}


function openModal(id){
  const m = document.getElementById(id) || (id==="modal-cardapio" ? ensureModalMarkup() : null);
  if(!m) return;
  m.classList.remove("oculto");
  m.setAttribute("aria-hidden","false");
  setTimeout(()=> window.lucide?.createIcons?.(), 0);
}

function closeModal(el){
  if(!el) return;
  el.classList.add("oculto");
  el.setAttribute("aria-hidden","true");
}
function bindModalDismiss(){
  document.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", ()=> closeModal(b.closest(".modal")) ));
  document.querySelectorAll(".modal").forEach(m=>{
    m.addEventListener("click", (e)=>{ if(e.target===m) closeModal(m); });
  });
}

// --- Modal: Visualizações ---
function preencherModalViews(){
  const box = $("views-list");
  if (!box) return; // ← evita erro se o container não estiver na página
  const itens = (lead.historico||[])
    .filter(h => String(h.tipo||"").toLowerCase().includes("visualiz"))
    .sort((a,b)=> (new Date(b.dataISO||b.data)) - (new Date(a.dataISO||a.data)));
  const total = itens.length;

  if(!total){ box.innerHTML = `<em>Sem visualizações registradas.</em>`; return; }

  box.innerHTML = `
    <div class="muted" style="margin-bottom:8px;">Total: <strong>${total}</strong></div>
    ${itens.map(h=>`<div>• ${esc(h.data||"")} — ${esc(h.observacao||"Cliente abriu a proposta.")}</div>`).join("")}
  `;
}

// --- Arquivar orçamento ---
function abrirArquivar(){
  const motivos = getJSON("motivosArquivamento",[]);
  const sel = $("selMotivoArquivar");
  sel.innerHTML = `<option value="">Selecione...</option>` + motivos.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("");
  openModal("modal-arquivar");
}
function confirmarArquivar(){
  const motivo = $("selMotivoArquivar").value.trim();
  const obs = ($("inpObsArquivar")?.value || "").trim();
  if (!motivo) {
    alert("Escolha um motivo.");
    return;
  }

  const leads = getJSON("leads", []);
  const idx = leads.findIndex(l => String(l.id) === String(lead.id));
  if (idx === -1) return;

  // Marca como arquivado (LOCAL)
  leads[idx].status = "Arquivados";
  leads[idx].arquivado = {
    motivo,
    observacoes: obs,
    dataISO: new Date().toISOString(),
    data: new Date().toLocaleString("pt-BR")
  };

  // Histórico de arquivamento
  const histItem = {
    data: new Date().toLocaleString("pt-BR"),
    dataISO: new Date().toISOString(),
    tipo: "Arquivamento",
    observacao: `Arquivado: ${motivo}${obs ? " — " + obs : ""}`,
    responsavel: leads[idx].responsavel
  };

  // grava histórico local
  (leads[idx].historico ||= []).push(histItem);

  // salva leads no localStorage e atualiza o lead atual
  localStorage.setItem("leads", JSON.stringify(leads));
  lead = leads[idx];

  // manda histórico para a API (/leads/historico)
  try {
    if (typeof enviarHistoricoApi === "function") {
      enviarHistoricoApi(histItem.tipo, histItem.observacao);
    }
  } catch (e) {
    console.warn("[HIST] Falha ao enviar Arquivamento para API", e);
  }

  // >>> NOVO: sincroniza status/arquivado com a API (PUT /leads/:id)
  try {
    if (window.handleRequest && lead && lead.id) {
      window.handleRequest(`/leads/${lead.id}`, {
        method: "PUT",
        body: {
          status: "Arquivados",
          arquivado: leads[idx].arquivado
        }
      });
    }
  } catch (e) {
    console.warn("[ARQ] Falha ao atualizar status Arquivados na API", e);
  }

  // fecha modal
  closeModal(document.getElementById("modal-arquivar"));

  // volta para o funil (onde ele não deve mais aparecer nas colunas ativas)
  window.location.href = "funil-leads.html";
}

// --- Editar cardápio/desconto ---
function ensureBox(id, parentSel="#modal-cardapio"){
  let el = document.getElementById(id);
  if (!el) {
    const parent = document.querySelector(parentSel) || document.getElementById("modal-cardapio");
    el = document.createElement("div");
    el.id = id;
    parent?.appendChild(el);
  }
  return el;
}

function preencherModalCardapio(){
  // Catálogos
  const catCard = (getJSON("produtosBuffet",[])||[]).filter(p => String(p?.tipo||"").toLowerCase()==="cardapio");
  const catAdd  = getJSON("adicionaisBuffet",[]);
  const catSrv  = getJSON("servicosBuffet",[]);

  // working copy
  modalCardapios = (lead.cardapios_enviados||[]).map(c=>({ nome: c.nome || "Cardápio", valor: toNumber(c.valor) }));

  // ======== CARDÁPIOS ========
  const boxC = ensureBox("listaEditarCardapio","#tab-cardapio");
  boxC.innerHTML = `
    <div class="row" style="gap:10px; align-items:center;">
      <div style="flex:1 1 220px;">
        <label style="display:block; font-weight:600; margin-bottom:6px;">Trocar cardápio</label>
        <select id="selNovoCardapio" style="width:100%;">
          <option value="">— selecione —</option>
          ${catCard.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("")}
        </select>
      </div>
      <div style="flex:1 1 280px;">
        <label style="display:block; font-weight:600; margin-bottom:6px;">Faixa</label>
        <select id="selFaixaCardapio" style="width:100%;" disabled>
          <option value="">Escolha um cardápio primeiro</option>
        </select>
      </div>
    </div>
    <div style="margin-top:12px;">
      <h4 style="margin:0 0 6px;">Atual</h4>
      <div id="listaCardapioAtual"></div>
    </div>
  `;
  const selCard  = $("selNovoCardapio");
  const selFaixa = $("selFaixaCardapio");
  selCard?.addEventListener("change", ()=>{
    selFaixa.innerHTML = "";
    const c = catCard.find(x => String(x.id)===String(selCard.value));
    if (!c || !Array.isArray(c.faixas) || !c.faixas.length){
      selFaixa.disabled = true;
      selFaixa.innerHTML = `<option value="">Sem faixas cadastradas</option>`;
      return;
    }
    selFaixa.disabled = false;
    selFaixa.innerHTML = `<option value="">— selecione a faixa —</option>` +
      c.faixas.map((f,ix)=>{
        const v = parseFloat(String(f.valor??"0").replace(/\./g,"").replace(",", "."))||0;
        const rot = (f.max!=null && f.max!=="") ? `${f.min}–${f.max}` : `${f.min}+`;
        return `<option value="${ix}" data-valor="${v}" data-nome="${esc(c.nome)}">${rot} • ${brl(v)} / pessoa</option>`;
      }).join("");
  });

  // render da lista “Atual” com botão X
  (function renderListaAtuais(){
    const boxAtual = ensureBox("listaCardapioAtual","#tab-cardapio");
    if(!modalCardapios.length){
      boxAtual.innerHTML = `<em>Nenhum cardápio selecionado neste orçamento.</em>`;
    }else{
      boxAtual.innerHTML = modalCardapios.map((c,ix)=>`
        <div class="row" data-ix="${ix}" style="align-items:center; gap:10px;">
          <div style="flex:1">
            <strong>${esc(c.nome)}</strong><br>
            <small>${brl(c.valor)} por pessoa</small>
          </div>
          <button class="btn-sec btn-sm btnRemCardapio" title="Remover"><i data-lucide="x"></i></button>
        </div>
      `).join("");
      boxAtual.querySelectorAll(".btnRemCardapio").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const ix = Number(btn.closest("[data-ix]")?.dataset?.ix||"-1");
          if(ix>=0){ modalCardapios.splice(ix,1); renderListaAtuais(); window.lucide?.createIcons?.(); }
        });
      });
    }
  })();

  // ======== ADICIONAIS ========
  const setAdd  = new Set((lead.adicionaisSelecionados||[]).map(a => String(a.nome||"").toLowerCase()));
  const boxA = ensureBox("listaEditarAdicionais","#tab-adicionais");
  boxA.innerHTML = catAdd.length
    ? catAdd.map(a=>{
        const valor = toNumber(a.valor);
        const cobr  = String(a.cobranca||"pessoa").toLowerCase();
        const checked = setAdd.has(String(a.nome||"").toLowerCase()) ? "checked" : "";
        return `
          <label class="row" style="gap:8px; align-items:center;">
            <input type="checkbox" class="chkAdd"
                   data-nome="${esc(a.nome||"")}"
                   data-valor="${valor}"
                   data-cobranca="${cobr}"
                   ${checked}>
            <div style="flex:1">
              <strong>${esc(a.nome||"Adicional")}</strong>
              <div class="muted">${brl(valor)}${cobr==="pessoa"?" / pessoa":""}</div>
            </div>
          </label>`;
      }).join("")
    : `<em>Nenhum adicional cadastrado.</em>`;

  // ======== SERVIÇOS ========
  const setSrv  = new Set((lead.servicosSelecionados||[]).map(s => String(s.nome||"").toLowerCase()));
  const boxS = ensureBox("listaEditarServicos","#tab-servicos");
  boxS.innerHTML = catSrv.length
    ? catSrv.map(s=>{
        const valor = toNumber(s.valor);
        const cobr  = String(s.cobranca||"fixo").toLowerCase();
        const checked = setSrv.has(String(s.nome||"").toLowerCase()) ? "checked" : "";
        return `
          <label class="row" style="gap:8px; align-items:center;">
            <input type="checkbox" class="chkSrv"
                   data-nome="${esc(s.nome||"")}"
                   data-valor="${valor}"
                   data-cobranca="${cobr}"
                   ${checked}>
            <div style="flex:1">
              <strong>${esc(s.nome||"Serviço")}</strong>
              <div class="muted">${brl(valor)}${cobr==="pessoa"?" / pessoa":""}</div>
            </div>
          </label>`;
      }).join("")
    : `<em>Nenhum serviço/pacote cadastrado.</em>`;

   // descontos atuais (cria se faltar)
  const descVal = $("inpDescValor");
  const descPer = $("inpDescPercent");
  if(descVal) descVal.value = (lead.descontoReais ?? "").toString();
  if(descPer) descPer.value = (lead.descontoPorcentagem ?? "").toString();

  removeEditorCompletoAviso();
  window.lucide?.createIcons?.();
}

function salvarCardapioModal(){
  const leads = getJSON("leads",[]);
  const idx   = leads.findIndex(l => String(l.id)===String(lead.id));
  if(idx===-1) return;

// descontos (sanitiza)
const descValEl = $("inpDescValor");
const descPerEl = $("inpDescPercent");
const descR = toNumber(descValEl ? descValEl.value : 0);
let   descP = toNumber(descPerEl ? descPerEl.value : 0);

// clamp 0–100
if (!isFinite(descP)) descP = 0;
descP = Math.max(0, Math.min(100, descP));

leads[idx].descontoReais       = descR > 0 ? descR : 0;
leads[idx].descontoPorcentagem = descP > 0 ? descP : 0;


  // cardápio novo (se selecionado) OU mantém/removidos via X
  const selFaixa = $("selFaixaCardapio");
  const optSel   = selFaixa && selFaixa.selectedOptions && selFaixa.selectedOptions[0];
  if (optSel && optSel.value){
    const valor = toNumber(optSel.dataset.valor);
    const nome  = optSel.dataset.nome || "Cardápio";
    leads[idx].cardapios_enviados = [{ nome, valor }]; // substitui
  }else{
    leads[idx].cardapios_enviados = Array.isArray(modalCardapios) ? modalCardapios : (leads[idx].cardapios_enviados||[]);
  }

  // adicionais
  const novosAdds = Array.from(document.querySelectorAll("#listaEditarAdicionais .chkAdd:checked"))
    .map(inp => ({ nome: inp.dataset.nome||"", valor: toNumber(inp.dataset.valor), cobranca: inp.dataset.cobranca||"pessoa" }));
  leads[idx].adicionaisSelecionados = novosAdds;

  // serviços
  const novosSrv = Array.from(document.querySelectorAll("#listaEditarServicos .chkSrv:checked"))
    .map(inp => ({ nome: inp.dataset.nome||"", valor: toNumber(inp.dataset.valor), cobranca: inp.dataset.cobranca||"fixo" }));
  leads[idx].servicosSelecionados = novosSrv;

  // histórico
  (leads[idx].historico ||= []).push({
  data: new Date().toLocaleString("pt-BR"),
  dataISO: new Date().toISOString(),
  tipo: "Edição",
  observacao: "Itens do orçamento atualizados (cardápio/adicionais/serviços) e descontos.",
  responsavel: leads[idx].responsavel
});


 // >>> NOVO: mandar esse histórico de edição para a API
  try {
    if (typeof enviarHistoricoApi === "function") {
      enviarHistoricoApi(
        "Edição",
        "Itens do orçamento atualizados (cardápio/adicionais/serviços) e descontos."
      );
    }
  } catch (e) {
    console.warn("[HIST] Falha ao enviar histórico de edição para API", e);
  }

  localStorage.setItem("leads", JSON.stringify(leads));
  lead = leads[idx];

  closeModal(document.getElementById("modal-cardapio"));
  renderLead();
  renderHistorico();
  alert("Alterações salvas!");
}
// ===== util =====
function _formatBR(yyyy_mm_dd){
  if(!yyyy_mm_dd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyy_mm_dd)) return String(yyyy_mm_dd||"");
  const [y,m,d] = yyyy_mm_dd.split("-");
  return `${d}/${m}/${y}`;
}
function _qs(s){ return document.querySelector(s); }
function _leadIdFromURL(){
  const u = new URL(location.href);
  return u.searchParams.get('id') || u.searchParams.get('leadId') || u.searchParams.get('lead') || "";
}
// fallback de toast
if (typeof window.showToast !== "function") {
  window.showToast = ({title, message, timeout=1600}={})=>{
    try{
      const el=document.createElement("div");
      el.style.cssText="position:fixed;right:12px;bottom:12px;background:#333;color:#fff;padding:10px 12px;border-radius:8px;z-index:9999;font-size:14px";
      el.textContent = (title?title+": ":"") + (message||"");
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), timeout);
    }catch{ alert((title?title+": ":"")+(message||"")); }
  };
}

// ===== Responsável (helpers) =====
function _usuarioAtual(){
  try{
    return JSON.parse(localStorage.getItem('usuarioLogado') || sessionStorage.getItem('usuarioLogado') || '{}') || {};
  }catch{ return {}; }
}
function _isAdmin(u){
  const p = String(u?.perfil||'').toLowerCase().trim();
  return ['administrador','administradora','admin','adm'].includes(p);
}
function _nomeResponsavelAtual(ld){
  return (
    ld?.responsavel?.nome || ld?.responsavelNome || ld?.responsavel ||
    ld?.vendedor?.nome    || ld?.vendedor       ||
    ld?.usuario?.nome     || ld?.usuario        || ''
  ).toString().trim();
}

function _popularOpcoesResponsaveis(selectEl, atualNome){
  const usuarios = JSON.parse(localStorage.getItem('usuarios') || '[]') || [];
  const ops = usuarios.filter(u =>
    ['administrador','vendedor'].includes(String(u?.perfil||'').toLowerCase())
  );

  selectEl.innerHTML =
    `<option value="">— selecione —</option>` +
    ops.map(u=>`<option
        value="${(u.email||u.nome||'').replace(/"/g,'&quot;')}"
        data-nome="${(u.nome||u.email||'').replace(/"/g,'&quot;')}"
        data-email="${(u.email||'').replace(/"/g,'&quot;')}"
        data-perfil="${(u.perfil||'').replace(/"/g,'&quot;')}"
      >${u.nome || u.email}</option>`).join('');

  // pré-seleciona
  const alvo = (atualNome||'').toLowerCase();
  const opt = Array.from(selectEl.options).find(o => (o.dataset.nome||'').toLowerCase() === alvo);
  if (opt) selectEl.value = opt.value;
}

function _notificarAtribuicao(novoNome, novoPerfil, ld){
  try{
    const arr = JSON.parse(localStorage.getItem('notificacoes') || '[]') || [];
    arr.push({
      id: 'ntf_'+Date.now(),
      tipo: 'lead-atribuido',
      mensagem: `Você foi atribuído ao lead "${ld?.nome || 'sem nome'}".`,
      lido: false,
      dataISO: new Date().toISOString(),
      destinatarioNome: novoNome,
      destinatarioPerfil: String(novoPerfil||'').toLowerCase(),
      leadId: ld?.id
    });
    localStorage.setItem('notificacoes', JSON.stringify(arr));
  }catch{}
  if (typeof atualizarBadgeNotificacoes === 'function') atualizarBadgeNotificacoes();
}

function setupResponsavelUI(){
  const view = $('resp-view');
  const adminBox = $('resp-admin');
  const sel = $('selResponsavel');
  const btn = $('btnSalvarResp');

  if (!view) return;

  // mostra nome atual
  const nomeAtual = _nomeResponsavelAtual(lead) || '—';
  view.textContent = nomeAtual || '—';

  // só admins podem editar
  const u = _usuarioAtual();
  if (!adminBox || !_isAdmin(u)) return;

  adminBox.style.display = 'flex';
  _popularOpcoesResponsaveis(sel, nomeAtual);

  btn?.addEventListener('click', ()=>{
    const o = sel.selectedOptions[0];
    if (!o || !o.dataset.nome){
      alert('Selecione um responsável.');
      return;
    }
    const novoNome   = o.dataset.nome;
    const novoEmail  = o.dataset.email || '';
    const novoPerfil = o.dataset.perfil || '';

    // atualiza no localStorage.leads
    let leads = JSON.parse(localStorage.getItem('leads') || '[]');
    const idx = leads.findIndex(l => String(l?.id) === String(lead?.id));
      if (idx >= 0){
      const antigo = _nomeResponsavelAtual(leads[idx]) || '';
      if (!Array.isArray(leads[idx].historico)) leads[idx].historico = [];
      leads[idx].historico.push({
        data: new Date().toLocaleString('pt-BR'),
        dataISO: new Date().toISOString(),
        tipo: 'Atribuição',
        de: antigo || '-',
        para: novoNome,
        responsavel: (u?.nome || u?.email || '-')
      });

      leads[idx].responsavel        = novoNome;
      leads[idx].responsavel_nome   = novoNome;
      leads[idx].responsavelEmail   = novoEmail;
      leads[idx].responsavelPerfil  = novoPerfil;

      // reflete no lead atual e salva (offline)
      lead = leads[idx];
      localStorage.setItem('leads', JSON.stringify(leads));

      // >>> NOVO: sincroniza responsável com a API (PUT /leads/:id)
      try {
        if (window.handleRequest && lead && lead.id) {
          window.handleRequest(`/leads/${lead.id}`, {
            method: 'PUT',
            body: {
              responsavel: {
                nome: novoNome,
                email: novoEmail,
                perfil: novoPerfil
              }
            }
          });
        }
      } catch (e) {
        console.warn('[RESP] Erro ao atualizar responsável na API', e);
      }

      // >>> NOVO: registra histórico da mudança de responsável na API
      try {
        if (typeof enviarHistoricoApi === 'function') {
          const textoHist = `Responsável alterado de ${antigo || '-'} para ${novoNome}`;
          enviarHistoricoApi('Atribuição', textoHist);
        }
      } catch (e) {
        console.warn('[RESP] Erro ao registrar histórico de atribuição na API', e);
      }
    }


    // UI + notificação
    view.textContent = novoNome;
    if (window.showToast) showToast({title:'Responsável atualizado', message:`Agora: ${novoNome}`});
    else alert('Responsável atualizado: ' + novoNome);

    _notificarAtribuicao(novoNome, novoPerfil, lead);
  });
}
setupResponsavelUI();
// Seguro: garante que, ao carregar a página, o render e os botões sejam ligados
window.addEventListener('DOMContentLoaded', () => {
  try { renderLead?.(); } catch(e) { /* silencioso */ }
  try { bindAcoes?.(); } catch(e) { /* silencioso */ }
});
// ==== PATCH: Degustação no Orçamento Detalhado (GLOBAL) ====
(function(){
  function $(id){ return document.getElementById(id); }
  function getLS(k, fb){ try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(fb)); } catch { return fb; } }
  function setLS(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
  function formatBRDate(iso){
    var m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso||'');
  }

  function openDegModal(){
    var modal = $('degModal'), sel = $('degSelect'), extra = $('degExtra');
    if (!modal || !sel) return;

    // pega slots criados em "Degustações Disponíveis"
    var slots = getLS('degustacoesDisponiveis', []);
    sel.innerHTML = slots.length
      ? '<option value="">Selecione…</option>' + slots.map(function(s,i){
          return '<option value="'+i+'"'
            + ' data-data="'+(s.data||'')+'"'
            + ' data-hora="'+(s.hora||'')+'"'
            + ' data-local="'+String(s.local||'').replace(/"/g,'&quot;')+'"'
            + ' data-cardapio="'+String(s.cardapio||'').replace(/"/g,'&quot;')+'">'
            +  formatBRDate(s.data)+' • '+(s.hora||'')+' • '+(s.local||'')+' • '+(s.cardapio||'-')
            + '</option>';
        }).join('')
      : '<option value="">— não há datas cadastradas —</option>';

    if (extra) extra.style.display = 'none';

    // pré-preenche nome/contato se existirem no formulário
    var nomePadrao = ($('nome')?.value || $('clienteNome')?.value || '').trim();
    if ($('degNomCasal')) $('degNomCasal').value = nomePadrao;
    if ($('degAcomp'))    $('degAcomp').value = '0';
    if ($('degWhats'))    $('degWhats').value = ($('whatsapp')?.value || $('telefone')?.value || '').replace(/\D/g,'');

    sel.onchange = function(){ if (extra) extra.style.display = sel.value ? 'grid':'none'; };

    // exibe o modal (compatível com quem usa .hidden)
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  function closeDegModal(){
    var m = $('degModal');
    if (!m) return;
    m.classList.add('hidden');
    m.style.display = 'none';
  }

  function salvarDegustacaoNoLead() {
    var sel = $('degSelect');
    if (!sel || !sel.value) {
      alert('Escolha uma data.');
      return;
    }

    var opt   = sel.options[sel.selectedIndex];
    var nome  = ($('degNomCasal')?.value || '').trim();
    if (!nome) {
      alert('Informe o nome do cliente/casal.');
      return;
    }

    var acomp = Math.max(0, parseInt($('degAcomp')?.value || '0', 10) || 0);
    var zap   = ($('degWhats')?.value || '').replace(/\D/g,'');
    var obs   = ($('degObs')?.value || '').trim();

    var data     = opt.dataset.data     || '';
    var hora     = opt.dataset.hora     || '';
    var local    = opt.dataset.local    || '';
    var cardapio = opt.dataset.cardapio || '';

    // 1) salva no LEAD (se existir no localStorage)
    try {
      var params = new URLSearchParams(location.search);
      var idLead = params.get('id') || params.get('leadId') || '';
      var leads  = getLS('leads', []);
      var idx    = leads.findIndex(function(l){ return String(l?.id) === String(idLead); });

      if (idx > -1) {
        var ld = leads[idx];

        ld.degustacao = {
          data,
          hora,
          local,
          cardapio,
          casalNome: nome,
          casalWhats: zap,
          acompanhantes: acomp,
          observacoes: obs
        };

        (ld.historico ||= []).push({
          data: new Date().toLocaleString('pt-BR'),
          dataISO: new Date().toISOString(),
          tipo: 'Degustação agendada',
          detalhes: `${formatBRDate(data)} ${hora} — ${local} — ${cardapio}`
        });

        leads[idx] = ld;
        setLS('leads', leads);

        // salvar degustação completa na API (PUT /leads/:id)
        try {
          if (window.handleRequest && idLead) {
            window.handleRequest(`/leads/${idLead}`, {
              method: 'PUT',
              body: {
                degustacao: {
                  data,
                  hora,
                  local,
                  cardapio,
                  casalNome: nome,
                  casalWhats: zap,
                  acompanhantes: acomp,
                  observacoes: obs
                }
              }
            });
          }
        } catch (e) {
          console.warn('[DEG] Erro ao atualizar degustação na API', e);
        }

        // registra histórico da degustação na API
        try {
          if (typeof enviarHistoricoApi === 'function') {
            var textoHist = 'Degustação agendada para ' + formatBRDate(data) + ' ' + hora + ' — ' + local + ' — ' + cardapio;
            enviarHistoricoApi('Degustação agendada', textoHist);
          }
        } catch (e) {
          console.warn('[HIST] Falha ao enviar degustação para API', e);
        }
      }
    } catch (e) {
      console.warn('Não foi possível salvar no lead:', e);
    }

    // 2) salva na AGENDA (lida pela página "Degustações Disponíveis")
    var agenda = getLS('agenda', []);
    agenda.push({
      id: 'agd_' + Date.now().toString(36),
      tipo: 'degustacao',
      titulo: 'Degustação – ' + nome,
      data: data,
      hora: hora,
      local: local,
      cardapio: cardapio,
      criadoEm: new Date().toISOString(),
      status: 'pendente',
      casalNome: nome,
      casalWhats: zap,
      acompanhantes: acomp,
      pessoasTotal: 2 + acomp,
      compareceu: 'pendente',
      observacoes: obs
    });
    setLS('agenda', agenda);

    closeDegModal();

    if (typeof window.mostrarToast === 'function') {
      try {
        mostrarToast('Degustação agendada!');
      } catch (e) {
        alert('Degustação agendada!');
      }
    } else {
      alert('Degustação agendada!');
    }
  }

  // Expor global (resolve "is not defined")
  window.openDegModal = openDegModal;
  window.closeDegModal = closeDegModal;
  window.salvarDegustacaoNoLead = salvarDegustacaoNoLead;

  // Bind redundante (se você preferir sem onclick no HTML)
  document.addEventListener('DOMContentLoaded', function(){
    $('btnAgendarDeg')?.addEventListener('click', function(e){
      e.preventDefault();
      openDegModal();
    });
    $('degCancel')?.addEventListener('click', closeDegModal);
    $('degSalvar')?.addEventListener('click', salvarDegustacaoNoLead);
  });
})();
