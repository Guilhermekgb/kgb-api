const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', 'reports', '.git', 'kgb-api/duplicates-archive'];

function shouldExclude(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  return EXCLUDE_DIRS.some(d => rel.startsWith(d + '/'));
}

function walk(dir, cb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (shouldExclude(full)) continue;
    if (e.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

function computePrefix(filePath) {
  const relDir = path.relative(ROOT, path.dirname(filePath)).replace(/\\/g, '/');
  if (!relDir || relDir === '.') return './';
  const parts = relDir.split('/').filter(Boolean);
  return parts.map(_ => '..').join('/') + '/';
}

const report = {
  total_files_scanned: 0,
  total_replacements: 0,
  by_file: []
};

const htmlFiles = [];
walk(ROOT, (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html' || ext === '.htm') htmlFiles.push(file);
});

report.total_files_scanned = htmlFiles.length;

for (const file of htmlFiles) {
  let txt = fs.readFileSync(file, 'utf8');
  const orig = txt;
  let replacements = 0;
  // regex for src="/..." or href="/..." capturing attribute and path
  txt = txt.replace(/(src|href)\s*=\s*"(\/[^"]+)"/gi, (m, attr, p) => {
    // exclusions
    if (/^\/\//.test(p)) return m; // //cdn...
    if (/^https?:\/\//i.test(p)) return m; // http(s)
    if (/^\/\#/.test(p)) return m; // anchors like /#
    // do not modify occurrences that include ':', like /api:xxx (unlikely) - keep simple
    // compute relative prefix
    const prefix = computePrefix(file);
    const newPath = prefix + p.slice(1);
    replacements++;
    return `${attr}="${newPath}"`;
  });

  if (replacements > 0) {
    fs.writeFileSync(file, txt, 'utf8');
    report.total_replacements += replacements;
    report.by_file.push({ file: path.relative(ROOT, file).replace(/\\/g,'/'), replacements });
  }
}

// sort by replacements desc
report.by_file.sort((a,b)=>b.replacements - a.replacements);
fs.writeFileSync(path.join(ROOT, 'tools', 'fix-absolute-paths.report.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('Total files scanned:', report.total_files_scanned);
console.log('Total replacements:', report.total_replacements);
console.log('Top files:');
report.by_file.slice(0,10).forEach(f => console.log(f.file, f.replacements));
console.log('Report written to tools/fix-absolute-paths.report.json');
