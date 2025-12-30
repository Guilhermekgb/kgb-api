const puppeteer = require('puppeteer');
(async()=>{
  const BASE = process.env.BASE_URL || 'http://localhost:3333';
  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  // inject sample mapping + event before scripts
  const sample = { "default/teste/script-upload.png": "https://res.cloudinary.com/dzw8u1h69/image/upload/v1765942238/default/l958ke0s7nx074rta3fx.png" };
  await page.evaluateOnNewDocument((m)=>{ try{ (typeof window.setFotosMap==='function' ? window.setFotosMap(m) : localStorage.setItem('fotosClientes', JSON.stringify(m))); }catch(e){} try{ window.__FOTOS_CLIENTES_PRELOAD__ = m; }catch(e){} try{ const ev={id:'__test_ev__', nomeEvento:'Teste', fotoClienteKey:Object.keys(m)[0], dataISO:new Date().toISOString()}; const arr=JSON.parse(localStorage.getItem('eventos')||'[]'); arr.unshift(ev); localStorage.setItem('eventos', JSON.stringify(arr)); localStorage.setItem('eventoSelecionado', String(ev.id)); }catch(e){} }, sample);

  await page.goto(BASE + '/area-cliente.html', { waitUntil: 'networkidle2', timeout: 30000 }).catch(()=>{});
  const info = await page.evaluate(()=>{
    const imgs = Array.from(document.querySelectorAll('img')).map(i=>({id:i.id||null, src:i.src||null, visible: !!(i.offsetWidth||i.offsetHeight)}));
    return { fotosClientes: localStorage.getItem('fotosClientes'), eventoSelecionado: localStorage.getItem('eventoSelecionado'), eventos: localStorage.getItem('eventos'), imgs };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
