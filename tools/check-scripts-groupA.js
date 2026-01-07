const fs = require('fs').promises;
const path = require('path');
const files = [
  'colaboradores.html',
  'layout-editor.html',
  'feiras.html',
  'kgb-formaturas-modelos-convite.html'
];
(async ()=>{
  const root = process.cwd();
  let out = '';
  for (const f of files){
    const p = path.join(root, f);
    out += `## ${f}\n`;
    try{
      const txt = await fs.readFile(p,'utf8');
      const re = /<script[^>]+src=["']([^"']+)["'][^>]*>(?:<\/script>)?/ig;
      let m; let i=0;
      while ((m = re.exec(txt)) !== null){
        i++;
        const src = m[1];
        const resolved = path.join(path.dirname(p), src).replace(/\\/g,'/');
        let exists = false;
        try { await fs.access(path.join(root, src)); exists = true; } catch(e) { exists = false; }
        out += `- tag ${i}: src="${src}" -> exists: ${exists} -> resolved: ${resolved}\n`;
      }
      if (i===0) out += '- (nenhuma tag <script src=> encontrada)\n';
    } catch(e){ out += `- ERRO: não foi possível ler ${f}: ${e.message}\n`; }
    out += '\n';
  }
  await fs.writeFile(path.join(root,'tools','report-scripts-groupA.md'), out, 'utf8');
  console.log('Gerado tools/report-scripts-groupA.md');
})();
