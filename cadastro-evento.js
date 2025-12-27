// (removido) import { handleRequest } from './api/remote-adapter.js'

// >>> deixe a proteção para o final do projeto <<<
// (mantém pronto, mas desativado)
if (window.__PROTEGER_PAGINA__ === true) {
  import('./api/middleware.js')
    .then(m => m?.protegerPagina?.()) // corrigido o nome
    .catch(err => console.warn('middleware não carregado', err));
}


// chama a API universal do projeto (local x remoto)
const IS_REMOTE = !!(window.__API_BASE__ && String(window.__API_BASE__).trim());

const callApi = (endpoint, method = 'GET', body = {}) =>
  import('./api/routes.js').then(({ handleRequest }) =>
    new Promise(resolve => handleRequest(endpoint, { method, body }, resolve))
  );

// --- Storage shim: no escopo deste módulo, `localStorage` passa a usar
//     `window.storageAdapter` quando disponível. Isso permite manter
//     o código existente sem refatorações massivas.
;(function(){
  try{
    const _globalLS = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : {
      getItem: ()=>null, setItem: ()=>{}, removeItem: ()=>{}
    };
    if (typeof window !== 'undefined' && window.storageAdapter) {
      // cria objeto que parece com localStorage
      const shim = {
        getItem(key){ try{ return window.storageAdapter.getRaw(key); }catch(e){ return _globalLS.getItem(key); } },
        setItem(key, value){ try{ if(window.storageAdapter.setRaw) return window.storageAdapter.setRaw(key, value); _globalLS.setItem(key, value);}catch(e){ try{ _globalLS.setItem(key, value); }catch{} } },
        removeItem(key){ try{ if(window.storageAdapter.setRaw) return window.storageAdapter.setRaw(key, null); _globalLS.removeItem(key);}catch(e){ try{ _globalLS.removeItem(key); }catch{} } }
      };
      // Shadowing localStorage in module scope
      Object.defineProperty(window, '__kgb_module_localStorage_shim__', { value: shim, writable: false });
      // define `localStorage` identifier in this module scope (works because file is a module)
      // eslint-disable-next-line no-unused-vars
      const localStorage = shim;
    }
  }catch(e){ /* ignore */ }
})();

// URL normalizada
const QS = new URLSearchParams(location.search);
const leadId = QS.get('leadId') || QS.get('id') || QS.get('norm') || QS.get('lead') || '';
const KEY_TIPOS_EVENTO = 'categorias:tiposEvento';
// --- Como nos conheceu (preencher <select> origemCliente) ---
function preencherOrigensCliente() {
  const sel = document.getElementById('origemCliente');
  if (!sel) return;

  let fontes = [];
  try {
    fontes = JSON.parse(localStorage.getItem('comoConheceu') || '[]');
  } catch {
    fontes = [];
  }

  // mantém sempre a primeira opção "Selecione"
  sel.innerHTML = '<option value="">Selecione</option>';

  (fontes || [])
    .filter(Boolean)
    .forEach((nome) => {
      const opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = nome;
      sel.appendChild(opt);
    });

  // se já existir um rascunho de eventoTemp com origemConheceu, reaplica
  try {
    const eventoTemp = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
    if (eventoTemp.origemConheceu) {
      sel.value = eventoTemp.origemConheceu;
    }
  } catch {}
}

// variáveis globais no módulo
let dadosItens = [];
let eventoDoLead = null;

// guarda no eventoTemp para uso entre telas
if (leadId) {
  try {
    const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
    evt.leadId = leadId;
    localStorage.setItem('eventoTemp', JSON.stringify(evt));
  } catch {}
}

// ===== Fotos de clientes (armazenadas no localStorage) =====
const FOTOS_STORAGE_KEY = 'fotosClientes';

function getFotosMap() {
  try {
    if (typeof getFotosClientesSync === 'function') return getFotosClientesSync();
    if (window.__FOTOS_CLIENTES_PRELOAD__) return window.__FOTOS_CLIENTES_PRELOAD__;
    if (typeof storageAdapter !== 'undefined' && storageAdapter.getRaw) {
      const raw = storageAdapter.getRaw('fotosClientes');
      try { return raw && typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { /* fallthrough */ }
    }
    // Avoid synchronous localStorage reads at runtime as a last-resort
    // (we prefer the shim `window.__FOTOS_CLIENTES_PRELOAD__` or the
    // `storageAdapter` in-memory cache). If nothing is available, return
    // an empty map to prevent flashes and heavy synchronous IO.
    return {};
  }
  catch { return {}; }
}

function clienteFotoKeyCurrent() {
  const id = document.getElementById('clienteId')?.value?.trim();
  const nome = (document.getElementById('nomeCliente')?.value || '').trim().toLowerCase();
  if (id) return `id:${id}`;
  if (nome) return `nome:${nome}`;
  return '';
}

function carregarFotoDoClienteNaUI(key) {
  const box = document.getElementById('fotoClienteBox');
  const img = document.getElementById('fotoClientePreview');
  const nameEl = document.getElementById('fotoClienteNome');
  if (!box || !img) return;

  const map = getFotosMap();
  const rec = key && map[key] ? map[key] : '';
  const src = typeof rec === 'string' ? rec : rec?.dataURL || '';
  const filename = rec?.filename || '';

  if (nameEl) nameEl.textContent = filename ? `Arquivo: ${filename}` : '';

  if (src) {
    box.classList.add('has-image');
    const apply = () => {
      if (img.src === src) {
        img.src = '';
        requestAnimationFrame(() => { img.src = src; });
      } else {
        img.src = src;
      }
    };
    img.onload = () => box.classList.add('has-image');
    img.onerror = () => { img.removeAttribute('src'); box.classList.remove('has-image'); };
    apply();
  } else {
    img.removeAttribute('src');
    box.classList.remove('has-image');
    if (nameEl) nameEl.textContent = '';
  }
  if (window.lucide?.createIcons) lucide.createIcons();
}

// Reduz para 600px (lado maior) e retorna DataURL no formato ideal
async function readAndResizeImage(file, maxSize = 600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const type = (file.type || '').toLowerCase();
        let outType = 'image/jpeg';
        if (type.includes('png')) outType = 'image/png';
        else if (type.includes('webp')) outType = 'image/webp';

        const dataURL = outType === 'image/png'
          ? canvas.toDataURL(outType)
          : canvas.toDataURL(outType, 0.9);

        resolve(dataURL);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
/* ==== M33 · Notifier seguro (bridge + helpers) ==== */
const BRIDGE = () => (window.__agendaBridge || null);
const hasB = () => !!BRIDGE();

const isoDate = (d)=>{
  if (!d) return '';
  const x = new Date(d);
  if (!Number.isFinite(+x)) return '';
  const z = new Date(x.getTime() - x.getTimezoneOffset()*60000);
  return z.toISOString().slice(0,10);
};
const short = (s,n=80)=> String(s||'').trim().slice(0,n);
const uidOf = (...parts)=> parts.filter(Boolean).map(String).join(':');
const ent   = (type, id)=> ({ type, id: String(id||'') });

const upsertUnified = (item)=> { try{ BRIDGE()?.upsertUnifiedItem(item); }catch{} };
const setUnifiedDone= (id)=>   { try{ BRIDGE()?.setUnifiedDone(id); }catch{} };
const publishFeed   = (ev)=>   { try{ BRIDGE()?.publishNotificationFeed(ev); }catch{} };

/* ==== Emissores prontos (chame ao salvar) ==== */
function notifyEventoCriado(evento){
  if (!hasB()) return;
  const id   = String(evento.id);
  const tit  = evento.nomeEvento || evento.nome || `Evento ${id}`;
  const data = isoDate(evento.dataISO || evento.data || new Date());
  upsertUnified({
    id: uidOf('evento','created',id),
    title: `Novo evento: ${short(tit,56)}`,
    date: data,
    status: 'scheduled',
    src: 'eventos',
    entity: ent('evento',id),
    desc: short(evento.local || evento.endereco || '')
  });
  publishFeed({
    id: uidOf('notif','evento','created',id),
    title: `Evento criado — ${short(tit,60)}`,
    level: 'info',
    entity: ent('evento',id),
    meta: { data, pessoas: evento.qtdPessoas || 0 }
  });
}

// ===== PUXAR ITENS/CONVIDADOS DA "PONTE" (priorizar a ponte) =====
try {
  const temp         = JSON.parse(localStorage.getItem("eventoTemp") || "{}") || {};
  const itensDaPonte = JSON.parse(localStorage.getItem("itensSelecionadosEvento") || "null");
  const qtdDaPonte   = localStorage.getItem("quantidadeConvidadosEvento");

  // começamos do rascunho atual
  const evt = { ...temp };

  // --- Itens selecionados: SEMPRE prioriza a ponte (seleção mais recente)
  if (Array.isArray(itensDaPonte) && itensDaPonte.length) {
    evt.itensSelecionados = itensDaPonte;
  } else if (Array.isArray(temp.itensSelecionados)) {
    evt.itensSelecionados = temp.itensSelecionados;
  } else {
    evt.itensSelecionados = [];
  }

  // --- Quantidade de convidados: também prioriza ponte
  const qLS  = parseInt(qtdDaPonte || "0", 10);
  const qTmp = parseInt(temp.quantidadeConvidados || temp.qtdConvidados || "0", 10);
  const q    = Number.isFinite(qLS) && qLS > 0 ? qLS :
               (Number.isFinite(qTmp) && qTmp > 0 ? qTmp : 0);
  if (q > 0) {
    evt.quantidadeConvidados = q;
    evt.qtdConvidados = q; // compat
  }

  // grava o rascunho consolidado
  localStorage.setItem("eventoTemp", JSON.stringify(evt));

  // (opcional) limpar marcadores de navegação; NÃO limpe 'itensSelecionadosEvento' aqui
  // para o cadastro poder ler logo após a navegação. Se quiser limpar, faça só no final do submit.
  try { localStorage.removeItem("itensEvento:returnTo"); } catch {}
} catch (e) {
  console.warn("Falha ao aplicar ponte de itens/convidados:", e);
}



// helpers
// Salva o array de eventos no localStorage com proteção
function safeSaveEventos(eventos) {
  try {
    localStorage.setItem('eventos', JSON.stringify(eventos || []));
  } catch (err) {
    console.error('Erro ao salvar eventos no localStorage:', err);
    alert('Não foi possível salvar os eventos (armazenamento cheio ou indisponível).');
  }
}

function getQtdConvidados() {
  const el = document.querySelector('#qtdConvidados, #quantidadeConvidados, #convidados, [name="qtdConvidados"]');
  const fromInput = Number((el?.value || '').toString().replace(/\D/g, ''));
  if (fromInput > 0) return fromInput;
  try {
    const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
    const fromTemp = Number(evt.qtdConvidados || evt.quantidadeConvidados || 0);
    if (fromTemp > 0) return fromTemp;
  } catch {}
  const fromLS = Number(localStorage.getItem('quantidadeConvidadosEvento') || 0);
  return Number.isFinite(fromLS) ? fromLS : 0;
}

function formatarNome(nomeOriginal) {
  return String(nomeOriginal || '')
    .replace(/[-_][a-z0-9]{4,}$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
}
// Data BR
function formatDateBR(s){
  if(!s) return "—";
  if(s instanceof Date){
    const dd=String(s.getDate()).padStart(2,"0");
    const mm=String(s.getMonth()+1).padStart(2,"0");
    return `${dd}/${mm}/${s.getFullYear()}`;
  }
  const iso = String(s).includes("/") ? s.split("/").reverse().join("-") : String(s);
  const d = new Date(iso);
  return isNaN(d) ? "—" : formatDateBR(d);
}

// Pega a foto salva no cadastro do evento / mapa local
function getFotoCliente(ev){
  try{
    if (ev?.fotoCliente) return ev.fotoCliente;
    let map;
    try {
      if (window.__FOTOS_CLIENTES_PRELOAD__) map = window.__FOTOS_CLIENTES_PRELOAD__;
      else if (typeof storageAdapter !== 'undefined' && storageAdapter.getRaw) {
        const raw = storageAdapter.getRaw('fotosClientes');
        map = raw && typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      } else {
        try {
          if (typeof getFotosClientesSync === 'function') map = getFotosClientesSync();
          else map = {};
        } catch { map = {}; }
      }
    } catch { map = {}; }
    const keys = [];
    if (ev?.fotoClienteKey) keys.push(ev.fotoClienteKey);
    if (ev?.clienteId)      keys.push(`id:${ev.clienteId}`);
    if (ev?.nomeCliente)    keys.push(`nome:${String(ev.nomeCliente).trim().toLowerCase()}`);
    for (const k of keys){
      const rec = map[k];
      if (!rec) continue;
      if (typeof rec === "string") return rec;
      return rec.dataURL || rec.url || rec.data || "";
    }
  }catch{}
  return "";
}

// apenas para exibir CNPJ no badge
function mascaraCNPJ(valor) {
  return String(valor || '')
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

// ——— Avisos não bloqueantes do cadastro ———
function coletarAvisosCadastro() {
  const v = (id) => (document.getElementById(id)?.value || '').trim();
  const avisos = [];
  if (!v('clienteId'))                    avisos.push('Sem cliente vinculado.');
  if (!v('tipoEvento'))                   avisos.push('Tipo de evento não selecionado.');
  if (!v('data'))                         avisos.push('Data do evento não definida.');
  if (!v('local'))                        avisos.push('Local do evento não preenchido.');
  if (!(Number(v('quantidadeConvidados')) > 0)) avisos.push('Quantidade de convidados não informada.');
  return avisos;
}
function renderAvisosCadastro(destaque = false) {
  const box = document.getElementById('avisosCadastro');
  if (!box) return;
  const avisos = coletarAvisosCadastro();
  if (!avisos.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';
  box.innerHTML = '<strong>Atenção:</strong> ' + avisos.join(' • ');
  box.style.outline = destaque ? '2px solid #e5b26a' : 'none';
  if (destaque) setTimeout(() => (box.style.outline = 'none'), 900);
}
function wireAvisosLive() {
  ['clienteId','nomeCliente','tipoEvento','data','local','quantidadeConvidados'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  () => renderAvisosCadastro());
    el.addEventListener('change', () => renderAvisosCadastro());
  });
}

// aplica cliente selecionado
window.aplicarCliente = function (c) {
  document.getElementById('clienteId').value   = c.id || '';
  document.getElementById('nomeCliente').value = c.nome || '';

  const foneRaw = (c.whatsapp || c.telefone || '');
  document.getElementById('telefoneCliente').value = foneRaw || '';
  document.getElementById('emailCliente').value    = c.email || '';

  const docRaw  = c.cnpj || c.cpfCnpj || c.documento || '';
  const digits  = String(docRaw).replace(/\D/g, '');
  const cpfMask = v => String(v || '')
    .replace(/\D/g,'').slice(0,11)
    .replace(/^(\d{3})(\d)/,'$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3')
    .replace(/\.(\d{3})(\d)/,'.$1-$2');

  let docFmt = '', docLabel = '';
  if (digits.length === 14) { docFmt = mascaraCNPJ(digits); docLabel = 'CNPJ'; }
  else if (digits.length === 11) { docFmt = cpfMask(digits); docLabel = 'CPF'; }

  const badge = document.getElementById('clienteBadge');
  const hint  = [];
  if (c.email) hint.push(c.email);
  if (foneRaw) hint.push(`Whats: ${foneRaw.replace(/\D/g,'')}`);
  if (docFmt) hint.push(`${docLabel}: ${docFmt}`);
  if (badge) {
    document.getElementById('clienteBadgeNome').textContent = c.nome || '(sem nome)';
    document.getElementById('clienteBadgeHint').textContent = hint.join(' • ');
    badge.style.display = 'flex';
  }

  const nomeKey = c?.nome ? `nome:${String(c.nome).trim().toLowerCase()}` : '';
  const idKey   = c?.id ? `id:${c.id}` : '';
  const map     = getFotosMap();
  const prev    = JSON.parse(localStorage.getItem('eventoTemp') || '{}').fotoClienteKey;
  const fotoKeyAplicar = map[idKey] ? idKey : (map[nomeKey] ? nomeKey : (prev || idKey || nomeKey));
  carregarFotoDoClienteNaUI(fotoKeyAplicar);

  try {
    const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
    evt.fotoClienteKey = fotoKeyAplicar;
    evt.clienteId      = c.id || '';
    evt.nomeCliente    = c.nome || '';
    evt.telefoneCliente= foneRaw || '';
    evt.emailCliente   = c.email || '';
    localStorage.setItem('eventoTemp', JSON.stringify(evt));
  } catch {}

  renderAvisosCadastro();
  document.getElementById('clienteId')?.dispatchEvent(new Event('change', { bubbles: true }));
  if (window.lucide?.createIcons) lucide.createIcons();
};

// lista de itens selecionados
window.atualizarListaItens = function () {
  const lista = document.getElementById("listaItensSelecionados");
  if (!lista) return;
  lista.innerHTML = "";

  const qtdFromInput = parseInt(document.getElementById("quantidadeConvidados")?.value || "0", 10);
  const qtdFromLS = parseInt(localStorage.getItem("quantidadeConvidadosEvento") || "0", 10);
  const qtdConvidados =
    (Number.isFinite(qtdFromInput) && qtdFromInput > 0) ? qtdFromInput :
    (Number.isFinite(qtdFromLS) && qtdFromLS > 0) ? qtdFromLS : 0;

  dadosItens.forEach((item, index) => {
    const nomeFormatado = formatarNome(
  item.nome ?? item.nomeItem ?? item.titulo ?? item.descricao ?? "Item"
);

    const valor = parseFloat(item.valor) || 0;

    const cobraPorPessoa = item.tipoCobranca === "porPessoa";
    const tipoCob = cobraPorPessoa
      ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por pessoa`
      : "Valor fixo";

    const totalBase = cobraPorPessoa ? valor * qtdConvidados : valor;

    const descontoStr = (item.desconto || "").toString().trim();
    let descontoValor = 0;
    if (descontoStr.endsWith("%")) {
      const perc = parseFloat(descontoStr.replace("%", "").replace(",", "."));
      if (isFinite(perc)) descontoValor = totalBase * (perc / 100);
    } else if (descontoStr) {
      const v = parseFloat(descontoStr.replace(",", "."));
      if (isFinite(v)) descontoValor = v;
    }

    const totalFinal = Math.max(0, totalBase - descontoValor);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:10px;">${nomeFormatado}</td>
      <td style="padding:10px;">${tipoCob}</td>
      <td style="padding:10px;">R$ ${totalFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
      <td style="padding:10px; text-align:center;">
        <button onclick="removerItem(${index})" style="background-color:#c23b22;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;">
          Excluir
        </button>
      </td>
    `;
    lista.appendChild(tr);
  });
    // === NOVO: espelhar o TOTAL DO CONTRATO (soma dos itens) no eventoTemp ===
  try {
    // usa o qtdConvidados já calculado acima
    const totalContrato = (dadosItens || []).reduce((acc, item) => {
      const valor = parseFloat(item.valor) || 0;
      const cobraPorPessoa = item.tipoCobranca === "porPessoa";
      const totalBase = cobraPorPessoa ? (valor * qtdConvidados) : valor;

      const descontoStr = (item.desconto || "").toString().trim();
      let descontoValor = 0;
      if (descontoStr.endsWith("%")) {
        const perc = parseFloat(descontoStr.replace("%","").replace(",",".")); 
        if (isFinite(perc)) descontoValor = totalBase * (perc/100);
      } else if (descontoStr) {
        const v = parseFloat(descontoStr.replace(",",".")); 
        if (isFinite(v)) descontoValor = v;
      }

      return acc + Math.max(0, totalBase - descontoValor);
    }, 0);

    const evtTemp = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
    evtTemp.totalContrato = totalContrato;
    evtTemp.resumoFinanceiro = { ...(evtTemp.resumoFinanceiro||{}), contratoTotal: totalContrato };
    evtTemp.valorContrato = totalContrato; // compat extra
    localStorage.setItem("eventoTemp", JSON.stringify(evtTemp));
  } catch {}


};

document.getElementById("quantidadeConvidados")?.addEventListener("input", (e) => {
  const v = parseInt(e.target.value || "0", 10);
  localStorage.setItem("quantidadeConvidadosEvento", String(Number.isFinite(v) && v > 0 ? v : 0));
  window.atualizarListaItens();
});

// --- RESUMO POR DATA ---
function _normDate(str) { return String(str || '').slice(0, 10); }
function _fmtConvidados(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return '— convidados';
  return n + (n === 1 ? ' convidado' : ' convidados');
}
function renderResumoPorData() {
  const box = document.getElementById('resumoData');
  const inner = document.getElementById('resumoDataInner');
  if (!box || !inner) return;

  const d = _normDate(document.getElementById('data')?.value);
  if (!d) { box.style.display = 'none'; inner.innerHTML = ''; return; }

  let eventos = [];
  try {
    eventos = (JSON.parse(localStorage.getItem('eventos') || '[]') || [])
      .filter(e => _normDate(e.data) === d)
      .filter(e => (e?.status || 'ativo') !== 'cancelado' && (e?.status || 'ativo') !== 'excluido');
  } catch {}

  let leads = [];
  try {
    leads = (JSON.parse(localStorage.getItem('leads') || '[]') || [])
      .filter(l => _normDate(l.dataEvento) === d);
  } catch {}

  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  const itensEventos = eventos.map(e => {
    const nome = e.nomeCliente || e.nomeEvento || '(sem nome)';
    const loc  = e.local || '—';
    const qtd  = e.quantidadeConvidados || e.qtdConvidados || 0;
    return `<li>${nome} / ${loc} / ${_fmtConvidados(qtd)}</li>`;
  }).join('');

  const itensLeads = leads.map(l => {
    const nome = l.nome || l.nomeCliente || l.cliente || '(sem nome)';
    const loc  = l.local || l.localEvento || '—';
    const qtd  = l.qtd || l.qtdConvidados || l.quantidadeConvidados || 0;
    return `<li>${nome} / ${loc} / ${_fmtConvidados(qtd)}</li>`;
  }).join('');

  inner.innerHTML = `
    <div>
      <div style="font-weight:700; color:#5a3e2b; margin-bottom:4px;">
        ${plural(eventos.length, 'evento fechado nessa data', 'eventos fechados nessa data')}
      </div>
      <ul style="padding-left:18px; margin:0;">
        ${itensEventos || '<li>Nenhum.</li>'}
      </ul>
    </div>
    <div>
      <div style="font-weight:700; color:#5a3e2b; margin-bottom:4px;">
        ${plural(leads.length, 'orçamento enviado para essa data', 'orçamentos enviados para essa data')}
      </div>
      <ul style="padding-left:18px; margin:0;">
        ${itensLeads || '<li>Nenhum.</li>'}
      </ul>
    </div>
  `;
  box.style.display = 'block';
}

// ---------- Inicialização do uploader ----------
function initFotoCliente() {
  const input = document.getElementById('fotoCliente');
  const box = document.getElementById('fotoClienteBox');
  const img = document.getElementById('fotoClientePreview');
  const nameEl = document.getElementById('fotoClienteNome');
  const btnEscolher = document.getElementById('btnEscolherFoto');
  const btnRemover = document.getElementById('btnRemoverFoto');

  const abrirSeletor = () => input?.click();

  box?.addEventListener('click', abrirSeletor);
  btnEscolher?.addEventListener('click', abrirSeletor);

  input?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    const objectURL = URL.createObjectURL(file);
    img.src = objectURL;
    box.classList.add('has-image');
    if (nameEl) nameEl.textContent = `Arquivo: ${file.name}`;

    try {
      const dataURL = await readAndResizeImage(file, 600);
      const key = clienteFotoKeyCurrent() || `temp:${Date.now()}`;
      const map = getFotosMap();
      map[key] = { dataURL, filename: file.name };
      setFotosMap(map);

      carregarFotoDoClienteNaUI(key);
      URL.revokeObjectURL(objectURL);

      const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
      evt.fotoClienteKey = key;
      localStorage.setItem('eventoTemp', JSON.stringify(evt));
    } catch (err) {
      console.warn('Falha ao processar imagem:', err);
    } finally {
      ev.target.value = '';
    }
  });

  btnRemover?.addEventListener('click', () => {
    const key = clienteFotoKeyCurrent() || (JSON.parse(localStorage.getItem('eventoTemp') || '{}').fotoClienteKey);
    const map = (function(){
      try{
        if (window.__FOTOS_CLIENTES_PRELOAD__ && typeof window.__FOTOS_CLIENTES_PRELOAD__ === 'object') return window.__FOTOS_CLIENTES_PRELOAD__;
        if (window.storageAdapter && typeof window.storageAdapter.getRaw === 'function'){
          const r = window.storageAdapter.getRaw('fotosClientes');
          return r ? (typeof r === 'string' ? JSON.parse(r) : r) : {};
        }
        return getFotosMap();
      }catch(e){ return getFotosMap(); }
    })();
    if (key && map[key]) { delete map[key]; setFotosMap(map); }
    carregarFotoDoClienteNaUI('');
    const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
    delete evt.fotoClienteKey;
    localStorage.setItem('eventoTemp', JSON.stringify(evt));
  });
}

// ---------- DOMContentLoaded principal ----------
document.addEventListener("DOMContentLoaded", () => {
  preencherTiposEvento();
  preencherOrigensCliente();   // <<< ADICIONE ESTA LINHA
  preencherEvento();
  carregarVendedores();
  // ...


    // --- IMPORTA itens escolhidos em itens-evento (cardápio/adicionais/serviços) ---
  (function importarItensSelecionadosSeTiver() {
    try {
      // 1) ler o que a tela de itens deixou no localStorage
      const itensSoltos   = JSON.parse(localStorage.getItem("itensSelecionadosEvento") || "null");
      const cardapioSel   = JSON.parse(localStorage.getItem("cardapioSelecionado") || "null");
      const addsSel       = JSON.parse(localStorage.getItem("adicionaisSelecionadosEvento") || localStorage.getItem("adicionaisSelecionados") || "null");
      const servicosSel   = JSON.parse(localStorage.getItem("servicosSelecionadosEvento") || localStorage.getItem("servicosSelecionados") || "null");
      const qtdLS         = localStorage.getItem("quantidadeConvidadosEvento");

      // 2) normalizador compatível com várias telas
      const normalizarItem = (it, tipoPadrao) => ({
        id: it.id ?? it.idItem ?? it.codigo ?? it.slug ?? it.idCardapio ?? it.cardapioId ?? ("it_" + Math.random().toString(36).slice(2)),
        nome: it.nomeItem ?? it.nome ?? it.titulo ?? it.label ?? it.descricao ?? "Item",
        valor: Number(it.valor ?? it.preco ?? it.preço ?? it.total ?? 0),
        tipoCobranca: it.tipoCobranca ?? it.cobranca ?? (tipoPadrao || "fixo"),
        desconto: it.desconto ?? it.descontoValor ?? "",
      });

      // 3) montar lista final priorizando o array "itensSelecionadosEvento";
      //    se não tiver, montar a partir de cardápio/adicionais/serviços
      let escolhidos = Array.isArray(itensSoltos) && itensSoltos.length ? itensSoltos : null;
      if (!escolhidos) {
        const doCardapio = cardapioSel ? [ normalizarItem(cardapioSel, "porPessoa") ] : [];
        const dosAdds    = Array.isArray(addsSel) ? addsSel.map(a => normalizarItem(a, a.cobranca || "porPessoa")) : [];
        const dosServs   = Array.isArray(servicosSel) ? servicosSel.map(s => normalizarItem(s, s.cobranca || "fixo")) : [];
        escolhidos = [...doCardapio, ...dosAdds, ...dosServs].filter(Boolean);
      }

      if (escolhidos && escolhidos.length) {
        // 4) aplica na variável da página e mostra na tabela
        dadosItens = escolhidos;
        atualizarListaItens();

        // 5) também guarda dentro do eventoTemp (para persistir o retorno)
        const evt = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
        evt.itensSelecionados = escolhidos;

        // se a tela de itens gravou a qtd no LS, espelha no eventoTemp e no input
        if (qtdLS != null) {
          const qtd = parseInt(qtdLS, 10);
          if (Number.isFinite(qtd) && qtd > 0) {
            evt.quantidadeConvidados = qtd;
            const elQtd = document.getElementById("quantidadeConvidados");
            if (elQtd) { elQtd.value = String(qtd); }
          }
        }

        localStorage.setItem("eventoTemp", JSON.stringify(evt));
      }

      // 6) limpar chaves de passagem (evita sujar próximas navegações)
      ["itensSelecionadosEvento","cardapioSelecionado","adicionaisSelecionadosEvento","adicionaisSelecionados","servicosSelecionadosEvento","servicosSelecionados"]
        .forEach(k => { try{ localStorage.removeItem(k); }catch{} });
    } catch (e) {
      console.warn("CadastroEvento: falha ao importar itens da tela de itens:", e);
    }
  })();

  
  if (window.lucide?.createIcons) lucide.createIcons();


  renderAvisosCadastro();
  wireAvisosLive();
  initFotoCliente();

  document.getElementById('data')?.addEventListener('input', renderResumoPorData);
  document.getElementById('data')?.addEventListener('change', renderResumoPorData);
  renderResumoPorData();

  const evtTmp = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
  if (evtTmp.fotoClienteKey) carregarFotoDoClienteNaUI(evtTmp.fotoClienteKey);
  else carregarFotoDoClienteNaUI(clienteFotoKeyCurrent());

  aplicarClienteVindoDoCadastroSeTiver();
  aplicarClienteVindoDoCadastroSeTiver().catch(()=>{});

  async function getClientes() {
    try {
      const raw = localStorage.getItem('clientes');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.clientes)) return parsed.clientes;
      }
    } catch {}
    try {
      if (window.firebaseClientes && typeof window.firebaseClientes.list === 'function') {
        return await window.firebaseClientes.list();
      }
    } catch {}
    return [];
  }

  async function aplicarClienteVindoDoCadastroSeTiver() {
    const qs = new URLSearchParams(location.search);
    const fromClienteQS = qs.get('fromCliente') === '1';
    const clienteIdQS   = qs.get('clienteId');

    if (clienteIdQS) {
      localStorage.setItem('clienteSelecionado', String(clienteIdQS));
      localStorage.setItem('voltarParaEvento', 'true');
    }

    const deveAplicar = fromClienteQS || !!clienteIdQS || localStorage.getItem('voltarParaEvento') === 'true';
    if (!deveAplicar) return;

    const idSelecionado = clienteIdQS || localStorage.getItem('clienteSelecionado');
    if (!idSelecionado) return;

    try {
      const clientes = await getClientes();
      const c = (clientes || []).find(x => String(x.id) === String(idSelecionado));
      if (c) {
        window.aplicarCliente(c);
        localStorage.removeItem('voltarParaEvento');
      }
    } catch {}
  }

  document.querySelectorAll('#qtdConvidados, #quantidadeConvidados, #convidados, [name="qtdConvidados"]').forEach(el => {
    el.addEventListener('input', () => {
      try {
        const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
        evt.qtdConvidados = getQtdConvidados();
        localStorage.setItem('eventoTemp', JSON.stringify(evt));
      } catch {}
      if (typeof calcularTotais === 'function') calcularTotais();
      if (typeof recalcItens === 'function') recalcItens();
    });
  });

  document.getElementById('btnSalvarFinal')?.addEventListener('click', () => {
    document.getElementById('formEvento').requestSubmit();
  });

  function preencherEvento() {
    const eventoTemp = JSON.parse(localStorage.getItem("eventoTemp") || "null");
    if (!eventoTemp) return;

    document.getElementById("clienteId").value = eventoTemp.clienteId || "";

    document.getElementById("nomeEvento").value = eventoTemp.nomeEvento || "";
    document.getElementById("nomeCliente").value = eventoTemp.nomeCliente || "";
    document.getElementById("telefoneCliente").value = eventoTemp.telefoneCliente || "";
    document.getElementById("emailCliente").value = eventoTemp.emailCliente || "";
    document.getElementById("origemCliente").value = eventoTemp.origemConheceu || "";
    document.getElementById("origemObs").value     = eventoTemp.origemObs || "";
    document.getElementById("local").value = eventoTemp.local || "";
    document.getElementById("data").value = eventoTemp.data || "";
    document.getElementById("quantidadeConvidados").value = eventoTemp.quantidadeConvidados || "";
    document.getElementById("tipoEvento").value = eventoTemp.tipoEvento || "";
    document.getElementById("observacoes").value = eventoTemp.observacoes ?? (eventoTemp.obsCardapio || "");
    document.getElementById("observacao1").value = eventoTemp.observacao1 || "";
    document.getElementById("observacao2").value = eventoTemp.observacao2 || "";
// novos: restaurar horários / origem / cerveja
document.getElementById("horarioCerimonia").value = eventoTemp.horarioCerimonia || "";
document.getElementById("horarioEvento").value    = eventoTemp.horarioEvento || "";
document.getElementById("cerveja").value          = eventoTemp.cerveja || "";
document.getElementById("origemObs").value        = eventoTemp.origemObs || "";

// origem ("como conheceu") pode carregar opções após o DOM; garanta o valor:
(function ensureOrigemValue(){
  const set = () => {
    const el = document.getElementById("origemCliente");
    if (!el) return;
    el.value = eventoTemp.origemConheceu || "";
  };
  // tenta já
  set();
  // e tenta de novo no próximo tick (caso as opções tenham sido preenchidas depois)
  setTimeout(set, 0);
})();

    if (eventoTemp.fotoClienteKey) {
      carregarFotoDoClienteNaUI(eventoTemp.fotoClienteKey);
    }

    if (eventoTemp.itensSelecionados && eventoTemp.itensSelecionados.length > 0) {
      dadosItens = eventoTemp.itensSelecionados;
      atualizarListaItens();
    }

    renderAvisosCadastro();
  }

  // Junta histórico do lead + do cadastro
  let historicoInicial = [];
  try {
    const evtTemp = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
   if (Array.isArray(evtTemp.historico)) historicoInicial = historicoInicial.concat(evtTemp.historico);


    if (leadId) {
      const leads = JSON.parse(localStorage.getItem('leads') || '[]');
      const lead = leads.find(l => String(l.id) === String(leadId));
     if (Array.isArray(lead?.historico)) historicoInicial = historicoInicial.concat(lead.historico);
    }
  } catch {}
// === INÍCIO PATCH: salvar evento remoto com fallback local ===
async function postComFallbackDeRotas(evento) {
  // tenta estas rotas em ordem; se 404, tenta a próxima
  const rotas = ['/eventos', '/api/eventos', '/events'];
  for (const rota of rotas) {
    try {
      const res = await callApi(rota, 'POST', evento);
      if (res?.status === 200 || res?.status === 201) return res;
      if (res?.status === 400) return res; // erro de validação real — não adianta tentar outras
      // 404 continua tentando a próxima rota
    } catch (err) {
      // erro de rede ou CORS — tenta próxima rota
      console.warn('[KGB] Falha ao chamar', rota, err);
    }
  }
  return { status: 404, error: 'Nenhuma rota de eventos encontrada no backend.' };
}

function salvarEventoLocalEIr(evento, novoIdOverride) {
  try {
    const eventos = JSON.parse(localStorage.getItem('eventos') || '[]') || [];
    const novoId = String(novoIdOverride || evento.id || Date.now());
    const registro = { ...evento, id: novoId, status: 'ativo' };
    eventos.push(registro);
    localStorage.setItem('eventos', JSON.stringify(eventos));
    // limpa rascunhos e segue
    localStorage.removeItem('eventoTemp');
    localStorage.removeItem('voltarParaEvento');
    localStorage.removeItem('clienteSelecionado');
    location.href = `evento-detalhado.html?id=${encodeURIComponent(novoId)}`;
  } catch (e) {
    console.error('Falha ao salvar local:', e);
    alert('Não foi possível salvar o evento nem localmente.');
  }
}
// === FIM PATCH ===

  document.getElementById("formEvento").addEventListener("submit", async function (e) {
    e.preventDefault();
    renderAvisosCadastro(true);

    const fotoKeyFinal =
      (JSON.parse(localStorage.getItem('eventoTemp') || '{}').fotoClienteKey)
      || clienteFotoKeyCurrent();

    const fotoParaEnviar = IS_REMOTE ? montarFotoParaEnviar(fotoKeyFinal) : null;

    const evento = {
      id: Date.now().toString(),
      clienteId: document.getElementById("clienteId")?.value || "",
      nomeEvento: document.getElementById("nomeEvento").value,
      tipoEvento: document.getElementById("tipoEvento").value,
      nomeCliente: document.getElementById("nomeCliente").value,
      telefoneCliente: document.getElementById("telefoneCliente").value,
      emailCliente: document.getElementById("emailCliente").value,
      origemConheceu: document.getElementById('origemCliente').value,
      origemObs: document.getElementById('origemObs').value,
      data: document.getElementById("data").value,
      local: document.getElementById("local").value,
      quantidadeConvidados: document.getElementById("quantidadeConvidados").value,
      cerimonia: document.getElementById("cerimonia").value,
      horarioCerimonia: document.getElementById("horarioCerimonia").value,
      horarioEvento: document.getElementById("horarioEvento").value,
      cerveja: document.getElementById("cerveja").value,
      observacao1: document.getElementById("observacao1")?.value || "",
      observacao2: document.getElementById("observacao2")?.value || "",
      obsCardapio: document.getElementById("obsCardapio")?.value || "",
      vendedor: document.getElementById("vendedor").value,
      itensSelecionados: dadosItens || [],
      historico: (Array.isArray(historicoInicial) ? historicoInicial : []),
      fotoClienteKey: fotoKeyFinal,
      ...(fotoParaEnviar ? { fotoCliente: fotoParaEnviar } : {}),
      orcamentoId: leadId || "",
      status: 'ativo',
      criadoEm: new Date().toISOString(),
    };

    // Tenta salvar primeiro na API; se não der, cai para salvamento local
    try {
      let salvouRemoto = false;
      let novoIdRemoto = null;

      if (IS_REMOTE) {
        try {
          let res;

          // se existir helper centralizado, usa ele; senão chama a rota /eventos direto
          if (typeof window.postComFallbackDeRotas === 'function') {
            res = await window.postComFallbackDeRotas(evento);
          } else if (typeof callApi === 'function') {
            res = await callApi('/eventos', 'POST', evento);
          }

          if (res && (res.status === 200 || res.status === 201)) {
            const body = res.data || res;

            novoIdRemoto = String(
              (body && (body.id || body._id)) ||
              res.id ||
              evento.id ||
              Date.now()
            );

            // notifica criação (modo remoto)
            try {
              if (typeof notifyEventoCriado === 'function') {
                const finalEvento = {
                  ...evento,
                  id: novoIdRemoto,
                  dataISO: evento.data,
                  qtdPessoas: Number(evento.quantidadeConvidados || 0),
                };
                notifyEventoCriado(finalEvento);
              }
            } catch (e) {
              console.warn('[KGB] Falha ao notificar criação de evento (remoto)', e);
            }

            // espelha no localStorage para telas antigas
            try {
              const eventosLocais = JSON.parse(localStorage.getItem('eventos') || '[]');
              const registroLocal = {
                ...evento,
                id: novoIdRemoto,
                status: evento.status || 'ativo',
              };
              eventosLocais.push(registroLocal);

              if (typeof safeSaveEventos === 'function') {
                safeSaveEventos(eventosLocais);
              } else {
                localStorage.setItem('eventos', JSON.stringify(eventosLocais));
              }
            } catch (e) {
              console.warn('[KGB] Falha ao espelhar evento no localStorage (remoto)', e);
            }

            salvouRemoto = true;
          } else if (res && res.status === 400) {
            // erro de validação vindo da API
            alert('Erro ao salvar evento na API. Verifique os dados e tente novamente.');
            return;
          } else if (res) {
            console.warn('[KGB] API respondeu status', res.status, '– usando fallback local.');
          }
        } catch (e) {
          console.warn('[KGB] Falha na API de eventos, salvando localmente.', e);
        }
      }

      // Se salvou com sucesso na API, limpamos rascunho e vamos pro evento
      if (salvouRemoto && novoIdRemoto) {
        try { localStorage.removeItem('eventoTemp'); } catch {}
        try { localStorage.removeItem('voltarParaEvento'); } catch {}
        try { localStorage.removeItem('clienteSelecionado'); } catch {}

        window.location.href = `evento-detalhado.html?id=${encodeURIComponent(novoIdRemoto)}`;
        return;
      }

      // ===== Salvamento LOCAL (fallback ou sem API) =====
      const eventos = JSON.parse(localStorage.getItem('eventos') || '[]');
      const novoEventoId = String(evento.id || Date.now());

      const registro = {
        ...evento,
        id: novoEventoId,
        status: evento.status || 'ativo',
      };

      eventos.push(registro);

      // salva lista de eventos no localStorage
      try {
        if (typeof safeSaveEventos === 'function') {
          safeSaveEventos(eventos);
        } else {
          localStorage.setItem('eventos', JSON.stringify(eventos));
        }
      } catch (e) {
        console.warn('[KGB] Falha ao salvar eventos no localStorage', e);
      }

      // notifica criação (local)
      try {
        if (typeof notifyEventoCriado === 'function') {
          notifyEventoCriado({
            ...registro,
            dataISO: registro.data,
            qtdPessoas: Number(registro.quantidadeConvidados || 0),
          });
        }
      } catch (e) {
        console.warn('[KGB] Falha ao notificar criação local do evento', e);
      }

      // limpa rascunhos locais
      try { localStorage.removeItem('eventoTemp'); } catch {}
      try { localStorage.removeItem('voltarParaEvento'); } catch {}
      try { localStorage.removeItem('clienteSelecionado'); } catch {}

      // redireciona para o evento detalhado (modo local)
      window.location.href = `evento-detalhado.html?id=${encodeURIComponent(novoEventoId)}`;
    } catch (err) {
      console.error('Falha ao salvar evento:', err);
      alert('Erro de rede ao salvar evento.');
    }

// --- Pré-preenchimento via orçamento detalhado (?p=...) ---
(() => {
  const qp = new URLSearchParams(location.search);
  const p = qp.get('p');
  if (!p) return;

  let data = null;
  try {
    const txt = atob(p);
    try { data = JSON.parse(txt); }
    catch { data = JSON.parse(decodeURIComponent(txt)); }
  } catch {}

  if (!data) return;

  const setVal = (id, v) => {
    if (v == null || v === "") return;
    const el = document.getElementById(id);
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  setVal('nomeCliente', data.nome);
  setVal('telefoneCliente', data.whatsapp || data.telefone);
  setVal('emailCliente', data.email);
  setVal('data', data.data_evento || data.dataEvento);
  setVal('horarioEvento', data.horario_evento || data.horarioEvento);
  setVal('tipoEvento', data.tipo_evento || data.tipoEvento);
  setVal('local', data.local_evento || data.local);
  setVal('quantidadeConvidados', data.convidados || data.qtd);

  try {
    const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
    Object.assign(evt, {
      nomeCliente: document.getElementById('nomeCliente')?.value || '',
      telefoneCliente: document.getElementById('telefoneCliente')?.value || '',
      emailCliente: document.getElementById('emailCliente')?.value || '',
      data: document.getElementById('data')?.value || '',
      horarioEvento: document.getElementById('horarioEvento')?.value || '',
      tipoEvento: document.getElementById('tipoEvento')?.value || '',
      local: document.getElementById('local')?.value || '',
      quantidadeConvidados: document.getElementById('quantidadeConvidados')?.value || ''
    });
    localStorage.setItem('eventoTemp', JSON.stringify(evt));
  } catch {}
})();

});


// carregar vendedores (corrigido)
async function carregarVendedores() {
  const sel = document.getElementById('vendedor');
  if (!sel) return;

  sel.innerHTML = '<option value="">Selecione</option>';

  const norm = s => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase();

  const dedupeNormalize = (arr) => {
    const porChave = new Map();
    for (const u of (arr || [])) {
      if (!u) continue;
      const email = String(u.email || '').trim().toLowerCase();
      const chave = email || String(u.nome || '').trim().toLowerCase();
      if (!chave) continue;
      if (!porChave.has(chave)) {
        porChave.set(chave, {
          id: u.id,
          nome: u.nome || '',
          email,
          whatsapp: String(u.whatsapp || ''),
          perfil: u.perfil || ''
        });
      }
    }
    return Array.from(porChave.values());
  };

  const addGrupo = (label, arr) => {
    if (!arr.length) return;
    const og = document.createElement('optgroup');
    og.label = label;
    arr.slice()
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
      .forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.nome || u.email || '';
        opt.textContent = u.nome || u.email || '(sem nome)';
        og.appendChild(opt);
      });
    sel.appendChild(og);
  };

  // 1) tenta remoto se houver backend configurado
  let usuarios = [];
  if (window.__API_BASE__) {
    try {
      const { handleRequest } = await import('./api/routes.js')
      const res = await new Promise(resolve =>
        handleRequest('/usuarios', { method: 'GET', body: {} }, resolve)
      );
      if ((res?.status === 200 || res?.status === 201) && Array.isArray(res.data)) {
        usuarios = dedupeNormalize(res.data);
      }
    } catch (e) {
      console.warn('Falha ao carregar vendedores via API, usando localStorage.', e);
    }
  }

  // 2) fallback localStorage (se remoto falhar ou vier vazio)
  if (!usuarios.length) {
    const chavesProvaveis = [
      'usuarios', 'db_usuarios', 'usuarios_db',
      'usuariosData', 'tb_usuarios', 'kgb_usuarios', 'kgb:usuarios'
    ];
    const todos = [];

    for (const k of chavesProvaveis) {
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr)) todos.push(...arr); // corrigido
      } catch {}
    }

    if (!todos.length) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || /usuarioLogado|token|perfis/i.test(k)) continue;
        try {
          const val = JSON.parse(localStorage.getItem(k) || 'null');
          if (Array.isArray(val) && val.some(v => v && (v.email || v.nome))) {
            todos.push(...val); // corrigido
          }
        } catch {}
      }
    }

    usuarios = dedupeNormalize(todos);
  }

  // 3) separa por grupos e preenche o select
  const grupos = { vendedores: [], administrativos: [] };
  usuarios.forEach(u => {
    const p = norm(u.perfil);
    if (/^vend/.test(p) || p.includes('comercial')) {
      grupos.vendedores.push(u); return;
    }
    if (/(admin|administrativ|administrador|gerent|gestor|coorden|diretor)/.test(p)) {
      grupos.administrativos.push(u); return;
    }
  });

  addGrupo('Vendedores', grupos.vendedores);
  addGrupo('Administrativo', grupos.administrativos);

  if (!sel.querySelector('optgroup')) {
    usuarios.slice()
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
      .forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.nome || u.email || '';
        opt.textContent = u.nome || u.email || '(sem nome)';
        sel.appendChild(opt);
      });
  }
}

async function getLeadById(id) {
  if (!id) return null;
  if (IS_REMOTE) {
    try {
      const r = await callApi('/leads', 'GET', { id });
      if (r?.status === 200 && Array.isArray(r.data)) {
        return r.data.find(l => String(l.id) === String(id)) || null;
      }
    } catch (e) {
      console.warn('Lead remoto indisponível, tentando local', e);
    }
  }
  const leads = JSON.parse(localStorage.getItem('leads') || '[]');
  return leads.find(l => String(l.id) === String(id)) || null;
}

// Tipos de evento
function lerTiposEvento() {
  try {
    const rawOficial = localStorage.getItem('categorias:tiposEvento');
    if (rawOficial) {
      const arr = JSON.parse(rawOficial);
      if (Array.isArray(arr)) {
        return arr.map(v => typeof v === 'string' ? v : (v?.nome || v?.label || ''))
                  .map(s => String(s).trim())
                  .filter(Boolean);
      }
    }
    const rawAntiga = localStorage.getItem('tiposEvento');
    if (rawAntiga) {
      const arr = JSON.parse(rawAntiga);
      if (Array.isArray(arr)) {
        localStorage.setItem('categorias:tiposEvento', rawAntiga);
        return arr.map(v => typeof v === 'string' ? v : (v?.nome || v?.label || ''))
                  .map(s => String(s).trim())
                  .filter(Boolean);
      }
    }
    const candidatos = ['categoriasGerais', 'categorias-gerais', 'tiposEventoBuffet', 'eventTypes'];
    for (const k of candidatos) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const data = JSON.parse(raw);
      let arr = [];
      if (Array.isArray(data)) arr = data;
      else if (Array.isArray(data?.tiposEvento)) arr = data.tiposEvento;
      else if (Array.isArray(data?.['Tipos de Evento'])) arr = data['Tipos de Evento'];
      if (arr.length) {
        return arr.map(v => typeof v === 'string' ? v : (v?.nome || v?.label || ''))
                  .map(s => String(s).trim())
                  .filter(Boolean);
      }
    }
  } catch {}
  return [];
}
function montarFotoParaEnviar(fotoKey) {
  if (!fotoKey) return null;
  try {
    const map = (function(){
      try{
        if (window.__FOTOS_CLIENTES_PRELOAD__ && typeof window.__FOTOS_CLIENTES_PRELOAD__ === 'object') return window.__FOTOS_CLIENTES_PRELOAD__;
        if (window.storageAdapter && typeof window.storageAdapter.getRaw === 'function'){
          const r = window.storageAdapter.getRaw('fotosClientes');
          return r ? (typeof r === 'string' ? JSON.parse(r) : r) : {};
        }
        return getFotosMap();
      }catch(e){ return {}; }
    })();
    const rec = map[fotoKey];
    if (!rec) return null;
    if (typeof rec === 'string') return { dataURL: rec, filename: 'foto-cliente.jpg' };
    if (rec?.dataURL) return { dataURL: rec.dataURL, filename: rec.filename || 'foto-cliente.jpg' };
    return null;
  } catch { return null; }
}

function preencherTiposEvento() {
  const sel = document.getElementById('tipoEvento');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione</option>';
  lerTiposEvento().forEach(tipo => {
    const opt = document.createElement('option');
    opt.value = tipo;
    opt.textContent = tipo;
    sel.appendChild(opt);
  });
}

// Nome → aplica cliente se bater
document.getElementById('nomeCliente')?.addEventListener('change', async () => {
  const valor = (document.getElementById('nomeCliente').value || '').trim().toLowerCase();
  const clientes = await getClientes();
  const c = (clientes || []).find(x => String(x.nome || '').toLowerCase() === valor);
  if (c) window.aplicarCliente(c);
});

// ===== Preenchimento via lead (garante DOM pronto) =====
document.addEventListener('DOMContentLoaded', async () => {
  if (!leadId) return;
  const lead = await getLeadById(leadId);
  if (!lead) return;

  eventoDoLead = {
    nome: lead.nome || lead.nomeCliente || lead.cliente || "",
    dataEvento: lead.dataEvento,
    local: lead.local,
    qtdConvidados: lead.qtd,
    responsavel: lead.responsavel,
    tipo: lead.tipoEvento,
    cardapios: lead.cardapios || [],
    servicos: lead.servicosAdicionais || [],
    historico: lead.historico || [],
    whatsapp: lead.whatsapp || "",
    email: lead.email || ""
  };

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ""; };
  set("nomeEvento",        eventoDoLead.nome);
  set("data",              eventoDoLead.dataEvento);
  set("local",             eventoDoLead.local);
  set("quantidadeConvidados", eventoDoLead.qtdConvidados);
  set("vendedor",          eventoDoLead.responsavel);
  set("tipoEvento",        eventoDoLead.tipo);
  set("observacoes",       lead.observacoes || lead.obsCardapio || "");
  set("nomeCliente",       eventoDoLead.nome);
  set("telefoneCliente",   eventoDoLead.whatsapp);
  set("emailCliente",      eventoDoLead.email);

  if (window.lucide?.createIcons) lucide.createIcons();
  carregarFotoDoClienteNaUI(clienteFotoKeyCurrent());
  renderAvisosCadastro();

  const eventoTemp = JSON.parse(localStorage.getItem("eventoTemp") || "{}");

  // 1) Se já existir rascunho com itens selecionados, respeita ele
  if (Array.isArray(eventoTemp.itensSelecionados) && eventoTemp.itensSelecionados.length) {
    dadosItens = eventoTemp.itensSelecionados;
  } else {
    // 2) Monta itens a partir do lead (cardápios + adicionais + serviços)
    const itens = [];

    // --- Cardápios enviados (sempre por pessoa) ---
    if (Array.isArray(lead.cardapios_enviados)) {
      lead.cardapios_enviados.forEach(c => {
        itens.push({
          origem: "cardapio",
          tipo: "Cardápio",
          idOrigem: c.id || "",
          nome: c.nome || "Cardápio",
          valor: Number(c.valor || 0) || 0,
          tipoCobranca: "porPessoa",
          desconto: "" // sem desconto inicial
        });
      });
    }

    // --- Adicionais selecionados ---
    if (Array.isArray(lead.adicionaisSelecionados)) {
      lead.adicionaisSelecionados.forEach(a => {
        const cobraPessoa = String(a.cobranca || "pessoa").toLowerCase() === "pessoa";
        itens.push({
          origem: "adicional",
          tipo: "Adicional",
          idOrigem: a.id || "",
          nome: a.nome || "Adicional",
          valor: Number(a.valor || 0) || 0,
          tipoCobranca: cobraPessoa ? "porPessoa" : "fixo",
          desconto: ""
        });
      });
    }

    // --- Serviços selecionados ---
    if (Array.isArray(lead.servicosSelecionados)) {
      lead.servicosSelecionados.forEach(s => {
        const cobraPessoa = String(s.cobranca || "fixo").toLowerCase() === "pessoa";
        itens.push({
          origem: "servico",
          tipo: "Serviço",
          idOrigem: s.id || "",
          nome: s.nome || "Serviço",
          valor: Number(s.valor || 0) || 0,
          tipoCobranca: cobraPessoa ? "porPessoa" : "fixo",
          desconto: ""
        });
      });
    }

    // Fallback de compatibilidade: se o lead antigo tiver outros campos
    if (!itens.length && (eventoDoLead.cardapios?.length || eventoDoLead.servicos?.length)) {
      // aqui você poderia, se quiser, mapear eventoDoLead.cardapios / servicos antigos
      // por enquanto só garante array vazio
    }

    dadosItens = itens;

    // 3) Persiste no eventoTemp para manter consistente com outras telas
    try {
      const evt = { ...(eventoTemp || {}) };
      evt.itensSelecionados = itens;
      localStorage.setItem("eventoTemp", JSON.stringify(evt));
    } catch (e) {
      console.warn("Não foi possível persistir itens do lead em eventoTemp:", e);
    }
  }

  atualizarListaItens();


  const blocoHistorico = document.getElementById("blocoHistoricoLead");
  const listaHistorico = document.getElementById("listaHistoricoLead");
  if (listaHistorico) listaHistorico.innerHTML = "";

  if (eventoDoLead.historico?.length) {
    eventoDoLead.historico.forEach(item => {
      const li = document.createElement("li");
      if (typeof item === "string") {
        li.textContent = item;
      } else {
        li.innerHTML = `<strong>${item.data}</strong> – ${item.tipo || "Anotação"}<br>${item.observacao}<br><em>Responsável: ${item.responsavel || "—"}</em>`;
      }
      listaHistorico?.appendChild(li);
    });
  } else if (blocoHistorico) {
    blocoHistorico.style.display = "none";
  }
});

const leadIdURL = new URLSearchParams(window.location.search).get("id");
if (!leadIdURL) {
  const eventoTemp = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
  if (Object.keys(eventoTemp).length > 0) {
    const campos = {
      nomeEvento: "nomeEvento",
      tipoEvento: "tipoEvento",
      nomeCliente: "nomeCliente",
      telefoneCliente: "telefoneCliente",
      emailCliente: "emailCliente",
      data: "data",
      local: "local",
      quantidadeConvidados: "quantidadeConvidados",
      cerimonia: "cerimonia",
      horarioCerimonia: "horarioCerimonia",
      cerveja: "cerveja",
      observacoes: "observacoes",
      observacao1: "observacao1",
      observacao2: "observacao2",
      vendedor: "vendedor",
    };
    for (const campo in campos) {
      const id = campos[campo];
      if (eventoTemp[campo]) document.getElementById(id).value = eventoTemp[campo];
    }
    if (Array.isArray(eventoTemp.itensSelecionados)) {
      dadosItens = eventoTemp.itensSelecionados;
      atualizarListaItens();
    }
  }
}

// Remover item da lista
window.removerItem = function(index) {
  if (!confirm("Deseja remover este item?")) return;
  dadosItens.splice(index, 1);
  atualizarListaItens();
};

// Autocompletar cliente pelo nome
document.getElementById("nomeCliente").addEventListener("input", async function () {
  const nome = (this.value || '').toLowerCase();
  const clientes = await getClientes();
  const cliente = (clientes || []).find(c => (c.nome || "").toLowerCase() === nome);

  if (cliente) {
    window.aplicarCliente(cliente);
  } else {
    document.getElementById("clienteId").value = "";
    document.getElementById("telefoneCliente").value = "";
    document.getElementById("emailCliente").value = "";
    const badge = document.getElementById('clienteBadge');
    if (badge) badge.style.display = 'none';
    const hintEl = document.getElementById('clienteHint');
    if (hintEl) hintEl.textContent = '';

    carregarFotoDoClienteNaUI('');
    const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
    delete evt.fotoClienteKey;
    localStorage.setItem('eventoTemp', JSON.stringify(evt));

    renderAvisosCadastro();
  }
});

// Guardar estado e ir cadastrar cliente
document.getElementById("cadastrarNovoClienteTopo").addEventListener("click", function (e) {
  e.preventDefault();

  const evtLS = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
  const fotoKey = evtLS.fotoClienteKey || clienteFotoKeyCurrent();

  const eventoTemp = {
    fotoClienteKey: fotoKey,
    nomeEvento: document.getElementById("nomeEvento").value,
    tipoEvento: document.getElementById("tipoEvento").value,
    nomeCliente: document.getElementById("nomeCliente").value,
    telefoneCliente: document.getElementById("telefoneCliente").value,
    emailCliente: document.getElementById("emailCliente").value,
    data: document.getElementById("data").value,
    local: document.getElementById("local").value,
    quantidadeConvidados: document.getElementById("quantidadeConvidados").value,
    cerimonia: document.getElementById("cerimonia").value,
    horarioCerimonia: document.getElementById("horarioCerimonia").value,
    horarioEvento: document.getElementById("horarioEvento").value,
    cerveja: document.getElementById("cerveja").value,
    observacoes: document.getElementById("observacoes").value,
    observacao1: document.getElementById("observacao1").value,
    observacao2: document.getElementById("observacao2").value,
    obsCardapio: document.getElementById("observacoes").value,
    vendedor: document.getElementById("vendedor").value,
    itensSelecionados: dadosItens || [],
    clienteId: document.getElementById("clienteId")?.value || ""
  };

  localStorage.setItem("eventoTemp", JSON.stringify(eventoTemp));
  localStorage.setItem("voltarParaEvento", "true");

  const qs = new URLSearchParams({ voltar: 'evento' });
  if (leadId) qs.set('leadId', leadId);
  window.location.href = `cadastro-cliente.html?${qs.toString()}`;
});

localStorage.removeItem("eventoPrePreenchido");

// Histórico de anotações
function atualizarHistoricoEvento(lista) {
  const listaHistorico = document.getElementById("listaHistoricoLead");
  listaHistorico.innerHTML = "";
  if (!lista.length) {
    listaHistorico.innerHTML = "<li>Nenhuma anotação ainda.</li>";
    return;
  }
  lista.slice().reverse().forEach((item, index) => {
    const li = document.createElement("li");
    const data = item.data || "–";
    const tipo = item.tipo || "Anotação";
    const obs = item.observacao || "–";
    const resp = item.responsavel || "—";
    li.innerHTML = `
      <strong>${data}</strong> – ${tipo}<br>
      <span id="obsE-${index}">${obs}</span><br>
      <em>Responsável: ${resp}</em><br>
      <button onclick="editarAnotacaoEvento(${index})" style="margin-top:5px;">Editar</button>
      <button onclick="excluirAnotacaoEvento(${index})" style="margin-top:5px; margin-left:5px;">Excluir</button>
    `;
    listaHistorico.appendChild(li);
  });
}
function editarAnotacaoEvento(indexReverso) {
  const eventoId = new URLSearchParams(window.location.search).get("id");
  const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
  const evento = eventos.find(e => e.id == eventoId);
  if (!evento || !evento.historico) return;
  const index = evento.historico.length - 1 - indexReverso;
  const novaObs = prompt("Editar anotação:", evento.historico[index].observacao);
  if (novaObs === null) return;
  evento.historico[index].observacao = novaObs;
 safeSaveEventos(eventos);

  atualizarHistoricoEvento(evento.historico);
}
function excluirAnotacaoEvento(indexReverso) {
  if (!confirm("Deseja excluir esta anotação?")) return;
  const eventoId = new URLSearchParams(window.location.search).get("id");
  const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
  const evento = eventos.find(e => e.id == eventoId);
  if (!evento || !evento.historico) return;
  const index = evento.historico.length - 1 - indexReverso;
  evento.historico.splice(index, 1);
safeSaveEventos(eventos);

  atualizarHistoricoEvento(evento.historico);
}
window.editarAnotacaoEvento  = editarAnotacaoEvento;
window.excluirAnotacaoEvento = excluirAnotacaoEvento;

function salvarAnotacaoEvento() {
  const texto = document.getElementById("novaAnotacaoEvento").value.trim();
  if (!texto) return alert("Digite algo antes de salvar.");
  const data = new Date().toLocaleDateString("pt-BR");
  const usuario = JSON.parse(localStorage.getItem("usuarioLogado"))?.nome || "—";
  const nova = { data, tipo: "Anotação", observacao: texto, responsavel: usuario };

  const eventoId = new URLSearchParams(window.location.search).get("id");
  const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
  let evento = eventos.find(e => e.id == eventoId);

  if (evento) {
    evento.historico = evento.historico || [];
    evento.historico.push(nova);
    safeSaveEventos(eventos);

  } else {
    let eventoTemp = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
    eventoTemp.historico = eventoTemp.historico || [];
    eventoTemp.historico.push(nova);
    localStorage.setItem("eventoTemp", JSON.stringify(eventoTemp));
  }

  const bloco = document.getElementById("blocoHistoricoLead");
  if (bloco) bloco.style.display = "block";

  const lista = document.getElementById("listaHistoricoLead");
  const li = document.createElement("li");
  li.innerHTML = `<strong>${nova.data}</strong> – ${nova.tipo}<br>${nova.observacao}<br><em>Responsável: ${nova.responsavel}</em>`;
  lista.prepend(li);

  document.getElementById("novaAnotacaoEvento").value = "";
}
window.salvarAnotacaoEvento = salvarAnotacaoEvento;

// === substituir a função inteira por esta versão ===
// salvar evento temporário (para voltar da tela de itens)
function salvarEventoTemp() {
  // helpers locais
  const getVal = (id) => (document.getElementById(id)?.value || '').trim();
  const toISODate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (!Number.isFinite(+d)) return '';
    // normaliza para ISO local YYYY-MM-DD (sem fuso)
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  const toInt = (v) => {
    const n = parseInt(String(v || '').replace(/\D+/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };

  // rascunho anterior (preserva campos que não estamos alterando agora)
  const prev = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
  const fotoKey = prev.fotoClienteKey || (typeof clienteFotoKeyCurrent === 'function' ? clienteFotoKeyCurrent() : '');

  // campos do formulário
  const dataISO = toISODate(getVal('data'));
  const criadoEm = prev.createdAt || toISODate(getVal('eventoCriadoEm')) || toISODate(new Date());

  // itens (garante array)
  const itensSelecionados = Array.isArray(window.dadosItens) ? window.dadosItens : (prev.itensSelecionados || []);

  const eventoTemp = {
    // preserva id temporário se existir
    id: prev.id || prev.tempId || undefined,

    // cliente
    clienteId: getVal('clienteId'),
    nomeCliente: getVal('nomeCliente'),
    telefoneCliente: getVal('telefoneCliente'),
    emailCliente: getVal('emailCliente'),

    // evento
    nomeEvento: getVal('nomeEvento'),
    tipoEvento: getVal('tipoEvento'),
    data: dataISO,
    dataISO: dataISO,               // espelho útil para outros módulos
    local: getVal('local'),
    quantidadeConvidados: toInt(getVal('quantidadeConvidados')),
    cerimonia: getVal('cerimonia'),
    horarioCerimonia: getVal('horarioCerimonia'),
    horarioEvento: getVal('horarioEvento'),
    cerveja: getVal('cerveja'),

    // origens/observações
    origemConheceu: getVal('origemCliente'),
    origemObs: getVal('origemObs'),
    observacoes: getVal('observacoes'),
    observacao1: getVal('observacao1'),
    observacao2: getVal('observacao2'),
    obsCardapio: getVal('observacoes'),

    // responsável
    vendedor: getVal('vendedor'),

    // anexos/itens
    fotoClienteKey: fotoKey,
    itensSelecionados,

    // metadados
    createdAt: criadoEm
  };

  // merge (mantém o que já existia e não estamos sobrescrevendo agora)
  const merged = { ...prev, ...eventoTemp };

  localStorage.setItem('eventoTemp', JSON.stringify(merged));

  // reflete visualmente a data de criação, se o campo existir
  const dtCriado = document.getElementById('eventoCriadoEm');
  if (dtCriado && !dtCriado.value) dtCriado.value = merged.createdAt || '';

  return merged; // opcional: útil se a função for usada programaticamente
}


window.salvarItensEIrParaItensEvento = function salvarItensEIrParaItensEvento() {
  salvarEventoTemp();
  localStorage.setItem("voltarParaEvento", "true");
 // garante que temos um ID do evento antes de ir
const evtTemp = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
if (!evtTemp.id) {
  // se ainda não tem id (cadastro novo), cria um temporário estável para a ida/volta
  evtTemp.id = "tmp_" + Date.now();
  localStorage.setItem("eventoTemp", JSON.stringify(evtTemp));
}
window.location.href = `itens-evento.html?id=${encodeURIComponent(evtTemp.id)}&origem=cadastro`;

};

// --- Modal Clientes ---
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const modal = $('modalClientes');
  const lista = $('listaClientesModal');
  const busca = $('buscaClienteModal');

  $('abrirPickerClientes')?.addEventListener('click', () => {
    renderLista('');
    modal.style.display = 'flex';
    setTimeout(() => busca?.focus(), 50);
  });

  $('fecharModalClientes')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  busca?.addEventListener('input', (e) => {
    renderLista(String(e.target.value || ''));
  });

  async function renderLista(filtro = '') {
    if (!lista) return;
    const clientes = await getClientes();
    const f = filtro.toLowerCase();

    const filtrados = clientes.filter(c => {
      const nome = (c.nome||'').toLowerCase();
      const email= (c.email||'').toLowerCase();
      const tel  = String(c.whatsapp||c.telefone||'');
      return !f || nome.includes(f) || email.includes(f) || tel.includes(f);
    });

    lista.innerHTML = filtrados.length
      ? ''
      : '<div style="padding:10px;color:#777;">Nenhum cliente encontrado.</div>';

    filtrados.forEach(c => {
      const tel = c.whatsapp || c.telefone || '';
      const card = document.createElement('button');
      card.type = 'button';
      card.style.cssText = 'text-align:left;padding:10px 12px;border:1px solid #e6dccc;background:#fff;border-radius:12px;cursor:pointer;';
      card.innerHTML = `
        <div style="font-weight:600;">${c.nome || '(sem nome)'}</div>
        <div style="font-size:12px;color:#6b6b6b;">${c.email || '—'} • ${tel || '—'}</div>
      `;
      card.addEventListener('click', () => {
        if (typeof window.aplicarCliente === 'function') window.aplicarCliente(c);
        modal.style.display = 'none';
      });
      lista.appendChild(card);
    });
  }
  function initCriadoEm() {
  const el = document.getElementById('eventoCriadoEm');
  if (!el) return;

  // tenta pegar do eventoTemp (se já existir); senão, hoje
  let val = '';
  try {
    const evt = JSON.parse(localStorage.getItem('eventoTemp') || '{}');
    val = (evt.criadoEm || '').slice(0, 10);
  } catch {}

  if (!val) val = new Date().toISOString().slice(0, 10);
  el.value = val;
}

// ...dentro do DOMContentLoaded principal:
initCriadoEm();

});

function preencherOrigemCliente() {
  const el = document.getElementById('origemCliente');
  if (!el) return;
  const fontes = JSON.parse(localStorage.getItem('comoConheceu') || '[]');
  const fallback = ['Indicação','Instagram','Facebook','Google','Site','Passou em frente','Outro'];
  const arr = Array.isArray(fontes) && fontes.length ? fontes : fallback;
  el.innerHTML = '<option value="">Selecione</option>' +
    arr.map(f => `<option value="${f}">${f}</option>`).join('');
}
document.addEventListener('DOMContentLoaded', preencherOrigemCliente);

// Link “+ Cadastrar novo cliente” com ret
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('cadastrarNovoClienteTopo');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const ret = encodeURIComponent(location.href.split('#')[0]);
    location.href = `cadastro-cliente.html?from=evento&ret=${ret}`;
  });
});
// === ABRIR ITENS-EVENTO guardando um rascunho (eventoTemp) ===
function abrirItensDoEvento(){
  const id = new URLSearchParams(location.search).get("id")
           || localStorage.getItem("eventoSelecionado")
           || String(Date.now());

  const qtd = parseInt(document.getElementById("eventoConvidados")?.value || "0", 10) || 0;
  const temp = {
    id,
    nomeEvento: document.getElementById("eventoNome")?.value || "",
    quantidadeConvidados: qtd
  };

  localStorage.setItem("eventoTemp", JSON.stringify(temp));
  localStorage.setItem("eventoSelecionado", String(id));
  if (qtd) localStorage.setItem("quantidadeConvidadosEvento", String(qtd));

  window.location.href = `itens-evento.html?id=${encodeURIComponent(id)}&origem=cadastro`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnSelecionarItens") // use o id do seu botão
    ?.addEventListener("click", (e) => { e.preventDefault(); abrirItensDoEvento(); });
});
// === Ao voltar do Itens-Evento, puxe a seleção para o eventoTemp ===
// === INÍCIO PATCH: importar ponte itensSelecionadosEvento ===
(function importarItensDaTelaItens(){
  try {
    const temp  = JSON.parse(localStorage.getItem("eventoTemp") || "null") || {};
    const itens = JSON.parse(localStorage.getItem("itensSelecionadosEvento") || "null");
    const qtdLS = Number(localStorage.getItem("quantidadeConvidadosEvento") || 0);

    if (Array.isArray(itens) && itens.length){
      // 1) grava no rascunho
      temp.itensSelecionados = itens;
      localStorage.setItem("eventoTemp", JSON.stringify(temp));

      // 2) joga na variável usada pela UI
      window.dadosItens = itens;

      // 3) atualiza quantidade (se veio da tela de itens)
      if (qtdLS > 0) {
        temp.quantidadeConvidados = qtdLS;
        temp.qtdConvidados = qtdLS; // compat
        localStorage.setItem("eventoTemp", JSON.stringify(temp));
        const elQtd = document.getElementById("quantidadeConvidados");
        if (elQtd) elQtd.value = String(qtdLS);
      }

      // 4) renderiza a tabela agora
      if (typeof window.atualizarListaItens === "function") window.atualizarListaItens();

      // 5) limpa a ponte depois de usar (pra não duplicar no refresh)
      try { localStorage.removeItem("itensSelecionadosEvento"); } catch {}
      try { localStorage.removeItem("quantidadeConvidadosEvento"); } catch {}
    } else {
      // sem ponte? usa o que estiver no eventoTemp
      window.dadosItens = Array.isArray(temp.itensSelecionados) ? temp.itensSelecionados : [];
      if (typeof window.atualizarListaItens === "function") window.atualizarListaItens();
    }
  } catch (e) {
    console.warn("CadastroEvento: falha ao importar itens da tela de itens:", e);
  }
})();
// === FIM PATCH ===


// === Abrir Itens a partir do CADASTRO e marcar retorno ===
(function wireAbrirItensFromCadastro(){
  const gatilhos = document.querySelectorAll('[data-abrir-itens], #btnIrItens, #btnItensEvento');
  if (!gatilhos.length) return;

  const getId = () => {
    const qsId = new URLSearchParams(location.search).get("id");
    if (qsId) return qsId;
    const tmp = JSON.parse(localStorage.getItem("eventoTemp") || "{}");
    if (tmp && tmp.id) return tmp.id;
    return localStorage.getItem("eventoSelecionado") || "";
  };

  gatilhos.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = String(getId() || "");
      try { localStorage.setItem("itensEvento:returnTo", "cadastro"); } catch {}
      const url = `itens-evento.html?id=${encodeURIComponent(id)}&from=cadastro`;
      window.location.href = url;
    });
  });
})();
  });