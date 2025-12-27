// api/proteger-pagina.js
import { obterUsuarioDoToken } from './auth.js';
// === INÍCIO PATCH GUARD: bypass + páginas públicas ===
// === INÍCIO PATCH GUARD: páginas públicas + bypass ===
(function(){
  if (window.__KGB_GUARD_BYPASS__ === true) return; // ex.: login.html

  const PUBLIC_PAGES = ['login.html', 'acesso-negado.html', 'index.html'];
  const path = (location.pathname || '').split('/').pop().split('?')[0].split('#')[0];
  if (PUBLIC_PAGES.includes(path)) return; // não bloqueia públicas
})();
// === FIM PATCH GUARD ===
// === INÍCIO PATCH GUARD: token + roles ===
(function(){
  // Nome do arquivo atual
  const page = (location.pathname || '').split('/').pop().split('?')[0].split('#')[0];

  // Meta que você já usa para mapear página (mantém compatibilidade)
  const metaPerm = document.querySelector('meta[name="page-permission"]');
  // Meta opcional para exigir papéis (ex.: <meta name="page-roles" content="Administrador,Financeiro">)
  const metaRoles = document.querySelector('meta[name="page-roles"]');

  const token = localStorage.getItem('auth.token') || '';
  const roles = (localStorage.getItem('auth.roles') || '')
                  .split(',').map(s=>s.trim()).filter(Boolean);

  // 1) Se não tem token → manda pro login
  if (!token) {
    // guarda para voltar depois (opcional)
    try { sessionStorage.setItem('postLoginRedirect', page); } catch {}
    location.href = 'login.html';
    return;
  }

  // 2) Se a página pede papéis, valida
  const required = (metaRoles?.content || '')
                    .split(',').map(s=>s.trim()).filter(Boolean);
  if (required.length) {
    const ok = required.some(r => roles.includes(r)); // basta 1 papel bater
    if (!ok) {
      location.href = 'acesso-negado.html';
      return;
    }
  }

  // 3) Se quiser reforçar que a página está “mapeada”, faça um aviso apenas
  if (!metaPerm) {
    console.warn('[GUARD] Sem meta[name="page-permission"] em', page);
  } else {
    // opcional: validar formato "page:..."; seu meta atual já segue isso
  }
})();
// === FIM PATCH GUARD ===

/* ========================= Helpers ========================= */
/* ===== Guard Core (M37) — Preview/Enforce + Route Map ===== */
(function(){
  if (window.__guardCoreLoaded) return; 
  window.__guardCoreLoaded = true;

  // Le flags
  const guard = {
    enforce: localStorage.getItem('guard.enforce') === '1' ? 1 : 0, // 0=preview, 1=enforce
    logPrefix: '[GUARD]',
  };

  // Util
  const $meta = (name) => document.querySelector(`meta[name="${name}"]`);
  const getMetaContent = (name) => ($meta(name)?.getAttribute('content')||'').trim();
  const pageFromMeta = () => {
    const c = getMetaContent('page-permission'); // ex.: "page:financeiro-lancamentos.html"
    if (!c) return null;
    const m = c.match(/^page\s*:\s*(.+)$/i);
    return m ? m[1].trim() : null;
  };
  // Nome do arquivo atual (ex: "clientes-lista.html")
const currentPageFile = () => {
  try {
    let p = (location.pathname || '').split('/').filter(Boolean).pop() || '';
    p = p.split('?')[0].split('#')[0];

    // Se vier sem extensão (ex: "/clientes-lista"), assume ".html"
    if (p && !p.includes('.')) p = `${p}.html`;

    // Se vier vazio (ex: "/"), assume index.html
    if (!p) p = 'index.html';

    return p;
  } catch (e) {
    return 'index.html';
  }
};

  // ===== IMPORTANTE =====
  // Mantenha este MAP com TODAS as páginas do menu caso alguma NÃO tenha o <meta>.
  // Formato: "arquivo.html": "page:arquivo.html"
  // DICA: se a página TIVER meta, o meta vence; o MAP é fallback.
  const ROUTE_MAP = window.ROUTE_MAP || {
    // === EXEMPLOS — complete conforme seu projeto ===
    'dashboard.html'                : 'page:dashboard.html',
    'leads.html'                    : 'page:leads.html',
    'clientes-lista.html'                 : 'page:clientes-lista.html',
    'financeiro-lancamentos.html'   : 'page:financeiro-lancamentos.html',
    'financeiro-evento.html'        : 'page:financeiro-evento.html',
    'financeiro-analises.html'      : 'page:financeiro-analises.html',
    'contrato.html'                 : 'page:contrato.html',
    'area-cliente.html'             : 'page:area-cliente.html',
    'permissoes.html'               : 'page:permissoes.html',
    'usuarios.html'                 : 'page:usuarios.html',
    'eventos-pagos.html'            : 'page:eventos-pagos.html',
    'checkin.html'                  : 'page:checkin.html',
    'pdv.html'                      : 'page:pdv.html',
    'formaturas.html'               : 'page:formaturas.html',
    'escala-evento.html'            : 'page:escala-evento.html',
'relatorio-evento.html'        : 'page:relatorio-evento.html',
'evento-detalhado.html'        : 'page:evento-detalhado.html',
'checklist-materiais.html'     : 'page:checklist-materiais.html',
'checklist.html' : 'page:checklist.html',
'clientes-lista.html' : 'page:clientes-lista.html',
'definicoes-evento.html'       : 'page:definicoes-evento.html',
  'detalhes-responsavel-evento.html' : 'page:detalhes-responsavel-evento.html',
'itens-evento.html' : 'page:itens-evento.html',
'painel-leads.html' : 'page:painel-leads.html',
'planilha-eventos.html' : 'page:planilha-eventos.html',
'pos-evento.html' : 'page:pos-evento.html',
'seguranca.html' : 'page:seguranca.html',
'comissoes.html' : 'page:comissoes.html',
'cadastro-cliente.html' : 'page:cadastro-cliente.html',
'equipe.html' : 'page:equipe.html',
'escala-evento.html' : 'page:escala-evento.html',

    // ...adicione TODAS as restantes do menu lateral
  };

 // novo código aqui...


    // Resolve a permissão da página: tenta meta; se não houver, ROUTE_MAP
  function resolvePagePermission(){
    const metaPage = pageFromMeta();
    if (metaPage) return `page:${metaPage}`;
    const file = currentPageFile();
    const mapped = ROUTE_MAP[file];
    return mapped ? mapped : null;
  }

  // Valida e loga em modo preview/enforce
  function validatePageAccessPreview(){
    const perm = resolvePagePermission();
    if (!perm){
      const msg = `${guard.logPrefix} Página sem meta 'page-permission' e sem entrada no ROUTE_MAP: ${currentPageFile()}`;
      if (guard.enforce){
        console.error(msg);
    alert('Acesso bloqueado: página não mapeada no guard.');
 location.href = './acesso-negado.html';
      } else {
        console.warn(msg, ' (modo preview: apenas aviso)');
      }
      return;
    }
    console.log(`${guard.logPrefix} OK (${guard.enforce? 'ENFORCE' : 'PREVIEW'}) => ${perm}`);
  }

  // Exponha utilitários (se outras partes precisarem)
  window.__GUARD__ = { ROUTE_MAP, validatePageAccessPreview, isEnforce: ()=>!!guard.enforce };

  // Dispara validação na carga
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', validatePageAccessPreview);
  } else {
    validatePageAccessPreview();
  }
})();

function normalizaTexto(s=''){
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim();
}
function lower(s=''){ return normalizaTexto(s).toLowerCase(); }

function getUsuarioAtual() {
  // 1) Tenta extrair dados do usuário a partir do token (se o backend colocar isso no token)
  const t = obterUsuarioDoToken?.() || {};

  // 2) Perfis (roles) salvos na sessão, vindos do login
  let rolesStr = '';
  try {
    rolesStr =
      (localStorage.getItem('auth.roles') ||
       sessionStorage.getItem('auth.roles') ||
       '').trim();
  } catch (e) {
    rolesStr = '';
  }

  const perfisLista = rolesStr
    .split(',')
    .map(s => String(s || '').trim())
    .filter(Boolean);

  // 3) Perfil principal
  const perfil =
    t.perfil ||
    t.role ||
    t.permissao ||
    perfisLista[0] ||
    '';

  // 4) Lista final de perfis
  const perfis = perfisLista.length
    ? perfisLista
    : (Array.isArray(t.perfis) ? t.perfis : (perfil ? [perfil] : []));

  // 5) Objeto final do usuário atual
  return {
    id: t.id || '',
    nome: t.nome || t.name || t.displayName || t.usuario || '',
    email: (t.email || '').toLowerCase(),
    perfil,
    perfis
  };
}


function ehAdmin(usuario){
  const txt = lower(usuario.perfil || '');
  const candidatos = [txt, ...(usuario.perfis || []).map(lower)];

  // considera admin se CONTÉM uma dessas palavras
  const palavrasAdmin = ['admin', 'adm', 'administrador', 'administrativo', 'gestor', 'diretor', 'owner', 'root', 'super', 'coordenador'];

  return candidatos.some(p =>
    palavrasAdmin.some(word => p.includes(word))
  );
}

function guardsDesativados() {
  try { return JSON.parse(localStorage.getItem('disable_guards') || 'false'); }
  catch { return false; }
}

/* ====== NOVO: modo de operação ====== */
// ENFORCE ativo se guard.enforce === '1' (senão é PREVIEW)
function isEnforce() { return localStorage.getItem('guard.enforce') === '1'; }

/* ====== NOVO: auditoria mínima ====== */
function audit(evento){
  try{
    const arr = JSON.parse(localStorage.getItem('audit:log') || '[]');
    arr.push({ ts: Date.now(), ...evento });
    localStorage.setItem('audit:log', JSON.stringify(arr));
  }catch{}
}
/* ===== Audit & Route Map (fallback seguro) ===== */
function auditBloqueio(motivo = 'bloqueio') {
  try {
    const u = getUsuarioAtual();
    const arr = JSON.parse(localStorage.getItem('audit:log') || '[]');
    arr.push({
      rota: location.pathname + location.search + location.hash,
      acao: motivo,
      userId: u.id || u.email || 'anon',
      ts: Date.now()
    });
    localStorage.setItem('audit:log', JSON.stringify(arr));
  } catch {}
}

/* Regras padrão por padrão de arquivo (sem meta)
   – ajuste os padrões conforme seus nomes de páginas reais */
const ROUTE_RULES = [
  { rx: /^(financeiro-|relatorio-financeiro|fechamento-)/i, perfis: ['admin','financeiro'] },
  { rx: /^(contrato|proposta|assinatura)/i,                perfis: ['admin','vendas'] },
  { rx: /^(area-cliente|portal-cliente)/i,                 perfis: ['admin'] },
];
function perfisPermitidosPorRotaAtual() {
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  const nome = file.replace(/\?.*|#.*/g,'');           // limpa query/hash
  const base = nome.replace(/\.(html|htm|php|asp)$/,''); // sem extensão
const regra = ROUTE_RULES.find(r => r.rx.test(base));
  return regra?.perfis || null; // null = sem mapeamento -> bloquear
}

/* ========================= Sessão ========================= */

// Só checa se há token de sessão. Se não, vai pro login.
// A validação fina de permissão fica por conta da API + RBAC de página.
export function protegerPaginaBasico() {
  if (guardsDesativados()) return;

  const token =
    (typeof localStorage   !== 'undefined' && localStorage.getItem('token')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token')) ||
    null;

  if (!token) {
    try {
      window.location.href = 'login.html';
    } catch {
      location.href = 'login.html';
    }
  }
}

/* ========================= Permissões ========================= */

// Retorna true/false se o perfil atual tem permissão (por ID, lendo localStorage.permissoes)
export function temPermissao(chave) {
  try {
    const usuario = getUsuarioAtual();
    if (ehAdmin(usuario)) return true; // Admin SEMPRE pode tudo

    const perms = JSON.parse(localStorage.getItem('permissoes') || '{}');
    const lista = (perms[chave] || [])
      .map(p => lower(p))
      .map(p => (p==='administrador' || p==='admin') ? 'admin' : p);

    const meusPerfis = new Set([ lower(usuario.perfil), ...(usuario.perfis||[]).map(lower) ]);
    return lista.some(p => meusPerfis.has(p));
  } catch {
    return false;
  }
}

// Exige que o perfil atual esteja em uma lista de perfis permitidos (NOMES de perfil)
export function exigirPerfil(permitidos = []) {
  if (guardsDesativados()) return;

  const usuario = getUsuarioAtual();
  if (ehAdmin(usuario)) return; // Admin entra mesmo se não listar 'Administrador'

  const lista = (Array.isArray(permitidos) ? permitidos : [permitidos])
    .map(r => lower(r))
    .map(p => (p === 'administrador' || p === 'admin') ? 'admin' : p);

  const meusPerfis = new Set([ lower(usuario.perfil), ...(usuario.perfis||[]).map(lower) ]);
  const ok = lista.some(p => meusPerfis.has(p));

  if (!ok) {
    audit({ acao:'bloqueio_perfil', rota: location.pathname, user: usuario.email||usuario.nome||'(sem user)', role: usuario.perfil, requer: lista });
    if (isEnforce()) {
  auditBloqueio('bloqueio');
window.location.replace('acesso-negado.html?from=' + encodeURIComponent(location.pathname));

    } else {
      console.warn('[GUARD][PREVIEW] perfil sem permissão para', location.pathname, 'role:', usuario.perfil, 'requer:', lista);
    }
  } else {
    audit({ acao:'acesso_ok_perfil', rota: location.pathname, user: usuario.email||usuario.nome||'(sem user)', role: usuario.perfil, requer: lista });
  }
}

// Usa o mapa de permissões salvo no localStorage (por ID)
export function exigirPermissao(chave) {
  if (guardsDesativados()) return;

  const usuario = getUsuarioAtual();
  const ok = temPermissao(chave);
  if (!ok) {
    audit({ acao:'bloqueio_permissao', rota: location.pathname, user: usuario.email||usuario.nome||'(sem user)', role: usuario.perfil, permId: chave });
    if (isEnforce()) {
   auditBloqueio('bloqueio');
window.location.replace('acesso-negado.html?from=' + encodeURIComponent(location.pathname));

    } else {
      console.warn('[GUARD][PREVIEW] permissão negada', chave, 'para', location.pathname, 'role:', usuario.perfil);
    }
  } else {
    audit({ acao:'acesso_ok_perm', rota: location.pathname, user: usuario.email||usuario.nome||'(sem user)', role: usuario.perfil, permId: chave });
  }
}

// Oculta/Desativa automaticamente elementos marcados com [data-permissao] (IDs)
export function aplicarPermissoesNaTela(root = document) {
  try {
    const els = root.querySelectorAll('[data-permissao]');
    const ENFORCE = isEnforce();
    els.forEach(el => {
      const chave = el.getAttribute('data-permissao');
      const ok = temPermissao(chave); // Admin passa dentro de temPermissao
      if (!ok) {
        el.title = 'Sem permissão';
        if (ENFORCE) {
          el.style.display = 'none';
        } else {
          el.style.opacity = '0.5';
          el.style.pointerEvents = 'none';
          if ('disabled' in el) el.disabled = true;
        }
        el.setAttribute('aria-hidden','true');
      } else {
        el.style.removeProperty('display');
        el.style.removeProperty('opacity');
        el.style.removeProperty('pointer-events');
        if ('disabled' in el) el.disabled = false;
        el.removeAttribute('aria-hidden');
      }
    });
  } catch {}
}

/* ====== NOVO: aplicar no MENU por perfis (data-roles) OU por permissões (data-permissao) ====== */
export function aplicarPermissoesNoMenu(root = document){
  const ENFORCE = isEnforce();
  const usuario = getUsuarioAtual();
  const role = lower(usuario.perfil || '');

  // 1) data-permissao (IDs)
  root.querySelectorAll('#menuLateral a[data-permissao], #menuLateral [data-permissao]').forEach(a=>{
    const chave = a.getAttribute('data-permissao');
    const ok = temPermissao(chave);
    if (!ok) {
      a.title = 'Sem permissão';
      if (ENFORCE) a.style.display = 'none';
      else { a.style.opacity = '0.45'; a.style.pointerEvents = 'none'; }
      a.classList.add('sem-permissao');
    }
  });

  // 2) data-roles (perfis)
  root.querySelectorAll('#menuLateral a[data-roles], #menuLateral [data-roles]').forEach(a=>{
    const roles = String(a.getAttribute('data-roles')||'')
      .split(',').map(s=>lower(s.trim())).filter(Boolean)
      .map(p => (p==='administrador' || p==='admin') ? 'admin' : p);

    const ok = ehAdmin(usuario) || roles.includes(role);
    if (!ok) {
      a.title = 'Sem permissão';
      if (ENFORCE) a.style.display = 'none';
      else { a.style.opacity = '0.45'; a.style.pointerEvents = 'none'; }
      a.classList.add('sem-permissao');
    }
  });
}

/* ========================= Guard default =========================
   Aceita:
   - nada  → usa meta ou só protege sessão
   - array/string → tratar como PERFIS (ex.: ['Administrador','Vendedor'])
   - {permissao:'id'} → tratar como ID (ex.: ver-comissoes)
   Meta aceita perfis e/ou ids, separados por "|", ex.:
   <meta name="page-permission" content="Administrador|Vendedor|ver-comissoes" />
   Regras:
   - Admin entra SEMPRE
   - Se houver perfis na meta: basta 1 bater
   - Se houver ids na meta: basta 1 temPermissao=true
*/
export default function guard(arg) {
  // [PATCH] Dashboard liberado para qualquer usuário logado
try {
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  if (file === 'dashboard.html') {
    // Garante só que a pessoa está logada
    protegerPaginaBasico();
    return;
  }
} catch (e) {
  console.warn('Falha ao aplicar patch do dashboard livre', e);
}

  if (guardsDesativados()) return;

  const usuario = getUsuarioAtual();
  if (ehAdmin(usuario)) return; // Fast-path: Admin passa sempre

  // Chamada programática
  if (Array.isArray(arg) || typeof arg === 'string') { exigirPerfil(arg); return; }
  if (typeof arg === 'object' && arg?.permissao) { exigirPermissao(arg.permissao); return; }

  // Meta-driven
  const meta = document.querySelector('meta[name="page-permission"]');
  const raw = normalizaTexto(meta?.content || '');
  if (!raw) { protegerPaginaBasico(); return; }

  const itens = raw.split('|').map(s => s.trim()).filter(Boolean);
  const perfis = [];
  const ids    = [];
  // heuristic: se tem hífen/slug, tratamos como ID; caso contrário, como perfil
  itens.forEach(t => (/^[a-z0-9\-:_]+$/i.test(t) && t.includes('-')) ? ids.push(t) : perfis.push(t));

  // 1) por perfis
  if (perfis.length){
    const meusPerfis = new Set([ lower(usuario.perfil), ...(usuario.perfis||[]).map(lower) ]);
    const okPerfis = perfis.some(p => meusPerfis.has(lower(p)));
    if (okPerfis) { audit({ acao:'acesso_ok_perfil_meta', rota: location.pathname, user: usuario.email||usuario.nome||'(sem user)', role: usuario.perfil, requer: perfis }); return; }
  }

  // 2) por ids (qualquer um)
  for (const id of ids){
    if (temPermissao(id)) { audit({ acao:'acesso_ok_perm_meta', rota: location.pathname, user: usuario.email||usuario.nome||'(sem user)', role: usuario.perfil, permId: id }); return; }
  }

  // se chegou aqui, sem permissão
  audit({ acao:'bloqueio_meta', rota: location.pathname, user: usuario.email||usuario.nome||'(sem user)', role: usuario.perfil, perfisReq: perfis, idsReq: ids });

  if (isEnforce()) {
  auditBloqueio('bloqueio');
window.location.replace('acesso-negado.html?from=' + encodeURIComponent(location.pathname));

  } else {
    console.warn('[GUARD][PREVIEW] acesso negado por meta para', location.pathname, 'role:', usuario.perfil, 'requer perfis:', perfis, 'ou ids:', ids);
    // PREVIEW não bloqueia — só protege sessão básica
    protegerPaginaBasico();
  }
}
// === Máscara leve de conteúdo (mantém título, oculta dados/soma, desativa cliques) ===
export function aplicarPermissoesConteudoLeve(root = document) {
  try {
    const itens = root.querySelectorAll('[data-permissao]');
    itens.forEach(el => {
      const key = el.getAttribute('data-permissao');
      // Admin sempre pode (já coberto por temPermissao) — aqui só mascara quem NÃO pode:
      if (!temPermissao(key)) {
        el.classList.add('is-locked');

        // Desativa interações do bloco
        el.querySelectorAll('a, button, input, select, textarea')
          .forEach(n => { n.setAttribute('tabindex', '-1'); n.setAttribute('aria-hidden', 'true'); n.addEventListener('click', e => e.preventDefault()); });

        // Aplica “censura”: tudo que for .valor, .kpi, <p>, <strong> etc. perde o texto
        // sem apagar os rótulos (títulos <h3>/<h4> continuam visíveis).
        const SENSITIVE_SELECTORS = [
          '.valor', '.kpi .valor', '.kpi p', '.kpi strong',
          '.list .valor', '.list li strong', 'td', 'canvas', '#graficoConversao'
        ];
        SENSITIVE_SELECTORS.forEach(sel => {
          el.querySelectorAll(sel).forEach(n => {
            // Evita apagar rótulos tipo "R$" fixos no HTML
            if (n.tagName === 'CANVAS') {
              n.replaceWith(document.createElement('div'));
            } else {
              n.textContent = '— sem acesso —';
            }
          });
        });

        // Se ainda não existir, insere um aviso discreto no rodapé do card
        if (!el.querySelector('.sem-acesso')) {
          const msg = document.createElement('div');
          msg.className = 'sem-acesso';
          msg.textContent = 'Seu perfil não tem acesso a estes dados.';
          el.appendChild(msg);
        }
      }
    });
  } catch {}
}
