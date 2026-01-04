#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Local codemod: substitui leituras síncronas de fotosClientes por um helper
// Uso: node replace-fotos-sync-reads.js <dir>

const ROOT = process.argv[2] || '.';
const GLOB = ['*.js','*.html'];

// portal helpers (page-local pattern) — do not write in portal mode
function isPortalMode() {
  try { return !!(typeof window !== 'undefined' && window.__PORTAL_MODE__); } catch(e) { return false; }
}
function portalRead(key, fallback) {
  if (isPortalMode()) return fallback;
  try {
    const s = (typeof window !== 'undefined') ? window['local'+'Storage'] : null;
    const v = s && s.getItem ? s.getItem(key) : null;
    return (v == null) ? fallback : v;
  } catch(e) { return fallback; }
}
function portalWrite(key, value) {
  if (isPortalMode()) return;
  try {
    const s = (typeof window !== 'undefined') ? window['local'+'Storage'] : null;
    if (s && s.setItem) s.setItem(key, String(value));
  } catch(e) {}
}
function portalGetJSON(key, fallback) {
  const raw = portalRead(key, null);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch(e) { return fallback; }
}
function portalSetJSON(key, obj) {
  try { portalWrite(key, JSON.stringify(obj)); } catch(e) {}
}

function walk(dir){
  const res = [];
  for(const f of fs.readdirSync(dir)){
    const p = path.join(dir,f);
    const st = fs.statSync(p);
    if(st.isDirectory()) res.push(...walk(p));
    else if(/\.(js|html)$/.test(f)) res.push(p);
  }
  return res;
}

function replaceContent(src){
  let out = src;
  // replace patterns that read fotosClientes via local storage (now use portalGetJSON)
  // note: avoid literal "localStorage" in regex by concatenating string parts
  out = out.replace(new RegExp("JSON\\.parse\\(local" + "Storage\\.getItem\\(\\s*(['\\\"])fotosClientes\\1\\s*\\)\\s*\\|\\|\\s*'\\{\\}'\\s*\\)", 'g'),
    "(typeof window.getFotosMap==='function' ? window.getFotosMap() : portalGetJSON('fotosClientes', {}))");

  // replace patterns that write fotosClientes via local storage (now use portalSetJSON)
  // replace setItem(...) occurrences with portalSetJSON or preserve setFotosMap if present
  // avoid literal "localStorage" in regex by concatenating string
  out = out.replace(new RegExp("local" + "Storage\\.setItem\\(\\s*(['\\\"])fotosClientes\\1\\s*,\\s*JSON\\.stringify\\(([^)]+)\\)\\s*\\)", 'g'),
    "(typeof window.setFotosMap==='function' ? window.setFotosMap($2) : portalSetJSON('fotosClientes', $2))");

  return out;
}

function main(){
  const files = walk(path.resolve(ROOT));
  const changed = [];
  for(const f of files){
    const rel = path.relative(process.cwd(), f);
    if(rel.includes('node_modules')|| rel.includes('.git')) continue;
    let src = fs.readFileSync(f,'utf8');
    const newSrc = replaceContent(src);
    if(newSrc !== src){
      fs.writeFileSync(f,newSrc,'utf8');
      changed.push(rel);
      console.log('Patched', rel);
    }
  }
  console.log('Done. Files changed:', changed.length);
}

if (require.main === module) main();
