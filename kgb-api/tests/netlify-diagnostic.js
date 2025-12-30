const puppeteer = require('puppeteer');

(async ()=>{
  const base = process.env.BASE_URL || 'https://kgbprobuffet.netlify.app';
  console.log('BASE_URL=', base);
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
  try{
    const page = await browser.newPage();
    page.on('console', m=>console.log('PAGE:', m.text()));
    page.on('pageerror', e=>console.error('PAGE ERROR:', e));

    const url = (base.endsWith('/')? base.slice(0,-1) : base) + '/lista-propostas.html';
    console.log('Goto', url);
    await page.goto(url, {waitUntil:'networkidle2', timeout:30000}).catch(e=>console.error('goto error', e && e.message));

    const info = await page.evaluate(async ()=>{
      const apiBase = window.__API_BASE__ || localStorage.getItem('API_BASE') || null;
      const propostasLocal = localStorage.getItem('propostasIndex') || null;
      const propostasSession = sessionStorage.getItem('propostasIndex') || null;
      let apiFetch = null;
      try{
        const base = (apiBase && apiBase !== '/' ) ? apiBase : window.location.origin;
        const r = await fetch((base.endsWith('/')?base.slice(0,-1):base) + '/orcamentos');
        const txt = await r.text().catch(()=>null);
        apiFetch = { url: (base.endsWith('/')?base.slice(0,-1):base) + '/orcamentos', status: r.status, body: txt };
      }catch(e){ apiFetch = { error: String(e) }; }
      return { apiBase, propostasLocal, propostasSession, apiFetch };
    });

    console.log('RESULT:', JSON.stringify(info, null, 2));
  }finally{ await browser.close(); }
  process.exit(0);
})();
