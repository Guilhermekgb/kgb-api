#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const excludeDirs = new Set(['node_modules','kgb-api','tools','tests','dist','build','reports','.git']);
const exts = ['.js', '.html'];
const report = {
  total_files_scanned: 0,
  total_replacements: 0,
  skipped_external: 0,
  by_file: [],
  dangerous_cases: []
};

async function walk(dir) {
  const names = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const d of names) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (excludeDirs.has(d.name)) continue;
      await walk(full);
    } else if (d.isFile()) {
      const ext = path.extname(d.name).toLowerCase();
      if (!exts.includes(ext)) continue;
      // skip the script itself
      if (full.endsWith('tools' + path.sep + 'replace-fetch-with-apifetch.js')) continue;
      await processFile(full, ext);
    }
  }
}

async function processFile(filePath, ext) {
  report.total_files_scanned++;
  let content = await fs.promises.readFile(filePath, 'utf8');
  // safety: skip files that define the apiFetch wrapper itself
  if (/\bfunction\s+apiFetch\b/.test(content) || /window\.apiFetch\s*=/.test(content)) {
    return;
  }
  let original = content;
  let replacements = 0;
  let skippedExternal = 0;

  if (ext === '.js') {
    // We will scan for standalone fetch( occurrences (not obj.fetch)
    // and decide per-call whether the first arg is a string starting with http or //
    let out = '';
    let idx = 0;
    const re = /(^|[^.\w$])fetch\s*\(/g;
    while (true) {
      const m = re.exec(content);
      if (!m) break;
      const matchStart = m.index + m[1].length; // position of 'fetch'
      const parenIndex = content.indexOf('(', matchStart);
      if (parenIndex === -1) break;
      // find first non-space char after paren
      let i = parenIndex + 1;
      while (i < content.length && /[\s]/.test(content[i])) i++;
      const ch = content[i];
      let isExternal = false;
      if (ch === '"' || ch === "'" || ch === '`') {
        // attempt to extract string literal
        const quote = ch;
        let j = i + 1;
        let found = false;
        while (j < content.length) {
          if (content[j] === '\\') { j += 2; continue; }
          if (content[j] === quote) { found = true; break; }
          j++;
        }
        const literal = found ? content.slice(i+1, j) : null;
        if (literal && (literal.startsWith('http') || literal.startsWith('//'))) {
          isExternal = true;
        }
      }

      if (isExternal) {
        skippedExternal++;
        report.skipped_external++;
        // move regex index forward to avoid infinite loop
        re.lastIndex = parenIndex + 1;
        continue;
      }

      // perform replacement at the matched position (keeping prefix)
      const prefix = content.slice(idx, matchStart);
      out += prefix + 'window.apiFetch(';
      idx = parenIndex + 1; // we already consumed '('
      replacements++;
      report.total_replacements++;
      re.lastIndex = idx;
    }
    if (replacements > 0) {
      out += content.slice(idx);
      content = out;
    }

  } else if (ext === '.html') {
    // handle inline <script>...</script> without src
    const scriptRe = /<script([^>]*?)>([\s\S]*?)<\/script>/gi;
    let changed = false;
    content = content.replace(scriptRe, (full, attrs, body) => {
      if (/\bsrc\s*=/.test(attrs)) return full; // skip external scripts
      // apply same replacement logic to body
      let local = body;
      const re = /(^|[^.\w$])fetch\s*\(/g;
      let out = '';
      let idx = 0;
      while (true) {
        const m = re.exec(local);
        if (!m) break;
        const matchStart = m.index + m[1].length;
        const parenIndex = local.indexOf('(', matchStart);
        if (parenIndex === -1) break;
        let i = parenIndex + 1;
        while (i < local.length && /[\s]/.test(local[i])) i++;
        const ch = local[i];
        let isExternal = false;
        if (ch === '"' || ch === "'" || ch === '`') {
          const quote = ch;
          let j = i + 1;
          let found = false;
          while (j < local.length) {
            if (local[j] === '\\') { j += 2; continue; }
            if (local[j] === quote) { found = true; break; }
            j++;
          }
          const literal = found ? local.slice(i+1, j) : null;
          if (literal && (literal.startsWith('http') || literal.startsWith('//'))) {
            isExternal = true;
          }
        }
        if (isExternal) { report.skipped_external++; skippedExternal++; re.lastIndex = parenIndex + 1; continue; }
        out += local.slice(idx, matchStart) + 'window.apiFetch(';
        idx = parenIndex + 1;
        replacements++; report.total_replacements++;
        changed = true;
        re.lastIndex = idx;
      }
      if (replacements > 0 && changed) {
        out += local.slice(idx);
        return '<script' + attrs + '>' + out + '<\/script>';
      }
      return full;
    });
  }

  if (replacements > 0 || skippedExternal > 0) {
    await fs.promises.writeFile(filePath, content, 'utf8');
    report.by_file.push({ file: path.relative(root, filePath).replace(/\\/g, '/'), replacements, skipped_external_count: skippedExternal });
  }
}

(async function main(){
  try {
    await walk(root);
    const reportPath = path.join('tools','replace-fetch-with-apifetch.report.json');
    await fs.promises.mkdir('tools', { recursive: true });
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('Done. Total replacements:', report.total_replacements, 'Skipped external:', report.skipped_external);
    const byFileSorted = report.by_file.slice().sort((a,b)=> (b.replacements||0)-(a.replacements||0));
    console.log('Top files:', byFileSorted.slice(0,10).map(f=>f.file).join(', '));
    if (report.dangerous_cases && report.dangerous_cases.length) {
      console.log('Dangerous cases found:', report.dangerous_cases.length);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(2);
  }
})();
