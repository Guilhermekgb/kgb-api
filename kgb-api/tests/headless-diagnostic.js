const puppeteer = require('puppeteer');

(async function(){
  const base = process.env.BASE_URL || 'http://127.0.0.1:5630';
  console.log('BASE_URL=', base);
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
  try{
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));

    const url = (base.endsWith('/')? base.slice(0,-1) : base) + '/orcamento.html';
    console.log('Goto', url);
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000}).catch(e=>console.error('goto error',e));

    // wait for the save function to be available
    try{
      await page.waitForFunction('typeof window.salvarLeadFunil === "function"', {timeout: 8000});
      console.log('salvarLeadFunil found, invoking...');
      await page.evaluate(()=>{
        try{ return window.salvarLeadFunil && window.salvarLeadFunil('proposta'); }catch(e){ console.error('eval error',e); }
      });
    }catch(e){
      console.warn('salvarLeadFunil not found or invocation failed:', e.message);
    }

    // wait a bit for background saves to finish
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(2000);
    } else {
      await new Promise(r => setTimeout(r, 2000));
    }

    const stores = await page.evaluate(async ()=>{
      return {
        propostasIndex_local: localStorage.propostasIndex || null,
        propostasIndex_session: sessionStorage.propostasIndex || null,
        leads_local: localStorage.leads || null,
        api_base: window.__API_BASE__ || null
      };
    });

    console.log('STORES:', JSON.stringify(stores, null, 2));

    // fetch /orcamentos from the page's context (to use same origin / CORS behavior)
    const apiFetch = await page.evaluate(async ()=>{
      const apiBase = window.__API_BASE__ || '/';
      const base = apiBase.endsWith('/')? apiBase.slice(0,-1) : apiBase;
      const url = base + '/orcamentos';
      try{
        const r = await fetch(url);
        const txt = await r.text();
        return { url, status: r.status, body: txt.slice(0,5000) };
      }catch(e){
        return { url, error: String(e) };
      }
    });

    console.log('API_FETCH:', JSON.stringify(apiFetch, null, 2));
  }finally{
    await browser.close();
  }
  process.exit(0);
})();
