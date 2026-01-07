const fs = require('fs');
const path = require('path');
const root = process.cwd();
const exts = ['.js','.html','.mjs'];
const exclude = new Set(['node_modules','kgb-api','tools','tests','dist','build','reports','.git']);
const patterns = [/localStorage/gi, /getItem\(/gi, /setItem\(/gi, /removeItem\(/gi, /\['local'\+'Storage'\]/gi, /\["local"\+"Storage"\]/gi];

async function walk(dir, out) {
  const items = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const it of items) {
    if (exclude.has(it.name)) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) await walk(full, out);
    else if (it.isFile()) {
      const ext = path.extname(it.name).toLowerCase();
      if (!exts.includes(ext)) continue;
      const txt = await fs.promises.readFile(full,'utf8');
      const lines = txt.split(/\r?\n/);
      for (let i=0;i<lines.length;i++){
        const L = lines[i];
        for (const p of patterns){ if (p.test(L)) { out.push(`${path.relative(root, full).replace(/\\/g,'/')}:${i+1}:${L.trim()}`); break; } }
      }
    }
  }
}

(async()=>{
  try{
    const out = [];
    await walk(root, out);
    await fs.promises.mkdir('tools',{recursive:true});
    await fs.promises.writeFile(path.join('tools','localstorage-remaining.txt'), out.join('\n'),'utf8');
    console.log('Wrote tools/localstorage-remaining.txt — entries:', out.length);
    process.exit(0);
  }catch(err){ console.error(err); process.exit(2);} })();
