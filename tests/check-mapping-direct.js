const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
    await page.evaluateOnNewDocument((m)=>{ try{ window.__FOTOS_CLIENTES_PRELOAD__ = m; }catch(e){} }, mapping);
  }

  await page.goto('about:blank');
  const result = await page.evaluate(() => {
    try{
      const map = window.__FOTOS_CLIENTES_PRELOAD__ || null;
      if (!map) return { ok:false, reason: 'no-mapping' };
      // find first string URL value inside the mapping (possibly nested)
      function findUrl(obj){
        if (!obj) return null;
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'object'){
          for (const k of Object.keys(obj)){
            const v = obj[k];
            const found = findUrl(v);
            if (found) return found;
          }
        }
        return null;
      }
      const url = findUrl(map);
      if (!url) return { ok:false, reason:'no-string-url' };
      const img = document.createElement('img');
      img.id = 'diag-img';
      img.src = url;
      document.body.appendChild(img);
      return { ok:true, src: img.src, includesCloud: String(img.src).includes('res.cloudinary.com') };
    }catch(e){ return { ok:false, err: String(e) }; }
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
