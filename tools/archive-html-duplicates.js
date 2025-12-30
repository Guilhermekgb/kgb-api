const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '..');
const k = path.join(root, 'kgb-api');
function walk(dir, arr){
  for(const e of fs.readdirSync(dir)){
    const full = path.join(dir,e);
    if (fs.statSync(full).isDirectory()) { walk(full, arr); } else { arr.push(full); }
  }
}

const rootFiles = [];
walk(root, rootFiles);
const rootHtmlBasenames = new Set();
for(const f of rootFiles){
  if (!f.startsWith(k) && f.toLowerCase().endsWith('.html')) rootHtmlBasenames.add(path.basename(f).toLowerCase());
}

const arch = path.join(k, 'duplicates-archive');
if (!fs.existsSync(arch)) fs.mkdirSync(arch, { recursive: true });
let moved = 0;

function walkAndMove(dir){
  for(const e of fs.readdirSync(dir)){
    const full = path.join(dir,e);
    if (fs.statSync(full).isDirectory()){ walkAndMove(full); continue; }
    if (!full.toLowerCase().endsWith('.html')) continue;
    const base = path.basename(full).toLowerCase();
    if (rootHtmlBasenames.has(base)){
      const rel = path.relative(k, full);
      const dest = path.join(arch, rel);
      const destDir = path.dirname(dest);
      fs.mkdirSync(destDir, { recursive: true });
      try{
        fs.renameSync(full, dest);
        console.log('archived', rel);
        moved++;
      }catch(e){
        console.error('failed move', rel, e.message);
      }
    }
  }
}

walkAndMove(k);
console.log('Archived total', moved);
