import { handleRequest as handleRemote } from './api/remote-adapter.js';
// clientes-lista.js — robusto: API + fallbacks locais
import guard from './api/proteger-pagina.js';

import { handleRequest as handleLocal } from './api/routes.js';


const KEY_TIPOS_EVENTO = 'categorias:tiposEvento';
// INÍCIO PATCH API-LOCAL 2/2
const api = (endpoint, method = 'GET', body = {}) =>
  new Promise(async (resolve) => {
    const forceLocal = (typeof window !== 'undefined') && window.__FORCE_LOCAL__ === true;
    const temRemoto  = !forceLocal && (typeof window !== 'undefined') && !!window.__API_BASE__;
    if (temRemoto) {
      try {
        await handleRemote(endpoint, { method, body }, resolve);
        return;
      } catch (e) {
        console.warn('[API] remoto falhou, usando rotas locais:', e);
      }
    }
    handleLocal(endpoint, { method, body }, resolve);
  });
// FIM PATCH API-LOCAL 2/2


/* ========== utils ========== */
function debounce(fn, wait = 250) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }
const collNome = new Intl.Collator('pt-BR', { sensitivity:'base', ignorePunctuation:true, numeric:true });
const collStr  = new Intl.Collator('pt-BR', { sensitivity:'base', ignorePunctuation:true, numeric:true });
const sortStrings = (a,b)=>collStr.compare(a,b);
const ordenarPorNome = (arr)=> (arr||[]).slice().sort((a,b)=>collNome.compare((a?.nome||a?.nomeCliente||'').trim(), (b?.nome||b?.nomeCliente||'').trim()));
const esc = (s)=>String(s ?? '').replace(/[&<>"'`]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));

/* Fallback local: tenta várias chaves conhecidas */
function lerClientesLocalPorChaves(){ 
  const chaves = ['clientesBase','clientes','clientes_lista','clientes:base','clientesSalvos'];
  for (const k of chaves){
    try{
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length) return data;
      if (Array.isArray(data?.clientes) && data.clientes.length) return data.clientes;
    }catch{}
  }
  return null;
}

function scanLocalStoragePorClientes(){
  let melhor = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      // 👇 NOVO: só considera chaves que contenham "cliente" no nome
      if (!/cliente/i.test(key)) continue;

      const raw = localStorage.getItem(key);
      if (!raw || raw.length > 2_000_000) continue; // evita blobs gigantes

      try {
        const val = JSON.parse(raw);

        // tenta formatos comuns: array direto ou { clientes: [...] }
        const arr = Array.isArray(val)
          ? val
          : (Array.isArray(val?.clientes) ? val.clientes : null);

        if (!arr || !arr.length) continue;

        // só considera se parecer mesmo um "cliente"
        const temNome = arr.some(o =>
          o && (o.nome || o.nomeCliente || o.email || o.whatsapp)
        );

        if (!temNome) continue;

        // escolhe o maior array encontrado
        if (arr.length > melhor.length) {
          melhor = arr;
        }
      } catch {}
    }
  } catch {}
  return melhor;
}


/* Tipos de evento (Google Fonts NÃO aqui; menu preservado) */
function lerTiposDeEventoDasCategorias() {
  try {
    const rawKey = localStorage.getItem(KEY_TIPOS_EVENTO);
    if (rawKey) {
      const arr = JSON.parse(rawKey);
      if (Array.isArray(arr) && arr.length) {
        return arr.map(v => typeof v === 'string' ? v : (v?.nome || v?.label || ''))
                  .map(s => String(s).trim()).filter(Boolean);
      }
    }
    const candidatos = ['categoriasGerais','categorias-gerais','tiposEvento','tipos_de_evento','eventTypes'];
    for (const k of candidatos) {
      const raw = localStorage.getItem(k); if (!raw) continue;
      const data = JSON.parse(raw); let arr = [];
      if (Array.isArray(data)) arr = data;
      else if (Array.isArray(data?.tiposEvento)) arr = data.tiposEvento;
      else if (Array.isArray(data?.['Tipos de Evento'])) arr = data['Tipos de Evento'];
      else for (const kk of Object.keys(data || {})) if (/tipo/i.test(kk) && Array.isArray(data[kk])) { arr = data[kk]; break; }
      if (arr.length) {
        return arr.map(v => typeof v === 'string' ? v : (v?.nome || v?.label || ''))
                  .map(s => String(s).trim()).filter(Boolean);
      }
    }
  } catch {}
  return [];
}

/* ========== boot ========== */
function init() {
 // 1) Baseada na META da página (mais simples, usa <meta name="page-permission">):
guard();

// ou, se preferir forçar perfis via código nesta tela:
// guard(['Administrador','Vendedor']);

  window.lucide?.createIcons?.();

  const recarregar = debounce(carregarClientes, 200);
  document.getElementById('filtroTipoEvento')?.addEventListener('change', recarregar);
  document.getElementById('filtroBusca')?.addEventListener('input', recarregar);
  document.getElementById('filtroData')?.addEventListener('change', recarregar);
  document.getElementById('filtroResponsavel')?.addEventListener('change', recarregar);

  // Ações (delegação)
  const lista = document.getElementById('listaClientes');
  lista?.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-edit],[data-del],[data-toggle]');
    if (!el) return;
    const id = el.getAttribute('data-edit') || el.getAttribute('data-del') || el.getAttribute('data-toggle');
    if (!id) return;

if (el.hasAttribute('data-edit')) {
  location.href = `cliente-detalhado.html?id=${encodeURIComponent(id)}`;
  return;
}

    if (el.hasAttribute('data-del')) {
      if (!confirm('Deseja realmente excluir este cliente?')) return;
      const r = await api('/clientes', 'DELETE', { id });
      if (r.status !== 200) return alert(r.error || 'Erro ao excluir');
      carregarClientes(); return;
    }
    if (el.hasAttribute('data-toggle')) {
      const atual = (el.getAttribute('data-status') || '').toLowerCase();
      const proximo = atual === 'inativo' ? 'ativo' : 'inativo';
      const r = await api('/clientes', 'PUT', { id, status: proximo });
      if (r.status !== 200) return alert(r.error || 'Erro ao atualizar status');
      carregarClientes(); return;
    }
  });

  (async () => {
    await carregarResponsaveis();
    await carregarClientes();
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
/* Localiza o evento mais relevante para um cliente (último por data) */
function getEventoIdParaCliente(c) {
  // 1) Tenta pelo array c.eventos (se existir)
  try {
    if (Array.isArray(c.eventos) && c.eventos.length) {
      const ult = c.eventos[c.eventos.length - 1] || {};
      const eId = ult.id || ult.idEvento || ult.eventoId;
      if (eId) return String(eId);
    }
  } catch {}

  // 2) Procura no localStorage "eventos"
  try {
    const eventos = JSON.parse(localStorage.getItem('eventos') || '[]');
    const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const dig  = s => String(s||'').replace(/\D+/g,'');

    const idC    = String(c.id || '');
    const emailC = String(c.email || '').toLowerCase().trim();
    const telC   = dig(c.whatsapp || c.telefone || c.celular || c.fone || '');
    const nomeC  = norm(c.nome || c.nomeCliente || '');

    const candidatos = eventos.filter(ev => {
      const idEv   = String(ev.clienteId || ev.idCliente || ev.cliente?.id || ev.infoCliente?.id || '');
      const emailEv= String(ev.emailCliente || ev.infoCliente?.email || '').toLowerCase().trim();
      const telEv  = dig(ev.whatsappCliente || ev.telefoneCliente || ev.whatsapp || ev.telefone || ev.celular || ev.infoCliente?.whatsapp || ev.infoCliente?.telefone || '');
      const nomeEv = norm(ev.nomeCliente || ev.infoCliente?.nome || '');
      return (idC && idEv && idEv === idC)
          || (emailC && emailEv && emailEv === emailC)
          || (telC && telEv && telEv === telC)
          || (nomeC && nomeEv && nomeEv === nomeC);
    });

    candidatos.sort((a,b)=>{
      const da = new Date(a.data || a.dataEvento || a.data_evento || a.dataISO || 0).getTime();
      const db = new Date(b.data || b.dataEvento || b.data_evento || b.dataISO || 0).getTime();
      return db - da; // mais recente primeiro
    });

    if (candidatos[0]?.id) return String(candidatos[0].id);
  } catch {}

  return null;
}

/* ========== carregar lista ========== */
async function carregarClientes() {
  const lista = document.getElementById('listaClientes');
  const selTipo = document.getElementById('filtroTipoEvento');
  if (!lista) return;

  lista.innerHTML = 'Carregando...';

 // 1) Busca na NUVEM (via API /leads)
let clientesRemotos = [];
try {
  const r = await api('/leads', 'GET', {});
  if (r && r.status === 200 && Array.isArray(r.data)) clientesRemotos = r.data;
} catch (e) {
  console.warn('[clientes] erro ao buscar /leads:', e);
}

// clientes locais (fallbacks variados)
const clientesLocais = lerClientesLocalPorChaves() || scanLocalStoragePorClientes() || [];

  // 3) Mescla REMOTOS + LOCAIS (sem duplicar)
  const mapa = new Map();
  const normalizarTelefone = (s) => String(s || '').replace(/\D+/g, '');
  const normalizarEmail = (s) => String(s || '').trim().toLowerCase();
  const normalizarNome = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const makeKey = (c = {}) => {
    const id =
      c.id ||
      c.idCliente ||
      c.clienteId ||
      (c.infoCliente && (c.infoCliente.id || c.infoCliente.clienteId)) ||
      '';
    const email = normalizarEmail(c.email || (c.infoCliente && c.infoCliente.email));
    const tel = normalizarTelefone(
      c.whatsapp ||
      c.telefone ||
      (c.infoCliente && (c.infoCliente.whatsapp || c.infoCliente.telefone))
    );
    const nome = normalizarNome(c.nome || c.nomeCliente || (c.infoCliente && c.infoCliente.nome));
    return [id, email, tel, nome].join('|');
  };

  (clientesRemotos || []).forEach((c) => {
    const k = makeKey(c);
    mapa.set(k, c);
  });

  (clientesLocais || []).forEach((c) => {
    const k = makeKey(c);
    if (!mapa.has(k)) {
      mapa.set(k, c);
    }
  });

  let clientes = Array.from(mapa.values());
  clientes = ordenarPorNome(clientes);

  // 4) Preenche "Tipo de Evento" (igual estava antes)
  if (selTipo && selTipo.options.length <= 1) {
    const setTipos = new Set();
    const cat = lerTiposDeEventoDasCategorias();
    if (cat.length) {
      cat.forEach(t => setTipos.add(t));
    } else {
      clientes.forEach(c => {
        if (c.tipoEvento) setTipos.add(String(c.tipoEvento).trim());
        const ult = (c.eventos && c.eventos.slice && c.eventos.slice(-1)[0]) || {};
        if (ult.tipo) setTipos.add(String(ult.tipo).trim());
      });
    }
    const frag = document.createDocumentFragment();
    Array.from(setTipos).filter(Boolean).sort(sortStrings).forEach(t => {
      const op = document.createElement('option');
      op.value = t;
      op.textContent = t;
      frag.appendChild(op);
    });
    selTipo.appendChild(frag);
  }

  // 5) Aplica filtros (igual estava)
  const busca = (document.getElementById('filtroBusca')?.value || '').toLowerCase();
  const tipo  = (document.getElementById('filtroTipoEvento')?.value || '').toLowerCase();
  const data  = document.getElementById('filtroData')?.value || '';
  const resp  = (document.getElementById('filtroResponsavel')?.value || '').toLowerCase();

  lista.innerHTML = '';

  let filtrados = clientes.filter(c => {
    const ult = (c.eventos && c.eventos.slice && c.eventos.slice(-1)[0]) || {};
    const tipoMatch = !tipo || String(ult.tipo || c.tipoEvento || '').toLowerCase().includes(tipo);
    const dataMatch = !data || String(ult.data || '') === data;
    const respDoItem = (ult.responsavel || c.responsavel || '').toLowerCase();
    const respMatch = !resp || respDoItem.includes(resp);

    const cidade = c.cidade || c.endereco?.cidade || '';
    const whats  = c.whatsapp || c.telefone || '';
    const buscaMatch =
      !busca ||
      String(c.nome || '').toLowerCase().includes(busca) ||
      String(cidade).toLowerCase().includes(busca) ||
      String(whats).toLowerCase().includes(busca);

    return tipoMatch && dataMatch && respMatch && buscaMatch;
  });

  filtrados = ordenarPorNome(filtrados);

  // 6) Renderiza os cards de clientes (igual antes)
  filtrados.forEach(c => {
    const isInativo = c.status ? String(c.status).toLowerCase() === 'inativo' : !!c.inativo;
    const box = document.createElement('div');
    box.className = 'cliente-box' + (isInativo ? ' inativo' : '');

    const docCount = Array.isArray(c.documentos) ? c.documentos.length : 0;
    const phoneRaw = c.whatsapp || c.telefone || '';
    const phone = String(phoneRaw).replace(/\D/g, '');
    const cidade = c.cidade || c.endereco?.cidade || '';

    box.innerHTML = `
      <h3>
        ${esc(c.nome || '(Sem nome)')}
        ${isInativo ? '<span class="etiqueta inativo">Inativo</span>' : ''}
        ${docCount > 0 ? `<span class="chip"><i data-lucide="paperclip"></i> ${docCount} doc${docCount>1?'s':''}</span>` : ''}
      </h3>
      <p class="info-secundaria">${esc(cidade || '-')}${c.tipoEvento ? ` • ${esc(c.tipoEvento)}` : ''}</p>
      <p>${esc(c.email || '-')} | ${esc(phoneRaw || '-')}</p>
      <div class="acoes">
        <button data-edit="${esc(c.id)}"><i data-lucide="edit-2"></i> Editar</button>
        <button data-del="${esc(c.id)}"><i data-lucide="trash"></i> Excluir</button>
        <button data-toggle="${esc(c.id)}" data-status="${isInativo ? 'inativo' : 'ativo'}">
          <i data-lucide="pause"></i> ${isInativo ? 'Ativar' : 'Inativar'}
        </button>
        ${phone ? `<a href="https://wa.me/${encodeURIComponent(phone)}" target="_blank" rel="noopener"><i data-lucide="message-circle"></i> WhatsApp</a>` : ''}
        ${(() => {
          const evId = getEventoIdParaCliente(c);
          const href = evId
            ? `evento-detalhado.html?id=${encodeURIComponent(evId)}`
            : `cliente-detalhado.html?id=${encodeURIComponent(c.id)}`;
          return `<a href="${href}"><i data-lucide="search"></i> Ver Detalhes</a>`;
        })()}
      </div>
    `;
    lista.appendChild(box);
  });

  window.lucide?.createIcons?.();

  if (!lista.children.length) {
    lista.innerHTML = '<p class="info-secundaria">Nenhum cliente encontrado com os filtros atuais.</p>';
  }
}


/* ========== responsáveis ========== */
async function carregarResponsaveis() {
  try {
    const sel = document.getElementById('filtroResponsavel');
    if (!sel || sel.options.length > 1) return;

    let nomes = [];
    const r = await api('/usuarios', 'GET', {});
    if (r?.status === 200) {
      nomes = (r.data || [])
        .filter(u => /admin|administrador|vendedor|comercial|gestor|gerente/i.test(String(u.perfil || '')))
        .map(u => String(u.nome || u.email || '').trim())
        .filter(Boolean);
    }

    try {
      const rCli = await api('/clientes', 'GET', {});
      if (rCli?.status === 200) {
        const extras = new Set();
        (rCli.data || []).forEach(c => {
          const ult = (c.eventos && c.eventos.slice && c.eventos.slice(-1)[0]) || {};
          [c.responsavel, ult.responsavel].forEach(v => v && extras.add(String(v).trim()));
        });
        nomes = nomes.concat([...extras]);
      }
    } catch {}

    const unicos = [...new Set(nomes)].filter(Boolean).sort(sortStrings);
    const frag = document.createDocumentFragment();
    unicos.forEach(n => {
      const op = document.createElement('option'); op.value = n; op.textContent = n; frag.appendChild(op);
    });
    sel.appendChild(frag);
  } catch {}
}
