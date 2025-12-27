#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORES = ['node_modules', '.git', 'backups', 'reports'];

function walk(dir){
  const out = [];
  for (const it of fs.readdirSync(dir, { withFileTypes: true })){
    const fp = path.join(dir, it.name);
    if (IGNORES.includes(it.name)) continue;
    if (it.isDirectory()) out.push(...walk(fp));
    else if (it.isFile() && /\.(js|html)$/i.test(it.name)) out.push(fp);
  }
  return out;
}

const pattern1 = /JSON\.parse\(localStorage\.getItem\(['"]fotosClientes['"]\)\s*\|\|\s*['"]{}['"]\)/g;
const pattern2 = /localStorage\.getItem\(['"]fotosClientes['"]\)/g;

const replacement = `(() => { try { if (typeof getFotosClientesSync === 'function') return JSON.stringify(getFotosClientesSync()); if (window.__FOTOS_CLIENTES_PRELOAD__) return JSON.stringify(window.__FOTOS_CLIENTES_PRELOAD__); if (typeof storageAdapter !== 'undefined' && storageAdapter.getRaw) { const raw = storageAdapter.getRaw('fotosClientes'); return raw && typeof raw === 'string' ? raw : JSON.stringify(raw || {}); } return '{}'; } catch { return '{}'; } })()`;

function backup(file){
  const bak = file + '.bak.' + Date.now();
  fs.copyFileSync(file, bak);
}

function processFile(file){
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;
  if (pattern1.test(src)){
    backup(file);
    src = src.replace(pattern1, replacement);
    changed = true;
  } else if (pattern2.test(src) && /JSON\.parse\(/.test(src)){
    backup(file);
    src = src.replace(pattern2, `(()=>{ try{ if(typeof getFotosClientesSync==='function') return JSON.stringify(getFotosClientesSync()); if(window.__FOTOS_CLIENTES_PRELOAD__) return JSON.stringify(window.__FOTOS_CLIENTES_PRELOAD__); if(window.storageAdapter && window.storageAdapter.getRaw) return window.storageAdapter.getRaw('fotosClientes'); return localStorage.getItem('fotosClientes'); }catch{return null;} })()`);
    changed = true;
  }
  if (changed){
    fs.writeFileSync(file, src, 'utf8');
    console.log('[fix] updated', file);
  }
}

function main(){
  const files = walk(ROOT);
  for (const f of files) processFile(f);
  console.log('[fix] done');
}

main();
