const puppeteer = require('puppeteer');
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
  const p = path.join(__dirname, '..', 'data', 'fotos-clientes.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e){ return null; }
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
      await page.evaluate((m)=>{ try{ (typeof window.setFotosMap==='function' ? window.setFotosMap(m) : localStorage.setItem('fotosClientes', JSON.stringify(m))); }catch(e){} }, mapping);
    }
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  }catch(e){ out.steps.push({ type:'navigation-error', msg: e.message }); return out; }
  out.steps.push({ type: 'loaded' });

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
  return out;
}

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
  const p = path.join(__dirname, '..', 'data', 'fotos-clientes.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e){ return null; }
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
      await page.evaluate((m)=>{ try{ (typeof window.setFotosMap==='function' ? window.setFotosMap(m) : localStorage.setItem('fotosClientes', JSON.stringify(m))); }catch(e){} }, mapping);
    }
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  }catch(e){ out.steps.push({ type:'navigation-error', msg: e.message }); return out; }
  out.steps.push({ type: 'loaded' });

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
  return out;
}

(async ()=>{
  const mapping = loadMapping();
  let browser;
  try{
    browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
    const page = await browser.newPage();

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
            return false;
          }

          async function checkPage(page, path, mapping){
            const url = BASE + path;
            const out = { path, url, steps: [], ok:false };
            try{
              if (mapping){
                await page.evaluate((m)=>{ try{ (typeof window.setFotosMap==='function' ? window.setFotosMap(m) : localStorage.setItem('fotosClientes', JSON.stringify(m))); }catch(e){} }, mapping);
              }
              await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            }catch(e){ out.steps.push({ type:'navigation-error', msg: e.message }); return out; }
            out.steps.push({ type: 'loaded' });

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
            return out;
          }

          (async ()=>{
            const mapping = loadMapping();
            const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
            const page = await browser.newPage();

            // Login
            try{
              await page.goto(BASE + LOGIN, { waitUntil: 'networkidle2', timeout: 30000 });
              await page.type('input[name="email"], input#email, input[type="email"]', 'admin@buffet.com').catch(()=>{});
              await page.type('input#senha, input[name="senha"], input[type="password"]', '123456').catch(()=>{});
              await Promise.all([ page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }) ]).catch(()=>{});
            }catch(e){ /* continue even if login fails */ }

            const results = [];
            for (const p of PAGES){
              const r = await checkPage(page, p, mapping);
              results.push(r);
            }

            await browser.close();
            console.log(JSON.stringify({ base: BASE, loggedAs: 'admin@buffet.com', results }, null, 2));
            process.exit(0);
          })();
  }catch(e){ /* continue even if login fails */ }
