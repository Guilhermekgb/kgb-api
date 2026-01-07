const fs = require('fs');
const path = require('path');
const infile = path.join('tools','localstorage-remaining.txt');
const outfile = path.join('tools','localstorage-remaining.classified.json');
if (!fs.existsSync(infile)) { console.error('Input missing'); process.exit(2); }
const lines = fs.readFileSync(infile,'utf8').split(/\r?\n/).filter(Boolean);
const report = { total:0, allow:0, review:0, forbidden:0, by_file:{}, examples:[] };
for (const ln of lines) {
  const m = ln.match(/^([^:]+):(\d+):(.*)$/);
  if (!m) continue;
  const file = m[1];
  const code = m[3].trim();
  report.total++;
  report.by_file[file] = report.by_file[file] || { total:0, allow:0, review:0, forbidden:0 };
  report.by_file[file].total++;

  const lower = code.toLowerCase();
  const isAllow = /kgb_token|kgb-token|kgbtoken|token|auth|login/.test(lower);
  const isReview = /api_base|__api_base__|api-base/.test(lower);

  if (isAllow) {
    report.allow++; report.by_file[file].allow++; continue;
  }
  if (isReview) { report.review++; report.by_file[file].review++; continue; }
  report.forbidden++; report.by_file[file].forbidden++;
  if (report.examples.length < 10) report.examples.push({ file, line: m[2], code: code.slice(0,400) });
}
fs.writeFileSync(outfile, JSON.stringify(report,null,2),'utf8');
console.log('Wrote', outfile);
process.exit(0);
