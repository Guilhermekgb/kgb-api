/* menu-lateral.js  MENU GLOBAL NÃO-INVASIVO (SEM BACKEND / SEM FETCH) */
(function () {
  "use strict";

  var CFG = {
    menuUrl: "menu-lateral.html",
    desktopMin: 980,
    sidebarW: 260
  };

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  function getSidebar() {
    var s = document.getElementById("menuLateral") || document.getElementById("sidebar") || document.querySelector("aside.sidebar");
    if (s) {
      s.id = "menuLateral";
      if (!s.classList.contains("sidebar")) s.classList.add("sidebar");
      return s;
    }
    s = document.createElement("aside");
    s.id = "menuLateral";
    s.className = "sidebar";
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

  function ensureFabButton() {
    var b = document.getElementById("btnMenuGlobal");
    if (b) return b;
    b = document.createElement("button");
    b.id = "btnMenuGlobal";
    b.type = "button";
    b.className = "sidebar-fab";
    b.setAttribute("aria-label", "Abrir menu");
    b.textContent = "";
    document.body.appendChild(b);
    return b;
  }

  function defaultMenuHtml() {
    return [
      '<div class="sidebar-brand">KGB Buffet</div>',
      '<nav class="sidebar-nav">',
      '  <a class="sidebar-link" href="dashboard.html">Dashboard</a>',
      '  <a class="sidebar-link" href="lista-evento.html">Eventos</a>',
      '  <a class="sidebar-link" href="clientes-lista.html">Clientes</a>',
      '  <a class="sidebar-link" href="financeiro-resumo.html">Financeiro</a>',
      '  <a class="sidebar-link" href="backup.html">Backup</a>',
      "</nav>"
    ].join("\\n");
  }

  function setOpen(open) {
    document.body.classList.toggle("sidebar-open", !!open);
  }

  function isDesktop() {
    return (window.innerWidth || 1024) >= CFG.desktopMin;
  }

  function loadMenu(sidebar) {
    sidebar.innerHTML = defaultMenuHtml();
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", CFG.menuUrl, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          var tmp = document.createElement("div");
          tmp.innerHTML = xhr.responseText;

          var el =
            tmp.querySelector("#menuLateral .menu-lateral") ||
            tmp.querySelector("aside#menuLateral .menu-lateral") ||
            tmp.querySelector(".menu-lateral") ||
            tmp;

          sidebar.innerHTML = (el === tmp) ? tmp.innerHTML : (el.outerHTML || el.innerHTML);
        }
      };
      xhr.send();
    } catch (e) {
      // mantém fallback
    }
  }

  function neutralizeLegacyConflicts() {
    document.body.classList.add("has-sidebar");
    var mains = document.querySelectorAll("main.conteudo-principal");
    for (var i = 0; i < mains.length; i++) {
      mains[i].style.marginLeft = "0px";
    }
  }

  ready(function () {
    var sidebar = getSidebar();
    var overlay = ensureOverlay();
    var btn = ensureFabButton();

    if (sidebar.dataset.menuReady === "1") return;
    sidebar.dataset.menuReady = "1";

    neutralizeLegacyConflicts();
    loadMenu(sidebar);

    setOpen(isDesktop());

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      setOpen(!document.body.classList.contains("sidebar-open"));
    });

    overlay.addEventListener("click", function () {
      if (!isDesktop()) setOpen(false);
    });

    window.addEventListener("resize", function () {
      setOpen(isDesktop());
    });

    console.log("[menu-lateral] OK (non-invasive)");
  });
})();
