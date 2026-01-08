const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const BASE = "https://kgbprobuffet.netlify.app";
const PAGES = [
  { name: "orcamento", url: `${BASE}/orcamento.html` },
  { name: "lista-evento", url: `${BASE}/lista-evento.html` },
];

function nowIso() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, "-");
}

(async () => {
  const ts = nowIso();
  const outJson = path.join("tools", `relatorio-prod-2pages-${ts}.json`);
  const outMd = path.join("tools", `relatorio-prod-2pages-${ts}.md`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];

  for (const p of PAGES) {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    const logs = [];
    const errors = [];
    const requests = [];
    const responses = [];

    page.on("console", (msg) => {
      try {
        logs.push({ type: msg.type(), text: msg.text() });
      } catch (e) {
        logs.push({ type: "console", text: String(e) });
      }
    });

    page.on("pageerror", (err) => {
      errors.push({ type: "pageerror", message: err.message, stack: err.stack });
    });

    page.on("requestfailed", (req) => {
      requests.push({
        type: "requestfailed",
        url: req.url(),
        method: req.method(),
        failure: req.failure() ? req.failure().errorText : null,
      });
    });

    page.on("request", (req) => {
      const url = req.url();
      if (
        url.includes("kgb-api-v2.onrender.com") ||
        url.includes("kgbprobuffet.netlify.app") ||
        url.endsWith(".js") ||
        url.endsWith(".html")
      ) {
        requests.push({ type: "request", url, method: req.method() });
      }
    });

    page.on("response", (res) => {
      const url = res.url();
      if (
        url.includes("kgb-api-v2.onrender.com") ||
        url.includes("kgbprobuffet.netlify.app") ||
        url.endsWith(".js") ||
        url.endsWith(".html")
      ) {
        responses.push({ url, status: res.status() });
      }
    });

    let ok = false;
    let finalUrl = "";
    let domInfo = {};
    let htmlSnippet = "";

    try {
      const r = await page.goto(p.url, { waitUntil: "domcontentloaded" });
      finalUrl = page.url();

      // tempo para scripts/render
      await page.waitForTimeout(5000);

      domInfo = await page.evaluate(() => {
        const byId = (id) => !!document.getElementById(id);
        const q = (sel) => !!document.querySelector(sel);

        return {
          readyState: document.readyState,
          title: document.title,
          hasMain: q("main"),
          hasConteudo: byId("conteudo"),
          hasApp: byId("app"),
          orcamento: {
            hasListaPacotes: byId("listaPacotes"),
            hasGridPacotes: byId("gridPacotes"),
            hasPacotesContainer: byId("pacotesContainer"),
          },
          listaEvento: {
            hasListaEventos: byId("listaEventos"),
            hasTabela: q("table"),
            hasCards: q(".card, .cards, .grid, .lista"),
          },
          api: {
            API_BASE: window.API_BASE || null,
            __KGB_API_BASE__: window.__KGB_API_BASE__ || null,
            __API_BASE__: (() => {
              try { return window.__API_BASE__ || null; }
              catch { return "read-only"; }
            })(),
          },
        };
      });

      htmlSnippet = await page.content();
      htmlSnippet = htmlSnippet.slice(0, 2000);

      ok = !!r && r.ok();
    } catch (err) {
      errors.push({ type: "goto", message: err.message, stack: err.stack });
    }

    results.push({
      page: p.name,
      url: p.url,
      finalUrl,
      ok,
      domInfo,
      errors,
      logs,
      requests,
      responses,
      htmlSnippet,
    });

    await page.close();
  }

  await browser.close();

  fs.writeFileSync(outJson, JSON.stringify(results, null, 2), "utf-8");

  let md = `# Relatório Prod 2 páginas (${ts})\n\n`;
  for (const r of results) {
    md += `## ${r.page}\n`;
    md += `- URL: ${r.url}\n`;
    md += `- Final URL: ${r.finalUrl}\n`;
    md += `- OK: ${r.ok}\n`;
    md += `- API: ${JSON.stringify(r.domInfo.api)}\n`;
    md += `- DOM: ${JSON.stringify({ ...r.domInfo, api: undefined }, null, 2)}\n\n`;

    const consoleTop = r.logs.slice(-120);
    md += `### Console (últimos ${consoleTop.length})\n`;
    for (const c of consoleTop) md += `- [${c.type}] ${c.text}\n`;

    if (r.errors.length) {
      md += `\n### Errors\n`;
      for (const e of r.errors) md += `- ${e.type}: ${e.message}\n`;
    }

    const apiRes = r.responses.filter(x => x.url.includes("kgb-api-v2.onrender.com"));
    md += `\n### API Responses (${apiRes.length})\n`;
    for (const a of apiRes.slice(-40)) md += `- ${a.status} ${a.url}\n`;

    md += `\n---\n\n`;
  }

  fs.writeFileSync(outMd, md, "utf-8");

  console.log("Gerado:", outMd);
  console.log("Gerado:", outJson);
})();
