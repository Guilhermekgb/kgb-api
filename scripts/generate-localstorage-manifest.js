#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Caminho base do repositório (assume que o script está em kgb-api/scripts)
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, '..', 'reports');
const outFile = path.join(outDir, 'localstorage-uses.json');

const exts = ['.js', '.mjs', '.html', '.css', '.ts', '.jsx', '.tsx'];

function walk(dir, filelist = []){
  const files = fs.readdirSync(dir);
  for (const f of files){
    const full = path.join(dir, f);
    try{
      const st = fs.statSync(full);
      if (st.isDirectory()){
        // ignore node_modules, .git, and data folders
        if (f === 'node_modules' || f === '.git' || f === 'data') continue;
        walk(full, filelist);
      } else if (st.isFile()){
        if (exts.includes(path.extname(f).toLowerCase())) filelist.push(full);
      }
    } catch(e){ /* ignore permission errors */ }
  }
  return filelist;
}

function scanFile(filePath){
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/);
  const matches = [];
  const re = /(?:localStorage|sessionStorage)\b/g;
  for (let i = 0; i < lines.length; i++){
    const line = lines[i];
    let m;
    while ((m = re.exec(line)) !== null){
      const col = m.index + 1;
      const snippet = line.trim();
      matches.push({ file: path.relative(repoRoot, filePath).replace(/\\/g,'/'), line: i+1, column: col, snippet });
    }
  }
  return matches;
}

function main(){
  console.log('Scanning for localStorage/sessionStorage uses...');
  const files = walk(repoRoot);
  const results = [];
  for (const f of files){
    try{
      const m = scanFile(f);
      if (m.length) results.push(...m);
    } catch(e){ console.warn('Failed to scan', f, e.message); }
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const payload = { generatedAt: new Date().toISOString(), repoRoot: repoRoot, count: results.length, results };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log('Wrote', outFile, 'with', results.length, 'matches');
}

if (require.main === module) main();
