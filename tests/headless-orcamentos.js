const puppeteer = require('puppeteer');

const BASE = process.env.BASE_URL || 'http://localhost:3333';

async function waitForServer(url, timeout = 20000) {
  const start = Date.now();
  const fetch = require('node-fetch');
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res && (res.status === 200 || res.status === 302 || res.status === 301)) return true;
    } catch (e) { }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server not ready: ' + url);
}

(async () => {
  try {
    await waitForServer(BASE + '/orcamento.html', 20000);
  } catch (e) {
    console.warn('Server not ready:', e.message);
  }

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  // ensure a valid session (bypass guard) before any script runs
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('auth.token', 'test-token'); } catch {}
    try { localStorage.setItem('auth.roles', 'Vendedor,Administrador'); } catch {}
    try { localStorage.setItem('guard.enforce', '0'); } catch {}
  });

  try {
    await page.goto(BASE + '/orcamento.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('#form-orcamento', { timeout: 15000 });

    // fill minimal fields
    await page.type('#nome', 'Teste Automacao');
    await page.type('#whatsapp', '11999998888');
    await page.type('#convidados', '50');

    // click gerar proposta
    await page.click('button[onclick="salvarLeadFunil(\'proposta\')"]');

    // wait a bit for localStorage writes
    await new Promise(r => setTimeout(r, 800));

    const proposals = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('propostasIndex') || 'null'); } catch { return null; }
    });

    const leads = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('leads') || 'null'); } catch { return null; }
    });

    console.log(JSON.stringify({ proposalsCount: (proposals && proposals.length) || 0, leadsCount: (leads && leads.length) || 0 }));
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('headless test failed:', e);
    await browser.close();
    process.exit(2);
  }
})();
