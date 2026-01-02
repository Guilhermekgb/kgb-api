const fs = require('fs');
const path = process.argv[2];
const txt = fs.readFileSync(path,'utf8');
const re = /localStorage|sessionStorage|handleRequest|fetch\(/g;
let m; let found=false;
while((m=re.exec(txt))){
  found = true;
  const idx = m.index;
  const before = txt.lastIndexOf('\n', idx);
  const after = txt.indexOf('\n', idx);
  const lineStart = before === -1 ? 0 : before+1;
  const lineEnd = after === -1 ? txt.length : after;
  const line = txt.slice(lineStart, lineEnd);
  const lineNumber = txt.slice(0,lineStart).split('\n').length;
  console.log(`${path}:${lineNumber}: ${line.trim()}`);
}
if(!found) console.log('NO_MATCH');
