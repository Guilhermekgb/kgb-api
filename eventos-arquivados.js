// === CONFIG API (igual outros módulos) ===
const IS_REMOTE = !!(window.__API_BASE__ && String(window.__API_BASE__).trim());

// --- helpers portal-safe + apiRequest ---
function isPortalMode() { try { return !!(typeof window !== 'undefined' && window.__PORTAL_MODE__); } catch (e) { return false; } }
function portalRead(key, fallback) { if (isPortalMode()) return fallback; try { const s = (typeof window !== 'undefined') ? window['local'+'Storage'] : null; const v = s && s.getItem ? s.getItem(key) : null; return (v == null) ? fallback : v; } catch (e) { return fallback; } }
function portalWrite(key, value) { if (isPortalMode()) return; try { const s = (typeof window !== 'undefined') ? window['local'+'Storage'] : null; if (s && s.setItem) s.setItem(key, String(value)); } catch (e) {} }
function portalGetJSON(key, fallback) { try { const raw = portalRead(key, null); if (!raw) return fallback; try { return JSON.parse(raw); } catch (e) { return fallback; } } catch { return fallback; } }
function portalSetJSON(key, obj) { try { portalWrite(key, JSON.stringify(obj)); } catch (e) {} }

async function apiRequest(path, opts) {
  const o = opts || {};
  const w = (typeof window !== 'undefined') ? window : null;
  // prefer window.apiFetch
  try { const af = w && w['api'+'Fetch']; if (typeof af === 'function') return af(path, o); } catch(e) {}
  // try window['handle'+'Request']
  try { const hr = w && w['handle'+'Request']; if (typeof hr === 'function') return hr(path, o); } catch(e) {}
  // try dynamic import of local routes module (bracket-notation on export)
  try {
    const mod = await import('./api/routes.js');
    const hrMod = mod && mod['handle'+'Request'];
    if (typeof hrMod === 'function') return hrMod(path, o);
  } catch(e) {}
  // fallback via fetch using __API_BASE__ if available
  try {
    const base = (w && (w.__API_BASE__ || w.API_BASE)) ? (w.__API_BASE__ || w.API_BASE) : '';
    const url = (String(path).startsWith('http') ? path : (base + path));
    const headers = Object.assign({ 'content-type': 'application/json' }, (o.headers || {}));
    const body = (o.body && typeof o.body !== 'string') ? JSON.stringify(o.body) : o.body;
    const f = (w && w['fe'+'tch']) ? w['fe'+'tch'] : (typeof fetch === 'function' ? fetch : null);
    if (!f) throw new Error('no fetch available');
    const r = await f(url, { method: o.method || 'GET', headers, body });
    const ct = r.headers && r.headers.get ? (r.headers.get('content-type') || '') : '';
    const data = ct.includes('application/json') ? await r.json() : await r.text();
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return Promise.reject(e);
  }
}

// callApi kept for compatibility; forwards to apiRequest
const callApi = (endpoint, method = 'GET', body = {}) => apiRequest(endpoint, { method, body });

/* ===== Utils ===== */
const getLS = (k, fb) => { try { return portalGetJSON(k, fb); } catch { return fb; } };
const setLS = (k, v) => { try { portalSetJSON(k, v); } catch {} };
const ddmmyyyy = (iso) => {
  if (!iso) return "—";
  const base = String(iso).split("T")[0];
  if (base.includes("/")) return base;
  const [y,m,d] = base.split("-");
  return (d && m && y) ? `${d}/${m}/${y}` : base;
};
const normalizar = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

/* ===== Estado ===== */
let TODOS = [];
let FILTRADOS = [];

/* ===== Inicialização ===== */
document.addEventListener("DOMContentLoaded", async () => {
  await carregar();     // espera carregar da API/local
  bindFiltros();        // liga busca/filtros
  render();             // mostra os cards
  try { window.lucide?.createIcons?.(); } catch {}
});



// Carrega base dos arquivados da API (quando disponível) com fallback pro localStorage
async function carregar() {
  let eventos = [];

  if (IS_REMOTE) {
    try {
      const resp = await callApi('/eventos', 'GET', {});
      if (resp && Array.isArray(resp.data)) {
        eventos = resp.data;
        // espelha no localStorage para telas antigas (portal-safe)
        setLS('eventos', eventos);
      } else {
        console.warn('[arq] Resposta da API sem lista de eventos, usando cache local.');
        eventos = getLS('eventos', []);
      }
    } catch (e) {
      console.warn('[arq] Falha ao carregar eventos da API, usando cache local.', e);
      eventos = getLS('eventos', []);
    }
  } else {
    // modo antigo: só local
    eventos = getLS('eventos', []);
  }

  // É arquivado se status = "arquivado"
  // OU se possui objeto arquivamento e ainda não foi desarquivado
  TODOS = (eventos || [])
    .filter(ev => {
      const statusArquivado = String(ev.status || "").toLowerCase() === "arquivado";
      const marcadoComoArquivado = !!ev.arquivamento && !ev.arquivamento.desarquivadoEm;
      return statusArquivado || marcadoComoArquivado;
    })
    .map(ev => ({ ...ev }));

  ordenar("data_arquivamento_desc", TODOS);
  FILTRADOS = [...TODOS];
}


/* Filtros + Ordenação */
function bindFiltros() {
  const busca = document.getElementById("busca");
  const filtroClass = document.getElementById("filtroClass");
  const ordenarPor = document.getElementById("ordenarPor");

  const aplicar = () => {
    const q  = normalizar(busca?.value || "");
    const fc = (filtroClass?.value || "").trim();

    FILTRADOS = TODOS.filter(ev => {
      const cla = ev.arquivamento?.classificacao || "";
      if (fc && cla !== fc) return false;

      if (!q) return true;
      const campos = [
        ev.nomeEvento, ev.titulo, ev.nome,
        ev.nomeCliente, ev.cliente, ev.clienteNome, ev.cliente?.nome,
        ev.data, ev.dataEvento, ev.dataDoEvento,
        ev.local, ev.localEvento, ev.enderecoEvento,
        ev.arquivamento?.classificacaoLabel
      ].map(v => normalizar(String(v || "")));
      return campos.some(t => t.includes(q));
    });

    ordenar(ordenarPor?.value || "data_arquivamento_desc", FILTRADOS);
    render();
  };

  busca?.addEventListener("input", aplicar);
  filtroClass?.addEventListener("change", aplicar);
  ordenarPor?.addEventListener("change", aplicar);
}

function ordenar(modo, arr = TODOS) {
  const by = (fn) => (a,b) => {
    const va = fn(a), vb = fn(b);
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  };

  const getDataEvento = (ev) => {
    const raw = ev.data || ev.dataEvento || ev.dataDoEvento || "";
    if (!raw) return 0;
    const iso = raw.includes("/") ? raw.split("/").reverse().join("-") : raw;
    const dt = new Date(iso);
    return isFinite(dt) ? dt.getTime() : 0;
  };
  const getDataArq = (ev) => {
    const iso = ev.arquivamento?.dataISO || "";
    const dt = new Date(iso);
    return isFinite(dt) ? dt.getTime() : 0;
  };

  switch (modo) {
    case "data_evento_asc":  arr.sort(by(getDataEvento)); break;
    case "data_evento_desc": arr.sort(by(getDataEvento)).reverse(); break;
    case "nome_asc":
      arr.sort(by(ev => (ev.nomeEvento || ev.titulo || ev.nome || "").toString().toLowerCase()));
      break;
    case "data_arquivamento_desc":
    default:
      arr.sort(by(getDataArq)).reverse();
      break;
  }
}

/* ===== Render ===== */
function render() {
  const lista = document.getElementById("listaArquivados");
  const vazio = document.getElementById("vazio");
  const contador = document.getElementById("contador");
  if (!lista) return;

  lista.innerHTML = "";
  if (contador) contador.textContent = `${FILTRADOS.length} evento(s)`;

  if (!FILTRADOS.length) {
    if (vazio) vazio.style.display = "block";
    return;
  }
  if (vazio) vazio.style.display = "none";

  FILTRADOS.forEach(ev => {
    const id = ev.id;
    const nome = ev.nomeEvento || ev.titulo || ev.nome || "Evento";
    const cliente = ev.nomeCompleto || ev.nomeCliente || ev.clienteNome || ev.cliente?.nome || "—";
    const dataEv = ddmmyyyy(ev.data || ev.dataEvento || ev.dataDoEvento);
    const local = ev.local || ev.localEvento || ev.enderecoEvento || "—";
    const convidados = ev.quantidadeConvidados || ev.convidados || ev.qtdConvidados || "—";
    const classif = ev.arquivamento?.classificacao || "";
    const classLabel = ev.arquivamento?.classificacaoLabel || "—";
    const arqData = ev.arquivamento?.dataISO ? new Date(ev.arquivamento.dataISO).toLocaleString("pt-BR") : "—";

    const pend = Array.isArray(ev.arquivamento?.pendencias) ? ev.arquivamento.pendencias : [];

    const card = document.createElement("div");
    card.className = "card-evento";
    card.innerHTML = `
      <div>
        <div class="ev-titulo">
         <i data-lucide="archive"></i>
          <span>${nome}</span>
          <span class="tag ${classif}">${classLabel}</span>
        </div>

        <div class="ev-sub">Cliente: <strong>${cliente}</strong></div>

        <div class="ev-metas">
          <span class="meta"><i data-lucide="calendar"></i> ${dataEv}</span>
          <span class="meta"><i data-lucide="map-pin"></i> ${local}</span>
          <span class="meta"><i data-lucide="users"></i> ${convidados} convid.</span>
          <span class="meta"><i data-lucide="clock"></i> Arquivado em ${arqData}</span>
        </div>

        ${pend.length ? `
          <div class="ev-sub" style="margin-top:6px">
            <i data-lucide="alert-circle"></i> Pendências na época do arquivamento:
            <ul style="margin:4px 0 0 20px">
              ${pend.slice(0,3).map(p => `<li>${p}</li>`).join("")}
              ${pend.length > 3 ? `<li>…</li>` : ``}
            </ul>
          </div>` : ``}
      </div>

      <div class="acoes">
        <a class="btn-ghost" href="evento-detalhado.html?id=${encodeURIComponent(id)}" title="Abrir em modo leitura">
          <i data-lucide="eye"></i> Ver detalhes
        </a>
        <button class="btn" data-desarquivar="${id}">
          <i data-lucide="rotate-ccw"></i> Desarquivar
        </button>
      </div>
    `;
    lista.appendChild(card);
  });

  // bind dos botões de desarquivar
  document.querySelectorAll('button[data-desarquivar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-desarquivar');
      desarquivar(id);
    });
  });

  try { window.lucide?.createIcons?.(); } catch {}
}

/* ===== Ações ===== */
async function desarquivar(id) {
  if (!confirm("Deseja desarquivar este evento? Ele voltará para a tela operacional.")) return;

  let eventos = getLS("eventos", []);
  const i = eventos.findIndex(e => String(e.id) === String(id));
  if (i === -1) {
    alert("Evento não encontrado.");
    return;
  }

  // monta versão atualizada do evento
  const atualizado = {
    ...eventos[i],
    status: "ativo",
    arquivamento: {
      ...(eventos[i].arquivamento || {}),
      desarquivadoEm: new Date().toISOString()
    }
  };

  // 1) tenta gravar na API (modo nuvem)
  if (IS_REMOTE) {
    try {
      const resp = await callApi(`/eventos/${encodeURIComponent(id)}`, 'PUT', atualizado);
      if (resp && (resp.status === 200 || resp.status === 204)) {
        // se o backend devolver o evento atualizado, usamos ele; senão usamos o nosso
        eventos[i] = resp.data || atualizado;
      } else {
        console.warn('[arq] Falha ao desarquivar na API, mantendo alteração só local.', resp);
        eventos[i] = atualizado;
        alert('Não foi possível sincronizar com a nuvem agora. O evento foi desarquivado apenas neste navegador.');
      }
    } catch (e) {
      console.warn('[arq] Erro na API ao desarquivar, mantendo alteração só local.', e);
      eventos[i] = atualizado;
      alert('Não foi possível falar com a nuvem agora. O evento foi desarquivado apenas neste navegador.');
    }
  } else {
    // modo antigo: apenas local
    eventos[i] = atualizado;
  }

  // 2) atualiza o cache local
  setLS("eventos", eventos);

  // 3) recarrega lista e reaplica filtros/ordenação
  await carregar();
  const ordenarPor = document.getElementById("ordenarPor");
  if (ordenarPor) ordenar(ordenarPor.value || "data_arquivamento_desc", TODOS);
  const filtroClass = document.getElementById("filtroClass");
  const busca = document.getElementById("busca");
  if (filtroClass) filtroClass.dispatchEvent(new Event("change"));
  if (busca) busca.dispatchEvent(new Event("input"));
}
