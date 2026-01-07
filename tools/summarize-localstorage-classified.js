const fs = require('fs');
const p = 'tools/localstorage-remaining.classified.json';
if(!fs.existsSync(p)){ console.error('Missing',p); process.exit(2); }
const j = JSON.parse(fs.readFileSync(p,'utf8'));
console.log('total:', j.total);
console.log('allow:', j.allow, 'review:', j.review, 'forbidden:', j.forbidden);
const arr = Object.entries(j.by_file).map(([f,s])=> ({file:f, forbidden:s.forbidden||0, total:s.total||0}));
arr.sort((a,b)=> b.forbidden - a.forbidden || b.total - a.total);
console.log('\nTop 10 files by forbidden:');
arr.slice(0,10).forEach((it,i)=> console.log(`${i+1}. ${it.file} — forbidden: ${it.forbidden} (total: ${it.total})`));
console.log('\nExamples (up to 5 forbidden):');
let examples = j.examples || [];
let shown=0;
for(const ex of examples){ if(shown>=5) break; if(typeof ex.code==='string'){ console.log(`- ${ex.file}:${ex.line}: ${ex.code}`); shown++; }}
process.exit(0);
