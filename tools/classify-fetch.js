const fs = require('fs');
const path = require('path');

const infile = path.join('tools','fetch-remaining.frontend.txt');
const outfile = path.join('tools','fetch-remaining.classified.json');

if (!fs.existsSync(infile)) {
  console.error('Input file not found:', infile);
  process.exit(2);
}

const lines = fs.readFileSync(infile,'utf8').split(/\r?\n/).filter(Boolean);
const report = {
  total: 0,
  safe_simple_string: 0,
  safe_relative: 0,
  dynamic_template: 0,
  dynamic_variable: 0,
  external: 0,
  by_file: {}
};

for (const ln of lines) {
  // format: path:line: code
  const m = ln.match(/^([^:]+):(\d+):(\s*)([\s\S]+)$/);
  if (!m) continue;
  const file = m[1];
  const code = m[4].trim();
  report.total++;
  report.by_file[file] = report.by_file[file] || { total:0, safe_simple_string:0, safe_relative:0, dynamic_template:0, dynamic_variable:0, external:0 };
  report.by_file[file].total++;

  // heuristics
  if (/\bfetch\s*\(\s*[`]/.test(code)) {
    report.dynamic_template++;
    report.by_file[file].dynamic_template++;
    continue;
  }
  if (/\bfetch\s*\(\s*['"][^'"`]+['"]/.test(code)) {
    // string literal
    const lit = code.match(/\bfetch\s*\(\s*(['"])([^'"`]*)\1/);
    const s = lit && lit[2] || '';
    if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) {
      report.external++;
      report.by_file[file].external++;
    } else if (/^\//.test(s) || /^\.\//.test(s)) {
      report.safe_relative++;
      report.by_file[file].safe_relative++;
    } else {
      report.safe_simple_string++;
      report.by_file[file].safe_simple_string++;
    }
    continue;
  }
  // anything else where the first arg is not a literal
  if (/\bfetch\s*\(\s*[A-Za-z0-9_\$\(]/.test(code)) {
    report.dynamic_variable++;
    report.by_file[file].dynamic_variable++;
    continue;
  }
  // fallback: mark as dynamic_variable
  report.dynamic_variable++;
  report.by_file[file].dynamic_variable++;
}

fs.writeFileSync(outfile, JSON.stringify(report,null,2),'utf8');
console.log('Wrote', outfile);
console.log('Summary:', report.total, 'total');
process.exit(0);
