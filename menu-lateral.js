/* menu-lateral.js  MENU GLOBAL NÃO-INVASIVO (fix: offset dashboard + submenus)
   - Injeta menu-lateral.html via XHR
   - Expõe toggleSubmenu() global (submenus)
   - Aplica CSS isolado no #menuLateral
   - Ajusta automaticamente o OFFSET do conteúdo (wrapper/main/body) para não ficar atrás do menu
*/
(function () {
  "use strict";

  var CFG = {
    menuUrl: "menu-lateral.html",
    desktopMin: 980,
    sidebarW: 260 // padroniza com agenda-equipe
  };

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  function ensureSidebar() {
    var s = document.getElementById("menuLateral") ||
            document.getElementById("sidebar") ||
            document.querySelector("aside#menuLateral") ||
            document.querySelector("aside.sidebar");

    if (s) {
      s.id = "menuLateral";
      return s;
    }
    s = document.createElement("aside");
    s.id = "menuLateral";
    document.body.insertBefore(s, document.body.firstChild || null);
    return s;
  }

  function ensureOverlay() {
    var o = document.getElementById("menuOverlay");
    if (o) return o;
    o = document.createElement("div");
    o.id = "menuOverlay";
    o.className = "sidebar-overlay";
    o.setAttribute("aria-hidden", "true");
    document.body.appendChild(o);
    return o;
  }

  function ensureCSS() {
    if (document.getElementById("kgbSidebarTheme")) return;

    var st = document.createElement("style");
    st.id = "kgbSidebarTheme";
    st.textContent = `
/* ===== Sidebar theme (isolado) ===== */
:root{ --sidebar-w:260px; }

#menuLateral{
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: var(--sidebar-w, 260px);
  background: #532b03; /* espresso sólido */
  color: #fff;
  overflow: auto;
  z-index: 9999;
  padding: 18px 14px;
  box-shadow: 2px 0 14px rgba(0,0,0,.18);
}
#menuLateral, #menuLateral *{
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important;
}
#menuLateral a{
  color: #fff;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 10px;
  font-size: 13.5px;
  letter-spacing: .3px;
}
#menuLateral a:hover{ background: rgba(255,255,255,.08); }
#menuLateral a.ativo{ background: rgba(255,255,255,.12); }

#menuLateral .logo{
  width: 100%;
  max-width: 220px;
  display: block;
  margin: 0 auto 14px auto;
  opacity: .95;
}
#menuLateral .menu-title{
  cursor: pointer;
  user-select: none;
  margin-top: 8px;
  padding: 10px 10px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  letter-spacing: .4px;
  font-size: 13px;
  opacity: .95;
}
#menuLateral .menu-title:hover{ background: rgba(255,255,255,.08); }

#menuLateral .submenu{
  display: none;
  margin-left: 8px;
  margin-top: 6px;
  padding-left: 10px;
  border-left: 1px solid rgba(255,255,255,.14);
}
#menuLateral .submenu a{
  padding: 8px 10px;
  font-weight: 500;
  opacity: .92;
}
#menuLateral .submenu.open{ display: block; }

/* overlay p/ mobile */
.sidebar-overlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.35);
  display: none;
  z-index: 9998;
}

/* desktop: menu sempre visível; o offset do conteúdo será aplicado via JS */
@media (min-width:${CFG.desktopMin}px){
  #menuLateral{ transform: none !important; }
}

/* mobile: fecha/abre com classe sidebar-open */
@media (max-width:${CFG.desktopMin - 1}px){
  #menuLateral{
    transform: translateX(-110%);
    transition: transform .18s ease;
  }
  body.sidebar-open #menuLateral{ transform: translateX(0); }
  body.sidebar-open .sidebar-overlay{ display: block; }
}
    `;
    document.head.appendChild(st);
  }

  // FUNÇÃO QUE O menu-lateral.html USA NO onclick=""
  window.toggleSubmenu = function (id) {
    try {
      var all = document.querySelectorAll("#menuLateral .submenu");
      for (var i = 0; i < all.length; i++) {
        if (all[i].id !== id) all[i].classList.remove("open");
      }
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle("open");
    } catch (e) {}
  };

  function markActiveLinks(sidebar) {
    try {
      var atual = (location.pathname.split("/").pop() || "dashboard.html");
      var links = sidebar.querySelectorAll("a[href]");
      links.forEach(function (a) {
        var href = (a.getAttribute("href") || "");
        var file = href.split("/").pop().split("?")[0].split("#")[0];
        if (file === atual) a.classList.add("ativo");
      });
    } catch (e) {}
  }

  function renderLucide() {
    try {
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
        return;
      }
    } catch (e) {}
    if (document.querySelector('script[data-lucide-loader="1"]')) return;
    var s = document.createElement("script");
    s.src = "https://unpkg.com/lucide@latest";
    s.async = true;
    s.setAttribute("data-lucide-loader", "1");
    s.onload = function () {
      try { window.lucide && window.lucide.createIcons && window.lucide.createIcons(); } catch (e) {}
    };
    document.head.appendChild(s);
  }

  function extractAsideInner(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var aside = tmp.querySelector('aside#menuLateral') || tmp.querySelector("aside") || tmp;
    return aside.innerHTML || tmp.innerHTML;
  }

  function loadMenu(sidebar, onDone) {
    sidebar.innerHTML = `
      <div class="menu-lateral">
        <div class="menu-scroll">
          <div style="padding:10px;font-weight:800;letter-spacing:.6px;">KGB</div>
          <a href="dashboard.html">Tela inicial</a>
        </div>
      </div>
    `;

    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", CFG.menuUrl, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          sidebar.innerHTML = extractAsideInner(xhr.responseText);
          markActiveLinks(sidebar);
          renderLucide();
        }
        if (typeof onDone === "function") onDone();
      };
      xhr.send();
    } catch (e) {
      if (typeof onDone === "function") onDone();
    }
  }

  // >>>> AQUI É O FIX DO DASHBOARD: cria OFFSET no conteúdo <<<<
  function applyOffset() {
    var isDesk = (window.innerWidth || 1024) >= CFG.desktopMin;
    var w = CFG.sidebarW;

    try {
      var r = document.getElementById("menuLateral")?.getBoundingClientRect?.();
      if (r && r.width) w = Math.round(r.width);
    } catch (e) {}

    // Mobile não precisa offset
    if (!isDesk) {
      // limpa offsets para não empurrar em telas pequenas
      try { document.documentElement.style.removeProperty("--sidebar-w"); } catch(e){}
      try { document.body.style.removeProperty("padding-left"); } catch(e){}
      var wrap0 = document.querySelector(".wrapper");
      if (wrap0) wrap0.style.paddingLeft = "";
      var mains0 = document.querySelectorAll("main, main.kgb-content, main.conteudo-principal, .conteudo, .conteudo-principal");
      for (var j=0;j<mains0.length;j++) mains0[j].style.marginLeft = "";
      return;
    }

    // Desktop: salva var e aplica offset na estrutura que existir
    try { document.documentElement.style.setProperty("--sidebar-w", w + "px"); } catch(e){}

    // 1) Se existir .wrapper (como nas telas que já funcionam), usa padding-left
    var wrap = document.querySelector(".wrapper");
    if (wrap) {
      wrap.style.paddingLeft = "var(--sidebar-w)";
      return;
    }

    // 2) Se existir main.conteudo-principal / main / container principal, usa margin-left
    var main = document.querySelector("main.conteudo-principal") ||
               document.querySelector("main.kgb-content") ||
               document.querySelector("main") ||
               document.querySelector(".conteudo-principal") ||
               document.querySelector(".conteudo");

    if (main) {
      main.style.marginLeft = "var(--sidebar-w)";
      return;
    }

    // 3) Fallback final: empurra o body
    try { document.body.style.paddingLeft = "var(--sidebar-w)"; } catch(e){}
  }

  function bindMobile(overlay) {
    overlay.addEventListener("click", function () {
      document.body.classList.remove("sidebar-open");
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") document.body.classList.remove("sidebar-open");
    });
  }

  ready(function () {
    var sidebar = ensureSidebar();
    var overlay = ensureOverlay();
    ensureCSS();

    // marca a página como tendo um sidebar global (usado pelo layout normalizer)
    try { if (!document.body.classList.contains('has-sidebar')) document.body.classList.add('has-sidebar'); } catch(e){}

    if (sidebar.dataset.menuReady === "1") return;
    sidebar.dataset.menuReady = "1";

    bindMobile(overlay);

    loadMenu(sidebar, function () {
      // aplica offset assim que o menu carregar
      applyOffset();
    });

    window.addEventListener("resize", function () {
      applyOffset();
    });

    console.log("[menu-lateral] OK (offset fix + width " + CFG.sidebarW + ")");
  });
})();
