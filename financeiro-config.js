// Base da API (padrão: http://localhost:3001). Pode mudar em Configurações gerais depois.
const API_BASE = (localStorage.getItem("API_BASE") || "http://localhost:3001").replace(/\/$/, "");

// financeiro-config.js
(() => {
  // === API base (igual na tela Modelos) ===
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : ''; // em produção, deixe vazio se o proxy servir /api

  // === Utils de LS ===
  const getLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const setLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ alert("Falha ao salvar preferências."); } };

  // === Config Financeiro (estrutura base) ===
  function ensureConfig(){
    let cfg = getLS("configFinanceiro", null);
    if (!cfg || typeof cfg !== "object") cfg = {};

    cfg.categorias    = Array.isArray(cfg.categorias)    ? cfg.categorias    : [];
    cfg.subcategorias = Array.isArray(cfg.subcategorias) ? cfg.subcategorias : [];
    cfg.meios         = Array.isArray(cfg.meios)         ? cfg.meios         : ["Pix","Cartão","Espécie","Boleto","Transferência"];
    cfg.tiposConta    = Array.isArray(cfg.tiposConta)    ? cfg.tiposConta    : [];

cfg.cobranca = cfg.cobranca || {};
cfg.cobranca.provider  = 'mercadopago'; // <- agora MP fixo
cfg.cobranca.providers = cfg.cobranca.providers || {
  mercadopago: { accessToken: '', env: 'production' }
};

    cfg.cobranca.descontoPadrao = cfg.cobranca.descontoPadrao || { tipo:"percent", valor:0, diasAntes:0 };
    cfg.cobranca.jurosPadrao    = cfg.cobranca.jurosPadrao    || { multaPercent:0, jurosDiaPercent:0 };
    cfg.cobranca.notificacao    = cfg.cobranca.notificacao    || {
      auto:false,
      offsets:{ pre:1, noDia:0, pos:1 },
      canais:{ pre:["whatsapp"], noDia:["whatsapp"], pos:["whatsapp"] },
      modelos:{ pre:"", noDia:"", pos:"" } // aqui guardamos o slug do modelo
    };
    return cfg;
  }

  // === Lê modelos salvos em modelos.html/modelos.js ===
  // Usa o ÍNDICE: "modelos_index" -> [{slug, nome, updatedAt}]
  function readModelos(){
    const idx = getLS("modelos_index", []); // <- chave correta do índice
    if (!Array.isArray(idx)) return [];
    return idx
      .slice()
      .sort((a,b)=> (b.updatedAt||0)-(a.updatedAt||0))
      .map(m => ({
        key: String(m.slug || ""),     // usamos o slug como value
        label: String(m.nome || m.slug || "Sem título")
      }))
      .filter(x => x.key && x.label);
  }

  function fillModelosSelect(sel, val){
    const mods = readModelos();
    sel.innerHTML = `<option value="">(Selecione)</option>` +
      mods.map(m => `<option value="${m.key}">${m.label}</option>`).join("");
    if (val) sel.value = val;
  }

  // múltipla seleção helpers (para canais)
  function arrFromMulti(sel){
    return Array.from(sel.selectedOptions || []).map(o => o.value);
  }
  function setMulti(sel, arr){
    const set = new Set(arr||[]);
    Array.from(sel.options || []).forEach(o => o.selected = set.has(o.value));
  }

function refreshProviderVisibility(){
  const asaas = document.getElementById("lab-asaas-key");
  const mp    = document.getElementById("lab-mp-key");
  if (asaas) asaas.style.display = "none";
  if (mp)    mp.style.display    = "";
}


  // === Carrega UI ===
function loadUI(){
  const cfg = ensureConfig();

  // Força o provedor para Mercado Pago no config
  cfg.cobranca = cfg.cobranca || {};
  cfg.cobranca.provider = 'mercadopago';
  cfg.cobranca.providers = cfg.cobranca.providers || {};
  cfg.cobranca.providers.mercadopago = cfg.cobranca.providers.mercadopago || { accessToken: '', env: 'sandbox' };

  // provider/env (UI)
  const selProv = document.getElementById("cfg-prov");
  if (selProv) {
    selProv.value = "mercadopago";
    selProv.disabled = true; // travado em MP
  }

  // Se tiver salvo, usa; senão, default sandbox para desenvolvimento
  const env = (cfg.cobranca.providers.mercadopago.env) || "sandbox";
  const token = cfg.cobranca.providers.mercadopago.accessToken || "";

  const selEnv = document.getElementById("cfg-env");
  if (selEnv) selEnv.value = env;

  const mpKey = document.getElementById("cfg-mp-key");
  if (mpKey) mpKey.value = token;

  // Esconde campo do Asaas, mostra só MP
  refreshProviderVisibility && refreshProviderVisibility();

  // desconto/juros
  document.getElementById("cfg-disc-tipo").value  = cfg.cobranca.descontoPadrao?.tipo || "percent";
  document.getElementById("cfg-disc-valor").value = Number(cfg.cobranca.descontoPadrao?.valor || 0);
  document.getElementById("cfg-disc-dias").value  = parseInt(cfg.cobranca.descontoPadrao?.diasAntes || 0, 10);
  document.getElementById("cfg-multa").value      = Number(cfg.cobranca.jurosPadrao?.multaPercent || 0);
  document.getElementById("cfg-juros-dia").value  = Number(cfg.cobranca.jurosPadrao?.jurosDiaPercent || 0);

  // notificações
  const n = cfg.cobranca.notificacao || {};
  document.getElementById("cfg-not-auto").checked = !!n.auto;
  document.getElementById("cfg-off-pre").value = parseInt(n.offsets?.pre ?? 1, 10);
  document.getElementById("cfg-off-dia").value = parseInt(n.offsets?.noDia ?? 0, 10);
  document.getElementById("cfg-off-pos").value = parseInt(n.offsets?.pos ?? 1, 10);

  setMulti(document.getElementById("cfg-canais-pre"), n.canais?.pre);
  setMulti(document.getElementById("cfg-canais-dia"), n.canais?.noDia);
  setMulti(document.getElementById("cfg-canais-pos"), n.canais?.pos);

  // modelos (carrega do índice correto)
  fillModelosSelect(document.getElementById("cfg-modelo-pre"), n.modelos?.pre);
  fillModelosSelect(document.getElementById("cfg-modelo-dia"), n.modelos?.noDia);
  fillModelosSelect(document.getElementById("cfg-modelo-pos"), n.modelos?.pos);
}
  // === Salva UI ===
  function saveUI(){
  const cfg = ensureConfig();

  // Sempre Mercado Pago
  cfg.cobranca = cfg.cobranca || {};
  cfg.cobranca.provider = "mercadopago";
  cfg.cobranca.providers = cfg.cobranca.providers || {};
  cfg.cobranca.providers.mercadopago = cfg.cobranca.providers.mercadopago || {};

  const env  = document.getElementById("cfg-env").value;
  const token = (document.getElementById("cfg-mp-key").value || "").trim();

  cfg.cobranca.providers.mercadopago.env = env;
  cfg.cobranca.providers.mercadopago.accessToken = token;

  // desconto/juros
  cfg.cobranca.descontoPadrao.tipo      = document.getElementById("cfg-disc-tipo").value;
  cfg.cobranca.descontoPadrao.valor     = Number(document.getElementById("cfg-disc-valor").value || 0);
  cfg.cobranca.descontoPadrao.diasAntes = parseInt(document.getElementById("cfg-disc-dias").value || "0", 10);

  cfg.cobranca.jurosPadrao.multaPercent    = Number(document.getElementById("cfg-multa").value || 0);
  cfg.cobranca.jurosPadrao.jurosDiaPercent = Number(document.getElementById("cfg-juros-dia").value || 0);

  // notificações
  cfg.cobranca.notificacao.auto = !!document.getElementById("cfg-not-auto").checked;
  cfg.cobranca.notificacao.offsets = {
    pre:   parseInt(document.getElementById("cfg-off-pre").value || "0", 10),
    noDia: parseInt(document.getElementById("cfg-off-dia").value || "0", 10),
    pos:   parseInt(document.getElementById("cfg-off-pos").value || "0", 10)
  };
  cfg.cobranca.notificacao.canais = {
    pre:   arrFromMulti(document.getElementById("cfg-canais-pre")),
    noDia: arrFromMulti(document.getElementById("cfg-canais-dia")),
    pos:   arrFromMulti(document.getElementById("cfg-canais-pos"))
  };
  // grava apenas o SLUG/ID do modelo escolhido
  cfg.cobranca.notificacao.modelos = {
    pre:   document.getElementById("cfg-modelo-pre").value,
    noDia: document.getElementById("cfg-modelo-dia").value,
    pos:   document.getElementById("cfg-modelo-pos").value
  };

  setLS("configFinanceiro", cfg);
  alert("Configurações salvas.");
}

  // === Testar conexão com provider (usa API_BASE) ===
  async function testarConexao(){
  const prov = document.getElementById("cfg-prov").value;
  const env  = document.getElementById("cfg-env").value;

  // Se estiver usando só Mercado Pago, pode deixar o campo em branco.
  const creds = (prov === "asaas")
    ? { apiKey: document.getElementById("cfg-asaas-key").value.trim() }
    : { accessToken: document.getElementById("cfg-mp-key").value.trim() };

  const out = document.getElementById("test-res");
  out.textContent = "Testando...";
  out.className = "hint";

  try{
    const resp = await fetch(`${API_BASE}/api/providers/test`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ provider: prov, env, credentials: creds })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(()=> "");
      throw new Error(`HTTP ${resp.status} ${txt}`);
    }
    const data = await resp.json();
    out.textContent = data.ok ? "Conexão OK ✅" : "Falhou ❌";
    out.className = data.ok ? "hint ok" : "hint err";
  }catch(e){
    out.textContent = "Erro na conexão: " + (e?.message||"");
    out.className = "hint err";
  }
}


  // === Bindings ===
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("cfg-prov").addEventListener("change", refreshProviderVisibility);
    document.getElementById("btn-test").addEventListener("click", testarConexao);
    document.getElementById("btn-save").addEventListener("click", saveUI);
    document.getElementById("btn-back").addEventListener("click", () => history.back());

    loadUI();
  });

  // Se você editar/criar modelos em outra aba, atualiza os selects aqui
  window.addEventListener("storage", (ev) => {
    if (ev.key === "modelos_index") {
      // recarrega apenas os 3 selects de modelos mantendo o selecionado se existir
      const preSel = document.getElementById("cfg-modelo-pre");
      const diaSel = document.getElementById("cfg-modelo-dia");
      const posSel = document.getElementById("cfg-modelo-pos");
      const prev = { pre: preSel?.value, dia: diaSel?.value, pos: posSel?.value };
      fillModelosSelect(preSel, prev.pre);
      fillModelosSelect(diaSel, prev.dia);
      fillModelosSelect(posSel, prev.pos);
    }
  });
})();
