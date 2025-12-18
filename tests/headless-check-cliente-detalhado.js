const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3333';
const PAGE = '/cliente-detalhado.html';

function loadMapping() {
  const p1 = path.join(__dirname, '..', 'data', 'fotos-clientes.json');
  const p2 = path.join(__dirname, '..', 'data', 'fotos-clientes.clean.json');
  const p = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e){ return null; }
}

(async ()=>{
  const mapping = loadMapping();
  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();

  if (mapping) {
    await page.evaluateOnNewDocument((m)=>{ try{ localStorage.setItem('fotosClientes', JSON.stringify(m)); }catch(e){} try{ window.__FOTOS_CLIENTES_PRELOAD__ = m; }catch(e){} }, mapping);
  }

  // set eventoSelecionado with fotoClienteKey matching mapping key
  const evento = { id: 'evt-test-1', nomeEvento: 'Teste', fotoClienteKey: 'teste/script-upload.png' };
  await page.evaluateOnNewDocument((ev)=>{ try{ localStorage.setItem('eventoSelecionado', JSON.stringify(ev)); }catch(e){} }, evento);

  await page.goto(BASE + PAGE, { waitUntil: 'networkidle2', timeout: 30000 });
  // snapshot img src
  const imgs = await page.$$eval('img', arr => arr.map(i => ({id: i.id||null, src: i.src||null, alt: i.alt||null})).slice(0,50));
  const cloud = imgs.some(i => i.src && i.src.includes('res.cloudinary.com'));
  console.log(JSON.stringify({ page: PAGE, imgs, cloud }, null, 2));
  await browser.close();
})();
