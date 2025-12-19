#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Local codemod: substitui leituras síncronas de fotosClientes por um helper
// Uso: node replace-fotos-sync-reads.js <dir>

const ROOT = process.argv[2] || '.';
const GLOB = ['*.js','*.html'];

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
  // replace JSON.parse(localStorage.getItem('fotosClientes') || '{}') patterns
  out = out.replace(/JSON\.parse\(localStorage\.getItem\(\s*(['\"])fotosClientes\1\s*\)\s*\|\|\s*'\{\}'\s*\)/g,
    "(typeof window.getFotosMap==='function' ? window.getFotosMap() : (function(){try{ return JSON.parse(localStorage.getItem('fotosClientes')||'{}'); }catch(e){return {};}})())");

  // replace localStorage.setItem('fotosClientes', JSON.stringify(map)) with helper
  out = out.replace(/localStorage\.setItem\(\s*(['\"])fotosClientes\1\s*,\s*JSON\.stringify\(([^)]+)\)\s*\)/g,
    "(typeof window.setFotosMap==='function' ? window.setFotosMap($2) : localStorage.setItem('fotosClientes', JSON.stringify($2)))");

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
