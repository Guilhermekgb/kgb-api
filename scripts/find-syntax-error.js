const fs = require('fs');
const file = process.argv[2];
if(!file){ console.error('Usage: node find-syntax-error.js <file>'); process.exit(2); }
const src = fs.readFileSync(file,'utf8');
const lines = src.split(/\n/);
for(let i=0;i<lines.length;i++){
  const fragment = lines.slice(0,i+1).join('\n');
  try{ new Function(fragment); }
  catch(e){
    console.error('Error at line', i+1, '=>', e.message);
    console.error('Context:');
    const start = Math.max(0, i-3);
    const end = Math.min(lines.length-1, i+1);
    for(let j=start;j<=end;j++){
      const ln = (j+1).toString().padStart(4,' ');
      console.error(ln+': '+lines[j]);
    }
    process.exit(1);
  }
}
console.log('No syntax error detected by incremental parse.');
