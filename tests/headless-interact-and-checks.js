const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3333';
const PAGES = [
  '/cadastro-evento.html',
  '/area-cliente.html',
  '/evento-detalhado.html',
  '/eventos.html',
  '/clientes-lista.html'
];

function loadMapping() {
  const p = path.join(__dirname, '..', 'data', 'fotos-clientes.json');
  if (!fs.existsSync(p)) return null;
  try {
    const txt = fs.readFileSync(p, 'utf8').trim();
    const cleaned = txt.replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('failed to read mapping:', e.message);
    return null;
  }
}

async function findAndClickCandidates(page) {
  // heuristics: try elements that may reveal images
  const selectors = ['button', 'a', '[role="button"]', '.btn', '.card', '.item', '.evento', '.cliente'];
  for (const sel of selectors) {
    const elems = await page.$$(sel);
    for (const el of elems) {
      try {
        const text = await page.evaluate(e => (e.textContent || '').toLowerCase(), el);
        if (!text) continue;
        // prefer elements that likely relate to photos or details
        if (text.includes('foto') || text.includes('fotos') || text.includes('ver') || text.includes('visual') || text.includes('detal')) {
          await el.click().catch(() => {});
          await new Promise(r => setTimeout(r, 700));
          return true;
        }
      } catch (e) { /* ignore */ }
    }
  }
  // fallback: click first clickable element
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      try { await el.click().catch(() => {}); await page.waitForTimeout(700); return true; } catch (e) {}
    }
  }
  return false;
}

async function analyzeImgs(page) {
  const imgs = await page.$$eval('img', arr => arr.map(i => i.src || i.getAttribute('data-src')));
  const cloud = imgs.some(s => typeof s === 'string' && s.includes('res.cloudinary.com'));
  return { imgs: imgs.filter(Boolean), cloud }; 
}

async function checkPageWithInteractions(browser, path, mapping) {
  const page = await browser.newPage();
  if (mapping) {
    await page.evaluateOnNewDocument((mappingStr) => {
      try { localStorage.setItem('fotosClientes', mappingStr); } catch(e) {}
    }, JSON.stringify(mapping));
  }
  const url = BASE + path;
  const out = { path, url, steps: [], ok: false };
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) { out.steps.push({ type: 'navigation-error', msg: e.message }); await page.close(); return out; }
  out.steps.push({ type: 'loaded' });

  // try up to 5 interaction attempts
  for (let i = 0; i < 5; i++) {
    const before = await analyzeImgs(page);
    out.steps.push({ step: i, beforeCount: before.imgs.length, beforeCloud: before.cloud });
    if (before.cloud) { out.ok = true; out.steps.push({ found: 'before' }); break; }

    const clicked = await findAndClickCandidates(page);
    out.steps.push({ step: i, clicked });
    await new Promise(r => setTimeout(r, 800));

    const after = await analyzeImgs(page);
    out.steps.push({ step: i, afterCount: after.imgs.length, afterCloud: after.cloud, imgs: after.imgs.slice(0,5) });
    if (after.cloud) { out.ok = true; break; }
    if (!clicked) break;
  }

  await page.close();
  return out;
}

(async () => {
  const mapping = loadMapping();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  for (const p of PAGES) {
    const r = await checkPageWithInteractions(browser, p, mapping);
    results.push(r);
  }
  await browser.close();
  console.log(JSON.stringify({ base: BASE, results }, null, 2));
  process.exit(0);
})();
