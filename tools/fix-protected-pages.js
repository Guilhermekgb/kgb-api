#!/usr/bin/env node
// tools/fix-protected-pages.js
// Insere includes obrigatórios em páginas protegidas (meta page-permission).

const fs = require('fs');
const path = require('path');

function findHtmlFiles(dir) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (it.name === 'node_modules' || it.name === '.git') continue;
      results.push(...findHtmlFiles(full));
    } else if (it.isFile() && full.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

function ensureScript(src, content) {
  return `  <script src="${src}"></script>` + (content ? '\n' + content : '\n');
}

function run(root) {
  root = path.resolve(root || '.');
  const htmlFiles = findHtmlFiles(root);
  const protectedPages = htmlFiles.filter(f => {
    const txt = fs.readFileSync(f, 'utf8');
    return txt.indexOf('meta name="page-permission"') !== -1;
  });

  const skippedForProtect = new Set(['login.html', 'documentacao-api.html']);

  const defaultScripts = [
    { src: '/js/auth-helper.js', key: 'auth-helper.js' },
    { src: '/api/api-fetch.js', key: 'api-fetch.js' },
    { src: '/api/proteger-pagina.js', key: 'proteger-pagina.js', module: true }
  ];

  const modified = [];

  for (const file of protectedPages) {
    try {
      let txt = fs.readFileSync(file, 'utf8');
      const rel = path.relative(root, file);

      // Determine which scripts to add: always add auth-helper and proteger-pagina
      // Add api-fetch.js if page references apiFetch or window.apiFetch OR just add always (safe)
      let needs = [];

      // Simple checks
      const hasAuthHelper = /auth-helper\.js/.test(txt);
      const hasApiFetch = /api-fetch\.js/.test(txt);
      const hasProteger = /proteger-pagina\.js/.test(txt);

      // Decide api-fetch inclusion: safe to add to all protected pages
      const shouldAddApiFetch = !hasApiFetch;

      // Skip adding proteger-pagina.js to explicit public pages
      const baseName = path.basename(file).toLowerCase();
      const skipProteger = skippedForProtect.has(baseName);

      if (!hasAuthHelper) needs.push(defaultScripts[0]);
      if (shouldAddApiFetch) needs.push(defaultScripts[1]);
      if (!hasProteger && !skipProteger) needs.push(defaultScripts[2]);

      if (!needs.length) continue; // nothing to do

      // Build insertion block
      let block = '';
      for (const s of needs) {
        if (s.module) {
          block += `  <script type="module" src="${s.src}"></script>\n`;
        } else {
          block += `  <script src="${s.src}"></script>\n`;
        }
      }

      // Insert block before </body> if present, else append
      const bodyClose = /<\/body\s*>/i;
      if (bodyClose.test(txt)) {
        txt = txt.replace(bodyClose, (m) => '\n' + block + m);
      } else {
        txt = txt + '\n' + block;
      }

      fs.writeFileSync(file, txt, 'utf8');
      modified.push({ file: rel, added: needs.map(n=>n.key) });
    } catch (e) {
      console.error('Failed to process', file, e && e.message);
    }
  }

  if (!modified.length) {
    console.log('No files modified. All protected pages already include required scripts.');
    return;
  }

  console.log('Modified files:');
  for (const m of modified) {
    console.log('- ' + m.file + '  (added: ' + m.added.join(', ') + ')');
  }
}

if (require.main === module) {
  const root = process.argv[2] || '.';
  run(root);
}
