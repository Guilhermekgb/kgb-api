const puppeteer = require('puppeteer');

(async () => {
  const url = process.env.TEST_URL || 'http://127.0.0.1:5500/proposta.html';
  const results = { console: [], network: [], errors: [] };

  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  // Ensure pages see the forced API base before any script runs
  const forced = process.env.FORCED_API_BASE || 'https://kgb-api-v2.onrender.com';
  await page.evaluateOnNewDocument((f) => {
    try { localStorage.setItem('API_BASE', f); } catch(e) {}
    try { window.__API_BASE__ = f; } catch(e) {}
    // Override fetch to rewrite local dev API to the forced remote base
    try {
      const _fetch = window.fetch;
      window.fetch = function(input, init){
        try{
          let url = (typeof input === 'string') ? input : (input && input.url) || '';
          if (typeof url === 'string' && url.indexOf('http://127.0.0.1:3333') === 0) {
            const newUrl = url.replace('http://127.0.0.1:3333', f);
            if (typeof input === 'string') input = newUrl;
            else if (input instanceof Request) input = new Request(newUrl, input);
          }
        }catch(e){}
        return _fetch.call(this, input, init);
      };
    } catch(e) {}
  }, forced);

  page.on('console', msg => {
    try {
      results.console.push({ type: msg.type(), text: msg.text(), location: msg.location() });
    } catch (e) {
      results.console.push({ type: 'unknown', text: String(msg) });
    }
  });

  page.on('requestfailed', req => {
    results.network.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || 'failed' });
  });

  page.on('response', async resp => {
    try {
      const status = resp.status();
      if (status >= 400) {
        const url = resp.url();
        let body = '';
        try { body = await resp.text(); } catch (e) { body = String(e); }
        results.network.push({ url, status, ok: resp.ok(), body: body.slice ? body.slice(0, 2000) : String(body) });
      }
    } catch (e) {
      results.errors.push(String(e));
    }
  });

  try {
    await page.setViewport({ width: 412, height: 915 }); // mobile-ish
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // wait additional time for SPA actions / XHR
    await new Promise(r=>setTimeout(r, 4000));

    // also try opening menu button if present
    try {
      await page.evaluate(() => {
        const btn = document.querySelector('#hamburguer, .hamburguer, #menu-toggle');
        if (btn) btn.click();
      });
      await new Promise(r=>setTimeout(r, 500));
    } catch (e) {}

    // collect some DOM hints
    const domHints = await page.evaluate(() => ({
      title: document.title,
      hasMetaViewport: !!document.querySelector('meta[name="viewport"]'),
      hamburgerExists: !!document.querySelector('#hamburguer, .hamburguer, #menu-toggle'),
    }));

    results.dom = domHints;
  } catch (e) {
    results.errors.push(String(e));
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})();
