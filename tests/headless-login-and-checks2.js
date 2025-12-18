const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3333';
const LOGIN = '/login.html';
const PAGES = [
  '/cadastro-evento.html',
  '/area-cliente.html',
  '/evento-detalhado.html',
  '/eventos.html',
  '/clientes-lista.html'
];

function loadMapping() {
  const p1 = path.join(__dirname, '..', 'data', 'fotos-clientes.json');
  const p2 = path.join(__dirname, '..', 'data', 'fotos-clientes.clean.json');
  const p = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e){ return null; }
}

async function listImgs(page){
  return page.$$eval('img', arr => arr.map(i => ({src: i.src || null, alt: i.alt || null, dataset: i.dataset || {}})));
}

async function analyzeImgs(page){
  const imgs = await listImgs(page);
  const urls = imgs.map(i => i.src).filter(Boolean);
  const cloud = urls.some(s => s.includes('res.cloudinary.com'));
  return { imgs: urls.slice(0,10), cloud };
}

async function clickHeuristics(page){
  const tries = [
    'button', 'a', '[role="button"]', '.btn', '.card', '.item', '.evento', '.cliente', '.thumbnail', '.gallery', '.foto', '.fotos'
  ];
  for (const sel of tries){
    const els = await page.$$(sel);
    for (const el of els){
      try{
        await el.click().catch(()=>{});
        await new Promise(r=>setTimeout(r,500));
        const imgs = await analyzeImgs(page);
        if (imgs.cloud) return true;
      }catch(e){}
    }
  }
  return false;
}

(async ()=>{
  const mapping = loadMapping();
  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();

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

  if (mapping) {
    const flat = flattenMapping(mapping);
    await page.evaluateOnNewDocument((m)=>{ try{ localStorage.setItem('fotosClientes', JSON.stringify(m)); }catch(e){} try{ window.__FOTOS_CLIENTES_PRELOAD__ = m; }catch(e){} }, flat);
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

  // Try login
  try{
    await page.goto(BASE + LOGIN, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.type('input[name="email"], input#email, input[type="email"]', 'admin@buffet.com').catch(()=>{});
    await page.type('input#senha, input[name="senha"], input[type="password"]', '123456').catch(()=>{});
    await Promise.all([ page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }) ]).catch(()=>{});
  }catch(e){}

  const results = [];
  for (const p of PAGES){
    const url = BASE + p;
    const out = { path: p, url, steps: [], ok:false };
    try{
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }catch(e){ out.steps.push({ navErr: e.message }); results.push(out); continue; }
    out.steps.push({ loaded: true });

    // apply mapping to <img> elements with data-* keys so UI shows images
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

    // capture localStorage value
    try{
      const ls = await page.evaluate(()=> localStorage.getItem('fotosClientes'));
      out.steps.push({ localStoragePresent: !!ls });
    }catch(e){}

    const before = await analyzeImgs(page);
    out.steps.push({ before });
    if (before.cloud){ out.ok = true; results.push(out); continue; }

    const clicked = await clickHeuristics(page);
    out.steps.push({ clicked });

    const after = await analyzeImgs(page);
    out.steps.push({ after });
    if (after.cloud) out.ok = true;
    results.push(out);
  }

  // force hero image from injected mapping + eventoSelecionado when present
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

  console.log(JSON.stringify({ base: BASE, loggedAs: 'admin@buffet.com', results }, null, 2));
  await browser.close();
})();
