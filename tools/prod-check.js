#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_MD = path.join(__dirname, 'relatorio-prod-netlify.md');
const OUTPUT_JSON = path.join(__dirname, 'relatorio-prod-netlify.json');
const BASE = 'https://kgbprobuffet.netlify.app/';
const PAGE = 'cliente-detalhado.html';

function timestamp(){ return new Date().toISOString(); }

async function waitForNetworkIdle(page, timeout = 120000, idleTime = 500){
  return new Promise((resolve, reject) => {
    let inflight = 0;
    let idleTimer = null;
    let finished = false;
    const onRequest = () => { inflight++; if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };
    const onRequestDone = () => {
      inflight = Math.max(0, inflight - 1);
      if (inflight === 0) {
        idleTimer = setTimeout(() => {
          if (!finished) { finished = true; cleanup(); resolve(); }
        }, idleTime);
      }
    };

    function cleanup(){
      page.removeListener('request', onRequest);
      page.removeListener('requestfinished', onRequestDone);
      page.removeListener('requestfailed', onRequestDone);
    }

    page.on('request', onRequest);
    page.on('requestfinished', onRequestDone);
    page.on('requestfailed', onRequestDone);

    // fallback timeout
    const to = setTimeout(() => {
      if (!finished) { finished = true; cleanup(); reject(new Error('network idle timeout')); }
    }, timeout);
  });
}

(async function main(){
  const fullPath = path.join(ROOT, PAGE);
  if (!fs.existsSync(fullPath)) {
    console.error('[prod-check-cliente] arquivo não encontrado:', PAGE);
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // inject global error handlers before any page script runs
  try{
    await page.evaluateOnNewDocument(() => {
      window.addEventListener('error', function(e){
        try{
          const info = { message: String(e && e.message), filename: String(e && e.filename), lineno: e && e.lineno, colno: e && e.colno, stack: (e && e.error && e.error.stack) ? String(e.error.stack) : null };
          try{ console.error('[window.error]', JSON.stringify(info)); }catch(e){}
        }catch(e){}
      });
      window.addEventListener('unhandledrejection', function(ev){
        try{
          const r = ev && ev.reason ? ev.reason : ev;
          const info = { message: String(r && r.message ? r.message : String(r)), stack: (r && r.stack) ? String(r.stack) : null };
          try{ console.error('[unhandledrejection]', JSON.stringify(info)); }catch(e){}
        }catch(e){}
      });
    });
  }catch(e){}

  const report = { page: PAGE, url: BASE + PAGE, timestamp: timestamp(), consoleErrors: [], consoleWarns: [], pageErrors: [], requests: [] };

  // keep last 30 requests
  // keep last 40 requests (diagnóstico mais profundo)
  const lastRequests = [];
  const maxKeep = 40;

  page.on('console', msg => {
    try{
      const t = msg.type();
      const text = msg.text();
      const loc = (msg.location && typeof msg.location === 'function') ? msg.location() : (msg.location || {});
      const entry = { time: timestamp(), text, location: loc };
      if (t === 'error') report.consoleErrors.push(entry);
      if (t === 'warning') report.consoleWarns.push(entry);
    }catch(e){}
  });

  page.on('pageerror', err => {
    try{
      report.pageErrors.push({ time: timestamp(), message: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : '') });
    }catch(e){}
  });

  page.on('response', async res => {
    try{
      const url = res.url();
      const status = res.status();
      const entry = { time: timestamp(), url, status };
      lastRequests.push(entry);
      if (lastRequests.length > maxKeep) lastRequests.shift();
      report.requests.push(entry);
    }catch(e){}
  });

  page.on('requestfailed', req => {
    try{
      const entry = { time: timestamp(), url: req.url(), status: 'FAILED', error: (req.failure() && req.failure().errorText) || null };
      lastRequests.push(entry);
      if (lastRequests.length > maxKeep) lastRequests.shift();
      report.requests.push(entry);
    }catch(e){}
  });

  // try login token to populate localStorage before scripts run (reuse previous approach)
  try{
    const loginResp = await fetch('https://kgb-api-v2.onrender.com/auth/login', {
      method: 'POST', headers: { 'content-type':'application/json' },
      body: JSON.stringify({ email: 'admin@kgb.com', senha: '123' })
    }).catch(()=>null);
    if (loginResp) {
      const j = await loginResp.json().catch(()=>null);
      const token = j && (j.token || j.access_token || j.jwt || (j.data && j.data.token));
      const user = j && (j.data || j.user || null);
      if (token) {
        try{ await page.evaluateOnNewDocument((t,u)=>{ try{ localStorage.setItem('KGB_TOKEN', t); }catch{}; try{ if (u) localStorage.setItem('KGB_USER', typeof u === 'string' ? u : JSON.stringify(u)); }catch{} }, token, user ? JSON.stringify(user) : null); }catch(e){}
      }
    }
  }catch(e){}

  const url = BASE + PAGE;
  let opened = false;

  try{
    // first try to get DOMContentLoaded quickly
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    opened = true;
    // short wait to let synchronous onload handlers run
    await page.waitForTimeout(3000);
    // then wait for network to settle (up to 120s)
    try{
      await waitForNetworkIdle(page, 120000, 800);
    }catch(e){
      // network idle timeout - continue to collect what we have
      report.note = 'waitForNetworkIdle timeout';
    }
  }catch(err){
    report.gotoError = String(err && err.message ? err.message : err);
  }

  // snapshot last 30 requests
  report.lastRequests = lastRequests.slice(-maxKeep);

  // write outputs
  const md = [];
  md.push('# Relatório — cliente-detalhado diagnóstico');
  md.push(`> Gerado em: ${new Date().toISOString()}`);
  md.push('');
  md.push(`- URL: ${report.url}`);
  md.push(`- Abriu OK?: ${opened ? 'sim' : 'não'}`);
  if (report.gotoError) md.push(`  - Erro ao abrir: \`${report.gotoError}\``);
  md.push('');
  md.push('## Console Errors');
  if (report.consoleErrors.length) report.consoleErrors.forEach(e => md.push(`- [${e.time}] ${e.text}`)); else md.push('- nenhum');
  md.push('');
  md.push('## Console Warnings');
  if (report.consoleWarns.length) report.consoleWarns.forEach(e => md.push(`- [${e.time}] ${e.text}`)); else md.push('- nenhum');
  md.push('');
  md.push('## Exceções não capturadas (pageerror)');
  if (report.pageErrors.length) report.pageErrors.forEach(e => md.push(`- [${e.time}] ${e.message}`)); else md.push('- nenhuma');
  md.push('');
  md.push('## Últimas requisições (até 30)');
  if (report.lastRequests.length) report.lastRequests.forEach(r => md.push(`- [${r.time}] ${r.status} ${r.url}${r.error ? ' — ' + r.error : ''}`)); else md.push('- nenhuma');
  md.push('');
  if (report.note) md.push(`> Nota: ${report.note}`);

  fs.writeFileSync(OUTPUT_MD, md.join('\n'), 'utf8');
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  console.log('[prod-check-cliente] relatório gravado em', OUTPUT_MD);
  console.log('[prod-check-cliente] dados brutos gravados em', OUTPUT_JSON);

  await page.close();
  await browser.close();
  process.exit(0);
})();
