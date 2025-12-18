const puppeteer = require('puppeteer');

const BASE = process.env.BASE_URL || 'http://localhost:3333';
const PAGES = [
  '/cadastro-evento.html',
  '/area-cliente.html',
  '/evento-detalhado.html'
];

async function checkPage(page, path) {
  const url = BASE + path;
  const result = { path, url, ok: true, errors: [], imgs: [], fotosClientes: null };
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    result.ok = false;
    result.errors.push('navigation:' + e.message);
    return result;
  }

    try {
    await page.waitForSelector('body', { timeout: 5000 });
    const data = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src || i.getAttribute('data-src'));
      let fotos = null;
      try { fotos = localStorage.getItem('fotosClientes'); } catch(e) { fotos = '__ls_error__:' + e.message }
      return { imgs, fotos };
    });
    result.imgs = data.imgs.filter(Boolean);
    result.fotosClientes = data.fotos;

    // analyze fotosClientes value
    if (data.fotos && data.fotos.indexOf('data:image') !== -1) {
      result.ok = false;
      result.errors.push('localStorage contains data:image base64 blobs');
    }
    if (data.fotos && data.fotos.length > 10000) {
      result.ok = false;
      result.errors.push('localStorage.fotosClientes seems very large');
    }

    // check at least one img uses Cloudinary if mapping present
    const anyCloud = result.imgs.some(s => typeof s === 'string' && s.includes('res.cloudinary.com'));
    result.cloudinaryPresent = anyCloud;
  } catch (e) {
    result.ok = false;
    result.errors.push('evaluate:' + e.message);
  }

  return result;
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const results = [];
  for (const p of PAGES) {
    const r = await checkPage(page, p);
    results.push(r);
  }
  await browser.close();

  console.log(JSON.stringify({ base: BASE, results }, null, 2));

  const anyFail = results.some(r => !r.ok);
  process.exit(anyFail ? 2 : 0);
})();
