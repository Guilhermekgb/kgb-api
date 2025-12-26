"use strict";
// Arquivo em UTF-8 (sem BOM). Evite colar traço longo — no JS; use "-" simples.

/* ============================
   Utils / Storage (compat ES5)
============================ */
function getLS(k){ try{ return JSON.parse(localStorage.getItem(k)||"[]"); }catch(e){ return []; } }
function getObj(k){ try{ return JSON.parse(localStorage.getItem(k)||"null"); }catch(e){ return null; } }
function setObj(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
var HAS_API = (typeof window !== "undefined") && (typeof window.callApi === "function");

// Manda o snapshot de RETORNO para o backend (/eventos/:id/checklist-retorno)
function saveRetornoBackend(evtId, payload){
  if (!HAS_API) return;
  try{
    window
      .callApi("/eventos/"+encodeURIComponent(evtId)+"/checklist-retorno", "PUT", payload)
      .catch(function(e){
        console.error("Falha ao salvar checklist-retorno no backend", e);
      });
  }catch(e){
    console.error("Erro inesperado ao chamar saveRetornoBackend", e);
  }
}
var HAS_API = (typeof window !== 'undefined') &&
              (typeof window.callApi === 'function') &&
              !!window.IS_REMOTE;

function nn(a,b){ return (a!=null ? a : b); } // nullish simples

function keySaida(id){   return "checklist:saida:"+id; }
function keyRetorno(id){ return "checklist:retorno:"+id; }

function loadSetores(){
  var a = getLS("estoque.setores");
  var b = getLS("estoque:setores");
  var out = [];
  (a.concat(b)).forEach(function(s){
    if(!s) return;
    if (s.ativo===false) return;
    out.push(s);
  });
  return out;
}
function loadMateriais(){
  var a = getLS("estoque.materiais");
  var b = getLS("estoque:materiais");
  return a.concat(b);
}
function loadEventos(){ return getObj("eventos") || []; }

function nomeVisivelEvento(ev){
  if(!ev) return "Evento";
  return ev.nomeEvento || ev.titulo || ev.nome || ev.cliente || ev.evento || ("Evento "+(ev.id||""));
}

/* ============================
   Modo (apenas rótulo)
============================ */
(function(){
  var hasToken = new URLSearchParams(location.search).has("t");
  var lbl = document.getElementById("lblModo");
  document.body.classList.add("execucao"); // força layout de execução
  if (hasToken){
    if(lbl) lbl.textContent = "Modo link/QR";
  } else {
    if(lbl) lbl.textContent = "Modo interno";
  }
})();

/* ============================
   Estado
============================ */
var state = {
  evtId: "",
  convidados: 0,
  itens: [],   // {materialId,setorId,previsto,enviado,retornado,obs}
  matsMap: {}
};

/* ============================
   Helpers
============================ */
function normalizeSaidaPayload(saved){
  var itens = (saved && Array.isArray(saved.itens)) ? saved.itens : [];
  return itens.map(function(i){
    return {
      materialId: String( (i && i.materialId!=null) ? i.materialId : (i ? i.m : "") ),
      setorId:    String( (i && i.setorId!=null)    ? i.setorId    : (i ? i.s : "") ),
      previsto:   nn( nn(i && i.previsto,  i && i.p), 0 ),
      enviado:    nn( nn(i && i.enviado,   i && i.e), 0 ),
      retornado:  nn( nn(i && i.retornado, i && i.r), null ),
      obs:        (i && i.obs!=null ? i.obs : (i && i.o!=null ? i.o : ""))
    };
  });
}

// Mescla o RETORNO salvo (se existir) dentro do state.itens da SAÍDA
function mergeRetornoSalvoNoState(evtId){
  var ret = getObj(keyRetorno(evtId));
  if (!ret || !Array.isArray(ret.itens)) return;

  var idx = {};
  state.itens.forEach(function(i){
    idx[String(i.materialId)+"|"+String(i.setorId)] = i;
  });

  ret.itens.forEach(function(r){
    var k = String( nn(r.materialId, r.m) ) + "|" + String( nn(r.setorId, r.s) );
    var it = idx[k];
    if(!it) return;
    if (r.retornado != null) it.retornado = Number(r.retornado);
    if (typeof r.obs === "string") it.obs = r.obs;
  });
}

// Snapshot leve do retorno
function makeRetornoSnapshot(){
  return {
    eventoId: state.evtId,
    dataConferencia: new Date().toISOString(),
    itens: state.itens.map(function(i){
      return {
        materialId: i.materialId,
        setorId:    i.setorId,
        enviado:    nn(i.enviado, 0),
        retornado:  nn(i.retornado, null),
        obs:        nn(i.obs, "")
      };
    })
  };
}

// Salvamento com debounce
var _saveRetTimer = null;
function queueSaveRetorno(){
  if (!state || !state.evtId) return;
  clearTimeout(_saveRetTimer);
  _saveRetTimer = setTimeout(function(){
    var snap = makeRetornoSnapshot();
    setObj(keyRetorno(state.evtId), snap);
    saveRetornoBackend(state.evtId, snap);
  }, 500);
}


/* ============================
   Foto do material (preview)
   — usa os MESMOS IDs do modal da tela de Materiais:
     #dlgFotoMat, #fotoMatImg, #fotoMatTitulo
============================ */
function openFotoPreview(src, nome){
  if(!src){ alert('Este material não possui imagem cadastrada.'); return; }
  var dlg = document.getElementById('dlgFotoMat');
  var img = document.getElementById('fotoMatImg');
  var ttl = document.getElementById('fotoMatTitulo');
  if (ttl) ttl.textContent = nome ? ('Foto — ' + nome) : 'Foto do material';
  if (img) { img.src = ''; img.src = src; } // evita ficar com a imagem anterior
  if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  else if (dlg) dlg.setAttribute('open','');
}

/* ============================
   Mapa de materiais (por ID e por nome)
============================ */
function buildMatsMap(){
  var arr = loadMateriais() || [];
  var out = {};
  arr.forEach(function(m){
    if (!m) return;
    var idKey   = (m.id != null) ? String(m.id) : null;
    var nameKey = String((m.nome || "").trim().toLowerCase());
    if (idKey) out[idKey] = m;                  // lookup por ID
    if (nameKey && !out[nameKey]) out[nameKey] = m; // fallback por nome
  });
  return out;
}

/* ============================
   Render das listas (por setor)
============================ */
function renderListas(){
  var wrap = document.getElementById("listas");
  if (!wrap) return;
  wrap.innerHTML = "";

  var setores = loadSetores();
  var mats    = state.matsMap || {};

  setores.forEach(function(s){
    var sid = String(s.id);
    var itensSetor = state.itens.filter(function(x){ return String(x.setorId) === sid; });
    if (!itensSetor.length) return;

    var section = document.createElement("section");
    section.style.marginBottom = "12px";
    section.setAttribute("data-setor-id", sid);
    section.innerHTML = '<div class="sec-title">'+(s.nome || "Setor")+'</div>';

    var table = document.createElement("table");
    table.innerHTML =
      '<thead>'+
        '<tr><th colspan="3">SAÍDA (travada)</th><th colspan="3">RETORNO (editar)</th></tr>'+
        '<tr>'+
          '<th>Item</th><th>Quantidade</th><th>Obs</th>'+
          '<th>Item</th><th>Quantidade</th><th>Observação</th>'+
        '</tr>'+
      '</thead>';

    var tb = document.createElement("tbody");

    itensSetor.forEach(function(it){
      // tenta achar por ID e também por NOME da saída (casos antigos sem id)
      var nomeSaida = String(it.nome || "");
      var mat =
        mats[String(it.materialId)] ||
        mats[String(nomeSaida.trim().toLowerCase())] ||
        null;

      var nome  = (mat && mat.nome) || nomeSaida || String(it.materialId);
      // aceita imagemUrl (novo) OU imagem (antigo)
      var imgSrc  = "";
      if (mat){
        imgSrc = (mat.imagemUrl && String(mat.imagemUrl).trim()) ||
                 (mat.imagem    && String(mat.imagem).trim()) ||
                 "";
      }
      var temFoto = !!imgSrc;

      var tr = document.createElement("tr");
      tr.innerHTML =
        // SAÍDA (travada)
        '<td>' +
          nome +
          (temFoto
            ? ' <button class="btn-foto" type="button" title="Ver foto" data-src="'+imgSrc+'" data-nome="'+(nome||'')+'">📷</button>'
            : '') +
        '</td>' +
        '<td><input type="number" min="0" value="'+(it.enviado!=null ? it.enviado : "")+'" disabled></td>' +
        '<td><input type="text" value="'+(it.obs || "")+'" disabled></td>' +

        // RETORNO (editável)
        '<td>' +
          nome +
          (temFoto
            ? ' <button class="btn-foto" type="button" title="Ver foto" data-src="'+imgSrc+'" data-nome="'+(nome||'')+'">📷</button>'
            : '') +
        '</td>' +
        '<td><input type="number" min="0" value="'+(it.retornado!=null ? it.retornado : "")+'" data-mid="'+it.materialId+'" class="ret"></td>' +
        '<td><input type="text" value="'+(it.obs || "")+'" data-mid="'+it.materialId+'" class="ret-obs"></td>';

      tb.appendChild(tr);
    });

    table.appendChild(tb);
    section.appendChild(table);
    wrap.appendChild(section);
  });

  // binds
  Array.prototype.forEach.call(wrap.querySelectorAll("input.ret"), function(inp){
    inp.addEventListener("input", function(){
      var mid = String(inp.getAttribute("data-mid"));
      var v   = (inp.value === "" ? null : Number(inp.value));
      var it  = state.itens.find(function(x){ return String(x.materialId) === mid; });
      if (it) it.retornado = v;
      queueSaveRetorno();
    });
  });

  Array.prototype.forEach.call(wrap.querySelectorAll("input.ret-obs"), function(inp){
    inp.addEventListener("input", function(){
      var mid = String(inp.getAttribute("data-mid"));
      var it  = state.itens.find(function(x){ return String(x.materialId) === mid; });
      if (it) it.obs = String(inp.value || "");
    });
  });
}

// Delegação de clique do botão 📷 dentro de #listas (funciona em qualquer re-render)
(function setupFotoDelegation(){
  var wrap = document.getElementById('listas');
  if (!wrap) return;
  wrap.addEventListener('click', function(e){
    var btn = e.target && e.target.closest('.btn-foto');
    if (!btn) return;
    var src  = btn.getAttribute('data-src')  || '';
    var nome = btn.getAttribute('data-nome') || 'Item';
    openFotoPreview(src, nome);
  });
})();

/* ============================
   Boot
============================ */
(async function(){
  const p     = new URLSearchParams(location.search);
  let evtId   = p.get("id") || "";
  const token = p.get("t") || "";

  // Se veio por link/QR com token e temos API → valida no backend
  if (token && HAS_API) {
    try{
      const resp = await window.callApi(
        `/eventos/checklist-por-token?t=${encodeURIComponent(token)}`,
        'GET',
        {}
      );
      const data = resp?.data ?? resp;
      if (!data || !data.evento) {
        alert('Link de execução inválido ou expirado.');
        return;
      }

      const ev = data.evento;
      evtId = String(ev.id || evtId || '');
      if (!evtId) {
        alert('Não foi possível identificar o evento deste link.');
        return;
      }

      // guarda o evento no cache local "eventos" (opcional, mas ajuda outras telas)
      try{
        const raw = localStorage.getItem('eventos');
        let eventos = [];
        if (raw) eventos = JSON.parse(raw);
        if (!Array.isArray(eventos)) eventos = [];
        const idx = eventos.findIndex(e => String(e.id) === evtId);
        if (idx >= 0) eventos[idx] = { ...eventos[idx], ...ev };
        else eventos.push(ev);
        localStorage.setItem('eventos', JSON.stringify(eventos));
      }catch(e){ console.warn('Falha ao cachear evento localmente:', e); }

      // guarda SAÍDA/RETORNO vindos da nuvem em localStorage,
      // para reaproveitar o código já existente
      if (data.checklistSaida && Array.isArray(data.checklistSaida.itens)) {
        setObj(keySaida(evtId), data.checklistSaida);
      }
      if (data.checklistRetorno && Array.isArray(data.checklistRetorno.itens)) {
        setObj(keyRetorno(evtId), data.checklistRetorno);
      }

      // garante que a URL tenha o id certo (sem perder o token)
      const url = new URL(location.href);
      url.searchParams.set('id', evtId);
      history.replaceState(null, '', url.toString());
    }catch(e){
      console.error('[execução] falha ao validar token na API', e);
      alert('Não foi possível validar o link de execução na nuvem.');
      // continua tentando usar dados locais, se houver
    }
  }

  if (!evtId){
    alert("EVENTO ID ausente na URL.");
    return;
  }
  state.evtId = evtId;

  const elEvtId = document.getElementById("lblEvtId");
  if (elEvtId) elEvtId.textContent = evtId;

  const saved = getObj(keySaida(evtId));
  if (!saved){
    alert("Não encontrei a SAÍDA para este evento. Gere na tela de Materiais.");
    return;
  }

  state.itens      = normalizeSaidaPayload(saved);
  state.convidados = Number((saved && saved.convidados) || 0);

  const elConv = document.getElementById("lblConvidados");
  if (elConv) elConv.textContent = String(state.convidados || 0);

  // carrega retorno existente (se houver)
  const ret = getObj(keyRetorno(evtId)) || { itens: [] };
  if (ret && Array.isArray(ret.itens)) {
    mergeRetornoIntoState(ret.itens);
  }

  renderTabela();
})();


/* ============================
   Ações
============================ */
document.getElementById("btnSalvar").onclick = function(){
  var snap = makeRetornoSnapshot();
  setObj(keyRetorno(state.evtId), snap);
  saveRetornoBackend(state.evtId, snap);
  alert("Retorno salvo.");
};


// estoque helpers
function readMateriaisList(key){ try{ return JSON.parse(localStorage.getItem(key)||"[]"); }catch(e){ return []; } }
function writeMateriaisList(key, arr){ try{ localStorage.setItem(key, JSON.stringify(arr)); }catch(e){} }

var STOCK_FIELDS = ["estoqueQtd","quantidade","qtd","estoque","qtdEstoque","saldo","emEstoque"];
function getStock(m){
  for (var i=0;i<STOCK_FIELDS.length;i++){
    var f = STOCK_FIELDS[i];
    var v = Number(m && m[f]);
    if (isFinite(v)) return v;
  }
  return 0;
}
function setStock(m, val){
  if (m && "estoqueQtd" in m){ m.estoqueQtd = val; return; }
  for (var i=0;i<STOCK_FIELDS.length;i++){
    var f = STOCK_FIELDS[i];
    if (m && f in m){ m[f] = val; return; }
  }
  if (m) m.quantidade = val;
}
function applyLossesToStock(ocorrencias){
  // 1) Atualiza o estoque local (localStorage) — mesma lógica de antes
  var perMat = {};
  (ocorrencias||[]).forEach(function(o){
    var mid = String(o.materialId);
    perMat[mid] = (perMat[mid]||0) + Number(o.faltou||0);
  });

  var keys = ["estoque.materiais","estoque:materiais"];
  keys.forEach(function(key){
    var lista = readMateriaisList(key);
    if (!Array.isArray(lista) || !lista.length) return;
    var idx = {};
    lista.forEach(function(m){ idx[String(m.id)] = m; });
    Object.keys(perMat).forEach(function(mid){
      var mat = idx[mid]; if(!mat) return;
      var novo = Math.max(0, getStock(mat) - Number(perMat[mid]||0));
      setStock(mat, novo);
    });
    writeMateriaisList(key, lista);
  });

  // 2) Se tiver API, registra as perdas na nuvem (POST /estoque/movimentos)
  try {
    if (HAS_API && typeof window.callApi === "function") {
      (ocorrencias || []).forEach(function(o){
        var qtd = Number(o.faltou || 0);
        if (!qtd) return;

        var payload = {
          tipo: "perda_checklist",
          origem: "checklist-execucao",
          eventoId: state && state.evtId ? String(state.evtId) : "",
          materialId: String(o.materialId || ""),
          setorId: String(o.setorId || ""),
          quantidade: qtd,
          obs: "Baixa automática ao finalizar checklist de retorno"
        };

        window.callApi("/estoque/movimentos", "POST", payload)
          .catch(function(e){
            console.warn("Falha ao registrar movimento de estoque na API", e);
          });
      });
    }
  } catch(e){
    console.error("Erro ao tentar enviar movimentos de estoque para a API", e);
  }
}


document.getElementById("btnFinalizar").onclick = function(){
  var ocorrencias = [];
  state.itens.forEach(function(it){
    var enviado = Number(it.enviado||0);
    var retorno = Number(it.retornado||0);
    var faltou  = Math.max(0, enviado - retorno);
    if (faltou > 0){
      ocorrencias.push({ materialId:String(it.materialId), setorId:String(it.setorId), faltou:faltou });
    }
  });

  applyLossesToStock(ocorrencias);

  try{
    localStorage.setItem("posEvento:"+state.evtId, JSON.stringify({
      eventoId: state.evtId,
      data: new Date().toISOString(),
      ocorrencias: ocorrencias
    }));
  }catch(e){}

   var ret = {
    eventoId: state.evtId,
    dataConferencia: new Date().toISOString(),
    itens: state.itens,
    finalizado: true
  };
  setObj(keyRetorno(state.evtId), ret);
  saveRetornoBackend(state.evtId, ret);
  location.href = "pos-evento.html?id="+encodeURIComponent(state.evtId);
};


/* ============================
   Imprimir por setor (diálogo)
============================ */
function openPrintDialog(){
  var dlg  = document.getElementById("dlgPrintSetores");
  var host = document.getElementById("printSetoresLista");
  if (!dlg || !host) { window.print(); return; }

  var setores = loadSetores();
  var visiveis = {};
  state.itens.forEach(function(x){ visiveis[String(x.setorId)] = true; });

  host.innerHTML = "";
  setores.forEach(function(s){
    if (!visiveis[String(s.id)]) return;
    var id = String(s.id);
    var div = document.createElement("div");
    div.style.margin = "6px 0";
    div.innerHTML =
      '<label style="display:flex;align-items:center;gap:8px">'+
        '<input type="checkbox" class="print-setor" value="'+id+'" checked>'+
        "<b>"+(s.nome||"Setor")+"</b>"+
      "</label>";
    host.appendChild(div);
  });

  if (typeof dlg.showModal === "function") dlg.showModal();
}
function printWithFilter(selectedIds){
  var all = document.querySelectorAll("#listas section[data-setor-id]");
  var restore = [];
  Array.prototype.forEach.call(all, function(sec){
    var sid = sec.getAttribute("data-setor-id");
    if (!selectedIds[sid]){
      restore.push(sec);
      sec.style.display = "none";
    }
  });
  window.print();
  restore.forEach(function(sec){ sec.style.display = ""; });
}

document.getElementById("btnImprimir").onclick = function(){ openPrintDialog(); };

var btnSel = document.getElementById("btnPrintSelecionado");
if (btnSel){
  btnSel.addEventListener("click", function(e){
    e.preventDefault();
    var checks = document.querySelectorAll("#dlgPrintSetores .print-setor:checked");
    var sel = {};
    Array.prototype.forEach.call(checks, function(c){ sel[String(c.value)] = true; });
    if (!Object.keys(sel).length){ alert("Selecione ao menos um setor."); return; }
    document.getElementById("dlgPrintSetores").close();
    printWithFilter(sel);
  });
}
var btnAll = document.getElementById("btnPrintTodos");
if (btnAll){
  btnAll.addEventListener("click", function(e){
    e.preventDefault();
    document.getElementById("dlgPrintSetores").close();
    window.print();
  });
}

/* ============================
   Barra "Imprimir setor" (atalho)
============================ */
function __getJSON(k, fb){ try{ var v = JSON.parse(localStorage.getItem(k)||"null"); return (v==null?fb:v); }catch(e){ return fb; } }
function __loadSetores(){
  var a = __getJSON("estoque.setores", []);
  var b = __getJSON("estoque:setores", []);
  var map = {};
  a.concat(b).forEach(function(s){
    if(!s) return;
    var key = (s.id!=null ? String(s.id) : String((s.nome||"").trim().toLowerCase()));
    if (!map[key]) map[key] = s;
  });
  var arr = [];
  Object.keys(map).forEach(function(k){ var s = map[k]; if (s && s.ativo!==false) arr.push(s); });
  arr.sort(function(x,y){ return String(x.nome||"").localeCompare(String(y.nome||"")); });
  return arr;
}
var __evtId  = new URLSearchParams(location.search).get("id") || "";
var __saida  = __getJSON("checklist:saida:"+__evtId,   {itens:[]});
var __ret    = __getJSON("checklist:retorno:"+__evtId, {itens:[]});
var __retByMid = {};
(__ret.itens||[]).forEach(function(i){
  var mid = String((i && i.m) || (i && i.materialId) || "");
  if (mid) __retByMid[mid] = i;
});

function __linhasPorSetor(setorId){
  var mats = __getJSON("estoque:materiais", []);
  var matsById = {};
  mats.forEach(function(m){
    matsById[(m.id!=null? String(m.id) : String((m.nome||"").trim().toLowerCase()))] = m;
  });

  var rows = [];
  (__saida.itens||[]).forEach(function(i){
    var mid  = String( (i && i.m) || (i && i.materialId) || "" );
    var sent = 0;
    if (i && i.e != null) sent = Number(i.e);
    else if (i && i.enviado != null) sent = Number(i.enviado);

    var rObj = __retByMid[mid] || {};
    var rcvdRaw = 0;
    if (rObj.r != null) rcvdRaw = rObj.r;
    else if (rObj.retornado != null) rcvdRaw = rObj.retornado;
    else if (i && i.r != null) rcvdRaw = i.r;
    else if (i && i.retornado != null) rcvdRaw = i.retornado;
    var rcvd = Number(rcvdRaw || 0);

    var matKey = mid || (i && i.nome ? String((i.nome||"").trim().toLowerCase()) : "");
    var mat    = matsById[matKey] || {};
    var sId    = (i && (i.s || i.setorId)) || mat.setorId || "";
    if (setorId && String(sId) !== String(setorId)) return;

    var nome = mat.nome || (i && i.nome) || mid;
    rows.push({ setorId:sId, setorNome:"", nome:nome, saida:sent, retorno:rcvd, faltaram:Math.max(0, sent-rcvd), un:(mat.unidade||"un") });
  });

  rows.sort(function(a,b){ return String(a.nome||"").localeCompare(String(b.nome||"")); });
  return rows;
}
function __getAppConfig(){ try{ return JSON.parse(localStorage.getItem("app_config")||"{}"); }catch(e){ return {}; } }
function __htmlImpressaoExec(setor, rows, tipo){
  var cfg    = __getAppConfig();
  var logo   = cfg.logo || "";
  var nome   = cfg.nome || "Seu Buffet";
  var brand  = cfg.brand  || "#5a3e2b";
  var brand2 = cfg.brand2 || "#c29a5d";
  var hoje   = new Date();
  var dataBR = ("0"+hoje.getDate()).slice(-2)+"/"+("0"+(hoje.getMonth()+1)).slice(-2)+"/"+hoje.getFullYear();

  var showSaida   = (tipo==="saida" || tipo==="ambos");
  var showRetorno = (tipo==="retorno" || tipo==="ambos");

  var styles =
    "<style>"+
    ":root{ --brand:"+brand+"; --gold:"+brand2+"; --line:#eadfcd; --ink:#3b2a21; }"+
    "html,body{ background:#fff; color:var(--ink); font-family: Inter, system-ui, Segoe UI, Roboto, Arial; }"+
    ".sheet{ max-width: 980px; margin: 0 auto; padding: 18px 18px 28px; }"+
    ".hero{ display:flex; gap:16px; align-items:center; padding:16px; color:#fff; background: linear-gradient(100deg, var(--brand), var(--gold)); border-radius: 12px; margin-bottom: 14px; }"+
    ".logo{ width:96px; height:96px; background:#fff; border-radius: 12px; display:grid; place-items:center; overflow:hidden; }"+
    ".logo img{ max-width:100%; max-height:100%; object-fit:contain; }"+
    ".hero h1{ margin:0; font-size:20px; }"+
    ".hero .sub{ opacity:.95; font-size:13px; margin-top:4px; }"+
    "table{ width:100%; border-collapse:collapse; }"+
    "th,td{ padding:10px 12px; border-bottom:1px solid var(--line); }"+
    "thead th{ background:#fff8ef; border-bottom:2px solid var(--line); text-align:left; }"+
    ".num{ text-align:right; white-space:nowrap; }"+
    "@media print{ .sheet{ padding:0; } .hero{ -webkit-print-color-adjust: exact; print-color-adjust: exact; } }"+
    "</style>";

  var header =
    '<div class="hero">'+
      '<div class="logo">'+(logo?'<img src="'+logo+'" alt="Logo">':"")+'</div>'+
      '<div>'+
        "<h1>"+nome+"</h1>"+
        '<div class="sub">Checklist de Materiais - '+(setor && setor.nome ? setor.nome : "-")+"</div>"+
        '<div class="sub">Gerado em '+dataBR+"</div>"+
      "</div>"+
    "</div>";

  var cols = "<th>Item</th><th>Un</th>"+
             (showSaida?'<th class="num">Saída</th>':"")+
             (showRetorno?'<th class="num">Retorno</th>':"")+
             ((showSaida&&showRetorno)?'<th class="num">Faltaram</th>':"");

  var body = "";
  if (rows.length){
    rows.forEach(function(r){
      body += "<tr>"+
        "<td>"+r.nome+"</td>"+
        "<td>"+r.un+"</td>"+
        (showSaida?'<td class="num">'+r.saida+"</td>":"")+
        (showRetorno?'<td class="num">'+r.retorno+"</td>":"")+
        ((showSaida&&showRetorno)?'<td class="num">'+r.faltaram+"</td>":"")+
      "</tr>";
    });
  } else {
    body = '<tr><td colspan="5" style="color:#7a6a5c">Sem itens para este setor.</td></tr>';
  }

  return styles + '<div class="sheet">' + header +
         "<table><thead><tr>"+cols+"</tr></thead><tbody>"+body+"</tbody></table>" +
         "</div>";
}

function __fillPrintSetores(){
  var sel = document.getElementById("printSetorSel");
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>';

  var ids = {};
  (__saida.itens||[]).forEach(function(i){
    var sid = String( (i && i.s) || (i && i.setorId) || "" );
    if (sid) ids[sid] = true;
  });

  __loadSetores().forEach(function(s){
    if (!ids[String(s.id)]) return;
    sel.add(new Option(s.nome || ("Setor "+s.id), String(s.id)));
  });
}
function __imprimirSetorExec(){
  var setorId = (document.getElementById("printSetorSel")||{}).value;
  var tipo    = (document.getElementById("printTipoSel")||{}).value || "ambos";
  if (!setorId){ alert("Selecione um setor."); return; }

  var setor = __loadSetores().find(function(s){ return String(s.id)===String(setorId); });
  var rows  = __linhasPorSetor(setorId);
  var html  = __htmlImpressaoExec(setor, rows, tipo);

  var w = window.open("", "_blank");
  if (!w){ alert("Bloqueado pelo navegador. Permita pop-ups para imprimir."); return; }
  w.document.open();
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Impressão - Checklist</title></head><body>'+html+"</body></html>");
  w.document.close();
  try{ w.focus(); w.print(); }catch(e){}
}
var btnPrint = document.getElementById("btnPrintExecSetor");
if (btnPrint) btnPrint.addEventListener("click", __imprimirSetorExec);
document.addEventListener("DOMContentLoaded", __fillPrintSetores);

// Debug básico
console.log("checklist-execucao.js carregado");
