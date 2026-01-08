const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const PAGES = [
  { name: "orcamento", url: "https://kgbprobuffet.netlify.app/orcamento.html" },
  { name: "lista-evento", url: "https://kgbprobuffet.netlify.app/lista-evento.html" },
];

function isoSafe() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

(async () => {
  const stamp = isoSafe();
  const outDir = path.join(__dirname, "..", "tools");
  const mdPath = path.join(outDir, `relatorio-prod-2pages-v2-${stamp}.md`);
  const jsonPath = path.join(outDir, `relatorio-prod-2pages-v2-${stamp}.json`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];

  for (const p of PAGES) {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    const consoleLines = [];
    const pageErrors = [];
    const requestFailed = [];
    const responses = [];

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      consoleLines.push(`[${type}] ${text}`);
    });

    page.on("pageerror", (err) => {
      pageErrors.push(String(err && err.stack ? err.stack : err));
    });

    page.on("requestfailed", (req) => {
      requestFailed.push({
        url: req.url(),
        method: req.method(),
        failure: req.failure() ? req.failure().errorText : "unknown",
      });
    });

    page.on("response", async (res) => {
      try {
        const url = res.url();
        const status = res.status();
        // guarda só APIs e/ou erros
        if (status >= 400 || /kgb-api\.onrender\.com|\/api\//i.test(url)) {
          responses.push({ url, status });
        }
      } catch (_) {}
    });

    let ok = true;
    let finalUrl = "";
    try {
      const resp = await page.goto(p.url, { waitUntil: "domcontentloaded" });
      finalUrl = page.url();
      if (!resp) ok = true;
    } catch (e) {
      ok = false;
      pageErrors.push("goto failed: " + String(e));
    }

    // espera um pouco para scripts rodarem e APIs acontecerem
    await page.waitForTimeout(8000);

    // snapshot DOM + variáveis
    const snap = await page.evaluate(() => {
      const pick = (sel) => !!document.querySelector(sel);
      const bodyText = (document.body && document.body.innerText) ? document.body.innerText.trim().slice(0, 300) : "";
      return {
        readyState: document.readyState,
        title: document.title,
        bodyTextSample: bodyText,
        hasMain: pick("main"),
        hasConteudo: pick("#conteudo"),
        hasApp: pick("#app"),
        orcamento: {
          hasListaPacotes: pick("#listaPacotes"),
          hasGridPacotes: pick("#gridPacotes"),
          hasPacotesContainer: pick("#pacotesContainer"),
        },
        listaEvento: {
          hasListaEventos: pick("#listaEventos"),
          hasTabela: pick("table"),
          hasCards: pick(".card, .card-evento, .evento-card"),
        },
        api: {
          API_BASE: window.API_BASE ?? null,
          __KGB_API_BASE__: window.__KGB_API_BASE__ ?? null,
          __API_BASE__: window.__API_BASE__ ?? null,
        },
      };
    });

    // screenshot
    const shotPath = path.join(outDir, `shot-${p.name}-${stamp}.png`);
    try { await page.screenshot({ path: shotPath, fullPage: true }); } catch(_) {}

    results.push({
      name: p.name,
      url: p.url,
      finalUrl,
      ok,
      dom: snap,
      consoleLast50: consoleLines.slice(-50),
      pageErrors,
      requestFailed,
      apiResponses: responses.slice(-50),
      screenshot: path.basename(shotPath),
    });

    await page.close();
  }

  await browser.close();

  // escreve JSON
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf8");

  // escreve MD
  const md = [];
  md.push(`# Relatório Prod 2 páginas V2 (${stamp})\n`);
  for (const r of results) {
    md.push(`## ${r.name}\n`);
    md.push(`URL: ${r.url}`);
    md.push(`Final URL: ${r.finalUrl}`);
    md.push(`OK: ${r.ok}`);
    md.push(`Screenshot: ${r.screenshot}\n`);
    md.push(`DOM: \n\`\`\`json\n${JSON.stringify(r.dom, null, 2)}\n\`\`\`\n`);

    if (r.pageErrors.length) {
      md.push(`Erros de página:\n\`\`\`\n${r.pageErrors.join("\n\n")}\n\`\`\`\n`);
    } else {
      md.push(`Erros de página: (nenhum)\n`);
    }

    if (r.requestFailed.length) {
      md.push(`Requests FAILED:\n\`\`\`json\n${JSON.stringify(r.requestFailed, null, 2)}\n\`\`\`\n`);
    } else {
      md.push(`Requests FAILED: (nenhum)\n`);
    }

    md.push(`API Responses (>=400 ou /api/ ou onrender):\n\`\`\`json\n${JSON.stringify(r.apiResponses, null, 2)}\n\`\`\`\n`);
    md.push(`Console (últimos 50):\n\`\`\`\n${r.consoleLast50.join("\n")}\n\`\`\`\n`);
  }

  fs.writeFileSync(mdPath, md.join("\n"), "utf8");
  console.log("Gerado:", mdPath);
  console.log("Gerado:", jsonPath);
})();
