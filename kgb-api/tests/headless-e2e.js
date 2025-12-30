const puppeteer = require('puppeteer');

(async ()=>{
  const base = process.env.BASE_URL || 'http://127.0.0.1:5630';
  console.log('BASE_URL=', base);
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
  try{
    const page = await browser.newPage();
    page.on('console', m=>console.log('PAGE:', m.text()));

    const orcUrl = (base.endsWith('/')?base.slice(0,-1):base) + '/orcamento.html';
    const listUrl = (base.endsWith('/')?base.slice(0,-1):base) + '/lista-propostas.html';

    console.log('Goto', orcUrl);
    await page.goto(orcUrl, {waitUntil:'networkidle2', timeout:30000}).catch(()=>{});
    // try invoke save
    try{
      await page.waitForFunction('typeof window.salvarLeadFunil === "function"', {timeout:8000});
      await page.evaluate(()=> window.salvarLeadFunil && window.salvarLeadFunil('proposta'));
      console.log('invoked salvarLeadFunil');
    }catch(e){ console.warn('save invocation failed', e.message); }

    await new Promise(r=>setTimeout(r,2000));
    // read propostasIndex
    const propIndex = await page.evaluate(()=> localStorage.propostasIndex || sessionStorage.propostasIndex || null);
    console.log('propostasIndex after save =', propIndex ? propIndex.slice(0,800) : propIndex);

    // open list page and wait for its carregar to run
    console.log('Goto', listUrl);
    await page.goto(listUrl, {waitUntil:'networkidle2', timeout:30000}).catch(()=>{});
    // wait for list container
    await page.waitForSelector('#listaPropostas', {timeout:8000});
    // probe getPropostas() directly to see source data
    let propostasData = null;
    try{
      propostasData = await page.evaluate(async ()=> {
        try { const p = await getPropostas(); return p; } catch(e){ return { __err: String(e) }; }
      });
    }catch(e){ propostasData = { __err: String(e) }; }
    console.log('getPropostas() =>', JSON.stringify(propostasData).slice(0,2000));
    const listHtml = await page.evaluate(()=> document.getElementById('listaPropostas')?.innerHTML || '');
    const hasItems = (listHtml || '').trim().length > 0 && !/Nenhuma proposta encontrada/.test(listHtml);
    console.log('lista-propostas has items?', hasItems);
    console.log('lista-propostas innerHTML snapshot:', (listHtml||'').slice(0,1200));

    process.exit(hasItems?0:2);
  }finally{ await browser.close(); }
})();
