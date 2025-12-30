#!/usr/bin/env node
// tools/audit-protected-pages.js
// Varre .html procurando páginas protegidas (meta page-permission) e verifica se
// os scripts obrigatórios estão presentes antes do código da página.

const fs = require('fs');
const path = require('path');

function findHtmlFiles(dir) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      // pular node_modules e .git
      if (it.name === 'node_modules' || it.name === '.git') continue;
      results.push(...findHtmlFiles(full));
    } else if (it.isFile() && full.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

function fileHas(src, needle) {
  return src.indexOf(needle) !== -1;
}

function run(root) {
  const htmlFiles = findHtmlFiles(root);
  const protectedPages = [];
  for (const f of htmlFiles) {
    const txt = fs.readFileSync(f, 'utf8');
    if (txt.indexOf('meta name="page-permission"') !== -1) {
      const base = path.basename(f).toLowerCase();
      // Ignorar páginas públicas que não devem exigir o guard
      if (base === 'login.html' || base === 'documentacao-api.html') continue;
      protectedPages.push({ file: f, src: txt });
    }
  }

  const report = [];
  for (const p of protectedPages) {
    const s = p.src;
    const missing = [];
    // auth-helper.js should be present
    if (!fileHas(s, 'auth-helper.js')) missing.push('auth-helper.js');

    // proteger-pagina.js should be present (guard)
    if (!fileHas(s, 'proteger-pagina.js')) missing.push('proteger-pagina.js');

    // api-fetch.js required only if page uses window.apiFetch or apiFetch(
    const needsApiFetch = fileHas(s, 'window.apiFetch') || fileHas(s, 'apiFetch(') || fileHas(s, "api-fetch.js");
    if (needsApiFetch && !fileHas(s, 'api-fetch.js')) missing.push('api-fetch.js');

    if (missing.length) {
      report.push({ page: p.file, missing });
    }
  }

  if (!report.length) {
    console.log('No issues found. All protected pages include required scripts.');
    return;
  }

  console.log('Protected pages missing required scripts:');
  for (const r of report) {
    console.log('- ' + path.relative(process.cwd(), r.page));
    for (const m of r.missing) console.log('   - missing: ' + m);
  }
}

if (require.main === module) {
  const root = process.argv[2] || '.';
  run(path.resolve(root));
}
