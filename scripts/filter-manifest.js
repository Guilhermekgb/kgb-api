#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const reportsDir = path.join(__dirname, '..', 'reports');
const manifestFile = path.join(reportsDir, 'localstorage-uses.json');
const outDir = path.join(reportsDir, 'filters');

if (!fs.existsSync(manifestFile)){
  console.error('Manifest not found:', manifestFile);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const keywords = process.argv.slice(2);
if (!keywords.length) keywords.push('clientes','token','eventos','API_BASE','fotosClientes');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function writeFilter(kw, items){
  const safe = kw.replace(/[^a-z0-9\-]/gi, '_');
  const out = {
    keyword: kw,
    count: items.length,
    sample: items.slice(0,50),
  };
  fs.writeFileSync(path.join(outDir, `${safe}.json`), JSON.stringify(out, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, `${safe}.md`), `# Filter: ${kw}\n\nMatches: ${items.length}\n\nFirst 50 entries:\n\n` + items.slice(0,50).map(r=>`- ${r.file}:${r.line} — ${r.snippet}`).join('\n'), 'utf8');
}

for (const kw of keywords){
  const lower = kw.toLowerCase();
  const matches = manifest.results.filter(r => {
    return r.snippet.toLowerCase().includes(lower) || r.file.toLowerCase().includes(lower);
  });
  writeFilter(kw, matches);
  console.log('Wrote filter for', kw, matches.length);
}

console.log('Filters written to', outDir);
