#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_MD = path.join(__dirname, 'relatorio-prod.md');
const OUTPUT_TXT = path.join(__dirname, 'relatorio-prod.txt');
const BASE = 'http://127.0.0.1:5500/';

const PAGES = [
  'orcamento.html',
  'orcamento-detalhado.html',
  'funil-leads.html',
  'cadastro-cliente.html',
  'cliente-detalhado.html'
];

function timestamp(){ return new Date().toISOString(); }

async function tryLogin(){
  try{
    const resp = await fetch('https://kgb-api.onrender.com/auth/login', {
      method: 'POST', headers: { 'content-type':'application/json' },
      body: JSON.stringify({ email: 'admin@kgb.com', senha: '123' })
    });
    const j = await resp.json();
    const token = j && (j.token || j.access_token || j.jwt || (j.data && j.data.token));
    const user = j && (j.data || j.user || null);
    console.log('[prod-check] login token:', !!token);
    return { token, user };
  }catch(e){
    console.warn('[prod-check] login falhou:', e && e.message ? e.message : e);
    return { token: null, user: null };
  }
}

(async function main(){
  const pagesToTest = PAGES.filter(p => {
    const full = path.join(ROOT, p);
    if (!fs.existsSync(full)) return false;
    return true;
  });

  const missing = PAGES.filter(p => !pagesToTest.includes(p));
  if (missing.length) console.log('[prod-check] páginas faltando, serão ignoradas:', missing.join(', '));

  const login = await tryLogin();

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [];

  for (const p of pagesToTest){
    const url = BASE + p;
    const page = await browser.newPage();

    if (login.token){
      try{
        await page.evaluateOnNewDocument((t,u)=>{
          try{ localStorage.setItem('KGB_TOKEN', t); }catch{};
          try{ if (u) localStorage.setItem('KGB_USER', typeof u === 'string' ? u : JSON.stringify(u)); }catch{};
        }, login.token, login.user ? JSON.stringify(login.user) : null);
      }catch(e){ console.warn('[prod-check] evaluateOnNewDocument failed', e); }
    }

    const r = { page: p, url, opened: false, gotoError: null, consoleErrors: [], pageErrors: [], requests: [], renderCalls: new Set(), badResponses: [], localStorageUsage: false };

    page.on('console', msg => {
      try{
        if (msg.type() === 'error') r.consoleErrors.push({ time: timestamp(), text: msg.text() });
      }catch(e){}
    });
    page.on('pageerror', err => r.pageErrors.push({ time: timestamp(), message: String(err && err.stack ? err.stack : err) }));

    page.on('response', async res => {
      try{
        const url = res.url();
        const status = res.status();
        r.requests.push({ time: timestamp(), url, status });
        if (url.includes('kgb-api.onrender.com')){
          // store full path
          try{ r.renderCalls.add(new URL(url).pathname || url); }catch{ r.renderCalls.add(url); }
        }
        if (status >= 400) r.badResponses.push({ time: timestamp(), url, status });

        // check script bodies for localStorage usage
        const req = res.request();
        if (req.resourceType && req.resourceType() === 'script'){
          try{
            const text = await res.text();
            if (text && text.includes('localStorage.')) r.localStorageUsage = true;
          }catch(e){}
        }
      }catch(e){}
    });

    try{
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      r.opened = true;
    }catch(err){
      r.gotoError = String(err && err.message ? err.message : err);
    }

    await page.waitForTimeout(1200);

    try{ await page.close(); }catch(e){}
    results.push(r);
    console.log(`[prod-check] ${p} -> opened:${r.opened} errors:${r.consoleErrors.length} pageErrors:${r.pageErrors.length} requests:${r.requests.length} renderCalls:${r.renderCalls.size} bad:${r.badResponses.length} localStorage:${r.localStorageUsage}`);
  }

  await browser.close();

  // build markdown
  const md = [];
  md.push('# Relatório PROD — Checagem de telas críticas');
  md.push(`> Gerado em: ${new Date().toISOString()}`);
  md.push('');
  md.push('## Resumo');
  md.push(`- Páginas pretendidas: ${PAGES.length}`);
  md.push(`- Páginas testadas: ${results.length}`);
  md.push('');

  for (const r of results){
    md.push('\n---\n');
    md.push(`### ${r.page}`);
    md.push(`- URL: ${r.url}`);
    md.push(`- Abriu OK?: ${r.opened ? 'sim' : 'não'}`);
    if (r.gotoError) md.push(`  - Erro ao abrir: \`${r.gotoError}\``);
    md.push(`- Chamou API Render?: ${r.renderCalls.size ? 'sim' : 'não'}`);
    if (r.renderCalls.size){
      md.push('  - Rotas chamadas:');
      for (const route of Array.from(r.renderCalls)) md.push(`    - ${route}`);
    }
    md.push(`- Teve status 4xx/5xx?: ${r.badResponses.length ? 'sim' : 'não'}`);
    if (r.badResponses.length){
      md.push('  - Respostas >= 400:');
      for (const br of r.badResponses) md.push(`    - [${br.time}] ${br.status} ${br.url}`);
    }
    md.push(`- Teve uso de localStorage? (heurística): ${r.localStorageUsage ? 'sim' : 'não'}`);
    md.push('');
  }

  fs.writeFileSync(OUTPUT_MD, md.join('\n'), 'utf8');
  fs.writeFileSync(OUTPUT_TXT, JSON.stringify(results, null, 2), 'utf8');
  console.log('[prod-check] relatório gravado em', OUTPUT_MD);
  console.log('[prod-check] dados brutos gravados em', OUTPUT_TXT);

  // final console summary
  console.log('\n[prod-check] Resumo final:');
  console.log(`- páginas pretendidas: ${PAGES.length}`);
  console.log(`- testadas: ${results.length}`);
  const calledRender = results.filter(r => r.renderCalls.size).length;
  console.log(`- páginas que chamaram kgb-api.onrender.com: ${calledRender}`);
  const hadErrors = results.filter(r => r.consoleErrors.length || r.pageErrors.length || r.badResponses.length).length;
  console.log(`- páginas com problemas (errors/exceptions/4xx-5xx): ${hadErrors}`);

  process.exit(0);
})();
