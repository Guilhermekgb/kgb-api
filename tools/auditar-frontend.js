#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(__dirname, 'relatorio-auditoria-frontend.md');

function walk(dir, acc = []){
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries){
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (e.isDirectory()){
      if (['node_modules', '.git', 'kgb-api', 'tools'].includes(e.name)) continue;
      walk(full, acc);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.html')){
      acc.push(rel.replace(/\\/g, '/'));
    }
  }
  return acc;
}

function timestamp(){ return new Date().toISOString(); }

async function audit(){
  const pages = walk(ROOT).sort();
  // Attempt to authenticate once and reuse token for all pages (auditoria logada)
  let AUTO_TOKEN = null;
  let AUTO_USER = null;
  try {
    const loginResp = await fetch('https://kgb-api.onrender.com/auth/login', {
      method: 'POST', headers: { 'content-type':'application/json' },
      body: JSON.stringify({ email: 'admin@kgb.com', senha: '123' })
    });
    try {
      const j = await loginResp.json();
      AUTO_TOKEN = j && (j.token || j.access_token || j.jwt || (j.data && j.data.token));
      AUTO_USER = j && (j.data || j.user || null);
      console.log('[auditar] token obtido:', !!AUTO_TOKEN);
    } catch(e){ console.warn('[auditar] falha ao parsear login:', e); }
  } catch(e){ console.warn('[auditar] falha no login automático:', e); }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [];

  for (const p of pages){
    const url = `http://127.0.0.1:5500/${p}`;
    const page = await browser.newPage();
    // If we have a token, inject it into localStorage before any script runs
    if (AUTO_TOKEN) {
      try{
        await page.evaluateOnNewDocument((t,u)=>{
          try{ localStorage.setItem('KGB_TOKEN', t); }catch{};
          try{ if (u) localStorage.setItem('KGB_USER', typeof u === 'string' ? u : JSON.stringify(u)); }catch{};
        }, AUTO_TOKEN, AUTO_USER ? JSON.stringify(AUTO_USER) : null);
      }catch(e){ console.warn('[auditar] falha evaluateOnNewDocument:', e); }
    }
    const pageResult = { path: p, url, errors: [], warnings: [], exceptions: [], requestsFailed: [], badResponses: [], gotoError: null };

    page.on('console', msg => {
      try{
        const type = msg.type();
        const text = msg.text();
        if (type === 'error') pageResult.errors.push({ time: timestamp(), text });
        if (type === 'warning') pageResult.warnings.push({ time: timestamp(), text });
      }catch(e){}
    });

    page.on('pageerror', err => {
      pageResult.exceptions.push({ time: timestamp(), message: String(err && err.stack ? err.stack : err) });
    });

    page.on('requestfailed', req => {
      try{
        const failure = req.failure() || {};
        pageResult.requestsFailed.push({ time: timestamp(), url: req.url(), method: req.method(), errorText: failure.errorText || String(failure) });
      }catch(e){}
    });

    page.on('response', res => {
      try{
        const status = res.status();
        if (status >= 400) {
          pageResult.badResponses.push({ time: timestamp(), url: res.url(), status, statusText: res.statusText() });
        }
      }catch(e){}
    });

    try{
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }catch(err){
      pageResult.gotoError = String(err && err.message ? err.message : err);
    }

    // allow any post-load activity to run
    await page.waitForTimeout(1000);

    try{ await page.close(); }catch{}
    results.push(pageResult);
    console.log(`[auditar] ${p} -> errors:${pageResult.errors.length} warnings:${pageResult.warnings.length} exceptions:${pageResult.exceptions.length} reqFailed:${pageResult.requestsFailed.length} badResp:${pageResult.badResponses.length}`);
  }

  await browser.close();

  // build markdown
  const lines = [];
  lines.push(`# Relatório de Auditoria Frontend`);
  lines.push(`\n> Gerado em: ${new Date().toISOString()}\n> Comando: node tools/auditar-frontend.js\n`);
  lines.push(`## Resumo`);
  lines.push(`- Páginas testadas: ${results.length}`);
  lines.push(`- Base URL: http://127.0.0.1:5500/`);

  for (const r of results){
    lines.push(`\n---\n`);
    lines.push(`### ${r.path}`);
    lines.push(`URL: ${r.url}`);
    if (r.gotoError) lines.push(`- Erro ao abrir: \`${r.gotoError}\``);
    lines.push(`- console.error: ${r.errors.length}`);
    lines.push(`- console.warn: ${r.warnings.length}`);
    lines.push(`- exceções JS (uncaught): ${r.exceptions.length}`);
    lines.push(`- requests falhados: ${r.requestsFailed.length}`);
    lines.push(`- respostas com status >= 400: ${r.badResponses.length}`);

    if (r.errors.length){
      lines.push('\n**console.error**');
      for (const e of r.errors) lines.push(`- [${e.time}] ${e.text}`);
    }
    if (r.warnings.length){
      lines.push('\n**console.warn**');
      for (const w of r.warnings) lines.push(`- [${w.time}] ${w.text}`);
    }
    if (r.exceptions.length){
      lines.push('\n**Exceções JS**');
      for (const ex of r.exceptions) lines.push(`- [${ex.time}] ${ex.message}`);
    }
    if (r.requestsFailed.length){
      lines.push('\n**Requests falhados**');
      for (const rf of r.requestsFailed) lines.push(`- [${rf.time}] ${rf.method} ${rf.url} — ${rf.errorText}`);
    }
    if (r.badResponses.length){
      lines.push('\n**Respostas HTTP >= 400**');
      for (const br of r.badResponses) lines.push(`- [${br.time}] ${br.status} ${br.url} — ${br.statusText}`);
    }
  }

  fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
  console.log(`[auditar] relatório gravado em ${OUTPUT}`);
}

audit().catch(err => {
  console.error('Erro na auditoria:', err);
  process.exit(1);
});
