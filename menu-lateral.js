/* =========================================================
   MENU LATERAL — loader clássico + imports dinâmicos (ESM)
   - Continua sendo <script src="menu-lateral.js"> (sem type="module")
   - Carrega: firebase-config, firebase-stub, routes, kgb-common, proteger-pagina
   - Injeta menu-lateral.html e controla mobile/backdrop/submenus
   ========================================================= */

/* ---------- Bootstrap: carrega módulos via import() dinâmico ---------- */
  (function(){
    try{
      if (!window.__mem_menu_lateral) window.__mem_menu_lateral = new Map();
      const M = window.__mem_menu_lateral;
      window.memGetMenu = (k,d=null) => M.has(k) ? M.get(k) : d;
      window.memSetMenu = (k,v) => (M.set(k,v), v);
      window.memRemoveMenu = (k) => (M.delete(k), undefined);
      window.safeJSONMenu = (s,d=null) => { try { return JSON.parse(s); } catch { return d; } };

      window.readLS = window.readLS || ((k,fb)=>{ try{ const v = (window.memGetMenu ? window.memGetMenu(k) : null); return v == null ? fb : v; }catch{return fb;} });
      window.writeLS = window.writeLS || ((k,v)=>{ try{ if (window.memSetMenu) window.memSetMenu(k, v); }catch{} });
      window.iterLSKeys = window.iterLSKeys || (()=> Array.from(window.__mem_menu_lateral ? window.__mem_menu_lateral.keys() : []));
    }catch(e){/* noop */}
  })();

(function bootstrapAPIs(){
  // base absoluta do arquivo atual (garante paths corretos mesmo em subpastas)
  function __getBaseURLForThisFile() {
    const scripts = Array.from(document.getElementsByTagName('script'));
    const me = scripts.find(s => /menu-lateral\.js(\?|$)/.test(s.src));
    const src = me?.src || (document.currentScript && document.currentScript.src) || location.href;
    return new URL('.', src);
  }
  const BASE = __getBaseURLForThisFile();

  // exige que window.apiFetch exista em tempo de execução; lança `api_unavailable` se ausente
  function __require_apiFetch() {
    const w = (typeof window !== 'undefined') ? window : null;
    if (!w || typeof w.apiFetch !== 'function') throw new Error('api_unavailable');
    return w;
  }

  // helper p/ importar relativo a este arquivo
  const imp = (rel) => import(new URL(rel, BASE).href);

  // habilita sync (stub) para quem lê essa flag
  window.firebaseSync = window.firebaseSync || {};
  window.firebaseSync.enabled = true;

  // carrega módulos sem travar a página; se falhar, segue só no armazenamento local legado
  (async () => {
    try {
      await imp('./api/firebase-config.js');
    } catch {}
    try {
      await imp('./api/firebase-stub.js');
    } catch {}
    try {
      const m = await imp('./api/routes.js');
      try {
        const hrKey = 'handle' + 'Request';
        if (m && m[hrKey] && !window[hrKey]) window[hrKey] = m[hrKey];
      } catch {}
    } catch {}
    try {
      await imp('./kgb-common.js');
    } catch {}
    try {
      const m = await imp('./api/proteger-pagina.js');
      // aplica guard se a página tiver a meta
      const meta = document.querySelector('meta[name="page-permission"]');
      const permissao = meta?.content?.trim();
       if (m?.aplicarPermissoesNaTela && !window.aplicarPermissoesNaTela)
    window.aplicarPermissoesNaTela = m.aplicarPermissoesNaTela;
      if (permissao && m?.default) {
        try { m.default({ permissao }); } catch {}
        try { m.aplicarPermissoesNaTela?.(); } catch {}
      }
    } catch {}
  })();
})();

/* ---------- Seu loader original (ajustado só no topo p/ anti-duplo-init) ---------- */

// menu-lateral.js — carrega o menu após o DOM, busca o HTML ao lado do JS
function initMenuLateral() {
  if (window.__MENU_LATERAL_INIT__) return;
  window.__MENU_LATERAL_INIT__ = true;

  const container = document.getElementById("menuLateral");
  if (!container) return;

  // Caminho do menu relativo a ESTE arquivo JS (funciona com ou sem type="module")
  function __getBaseURLForThisFile() {
    const scripts = Array.from(document.getElementsByTagName('script'));
    const me = scripts.find(s => /menu-lateral\.js(\?|$)/.test(s.src));
    const src = me?.src || (document.currentScript && document.currentScript.src) || location.href;
    return new URL('.', src);
  }

  const base = __getBaseURLForThisFile();
  const menuURL = new URL('menu-lateral.html', base);

  __require_apiFetch().apiFetch(menuURL.href, { method: 'GET', headers: { 'accept': 'text/html' } })
    .then((html) => {
      container.innerHTML = html;

    // === Logout: trata cliques no "Sair" ===
  {
    const logoutLinks = container.querySelectorAll('[data-logout]');
    logoutLinks.forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();

        // limpa dados de sessão
        try {
            // primary logout via API (cookie/session)
            try { __require_apiFetch().apiFetch((window.__API_BASE__||'') + '/auth/logout', { method: 'POST' }).catch(()=>{}); } catch {}
            // fallback: clear legacy items in module memStore (non-primary)
            try { if (window.memRemoveMenu) window.memRemoveMenu('auth:user'); } catch {}
            try { if (window.memRemoveMenu) window.memRemoveMenu('usuarioLogado'); } catch {}
            try { if (window.writeLS) window.writeLS('session.lastReason', 'manual'); } catch {}
        } catch {}

        // se tiver Firebase, desloga também (opcional)
        if (window.firebase?.auth) {
          try { window.firebase.auth().signOut(); } catch {}
        }

        // destino: usa href, mas cai para login.html se for "#" ou vazio/javasript:
        const raw = (a.getAttribute('href') || '').trim().toLowerCase();
        const dest = (!raw || raw === '#' || raw.startsWith('javascript:'))
          ? 'login.html'
          : a.getAttribute('href');

        location.href = dest;
      });
    });
  }


      // Backdrop + controles mobile
      const $aside = document.getElementById("menuLateral");
      const $backdrop = document.getElementById("menuBackdrop");
      const $btn = document.getElementById("hamburguer");

      function abrirMenu() {
        if (!$aside) return;
        $aside.classList.add("aberto");
        if ($backdrop) {
          $backdrop.hidden = false;
          $backdrop.offsetHeight; // força reflow
          $backdrop.classList.add("mostrar");
        }
        document.body.classList.add("no-scroll");
      }
      function fecharMenu() {
        if (!$aside) return;
        $aside.classList.remove("aberto");
        if ($backdrop) {
          $backdrop.classList.remove("mostrar");
          setTimeout(() => { $backdrop.hidden = true; }, 200);
        }
        document.body.classList.remove("no-scroll");
      }
      function toggleMenu() {
        ($aside && $aside.classList.contains("aberto")) ? fecharMenu() : abrirMenu();
      }

      $btn && $btn.addEventListener("click", toggleMenu);
      $backdrop && $backdrop.addEventListener("click", fecharMenu);
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") fecharMenu();
      });
      // Fecha ao clicar em qualquer link do menu (no mobile)
      container.querySelectorAll("a[href]").forEach(a => {
        a.addEventListener("click", () => fecharMenu());
      });

      // Lucide icons (com fallback)
      try {
        const L = window.lucide;
        if (L && typeof L.createIcons === 'function') {
          if (L.icons) L.createIcons({ icons: L.icons });
          else L.createIcons();
        }
      } catch {}

      // Submenus no escopo global (HTML usa onclick="toggleSubmenu('...')")
      function toggleSubmenu(id) {
        document.querySelectorAll("#menuLateral .submenu").forEach((sub) => {
          if (sub.id !== id) sub.style.display = "none";
        });
        const el = document.getElementById(id);
        if (el) el.style.display = el.style.display === "block" ? "none" : "block";
      }
      window.toggleSubmenu = toggleSubmenu;

      // Destacar link ativo
      const atual = (location.pathname.split("/").pop() || "dashboard.html");
      container.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href") || "";
        const file = href.split("/").pop().split("?")[0].split("#")[0];
        if (file === atual) a.classList.add("ativo");
      });

      // Consistência ao redimensionar
      window.addEventListener("resize", () => {
        if (window.innerWidth > 768) fecharMenu();
      });

      // === Badge do sininho (notificações) ===
      (function menuBadgeNotificacoes(){
        let __MENU_CURRENT_USER = window.__KGB_USER_CACHE || null;
        async function ensureMenuUser(){
          try { __MENU_CURRENT_USER = window.__KGB_USER_CACHE || (typeof window.getUsuarioAtualAsync === 'function' ? await window.getUsuarioAtualAsync() : null) || window.__KGB_USER_CACHE || null; } catch(e){}
        }
        function readSetForUID(){
          try {
            const uid = String(__MENU_CURRENT_USER?.id || 'anon');
            const arr = (window.readLS ? window.readLS(`notificationsRead:${uid}`, []) : []);
            return new Set((Array.isArray(arr) ? arr : []).map(String));
          } catch { return new Set(); }
        }
        function getFeed(){
          try { return (window.readLS ? window.readLS('notificationsFeed', []) : []); }
          catch { return []; }
        }
        function countUnread(feed){
          const read = readSetForUID();
          return (feed||[]).filter(f => !read.has(String(f.id))).length;
        }
        function updateBadge(){
          const el = document.getElementById('badgeNotificacoes');
          if (!el) return;
          const n = countUnread(getFeed());
          el.textContent   = n > 0 ? String(n) : '';
          el.style.display = n > 0 ? 'inline-flex' : 'none';
        }

        // ensure user loaded then update
        (async ()=>{ await ensureMenuUser(); updateBadge(); })();

        if (!window.__MENU_BADGE_BOUND__) {
          window.__MENU_BADGE_BOUND__ = true;

          window.addEventListener('storage', (e) => {
            try {
              const k = e?.key || '';
              if (k === 'notificationsFeed' || k === 'notificationsFeed:ping' || k.startsWith('notificationsRead:')) {
                updateBadge();
              }
            } catch {}
          });

          try {
            const bc = new BroadcastChannel('mrubuffet');
            bc.addEventListener('message', (ev) => {
              if (ev?.data?.type === 'notificationsFeed:ping') updateBadge();
            });
          } catch {}

          document.addEventListener('DOMContentLoaded', updateBadge);
        }

        window.__refreshMenuBadge = updateBadge;
      })();
      // === fim sininho ===

      // Após injetar o menu, se a página tiver meta de permissão, reaplica visuais
      try {
        const meta = document.querySelector('meta[name="page-permission"]');
        const permissao = meta?.content?.trim();
        if (permissao && window.aplicarPermissoesNaTela) {
          window.aplicarPermissoesNaTela();
        }
      } catch {}
    })
    .catch((err) => {
      container.innerHTML =
        `<div style="padding:16px;color:#fff;background:#8b2d2d">
           Erro ao carregar o menu: ${String(err)}
           <br><small>URL: ${menuURL.href}</small>
         </div>`;
    });
}

// Roda após o DOM em qualquer cenário
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMenuLateral, { once: true });
} else {
  initMenuLateral();
}

/* ---------- Badge de alerta em "Logs Técnicos" ---------- */
(function kgbLogsBadge(){
  const hasErrorInLogs = () => {
    const logsBackup = (() => { try { return (readLS ? readLS('logs', []) : []); } catch { return []; } })();
    const logsTec    = (() => { try { return (readLS ? readLS('logsTecnicos', []) : []); } catch { return []; } })();
    const erroBackup = logsBackup.some(l =>
      /erro|error|fail|exception/i.test(String(l.acao||"")) ||
      /erro|error|fail|exception/i.test(JSON.stringify(l||{}))
    );
    const erroTec = logsTec.some(l =>
      (Number(l.status) >= 400) ||
      /erro|error|fail|exception/i.test(JSON.stringify(l||{}))
    );
    return erroBackup || erroTec;
  };

  function aplicarBadge(){
    if (!hasErrorInLogs()) return;
    const item = document.querySelector('a[href*="logs-tecnicos"]');
    if (item) item.classList.add("alerta-ativo");
  }

  aplicarBadge();

  try{
    const side = document.getElementById('menuLateral') || document.body;
    const obs = new MutationObserver(() => {
      const anchor = document.querySelector('a[href*="logs-tecnicos"]');
      if (anchor) { aplicarBadge(); obs.disconnect(); }
    });
    obs.observe(side, { childList: true, subtree: true });
  }catch{}
})();

/* =========================================================
   M34 — Núcleo Backup & Segurança (carregado pelo menu)
   - Exportar/Importar/Backup/Retenção/Logs
   - Idle Logout (20 min padrão)
   ========================================================= */
(() => {
  if (window.__KGB_SECURITY_INIT__) return;
  window.__KGB_SECURITY_INIT__ = true;

  // --------- Fallbacks utilitários ---------
  const readLS  = window.readLS  || ((k, fb) => { try { return (window.memGetMenu ? window.memGetMenu(k) : fb) ?? fb; } catch { return fb; } });
  const writeLS = window.writeLS || ((k, v)   => { try { if (window.memSetMenu) return window.memSetMenu(k, v); } catch {} });

  function baixarArquivo(nome, conteudo, mime='application/json') {
    const blob = new Blob([conteudo], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
  }

  function getUserEmail() {
    try {
      const u = (window.readLS ? window.readLS('usuarioLogado', null) : null) || (window.readLS ? window.readLS('userProfile', null) : null);
      return u?.email || u?.nome || 'anon';
    } catch { return 'anon'; }
  }

  // --------- Config do módulo ---------
  const KGB_BACKUP = {
    KEYS: [
      'financeiroGlobal', 'leads', 'eventos', 'propostas',
      'agenda', 'contratos', 'cardapios',
      'notificacoes', 'notificacoesInternas', 'notificacoesExternas'
    ],
    CACHE_RE: /(layout|snapshot|_html|_imagem|cache|tmp|buffer)/i,
    KEEP: 5,
    LOG_KEY: 'backup:log'
  };

  // --------- Logs ---------
  function logBackup(acao, chave, bytes=0) {
    const arr = readLS(KGB_BACKUP.LOG_KEY, []);
    arr.push({
      acao, chave,
      ts: Date.now(),
      tamanhoKB: Math.round((bytes||0)/1024),
      user: getUserEmail()
    });
    writeLS(KGB_BACKUP.LOG_KEY, arr);
  }

  // --------- Snapshots + retenção ---------
  function saveWithBackup(key, value) {
    writeLS(key, value);
    const ts    = Date.now();
    const snapK = `backup:${key}:${ts}`;
    const json  = JSON.stringify(value ?? null);
    try{ if (window.writeLS) window.writeLS(snapK, JSON.parse(json)); }catch{}
    logBackup('snapshot', key, json.length);
    runBackupRetention(key, KGB_BACKUP.KEEP);
  }

  function runBackupRetention(baseKey, keepN=5) {
    const prefix = `backup:${baseKey}:`;
    const scan = (window.iterLSKeys ? window.iterLSKeys() : []);
    const snaps = scan
      .filter(k => k.startsWith(prefix))
      .map(k => ({ k, ts: Number(k.slice(prefix.length)) || 0 }))
      .sort((a,b) => b.ts - a.ts);

    if (snaps.length <= keepN) return;
    snaps.slice(keepN).forEach(s => { try{ if (window.memRemoveMenu) window.memRemoveMenu(s.k); }catch{} });
    logBackup('retenção', baseKey, 0);
  }

  // --------- Exportar / Importar / Limpar caches ---------
  async function exportarJSON() {
    const out = {};
    for (const k of KGB_BACKUP.KEYS) out[k] = readLS(k, null);
    out.__meta = { geradoEm: new Date().toISOString(), por: getUserEmail(), versao: 'M34-local-1' };
    const text = JSON.stringify(out, null, 2);
    baixarArquivo(`backup-kgb-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`, text);
    logBackup('exportar', '*', text.length);
  }

  async function importarJSONFromFile(file) {
    const txt = await file.text();
    let data; try { data = JSON.parse(txt); } catch { alert('Arquivo inválido.'); return; }
    Object.keys(data).filter(k => !k.startsWith('__')).forEach(k => writeLS(k, data[k]));
    logBackup('importar', '*', txt.length);
    location.reload();
  }

  function limparCaches() {
    const re = KGB_BACKUP.CACHE_RE;
    let n=0;
    const keysAll = (window.iterLSKeys ? window.iterLSKeys() : []);
    keysAll.forEach(k => { if (re.test(k)) { try{ if (window.memRemoveMenu) window.memRemoveMenu(k); n++; }catch{} } });
    logBackup('limpar-caches', `removidos:${n}`, 0);
    alert(`Caches limpos: ${n}`);
  }

  // --------- Idle Logout (20 min padrão; chave configurável) ---------
  (function setupIdleLogout(){
    const MIN_DEFAULT = 20;
    const keyCfg   = 'session.timeoutMin';
    // tente limpar as duas chaves mais comuns de auth
    const clearAuth = () => {
      try{ if (window.memRemoveMenu) window.memRemoveMenu('auth:user'); }catch{}
      try{ if (window.memRemoveMenu) window.memRemoveMenu('usuarioLogado'); }catch{}
    };
    const redirect = 'login.html';

    let MIN = Number((window.readLS ? window.readLS(keyCfg, MIN_DEFAULT) : MIN_DEFAULT) || MIN_DEFAULT);
    if (!isFinite(MIN) || MIN <= 0) MIN = MIN_DEFAULT;

    let timer = null;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        clearAuth();
        try{ if (window.writeLS) window.writeLS('session.lastReason', 'idle'); }catch{}
        location.href = redirect;
      }, MIN * 60 * 1000);
    };

    ['mousemove','keydown','scroll','click','touchstart']
      .forEach(ev => window.addEventListener(ev, resetTimer, { passive:true }));

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resetTimer, { once:true });
    } else {
      resetTimer();
    }

    window.__idleLogout = { reset: resetTimer, minutes: () => MIN };
  })();

  // --------- expõe API global ---------
  window.kgbBackup = {
    KEYS: KGB_BACKUP.KEYS,
    saveWithBackup,
    runBackupRetention,
    exportarJSON,
    importarJSONFromFile,
    limparCaches,
    logBackup
  };
})();
// === Desativa badge no menu lateral (usando apenas o sino do Dashboard) ===
(function(){
  // Se alguma parte do código tentar "atualizar" o badge do menu, vira NO-OP:
  if (typeof window.__refreshMenuBadge !== 'function') {
    window.__refreshMenuBadge = function(){ /* desativado por escolha de UX */ };
  } else {
    const _orig = window.__refreshMenuBadge;
    window.__refreshMenuBadge = function(){ /* desativado */ return; };
  }

  // Se por acaso o elemento existir no HTML, força ocultar/remover
  const hideOrRemove = () => {
    const el = document.getElementById('badgeNotificacoes');
    if (!el) return;
    try { el.remove(); } catch { el.style.display = 'none'; }
  };
  hideOrRemove();
  document.addEventListener('DOMContentLoaded', hideOrRemove);
})();
