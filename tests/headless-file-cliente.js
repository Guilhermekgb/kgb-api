const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT = path.join('C:', 'Users', 'user', 'OneDrive', 'Desktop', 'sistema-buffet');
const FILE = path.join(ROOT, 'cliente-detalhado.html');

function loadMapping() {
  const p1 = path.join(__dirname, '..', 'data', 'fotos-clientes.json');
  const p2 = path.join(__dirname, '..', 'data', 'fotos-clientes.clean.json');
  const p = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e){ return null; }
}

(async ()=>{
  if (!fs.existsSync(FILE)){
    console.error('file missing:', FILE); process.exit(2);
  }
  const mapping = loadMapping();
  const evento = { id: 'evt-local-test', nomeEvento: 'Teste local', fotoClienteKey: 'teste/script-upload.png' };

  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();

  // inject mapping + evento BEFORE load
  if (mapping) {
    await page.evaluateOnNewDocument((m)=>{ try{ localStorage.setItem('fotosClientes', JSON.stringify(m)); }catch(e){} try{ window.__FOTOS_CLIENTES_PRELOAD__ = m;}catch(e){} }, mapping);
  }
  await page.evaluateOnNewDocument((ev)=>{ try{ localStorage.setItem('eventoSelecionado', JSON.stringify(ev)); }catch(e){} }, evento);

  const fileUrl = 'file:///' + FILE.replace(/\\/g,'/');
  try{
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });
  }catch(e){ console.error('goto error', e && e.message); }

  // wait a bit for scripts to run
  await new Promise(r => setTimeout(r, 1200));

  const imgs = await page.$$eval('img', arr => arr.map(i => ({ id: i.id||null, src: i.src||null, visible: !!(i.offsetWidth||i.offsetHeight) } )));
  const cloud = imgs.some(i => i.src && i.src.includes('res.cloudinary.com'));

  console.log(JSON.stringify({ file: fileUrl, imgs: imgs.slice(0,20), cloud }, null, 2));

  await browser.close();
})();
