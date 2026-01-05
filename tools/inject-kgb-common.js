const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', 'reports', '.git', 'kgb-api'];

function shouldExclude(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  return EXCLUDE_DIRS.some(d => rel === d || rel.startsWith(d + '/'));
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
  total_injections: 0,
  skipped_login: 0,
  skipped_backend_kgb_api: 0,
  by_file: []
};

const htmlFiles = [];
walk(ROOT, (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html' || ext === '.htm') htmlFiles.push(file);
});

report.total_files_scanned = htmlFiles.length;

for (const file of htmlFiles) {
  const relFile = path.relative(ROOT, file).replace(/\\/g, '/');
  if (relFile === 'login.html') { report.skipped_login++; report.by_file.push({ file: relFile, injected: false, reason: 'login.html skipped' }); continue; }
  if (relFile.startsWith('kgb-api/')) { report.skipped_backend_kgb_api++; report.by_file.push({ file: relFile, injected: false, reason: 'backend skipped' }); continue; }

  let txt = fs.readFileSync(file, 'utf8');
  const needRegex = /proteger-pagina\.js|window\.apiFetch|apiFetch\(|__API_BASE__|\bguard\(/i;
  if (!needRegex.test(txt)) { report.by_file.push({ file: relFile, injected: false, reason: 'no indicators' }); continue; }
  if (/kgb-common\.js/.test(txt)) { report.by_file.push({ file: relFile, injected: false, reason: 'already has kgb-common' }); continue; }

  // compute relative src
  const prefix = computePrefix(file);
  const scriptTag = `<script src="${prefix}kgb-common.js"></script>`;

  let injected = false;

  // 1) if exists a script tag with src containing proteger-pagina.js, insert before it
  const reProtectScript = /<script[^>]*?(?:src=["'][^"']*proteger-pagina\.js[^"']*["'][^>]*>|>\s*import[\s\S]{0,200}?proteger-pagina\.js[\s\S]*?<\/script>)/i;
  const mProtect = txt.match(reProtectScript);
  if (mProtect && mProtect.index !== undefined) {
    const insertPos = mProtect.index;
    txt = txt.slice(0, insertPos) + scriptTag + "\n" + txt.slice(insertPos);
    injected = true;
  }

  // 2) else insert before first local script src (not http/https or //)
  if (!injected) {
    const reLocalScriptAll = /<script[^>]*src=["']([^"']+)["'][^>]*>/ig;
    let mLocal;
    let foundLocalIndex = -1;
    while ((mLocal = reLocalScriptAll.exec(txt)) !== null) {
      const srcVal = mLocal[1] || '';
      if (!/^https?:\/\//i.test(srcVal) && !/^\/\//.test(srcVal)) { foundLocalIndex = mLocal.index; break; }
    }
    if (foundLocalIndex !== -1) {
      const insertPos = foundLocalIndex;
      txt = txt.slice(0, insertPos) + scriptTag + "\n" + txt.slice(insertPos);
      injected = true;
    }
  }

  // 3) fallback: insert before </head> if present, else before </body>
  if (!injected) {
    const idxHeadClose = txt.search(/<\/head>/i);
    if (idxHeadClose !== -1) {
      const insertPos = idxHeadClose;
      txt = txt.slice(0, insertPos) + scriptTag + "\n" + txt.slice(insertPos);
      injected = true;
    } else {
      const idxBodyClose = txt.search(/<\/body>/i);
      if (idxBodyClose !== -1) {
        const insertPos = idxBodyClose;
        txt = txt.slice(0, insertPos) + scriptTag + "\n" + txt.slice(insertPos);
        injected = true;
      }
    }
  }

  if (injected) {
    fs.writeFileSync(file, txt, 'utf8');
    report.total_injections++;
    report.by_file.push({ file: relFile, injected: true, reason: 'injected before protect/local/head/body' });
  } else {
    report.by_file.push({ file: relFile, injected: false, reason: 'could not find insertion point' });
  }
}

report.by_file.sort((a,b)=> (b.injected === a.injected) ? 0 : (a.injected ? -1 : 1));
fs.writeFileSync(path.join(ROOT, 'tools', 'inject-kgb-common.report.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('Total files scanned:', report.total_files_scanned);
console.log('Total injections:', report.total_injections);
console.log('Top inserted files:');
report.by_file.filter(f=>f.injected).slice(0,10).forEach(f=>console.log(f.file));
console.log('Report written to tools/inject-kgb-common.report.json');
