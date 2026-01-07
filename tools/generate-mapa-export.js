const fs = require('fs').promises;
const path = require('path');

async function walk(dir){
  let files = [];
  for (const name of await fs.readdir(dir)){
    const p = path.join(dir, name);
    const st = await fs.lstat(p);
    if (st.isDirectory()){
      files = files.concat(await walk(p));
    } else {
      files.push(p);
    }
  }
  return files;
}

(async ()=>{
  const root = process.cwd();
  const all = await walk(root);
  const jsFiles = all.filter(f=>f.endsWith('.js'));
  const htmlFiles = all.filter(f=>f.endsWith('.html'));

  const exportFiles = [];
  for (const f of jsFiles){
    const txt = await fs.readFile(f,'utf8');
    if (/^\s*export\s/m.test(txt)) exportFiles.push(f);
  }

  let out = '# Mapa de arquivos JS com export\n\n';
  for (const jf of exportFiles){
    const name = path.basename(jf);
    out += `## ${name}\n\n`;
    let used = false;
    for (const h of htmlFiles){
      const htxt = await fs.readFile(h,'utf8');
      const re = new RegExp(`<script[^>]+src=["']?([^"'>]+${name})["']?[^>]*>`, 'ig');
      let m;
      while ((m = re.exec(htxt)) !== null){
        used = true;
        const tag = m[0];
        const isModule = /type=\s*"module"|type=\s*'module'/i.test(tag);
        out += `- usado em: ${path.relative(root,h)} (${isModule ? 'module' : 'script clássico'})\n`;
      }
    }
    if (!used) out += '- usado em: (nenhum)\n';
    out += '\n';
  }

  await fs.writeFile(path.join(root,'tools','mapa-export.md'), out, 'utf8');
  console.log('Gerado tools/mapa-export.md');
})();
