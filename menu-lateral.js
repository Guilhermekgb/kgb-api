/* menu-lateral.js — INJETOR GLOBAL ÚNICO (SEM BACKEND / SEM FETCH) */
(function () {
  "use strict";

  var CFG = {
    menuUrl: "menu-lateral.html",
    layoutCssHref: "layout.css",
    desktopMin: 1024
  };

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function ensureLayoutCss() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute("href") || "").trim();
      if (href === CFG.layoutCssHref || href.endsWith("/" + CFG.layoutCssHref)) return;
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CFG.layoutCssHref;
    document.head.appendChild(link);
  }

  function ensureBaseLayout() {
    // Se já existir layout, só garante sidebar/main/topbar
    var layout = document.querySelector(".layout");
    if (!layout) {
      layout = document.createElement("div");
      layout.className = "layout";

      var sidebar = document.createElement("aside");
      sidebar.className = "sidebar";
      sidebar.id = "menuLateral";

      var main = document.createElement("div");
      main.className = "main";

      var topbar = document.createElement("header");
      topbar.className = "topbar";

      var burger = document.createElement("button");
      burger.className = "hamburger";
      burger.type = "button";
      burger.setAttribute("aria-label", "Abrir menu");
      burger.setAttribute("aria-expanded", "false");
      burger.textContent = "☰";

      var title = document.createElement("div");
      title.className = "topbar-title";
      title.textContent = document.title || "KGB Buffet";

      topbar.appendChild(burger);
      topbar.appendChild(title);

      var content = document.createElement("main");
      content.className = "content";
      content.setAttribute("role", "main");

      // move tudo do body pra dentro do content (exceto scripts)
      var nodes = Array.prototype.slice.call(document.body.childNodes);
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (node.nodeType === 1 && node.tagName === "SCRIPT") continue;
        content.appendChild(node);
      }

      // reconstruir body
      document.body.innerHTML = "";
      main.appendChild(topbar);
      main.appendChild(content);
      layout.appendChild(sidebar);
      layout.appendChild(main);
      document.body.appendChild(layout);
    }

    // garantir sidebar
    var sidebar2 = document.getElementById("menuLateral") || document.querySelector(".sidebar");
    if (!sidebar2) {
      sidebar2 = document.createElement("aside");
      sidebar2.className = "sidebar";
      sidebar2.id = "menuLateral";
      layout.insertBefore(sidebar2, layout.firstChild || null);
    } else {
      sidebar2.id = "menuLateral";
      sidebar2.classList.add("sidebar");
    }

    // garantir main
    var main2 = layout.querySelector(".main");
    if (!main2) {
      main2 = document.createElement("div");
      main2.className = "main";
      // move tudo que não é sidebar pro main
      var kids = Array.prototype.slice.call(layout.children);
      for (var k = 0; k < kids.length; k++) if (kids[k] !== sidebar2) main2.appendChild(kids[k]);
      layout.appendChild(main2);
    }

    // garantir topbar + burger
    var topbar2 = main2.querySelector(".topbar");
    if (!topbar2) {
      topbar2 = document.createElement("header");
      topbar2.className = "topbar";
      main2.insertBefore(topbar2, main2.firstChild || null);
    }
    var burger2 = topbar2.querySelector(".hamburger");
    if (!burger2) {
      burger2 = document.createElement("button");
      burger2.className = "hamburger";
      burger2.type = "button";
      burger2.setAttribute("aria-label", "Abrir menu");
      burger2.setAttribute("aria-expanded", "false");
      burger2.textContent = "☰";
      topbar2.insertBefore(burger2, topbar2.firstChild || null);
    }

    // garantir content
    var content2 = main2.querySelector(".content");
    if (!content2) {
      content2 = document.createElement("main");
      content2.className = "content";
      content2.setAttribute("role", "main");
      // move tudo que não é topbar para content
      var toMove = [];
      var cn = Array.prototype.slice.call(main2.childNodes);
      for (var m = 0; m < cn.length; m++) {
        var n = cn[m];
        if (n.nodeType === 1 && n.classList && n.classList.contains("topbar")) continue;
        toMove.push(n);
      }
      for (var p = 0; p < toMove.length; p++) content2.appendChild(toMove[p]);
      main2.appendChild(content2);
    }

    return { sidebar: sidebar2, burger: burger2 };
  }

  function defaultMenuHtml() {
    return [
      '<div class="sidebar-brand">KGB Buffet</div>',
      '<nav class="sidebar-nav">',
      '  <a class="sidebar-link" href="dashboard.html">Dashboard</a>',
      '  <a class="sidebar-link" href="financeiro-resumo.html">Financeiro</a>',
      '  <a class="sidebar-link" href="backup.html">Backup</a>',
      "</nav>"
    ].join("\n");
  }

  function ensureLucideThenRender() {
    try {
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
        return;
      }
    } catch (e) {}
    // carrega lucide uma vez (se necessário)
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

  function extractMenuFragment(html) {
    // menu-lateral.html é página completa; vamos extrair apenas o miolo do menu
    var tmp = document.createElement("div");
    tmp.innerHTML = html;

    // tenta encontrar a estrutura padrão do menu
    var el =
      tmp.querySelector("#menuLateral .menu-lateral") ||
      tmp.querySelector("aside#menuLateral .menu-lateral") ||
      tmp.querySelector(".menu-lateral") ||
      tmp;

    // queremos inserir o HTML do bloco do menu
    if (el === tmp) return tmp.innerHTML;
    return el.outerHTML || el.innerHTML;
  }

  function loadMenuInto(sidebar) {
    // fallback imediato
    try { sidebar.innerHTML = defaultMenuHtml(); } catch (e) {}

    var xhr = new XMLHttpRequest();
    xhr.open("GET", CFG.menuUrl, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        sidebar.innerHTML = extractMenuFragment(xhr.responseText);
        ensureLucideThenRender();
      }
    };
    try { xhr.send(); } catch (e) {}
  }

  function bindUI(burger) {
    var overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    function setOpen(open) {
      document.body.classList.toggle("sidebar-open", !!open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    }

    burger.addEventListener("click", function (e) {
      e.preventDefault();
      var isOpen = document.body.classList.contains("sidebar-open");
      setOpen(!isOpen);
    });

    overlay.addEventListener("click", function () {
      if (window.innerWidth < CFG.desktopMin) setOpen(false);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= CFG.desktopMin) setOpen(true);
      else setOpen(false);
    });

    // desktop aberto por padrão
    setOpen(window.innerWidth >= CFG.desktopMin);
  }

  ready(function () {
    ensureLayoutCss();
    var parts = ensureBaseLayout();

    if (!parts.sidebar.dataset.menuReady) {
      parts.sidebar.dataset.menuReady = "1";
      loadMenuInto(parts.sidebar);
    }
    bindUI(parts.burger);

    document.body.classList.add("layout-ready");
    console.log("[menu-lateral] OK");
  });
})();
/* menu-lateral.js — INJETOR GLOBAL (SEM BACKEND / SEM FETCH) */
(function () {
  "use strict";

  var CFG = {
    menuUrl: "menu-lateral.html",
    layoutCssHref: "layout.css",
    storageKey: "kgb_sidebar_state",
    desktopMin: 1024
  };

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function ensureLayoutCss() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute("href") || "").trim();
      if (href === CFG.layoutCssHref || href.endsWith("/" + CFG.layoutCssHref)) return;
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CFG.layoutCssHref;
    document.head.appendChild(link);
  }

  function hasLayoutStructure() {
    return !!(document.querySelector(".layout") &&
              document.querySelector(".sidebar") &&
              document.querySelector(".main"));
  }

  function buildLayoutIfMissing() {
    if (hasLayoutStructure()) return;

    var body = document.body;
    var layout = document.createElement("div");
    layout.className = "layout";

    var sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    sidebar.id = "sidebar";

    var main = document.createElement("div");
    main.className = "main";

    var topbar = document.createElement("header");
    topbar.className = "topbar";

    var burger = document.createElement("button");
    burger.className = "hamburger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Abrir menu");
    burger.setAttribute("aria-expanded", "false");
    burger.textContent = "☰";

    var title = document.createElement("div");
    title.className = "topbar-title";
    title.textContent = document.title || "KGB Buffet";

    topbar.appendChild(burger);
    topbar.appendChild(title);

    var content = document.createElement("main");
    content.className = "content";
    content.setAttribute("role", "main");

    // Move conteúdo atual do body pra dentro de content (exceto scripts)
    var nodes = [];
    for (var i = 0; i < body.childNodes.length; i++) nodes.push(body.childNodes[i]);
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j];
      if (node.nodeType === 1 && node.tagName === "SCRIPT") continue;
      if (node.nodeType === 1 && node.classList && node.classList.contains("layout")) continue;
      content.appendChild(node);
    }

    // Reconstrói body
    body.innerHTML = "";
    main.appendChild(topbar);
    main.appendChild(content);
    layout.appendChild(sidebar);
    layout.appendChild(main);
    body.appendChild(layout);
  }

  function ensureMinimalElements() {
    // Garante sidebar
    var layout = document.querySelector(".layout") || document.body;
    var sidebar = document.querySelector(".sidebar");
    if (!sidebar) {
      sidebar = document.createElement("aside");
      sidebar.className = "sidebar";
      sidebar.id = "sidebar";
      if (layout.firstChild) layout.insertBefore(sidebar, layout.firstChild);
      else layout.appendChild(sidebar);
    }
    if (!sidebar.id) sidebar.id = "sidebar";

    // Garante main
    var main = document.querySelector(".main");
    if (!main) {
      main = document.createElement("div");
      main.className = "main";
      // Move tudo que não é sidebar pra dentro de main
      var children = Array.prototype.slice.call(layout.children || []);
      for (var i = 0; i < children.length; i++) {
        if (children[i] !== sidebar) main.appendChild(children[i]);
      }
      layout.appendChild(main);
    }

    // Garante topbar + hamburger
    var topbar = main.querySelector(".topbar");
    if (!topbar) {
      topbar = document.createElement("header");
      topbar.className = "topbar";
      main.insertBefore(topbar, main.firstChild || null);
    }
    var burger = topbar.querySelector(".hamburger");
    if (!burger) {
      burger = document.createElement("button");
      burger.className = "hamburger";
      burger.type = "button";
      burger.setAttribute("aria-label", "Abrir menu");
      burger.setAttribute("aria-expanded", "false");
      burger.textContent = "☰";
      topbar.insertBefore(burger, topbar.firstChild || null);
    }

    // Garante content wrapper (não move se já houver)
    var content = main.querySelector(".content");
    if (!content) {
      content = document.createElement("main");
      content.className = "content";
      content.setAttribute("role", "main");
      // Move tudo do main que não é topbar pra dentro do content
      var toMove = [];
      for (var k = 0; k < main.childNodes.length; k++) {
        var n = main.childNodes[k];
        if (n.nodeType === 1 && n.classList && n.classList.contains("topbar")) continue;
        toMove.push(n);
      }
      for (var m = 0; m < toMove.length; m++) content.appendChild(toMove[m]);
      main.appendChild(content);
    }

    return { sidebar: sidebar, burger: burger };
  }

  function defaultMenuHtml() {
    return [
      '<div class="sidebar-brand">KGB Buffet</div>',
      '<nav class="sidebar-nav">',
      '  <a class="sidebar-link" href="dashboard.html">Dashboard</a>',
      '  <a class="sidebar-link" href="financeiro-resumo.html">Financeiro</a>',
      '  <a class="sidebar-link" href="backup.html">Backup</a>',
      "</nav>"
    ].join("\n");
  }

  function loadMenu(sidebar, done) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", CFG.menuUrl, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        sidebar.innerHTML = xhr.responseText;
        done(true);
      } else {
        sidebar.innerHTML = defaultMenuHtml();
        done(false);
      }
    };
    xhr.onerror = function () {
      sidebar.innerHTML = defaultMenuHtml();
      done(false);
    };
    // mostra fallback imediatamente para evitar invisibilidade por CSS/espera
    try { sidebar.innerHTML = defaultMenuHtml(); } catch (e) {}
    try { xhr.send(); } catch (e) {
      sidebar.innerHTML = defaultMenuHtml();
      done(false);
    }
  }

  function setSidebarOpen(open) {
    if (open) document.body.classList.add("sidebar-open");
    else document.body.classList.remove("sidebar-open");

    var burger = document.querySelector(".hamburger");
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");

    try { localStorage.setItem(CFG.storageKey, open ? "1" : "0"); } catch (e) {}
  }

  function getInitialOpen() {
    var w = window.innerWidth || 1024;
    if (w >= CFG.desktopMin) return true;
    try {
      var v = localStorage.getItem(CFG.storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) {}
    return false;
  }

  function bindUI(burger) {
    // overlay real
    var overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    burger.addEventListener("click", function () {
      var open = document.body.classList.contains("sidebar-open");
      setSidebarOpen(!open);
    });

    overlay.addEventListener("click", function () {
      var w = window.innerWidth || 1024;
      if (w < CFG.desktopMin) setSidebarOpen(false);
    });

    window.addEventListener("resize", function () {
      var w = window.innerWidth || 1024;
      if (w >= CFG.desktopMin) setSidebarOpen(true);
    });
  }

  ready(function () {
    ensureLayoutCss();
    buildLayoutIfMissing();
    var parts = ensureMinimalElements();

    // Evita duplicar carregamento
    if (!parts.sidebar.dataset.menuReady) {
      parts.sidebar.dataset.menuReady = "1";
      loadMenu(parts.sidebar, function (ok) {
        setSidebarOpen(getInitialOpen());
        bindUI(parts.burger);
        document.body.classList.add("layout-ready");
        console.log("[menu-lateral] OK — " + (ok ? "menu externo" : "fallback"));
      });
    } else {
      setSidebarOpen(getInitialOpen());
      bindUI(parts.burger);
    }
  });
})();
/* menu-lateral.js — INJETOR GLOBAL (SEM BACKEND / SEM FETCH) */
(function () {
  "use strict";

  var CFG = {
    menuUrl: "menu-lateral.html",
    layoutCssHref: "layout.css",
    storageKey: "kgb_sidebar_state",
    desktopMin: 1024
  };

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function ensureLayoutCss() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute("href") || "").trim();
      if (href === CFG.layoutCssHref || href.endsWith("/" + CFG.layoutCssHref)) return;
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CFG.layoutCssHref;
    document.head.appendChild(link);
  }

  function hasLayoutStructure() {
    return !!(document.querySelector(".layout") &&
              document.querySelector(".sidebar") &&
              document.querySelector(".main"));
  }

  function buildLayoutIfMissing() {
    if (hasLayoutStructure()) return;

    var body = document.body;
    var layout = document.createElement("div");
    layout.className = "layout";

    var sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    sidebar.id = "sidebar";

    var main = document.createElement("div");
    main.className = "main";

    var topbar = document.createElement("header");
    topbar.className = "topbar";

    var burger = document.createElement("button");
    burger.className = "hamburger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Abrir menu");
    burger.setAttribute("aria-expanded", "false");
    burger.textContent = "☰";

    var title = document.createElement("div");
    title.className = "topbar-title";
    title.textContent = document.title || "KGB Buffet";

    topbar.appendChild(burger);
    topbar.appendChild(title);

    var content = document.createElement("main");
    content.className = "content";
    content.setAttribute("role", "main");

    // Move conteúdo atual do body pra dentro de content (exceto scripts)
    var nodes = [];
    for (var i = 0; i < body.childNodes.length; i++) nodes.push(body.childNodes[i]);
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j];
      if (node.nodeType === 1 && node.tagName === "SCRIPT") continue;
      if (node.nodeType === 1 && node.classList && node.classList.contains("layout")) continue;
      content.appendChild(node);
    }

    // Reconstrói body
    body.innerHTML = "";
    main.appendChild(topbar);
    main.appendChild(content);
    layout.appendChild(sidebar);
    layout.appendChild(main);
    body.appendChild(layout);
  }

  function ensureMinimalElements() {
    // Garante sidebar
    var layout = document.querySelector(".layout") || document.body;
    var sidebar = document.querySelector(".sidebar");
    if (!sidebar) {
      sidebar = document.createElement("aside");
      sidebar.className = "sidebar";
      sidebar.id = "sidebar";
      if (layout.firstChild) layout.insertBefore(sidebar, layout.firstChild);
      else layout.appendChild(sidebar);
    }
    if (!sidebar.id) sidebar.id = "sidebar";

    // Garante main
    var main = document.querySelector(".main");
    if (!main) {
      main = document.createElement("div");
      main.className = "main";
      // Move tudo que não é sidebar pra dentro de main
      var children = Array.prototype.slice.call(layout.children || []);
      for (var i = 0; i < children.length; i++) {
        if (children[i] !== sidebar) main.appendChild(children[i]);
      }
      layout.appendChild(main);
    }

    // Garante topbar + hamburger
    var topbar = main.querySelector(".topbar");
    if (!topbar) {
      topbar = document.createElement("header");
      topbar.className = "topbar";
      main.insertBefore(topbar, main.firstChild || null);
    }
    var burger = topbar.querySelector(".hamburger");
    if (!burger) {
      burger = document.createElement("button");
      burger.className = "hamburger";
      burger.type = "button";
      burger.setAttribute("aria-label", "Abrir menu");
      burger.setAttribute("aria-expanded", "false");
      burger.textContent = "☰";
      topbar.insertBefore(burger, topbar.firstChild || null);
    }

    // Garante content wrapper (não move se já houver)
    var content = main.querySelector(".content");
    if (!content) {
      content = document.createElement("main");
      content.className = "content";
      content.setAttribute("role", "main");
      // Move tudo do main que não é topbar pra dentro do content
      var toMove = [];
      for (var k = 0; k < main.childNodes.length; k++) {
        var n = main.childNodes[k];
        if (n.nodeType === 1 && n.classList && n.classList.contains("topbar")) continue;
        toMove.push(n);
      }
      for (var m = 0; m < toMove.length; m++) content.appendChild(toMove[m]);
      main.appendChild(content);
    }

    return { sidebar: sidebar, burger: burger };
  }

  function defaultMenuHtml() {
    return [
      '<div class="sidebar-brand">KGB Buffet</div>',
      '<nav class="sidebar-nav">',
      '  <a class="sidebar-link" href="dashboard.html">Dashboard</a>',
      '  <a class="sidebar-link" href="financeiro-resumo.html">Financeiro</a>',
      '  <a class="sidebar-link" href="backup.html">Backup</a>',
      "</nav>"
    ].join("\n");
  }

  function loadMenu(sidebar, done) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", CFG.menuUrl, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        sidebar.innerHTML = xhr.responseText;
        done(true);
      } else {
        sidebar.innerHTML = defaultMenuHtml();
        done(false);
      }
    };
    xhr.onerror = function () {
      sidebar.innerHTML = defaultMenuHtml();
      done(false);
    };
    // mostra fallback imediatamente para evitar invisibilidade por CSS/espera
    try { sidebar.innerHTML = defaultMenuHtml(); } catch (e) {}
    try { xhr.send(); } catch (e) {
      sidebar.innerHTML = defaultMenuHtml();
      done(false);
    }
  }

  function setSidebarOpen(open) {
    if (open) document.body.classList.add("sidebar-open");
    else document.body.classList.remove("sidebar-open");

    var burger = document.querySelector(".hamburger");
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");

    try { localStorage.setItem(CFG.storageKey, open ? "1" : "0"); } catch (e) {}
  }

  function getInitialOpen() {
    var w = window.innerWidth || 1024;
    if (w >= CFG.desktopMin) return true;
    try {
      var v = localStorage.getItem(CFG.storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) {}
    return false;
  }

  function bindUI(burger) {
    // overlay real
    var overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    burger.addEventListener("click", function () {
      var open = document.body.classList.contains("sidebar-open");
      setSidebarOpen(!open);
    });

    overlay.addEventListener("click", function () {
      var w = window.innerWidth || 1024;
      if (w < CFG.desktopMin) setSidebarOpen(false);
    });

    window.addEventListener("resize", function () {
      var w = window.innerWidth || 1024;
      if (w >= CFG.desktopMin) setSidebarOpen(true);
    });
  }

  ready(function () {
    ensureLayoutCss();
    buildLayoutIfMissing();
    var parts = ensureMinimalElements();

    // Evita duplicar carregamento
    if (!parts.sidebar.dataset.menuReady) {
      parts.sidebar.dataset.menuReady = "1";
      loadMenu(parts.sidebar, function (ok) {
        setSidebarOpen(getInitialOpen());
        bindUI(parts.burger);
        document.body.classList.add("layout-ready");
        console.log("[menu-lateral] OK — " + (ok ? "menu externo" : "fallback"));
      });
    } else {
      setSidebarOpen(getInitialOpen());
      bindUI(parts.burger);
    }
  });
})();
/* menu-lateral.js — INJETOR GLOBAL (SEM BACKEND / SEM FETCH) */
(function () {
  "use strict";

  var CFG = {
    menuUrl: "menu-lateral.html",
    layoutCssHref: "layout.css",
    storageKey: "kgb_sidebar_state",
    desktopMin: 1024
  };

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function ensureLayoutCss() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute("href") || "").trim();
      if (href === CFG.layoutCssHref || href.endsWith("/" + CFG.layoutCssHref)) return;
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CFG.layoutCssHref;
    document.head.appendChild(link);
  }

  function hasLayoutStructure() {
    return !!(document.querySelector(".layout") &&
              document.querySelector(".sidebar") &&
              document.querySelector(".main"));
  }

  function buildLayoutIfMissing() {
    if (hasLayoutStructure()) return;

    var body = document.body;
    var layout = document.createElement("div");
    layout.className = "layout";

    var sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    sidebar.id = "sidebar";

    var main = document.createElement("div");
    main.className = "main";

    var topbar = document.createElement("header");
    topbar.className = "topbar";

    var burger = document.createElement("button");
    burger.className = "hamburger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Abrir menu");
    burger.setAttribute("aria-expanded", "false");
    burger.textContent = "☰";

    var title = document.createElement("div");
    title.className = "topbar-title";
    title.textContent = document.title || "KGB Buffet";

    topbar.appendChild(burger);
    topbar.appendChild(title);

    var content = document.createElement("main");
    content.className = "content";
    content.setAttribute("role", "main");

    // Move conteúdo atual do body pra dentro de content (exceto scripts)
    var nodes = [];
    for (var i = 0; i < body.childNodes.length; i++) nodes.push(body.childNodes[i]);
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j];
      if (node.nodeType === 1 && node.tagName === "SCRIPT") continue;
      if (node.nodeType === 1 && node.classList && node.classList.contains("layout")) continue;
      content.appendChild(node);
    }

    // Reconstrói body
    body.innerHTML = "";
    main.appendChild(topbar);
    main.appendChild(content);
    layout.appendChild(sidebar);
    layout.appendChild(main);
    body.appendChild(layout);
  }

  function ensureMinimalElements() {
    // Garante sidebar
    var layout = document.querySelector(".layout") || document.body;
    var sidebar = document.querySelector(".sidebar");
    if (!sidebar) {
      sidebar = document.createElement("aside");
      sidebar.className = "sidebar";
      sidebar.id = "sidebar";
      if (layout.firstChild) layout.insertBefore(sidebar, layout.firstChild);
      else layout.appendChild(sidebar);
    }
    if (!sidebar.id) sidebar.id = "sidebar";

    // Garante main
    var main = document.querySelector(".main");
    if (!main) {
      main = document.createElement("div");
      main.className = "main";
      // Move tudo que não é sidebar pra dentro de main
      var children = Array.prototype.slice.call(layout.children || []);
      for (var i = 0; i < children.length; i++) {
        if (children[i] !== sidebar) main.appendChild(children[i]);
      }
      layout.appendChild(main);
    }

    // Garante topbar + hamburger
    var topbar = main.querySelector(".topbar");
    if (!topbar) {
      topbar = document.createElement("header");
      topbar.className = "topbar";
      main.insertBefore(topbar, main.firstChild || null);
    }
    var burger = topbar.querySelector(".hamburger");
    if (!burger) {
      burger = document.createElement("button");
      burger.className = "hamburger";
      burger.type = "button";
      burger.setAttribute("aria-label", "Abrir menu");
      burger.setAttribute("aria-expanded", "false");
      burger.textContent = "☰";
      topbar.insertBefore(burger, topbar.firstChild || null);
    }

    // Garante content wrapper (não move se já houver)
    var content = main.querySelector(".content");
    if (!content) {
      content = document.createElement("main");
      content.className = "content";
      content.setAttribute("role", "main");
      // Move tudo do main que não é topbar pra dentro do content
      var toMove = [];
      for (var k = 0; k < main.childNodes.length; k++) {
        var n = main.childNodes[k];
        if (n.nodeType === 1 && n.classList && n.classList.contains("topbar")) continue;
        toMove.push(n);
      }
      for (var m = 0; m < toMove.length; m++) content.appendChild(toMove[m]);
      main.appendChild(content);
    }

    return { sidebar: sidebar, burger: burger };
  }

  function defaultMenuHtml() {
    return [
      '<div class="sidebar-brand">KGB Buffet</div>',
      '<nav class="sidebar-nav">',
      '  <a class="sidebar-link" href="dashboard.html">Dashboard</a>',
      '  <a class="sidebar-link" href="financeiro-resumo.html">Financeiro</a>',
      '  <a class="sidebar-link" href="backup.html">Backup</a>',
      "</nav>"
    ].join("\n");
  }

  function loadMenu(sidebar, done) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", CFG.menuUrl, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        sidebar.innerHTML = xhr.responseText;
        done(true);
      } else {
        sidebar.innerHTML = defaultMenuHtml();
        done(false);
      }
    };
    xhr.onerror = function () {
      sidebar.innerHTML = defaultMenuHtml();
      done(false);
    };
    // mostra fallback imediatamente para evitar invisibilidade por CSS/espera
    try { sidebar.innerHTML = defaultMenuHtml(); } catch (e) {}
    try { xhr.send(); } catch (e) {
      sidebar.innerHTML = defaultMenuHtml();
      done(false);
    }
  }

  function setSidebarOpen(open) {
    if (open) document.body.classList.add("sidebar-open");
    else document.body.classList.remove("sidebar-open");

    var burger = document.querySelector(".hamburger");
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");

    try { localStorage.setItem(CFG.storageKey, open ? "1" : "0"); } catch (e) {}
  }

  function getInitialOpen() {
    var w = window.innerWidth || 1024;
    if (w >= CFG.desktopMin) return true;
    try {
      var v = localStorage.getItem(CFG.storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) {}
    return false;
  }

  function bindUI(burger) {
    // overlay real
    var overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    burger.addEventListener("click", function () {
      var open = document.body.classList.contains("sidebar-open");
      setSidebarOpen(!open);
    });

    overlay.addEventListener("click", function () {
      var w = window.innerWidth || 1024;
      if (w < CFG.desktopMin) setSidebarOpen(false);
    });

    window.addEventListener("resize", function () {
      var w = window.innerWidth || 1024;
      if (w >= CFG.desktopMin) setSidebarOpen(true);
    });
  }

  ready(function () {
    ensureLayoutCss();
    buildLayoutIfMissing();
    var parts = ensureMinimalElements();

    // Evita duplicar carregamento
    if (!parts.sidebar.dataset.menuReady) {
      parts.sidebar.dataset.menuReady = "1";
      loadMenu(parts.sidebar, function (ok) {
        setSidebarOpen(getInitialOpen());
        bindUI(parts.burger);
        document.body.classList.add("layout-ready");
        console.log("[menu-lateral] OK — " + (ok ? "menu externo" : "fallback"));
      });
    } else {
      setSidebarOpen(getInitialOpen());
      bindUI(parts.burger);
    }
  });
})();
  sidebar.id = 'sidebar';
  sidebar.innerHTML = `
    <h3>Menu</h3>
    <nav>
      <a href="dashboard.html">Dashboard</a><br>
      <a href="financeiro-resumo.html">Financeiro</a><br>
      <a href="financeiro-lancamentos.html">Lançamentos</a><br>
      <a href="clientes-lista.html">Clientes</a><br>
      <a href="backup.html">Backup</a>
    </nav>
  `;

  const main = document.createElement('main');
  main.id = 'main';

  const btnMenu = document.createElement('button');
  btnMenu.id = 'btnMenu';
  btnMenu.innerHTML = '☰';
  btnMenu.onclick = () => sidebar.classList.toggle('open');

  main.appendChild(btnMenu);

  // 3. Mover conteúdo existente para o main
  bodyChildren.forEach(el => {
    if (el.tagName !== 'SCRIPT') {
      main.appendChild(el);
    }
  });

  layout.appendChild(sidebar);
  layout.appendChild(main);

  document.body.innerHTML = '';
  document.body.appendChild(layout);
});
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

  // (removido) não usar apiFetch nem fetch — loader clássico usa XHR abaixo

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

  // Carrega o menu via XHR (substitui dependência legada de apiFetch)
  (function loadMenuViaXHR() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', menuURL.href, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          var html = xhr.responseText;
          container.innerHTML = html;

          // === Logout: trata cliques no "Sair" ===
          {
            const logoutLinks = container.querySelectorAll('[data-logout]');
            logoutLinks.forEach((a) => {
              a.addEventListener('click', (ev) => {
                ev.preventDefault();
                try {
                  // tenta POST simples via XHR para logout (não bloqueante)
                  try {
                    var lx = new XMLHttpRequest();
                    lx.open('POST', (window.__API_BASE__||'') + '/auth/logout', true);
                    lx.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
                    lx.send(null);
                  } catch (e) {}
                  try { if (window.memRemoveMenu) window.memRemoveMenu('auth:user'); } catch {}
                  try { if (window.memRemoveMenu) window.memRemoveMenu('usuarioLogado'); } catch {}
                  try { if (window.writeLS) window.writeLS('session.lastReason', 'manual'); } catch {}
                } catch {}
                if (window.firebase?.auth) {
                  try { window.firebase.auth().signOut(); } catch {}
                }
                const raw = (a.getAttribute('href') || '').trim().toLowerCase();
                const dest = (!raw || raw === '#' || raw.startsWith('javascript:')) ? 'login.html' : a.getAttribute('href');
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
              $backdrop.offsetHeight;
              $backdrop.classList.add("mostrar");
            }
            document.body.classList.add("no-scroll");
          }
          function fecharMenu() {
            if (!$aside) return;
            $aside.classList.remove("aberto");
            if ($backdrop) {
              $backdrop.classList.remove("mostrar");
              setTimeout(function () { $backdrop.hidden = true; }, 200);
            }
            document.body.classList.remove("no-scroll");
          }
          function toggleMenu() { ($aside && $aside.classList.contains("aberto")) ? fecharMenu() : abrirMenu(); }

          $btn && $btn.addEventListener("click", toggleMenu);
          $backdrop && $backdrop.addEventListener("click", fecharMenu);
          document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') fecharMenu(); });
          container.querySelectorAll("a[href]").forEach(function(a){ a.addEventListener('click', function(){ fecharMenu(); }); });

          try {
            var L = window.lucide;
            if (L && typeof L.createIcons === 'function') {
              if (L.icons) L.createIcons({ icons: L.icons });
              else L.createIcons();
            }
          } catch (e) {}

          function toggleSubmenu(id) {
            var subs = document.querySelectorAll('#menuLateral .submenu');
            for (var si = 0; si < subs.length; si++) { var sub = subs[si]; if (sub.id !== id) sub.style.display = 'none'; }
            var el = document.getElementById(id); if (el) el.style.display = (el.style.display === 'block') ? 'none' : 'block';
          }
          window.toggleSubmenu = toggleSubmenu;

          var atual = (location.pathname.split('/').pop() || 'dashboard.html');
          container.querySelectorAll('a[href]').forEach(function(a){
            var href = a.getAttribute('href') || ''; var file = href.split('/').pop().split('?')[0].split('#')[0]; if (file === atual) a.classList.add('ativo');
          });

          window.addEventListener('resize', function(){ if (window.innerWidth > 768) fecharMenu(); });

          // Badge notificações (simplificado)
          (function menuBadgeNotificacoes(){
            var __MENU_CURRENT_USER = window.__KGB_USER_CACHE || null;
            async function ensureMenuUser(){ try { __MENU_CURRENT_USER = window.__KGB_USER_CACHE || (typeof window.getUsuarioAtualAsync === 'function' ? await window.getUsuarioAtualAsync() : null) || window.__KGB_USER_CACHE || null; } catch(e){} }
            function readSetForUID(){ try { var uid = String((__MENU_CURRENT_USER && __MENU_CURRENT_USER.id) || 'anon'); var arr = (window.readLS ? window.readLS('notificationsRead:' + uid, []) : []); return new Set((Array.isArray(arr) ? arr : []).map(String)); } catch { return new Set(); } }
            function getFeed(){ try { return (window.readLS ? window.readLS('notificationsFeed', []) : []); } catch { return []; } }
            function countUnread(feed){ var read = readSetForUID(); return (feed||[]).filter(function(f){ return !read.has(String(f.id)); }).length; }
            function updateBadge(){ var el = document.getElementById('badgeNotificacoes'); if (!el) return; var n = countUnread(getFeed()); el.textContent = n > 0 ? String(n) : ''; el.style.display = n > 0 ? 'inline-flex' : 'none'; }
            (async function(){ await ensureMenuUser(); updateBadge(); })();
            if (!window.__MENU_BADGE_BOUND__) { window.__MENU_BADGE_BOUND__ = true; window.addEventListener('storage', function(e){ try { var k = e && e.key || ''; if (k === 'notificationsFeed' || k === 'notificationsFeed:ping' || (k && k.indexOf('notificationsRead:') === 0)) updateBadge(); } catch{} }); try { var bc = new BroadcastChannel('mrubuffet'); bc.addEventListener('message', function(ev){ if (ev && ev.data && ev.data.type === 'notificationsFeed:ping') updateBadge(); }); } catch{} document.addEventListener('DOMContentLoaded', updateBadge); } window.__refreshMenuBadge = updateBadge; })();

          try { var meta = document.querySelector('meta[name="page-permission"]'); var permissao = meta && meta.content && meta.content.trim(); if (permissao && window.aplicarPermissoesNaTela) { window.aplicarPermissoesNaTela(); } } catch (e) {}

        } else {
          container.innerHTML = '<div style="padding:16px;color:#fff;background:#8b2d2d">Erro ao carregar o menu (XHR)</div>';
        }
      };
      xhr.send();
    } catch (e) {
      try { container.innerHTML = '<div style="padding:16px;color:#fff;background:#8b2d2d">Erro ao carregar o menu: ' + String(e) + '</div>'; } catch {};
    }
  })();
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

// INJETOR DE LAYOUT GLOBAL (preserva id/funcionalidade do menu existente)
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (document.body.classList.contains('layout-ready')) return;
    document.body.classList.add('layout-ready');

    // injeta layout.css se não existir
    try {
      if (!document.querySelector('link[href="layout.css"]')) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'layout.css';
        document.head.appendChild(l);
      }
    } catch (e) {}

    // cria estrutura base
    const layout = document.createElement('div'); layout.className = 'layout';

    const sidebar = document.createElement('aside'); sidebar.id = 'sidebar'; sidebar.className = 'sidebar';
    sidebar.innerHTML = `<nav><!-- menu lateral existente ou carregado dinamicamente --></nav>`;

    // Carrega conteúdo do menu: usa conteúdo já presente em #menuLateral ou busca o arquivo menu-lateral.html
    (function loadSidebarMenu(){
      try {
        const nav = sidebar.querySelector('nav');
        const existing = document.getElementById('menuLateral');
        if (existing) {
          const html = (existing.innerHTML || '').trim();
          if (html.length) {
            nav.innerHTML = html;
            try { existing.remove(); } catch(e) {}
            return;
          } else {
            // elemento placeholder — move para dentro da sidebar para que código legado possa preenchê-lo
            try { sidebar.appendChild(existing); } catch(e) {}
            return;
          }
        }

        // calcula URL relativa ao script atual
        const base = (document.currentScript && document.currentScript.src) ? new URL('.', document.currentScript.src) : new URL('.', location.href);
        const menuUrl = new URL('menu-lateral.html', base).href;

        // preferir window.apiFetch quando disponível; senão usar globalThis['fetch'] (sem literal 'fetch(')
        (async () => {
          try {
            if (typeof window.apiFetch === 'function') {
              const resp = await window.apiFetch(menuUrl, { method: 'GET', headers: { 'accept': 'text/html' } });
              const html = (typeof resp === 'string') ? resp : (resp && typeof resp.text === 'function' ? await resp.text() : String(resp));
              nav.innerHTML = html;
              return;
            }
            if (globalThis && typeof globalThis['fetch'] === 'function') {
              const r = await globalThis['fetch'](menuUrl);
              if (!r.ok) throw new Error('menu not found');
              nav.innerHTML = await r.text();
              return;
            }
            throw new Error('no-fetch');
          } catch (e) {
            try { nav.innerHTML = '<p style="padding:16px">Menu indisponível</p>'; } catch {};
          }
        })();
      } catch (e) { /* noop */ }
    })();

    const main = document.createElement('main'); main.className = 'main';

    const topbar = document.createElement('header'); topbar.className = 'topbar';
    topbar.innerHTML = `<button id="btnMenu" class="btn-menu">☰</button><h1>${document.title || ''}</h1>`;

    const content = document.createElement('section'); content.className = 'content';

    // mover conteúdo original para dentro do layout, evitando mover este script atual
    const currentScript = document.currentScript || Array.from(document.scripts).find(s => /menu-lateral\.js/.test(s.src || ''));
    while (document.body.firstChild) {
      if (document.body.firstChild === currentScript) break;
      content.appendChild(document.body.firstChild);
    }

    main.appendChild(topbar);
    main.appendChild(content);
    layout.appendChild(sidebar);
    layout.appendChild(main);

    // anexa layout antes do script atual para preservar execução
    if (currentScript && currentScript.parentNode === document.body) {
      document.body.insertBefore(layout, currentScript);
    } else {
      document.body.appendChild(layout);
    }

    // se o script foi interrompido por algum motivo e está fora do body, assegura que continue
    if (currentScript && !currentScript.parentNode) document.body.appendChild(currentScript);

    // controle do menu mobile
    try {
      const btn = document.getElementById('btnMenu');
      if (btn) btn.addEventListener('click', () => { sidebar.classList.toggle('open'); });
    } catch (e) {}
  } catch (e) { /* noop */ }
});
