/* menu-lateral.js  MENU GLOBAL NÃO-INVASIVO (FOCO: DASHBOARD OK)
   - NÃO envolve o conteúdo da página em wrappers
   - Garante: #menuLateral existe, injeta menu-lateral.html via XHR
   - Garante: toggleSubmenu() global (submenus funcionam)
   - Aplica CSS isolado SÓ dentro do #menuLateral (fundo, fontes, links)
*/
(function () {
  "use strict";

  var CFG = {
    menuUrl: "menu-lateral.html",
    desktopMin: 980
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
#menuLateral{
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 280px;
  background: #2b170d; /* marrom escuro */
  color: #fff;
  overflow: auto;
  z-index: 9999;
  padding: 18px 14px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.04) inset;
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

/* desktop: deixa menu sempre visível */
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
    // queremos só o conteúdo interno do aside (pra não duplicar <aside>)
    return aside.innerHTML || tmp.innerHTML;
  }

  function loadMenu(sidebar) {
    // se não carregar, mantém o básico
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
      };
      xhr.send();
    } catch (e) {}
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

    if (sidebar.dataset.menuReady === "1") return;
    sidebar.dataset.menuReady = "1";

    loadMenu(sidebar);
    bindMobile(overlay);

    // desktop: mantém aberto
    if ((window.innerWidth || 1024) >= CFG.desktopMin) {
      document.body.classList.remove("sidebar-open");
    }

    console.log("[menu-lateral] OK (dashboard focus)");
  });
})();
