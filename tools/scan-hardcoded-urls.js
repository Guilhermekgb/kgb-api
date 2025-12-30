const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORES = ['node_modules', 'tools', 'kgb-api', 'reports', 'tests', 'public', 'headless-local-output.json', 'kgb-api\\reports', '.git'];
const TARGETS = ['onrender.com', 'http://localhost:3333', 'http://127.0.0.1:3333'];
const EXT = ['.html', '.js'];

function shouldIgnore(p) {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  for (const ig of IGNORES) if (rel.startsWith(ig)) return true;
  return false;
}

function walk(dir, cb) {
  const items = fs.readdirSync(dir);
  for (const it of items) {
    const full = path.join(dir, it);
    const stat = fs.statSync(full);
    if (shouldIgnore(full)) continue;
    if (stat.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

const results = [];
walk(ROOT, (file) => {
  const ext = path.extname(file).toLowerCase();
  if (!EXT.includes(ext)) return;
  let s = '';
  try { s = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
  TARGETS.forEach(t => {
    let idx = s.indexOf(t);
    while (idx !== -1) {
      const lines = s.slice(0, idx).split(/\\r?\\n/);
      const lineNo = lines.length;
      const snippet = lines[lines.length-1].trim();
      results.push({file: path.relative(ROOT, file), target: t, line: lineNo, snippet});
      idx = s.indexOf(t, idx+1);
    }
  });
});

if (results.length===0) {
  console.log('OK - no hardcoded targets found');
  process.exit(0);
}

console.log('Found', results.length, 'matches:');
results.forEach(r => console.log(`${r.file}:${r.line} -> ${r.target} -> ${r.snippet}`));
process.exit(1);
