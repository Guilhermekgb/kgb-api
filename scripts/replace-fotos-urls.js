#!/usr/bin/env node
/**
 * replace-fotos-urls.js
 * Simple codemod that reads `data/fotos-clientes-cloud-ready.json` (mapping key->cloud-url)
 * and replaces matching local references in HTML/JS files with the cloud URL.
 * - Does a dry-run by default; pass `--apply` to write files.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAPPING = path.join(ROOT, 'data', 'fotos-clientes-cloud-ready.json');
const APPLY = process.argv.includes('--apply');

if (!fs.existsSync(MAPPING)) { console.error('Mapping not found:', MAPPING); process.exit(2); }
const map = JSON.parse(fs.readFileSync(MAPPING,'utf8'));
const flat = map; // already flat by upload script output

function walkFiles(dir, exts = ['.html','.js']){
  const out = [];
  for (const name of fs.readdirSync(dir)){
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walkFiles(full, exts));
    else if (exts.includes(path.extname(name))) out.push(full);
  }
  return out;
}

const files = walkFiles(ROOT);
let totalChanges = 0;
for (const f of files){
  let txt = fs.readFileSync(f,'utf8');
  let changed = false;
  for (const key of Object.keys(flat)){
    const cloud = flat[key];
    // match occurrences of the key as filename or attribute value; conservative: match key or key without folders
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re = new RegExp(esc, 'g');
    if (re.test(txt) && txt.indexOf(cloud) === -1){
      txt = txt.replace(re, cloud);
      changed = true;
    }
  }
  if (changed){
    totalChanges++;
    console.log('[DRY] would update', f);
    if (APPLY){
      fs.writeFileSync(f, txt, 'utf8');
      console.log('  applied');
    }
  }
}

console.log('Done. Files changed:', totalChanges, APPLY ? '(applied)' : '(dry-run)');
