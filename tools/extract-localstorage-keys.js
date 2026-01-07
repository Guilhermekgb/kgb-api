const fs = require('fs');
const path = require('path');
const infile = path.join('tools','localstorage-remaining.txt');
const outJson = path.join('tools','localstorage-keys.map.json');
const outMd = path.join('tools','localstorage-roadmap.md');
if(!fs.existsSync(infile)){ console.error('Input missing:', infile); process.exit(2); }
const lines = fs.readFileSync(infile,'utf8').split(/\r?\n/).filter(Boolean);
const keyMap = new Map();
const fileMap = new Map();
let total_lines = lines.length;
let total_literal = 0;
let total_dynamic = 0;

const literalRe = /(?:getItem|setItem|removeItem)\s*\(\s*(['\"`])([^\1]*?)\1/;
const varRe = /(?:getItem|setItem|removeItem)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/;

for(const ln of lines){
  const m = ln.match(/^([^:]+):(\d+):(.*)$/);
  if(!m) continue;
  const file = m[1];
  const lineNo = Number(m[2]);
  const code = m[3].trim();
  // ensure file entry
  if(!fileMap.has(file)) fileMap.set(file, { file, total:0, literal_keys_count:0, dynamic_key_count:0, keys:{}});
  const f = fileMap.get(file);
  f.total++;

  const lit = code.match(literalRe);
  if(lit){
    const key = lit[2];
    total_literal++;
    // update keyMap
    const e = keyMap.get(key) || { key, count:0, files: new Map(), sample_lines: [] };
    e.count++;
    const cf = e.files.get(file) || 0; e.files.set(file, cf+1);
    if(e.sample_lines.length < 3) e.sample_lines.push({ file, line: lineNo, code: code.slice(0,300) });
    keyMap.set(key, e);
    // file stats
    f.literal_keys_count++;
    f.keys[key] = (f.keys[key]||0)+1;
    continue;
  }
  // dynamic?
  const vm = code.match(varRe);
  if(vm){
    total_dynamic++;
    f.dynamic_key_count++;
    const dyn = keyMap.get('__dynamic__') || { key: '__dynamic__', count:0, files: new Map(), sample_lines: [] };
    dyn.count++;
    const cf = dyn.files.get(file) || 0; dyn.files.set(file, cf+1);
    if(dyn.sample_lines.length < 3) dyn.sample_lines.push({ file, line: lineNo, code: code.slice(0,300) });
    keyMap.set('__dynamic__', dyn);
    continue;
  }
  // fallback dynamic
  total_dynamic++;
  f.dynamic_key_count++;
  const dyn = keyMap.get('__dynamic__') || { key: '__dynamic__', count:0, files: new Map(), sample_lines: [] };
  dyn.count++;
  const cf = dyn.files.get(file) || 0; dyn.files.set(file, cf+1);
  if(dyn.sample_lines.length < 3) dyn.sample_lines.push({ file, line: lineNo, code: code.slice(0,300) });
  keyMap.set('__dynamic__', dyn);
}

// Build output structures
const keysArr = Array.from(keyMap.values()).map(k=>{
  const filesArr = Array.from(k.files.entries()).map(([file,c])=> ({ file, count: c }));
  filesArr.sort((a,b)=>b.count-a.count);
  return { key: k.key, count: k.count, files: filesArr.slice(0,10), sample_lines: k.sample_lines };
});
keysArr.sort((a,b)=>b.count - a.count);

const filesArr = Array.from(fileMap.values()).map(f=>{
  const top_keys = Object.entries(f.keys).sort((a,b)=>b[1]-a[1]).slice(0,5).map(it=> ({ key: it[0], count: it[1] }));
  return { file: f.file, total: f.total, literal_keys_count: f.literal_keys_count, dynamic_key_count: f.dynamic_key_count, top_keys };
});
filesArr.sort((a,b)=>b.total - a.total);

const out = {
  total_lines,
  total_keys_literal: total_literal,
  total_dynamic_key: total_dynamic,
  keys: keysArr,
  files: filesArr
};
fs.writeFileSync(outJson, JSON.stringify(out,null,2),'utf8');

// generate roadmap md
let md = [];
md.push('# LocalStorage Migration Roadmap\n');
md.push(`Total lines scanned: ${total_lines}`);
md.push(`Literal keys: ${total_literal}  |  Dynamic keys: ${total_dynamic}`);
md.push('\n## Top 10 files (by total localStorage mentions)');
filesArr.slice(0,10).forEach((f,i)=> md.push(`${i+1}. ${f.file} — total: ${f.total}, literal:${f.literal_keys_count}, dynamic:${f.dynamic_key_count}`));

md.push('\n## Top 10 keys (literal)');
keysArr.filter(k=>k.key!=='__dynamic__').slice(0,10).forEach((k,i)=> md.push(`${i+1}. ${k.key} — count: ${k.count}, files: ${k.files.map(x=>x.file+"("+x.count+")").join(', ')}`));

// suggest blocks: naive grouping by filename keywords
const groups = {};
function addToGroup(name,file){ groups[name]=groups[name]||new Set(); groups[name].add(file); }
filesArr.forEach(f=>{
  const fn = f.file.toLowerCase();
  if(fn.includes('cliente')||fn.includes('clientes')) addToGroup('Clientes', f.file);
  if(fn.includes('evento')||fn.includes('eventos')) addToGroup('Eventos', f.file);
  if(fn.includes('financeiro')||fn.includes('fin')) addToGroup('Financeiro', f.file);
  if(fn.includes('cardapio')||fn.includes('produt')) addToGroup('Cardapios/Produtos', f.file);
  if(fn.includes('foto')||fn.includes('fotos')) addToGroup('Fotos', f.file);
  if(fn.includes('formatura')) addToGroup('Formaturas', f.file);
  if(fn.includes('modelo')||fn.includes('modelos')) addToGroup('Modelos', f.file);
});

md.push('\n## Suggested migration blocks (example)');
let idx =1;
for(const [k,v] of Object.entries(groups)){
  md.push(`\n### Bloco ${idx}: ${k}`);
  md.push(Array.from(v).slice(0,10).map(x=>'- '+x).join('\n'));
  idx++;
}

fs.writeFileSync(outMd, md.join('\n\n'),'utf8');
console.log('Wrote', outJson, 'and', outMd);
process.exit(0);
