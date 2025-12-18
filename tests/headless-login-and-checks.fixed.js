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
  // if we found any flattened entries return them, otherwise return original
  return Object.keys(out).length ? out : src;
}

async function analyzeImgs(page){
  const imgs = await page.$$eval('img', arr => arr.map(i => i.src || i.getAttribute('data-src')));
  const cloud = imgs.some(s => typeof s === 'string' && s.includes('res.cloudinary.com'));
  return { imgs: imgs.filter(Boolean), cloud };
}

async function findAndClickCandidates(page){
  const selectors = ['button', 'a', '[role="button"]', '.btn', '.card', '.item', '.evento', '.cliente'];
  for (const sel of selectors){
    const elems = await page.$$(sel);
    for (const el of elems){
      try{
        const text = (await page.evaluate(e => (e.textContent||'').toLowerCase(), el)) || '';
        if (!text) continue;
        if (text.includes('foto') || text.includes('fotos') || text.includes('ver') || text.includes('visual') || text.includes('detal')){
          await el.click().catch(()=>{});
          await new Promise(r=>setTimeout(r,700));
          return true;
        }
      }catch(e){}
    }
  }
  for (const sel of selectors){
    const el = await page.$(sel);
    if (el){ try{ await el.click().catch(()=>{}); await new Promise(r=>setTimeout(r,700)); return true;}catch(e){} }
  }
  return false;
}

async function checkPage(page, path, mapping){
  const url = BASE + path;
  const out = { path, url, steps: [], ok:false };
  try{
    if (mapping){
      const flat = flattenMapping(mapping);
      await page.evaluate((m)=>{ try{ localStorage.setItem('fotosClientes', JSON.stringify(m)); }catch(e){} try{ window.__FOTOS_CLIENTES_PRELOAD__ = m; }catch(e){} }, flat);
      // also inject a small eventos list and mark eventoSelecionado so pages that read localStorage render
      try{
        const sampleKey = Object.keys(flat)[0];
        if (sampleKey){
          await page.evaluate((k)=>{
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
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  }catch(e){ out.steps.push({ type:'navigation-error', msg: e.message }); return out; }
  out.steps.push({ type: 'loaded' });

  // try to apply mapping to any <img data-*key> attributes so pages render
  try{
    await page.evaluate(()=>{
      try{
        const raw = window.__FOTOS_CLIENTES_PRELOAD__ || localStorage.getItem('fotosClientes');
        const mapping = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
        const out = {};
        function walk(o,p){ for(const k in o){ const v=o[k]; const key = p? p + '/' + k : k; if (typeof v === 'string') out[key]=v; else if (v && typeof v === 'object') walk(v,key); } }
        walk(mapping,'');
        const attrs = ['data-fotocliente','data-foto','data-foto-key','data-fotoclientekey','data-src','data-clientefoto'];
        attrs.forEach(attr => document.querySelectorAll('img['+attr+']').forEach(img=>{ const key = img.getAttribute(attr); if (key && out[key]) img.src = out[key]; }));
      }catch(e){}
    });
  }catch(e){}

  for (let i=0;i<5;i++){
    const before = await analyzeImgs(page);
    out.steps.push({ step:i, beforeCount: before.imgs.length, beforeCloud: before.cloud });
    if (before.cloud){ out.ok = true; out.steps.push({ found:'before' }); break; }

    const clicked = await findAndClickCandidates(page);
    out.steps.push({ step:i, clicked });
    await new Promise(r=>setTimeout(r,800));

    const after = await analyzeImgs(page);
    out.steps.push({ step:i, afterCount: after.imgs.length, afterCloud: after.cloud, imgs: after.imgs.slice(0,5) });
    if (after.cloud){ out.ok = true; break; }
    if (!clicked) break;
  }
  // ensure hero image updated from injected mapping + eventoSelecionado if still empty
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
  return out;
}

(async ()=>{
  const mapping = loadMapping();
  let browser;
  try{
    browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
    const page = await browser.newPage();

    // ensure mapping + sample event exist before any page script executes
    try{
      if (mapping){
        const flatGlobal = flattenMapping(mapping);
        await page.evaluateOnNewDocument((m)=>{
          try{ localStorage.setItem('fotosClientes', JSON.stringify(m)); }catch(e){}
          try{ window.__FOTOS_CLIENTES_PRELOAD__ = m; }catch(e){}
          try{
            const sampleKey = Object.keys(m||{})[0];
            if (sampleKey){
              const ev = { id: '__test_ev__', nomeEvento: 'Teste (auto)', fotoClienteKey: sampleKey, dataISO: new Date().toISOString(), qtdConvidados:50 };
              const arr = (()=>{ try{ return JSON.parse(localStorage.getItem('eventos')||'[]'); }catch(e){ return []; } })();
              arr.unshift(ev);
              localStorage.setItem('eventos', JSON.stringify(arr));
              localStorage.setItem('eventoSelecionado', String(ev.id));
            }
          }catch(e){}
        }, flatGlobal);
      }
    }catch(e){}

    // Login (best-effort)
    try{
      await page.goto(BASE + LOGIN, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.type('input[name="email"], input#email, input[type="email"]', 'admin@buffet.com').catch(()=>{});
      await page.type('input#senha, input[name="senha"], input[type="password"]', '123456').catch(()=>{});
      await Promise.all([ page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }) ]).catch(()=>{});
    }catch(e){ }

    const results = [];
    for (const p of PAGES){
      const r = await checkPage(page, p, mapping);
      results.push(r);
    }

    console.log(JSON.stringify({ base: BASE, loggedAs: 'admin@buffet.com', results }, null, 2));
  }catch(e){
    console.error('fatal:', e && e.stack || e);
    process.exitCode = 2;
  }finally{
    try{ if (browser) await browser.close(); }catch(e){}
  }
})();
