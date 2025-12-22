const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT = path.join('C:', 'Users', 'user', 'OneDrive', 'Desktop', 'sistema-buffet');
const FILE = path.join(ROOT, 'area-cliente.html');

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
  const event = { id: 'evt-local-1', nomeEvento: 'Teste Evento', fotoClienteKey: 'teste/script-upload.png', dataISO: null, local: 'Local Teste', qtdConvidados: 20 };

  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();

  if (mapping) {
    // try to produce a flat mapping where the event.fotoClienteKey maps to a URL
    function findByKey(obj, k){
      if (!obj || typeof obj !== 'object') return null;
      if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
      for (const kk of Object.keys(obj)){
        const v = obj[kk];
        const found = findByKey(v, k);
        if (found) return found;
      }
      return null;
    }
    const urlForKey = findByKey(mapping, event.fotoClienteKey);
    const flat = urlForKey ? { [event.fotoClienteKey]: urlForKey } : mapping;
    await page.evaluateOnNewDocument((m)=>{ try{ (typeof window.setFotosMap==='function' ? window.setFotosMap(m) : localStorage.setItem('fotosClientes', JSON.stringify(m))); }catch(e){} try{ window.__FOTOS_CLIENTES_PRELOAD__ = m;}catch(e){} }, flat);
  }
  // set eventoSelecionado and eventos list and query string id
  await page.evaluateOnNewDocument((ev)=>{ try{ localStorage.setItem('eventoSelecionado', String(ev.id)); localStorage.setItem('eventos', JSON.stringify([ev])); }catch(e){} }, event);

  const fileUrl = 'file:///' + FILE.replace(/\\/g,'/') + '?id=' + encodeURIComponent(event.id);
  try{
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });
  }catch(e){ console.error('goto error', e && e.message); }

  await new Promise(r => setTimeout(r, 1500));

  const imgs = await page.$$eval('img', arr => arr.map(i => ({ id: i.id||null, src: i.src||null, visible: !!(i.offsetWidth||i.offsetHeight) } )));
  const cloud = imgs.some(i => i.src && i.src.includes('res.cloudinary.com'));

  console.log(JSON.stringify({ file: fileUrl, imgs: imgs.slice(0,20), cloud }, null, 2));

  await browser.close();
})();
