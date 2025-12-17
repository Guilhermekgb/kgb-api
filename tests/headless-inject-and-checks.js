const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3333';
const PAGES = [
  '/cadastro-evento.html',
  '/area-cliente.html',
  '/evento-detalhado.html'
];

function loadMapping() {
  const p = path.join(__dirname, '..', 'data', 'fotos-clientes.json');
  if (!fs.existsSync(p)) return null;
  try {
    const txt = fs.readFileSync(p, 'utf8').trim();
    // file may include JSON fences if previously saved that way; strip ```
    const cleaned = txt.replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('failed to read mapping:', e.message);
    return null;
  }
}

function flattenMapping(src){
  if (!src || typeof src !== 'object') return src;
  const out = {};
  function walk(obj, prefix){
    for (const k of Object.keys(obj||{})){
      const v = obj[k];
      const key = prefix ? (prefix + '/' + k) : k;
      if (typeof v === 'string') out[key] = v;
      else if (v && typeof v === 'object') walk(v, key);
    }
  }
  walk(src, '');
  return Object.keys(out).length ? out : src;
}

async function checkPage(page, path) {
  const url = BASE + path;
  const result = { path, url, ok: true, errors: [], imgs: [], fotosClientes: null };
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    result.ok = false;
    result.errors.push('navigation:' + e.message);
    return result;
  }

  try {
    await page.waitForSelector('body', { timeout: 5000 });
    const data = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src || i.getAttribute('data-src'));
      let fotos = null;
      try { fotos = localStorage.getItem('fotosClientes'); } catch(e) { fotos = '__ls_error__:' + e.message }
      return { imgs, fotos };
    });
    result.imgs = data.imgs.filter(Boolean);
    result.fotosClientes = data.fotos;

    if (data.fotos && data.fotos.indexOf('data:image') !== -1) {
      result.ok = false;
      result.errors.push('localStorage contains data:image base64 blobs');
    }
    if (data.fotos && data.fotos.length > 10000) {
      result.ok = false;
      result.errors.push('localStorage.fotosClientes seems very large');
    }

    const anyCloud = result.imgs.some(s => typeof s === 'string' && s.includes('res.cloudinary.com'));
    result.cloudinaryPresent = anyCloud;
  } catch (e) {
    result.ok = false;
    result.errors.push('evaluate:' + e.message);
  }

  return result;
}

(async () => {
  const mapping = loadMapping();
  if (!mapping) {
    console.warn('No mapping found at data/fotos-clientes.json — proceeding without injection');
  }

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  if (mapping) {
    // make the mapping available before any page scripts run
    const flat = flattenMapping(mapping);
    await page.evaluateOnNewDocument((m) => {
      try { localStorage.setItem('fotosClientes', JSON.stringify(m)); } catch (e) { /* ignore */ }
      try { window.__FOTOS_CLIENTES_PRELOAD__ = m; } catch (e) { }
    }, flat);
    try{
      const sampleKey = Object.keys(flat)[0];
      if (sampleKey){
        await page.evaluateOnNewDocument((k)=>{
          try{
            const ev = { id: '__test_ev__', nomeEvento: 'Teste (auto)', fotoClienteKey: k, dataISO: new Date().toISOString(), qtdConvidados: 50 };
            const arr = (()=>{ try{ return JSON.parse(localStorage.getItem('eventos')||'[]'); }catch(e){ return []; } })();
            arr.unshift(ev);
            localStorage.setItem('eventos', JSON.stringify(arr));
            localStorage.setItem('eventoSelecionado', String(ev.id));
          }catch(e){}
        }, sampleKey);
      }
    }catch(e){}
  }

  const results = [];
  for (const p of PAGES) {
    const r = await checkPage(page, p);
    // After checkPage navigation, try to force mapping onto images (for pages that use data- attributes)
    try{
      await page.evaluate(()=>{
        try{
          const raw = window.__FOTOS_CLIENTES_PRELOAD__ || localStorage.getItem('fotosClientes');
          const mapping = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
          const flat = {};
          function walk(o,p){ for(const k in o){ const v=o[k]; const key = p? p + '/' + k : k; if (typeof v === 'string') flat[key]=v; else if (v && typeof v === 'object') walk(v,key); } }
          walk(mapping,'');
          const attrs = ['data-fotocliente','data-foto','data-foto-key','data-fotoclientekey','data-src','data-clientefoto'];
          attrs.forEach(attr => document.querySelectorAll('img['+attr+']').forEach(img=>{ const key = img.getAttribute(attr); if (key && flat[key]) img.src = flat[key]; }));
        }catch(e){}
      });
    }catch(e){}
    results.push(r);
  }
  // after running checks, ensure hero image updated from mapping + evento if present
  try{
    await page.evaluate(()=>{
      try{
        const raw = window.__FOTOS_CLIENTES_PRELOAD__ || localStorage.getItem('fotosClientes');
        const mapping = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
        const evs = JSON.parse(localStorage.getItem('eventos')||'[]');
        const sel = localStorage.getItem('eventoSelecionado');
        const ev = evs.find(x=>String(x.id)===String(sel)) || evs[0] || {};
        const key = ev && ev.fotoClienteKey;
        if (key && mapping && mapping[key]){
          const el = document.getElementById('fotoCliente');
          if (el) el.src = mapping[key];
        }
      }catch(e){}
    });
  }catch(e){}
  await browser.close();

  console.log(JSON.stringify({ base: BASE, injected: !!mapping, results }, null, 2));
  const anyFail = results.some(r => !r.ok);
  process.exit(anyFail ? 2 : 0);
})();
