const fs = require('fs').promises;
const path = require('path');

const FORBIDDEN = new Set(['kgb-common.js','api-fetch.js','proteger-pagina.js','menu-lateral.js']);

async function walk(dir){
  const res = [];
  for (const name of await fs.readdir(dir)){
    const p = path.join(dir, name);
    const st = await fs.lstat(p);
    if (st.isDirectory()){
      res.push(...await walk(p));
    } else {
      res.push(p);
    }
  }
  return res;
}

(async ()=>{
  const root = process.cwd();
  const all = await walk(root);
  const jsFiles = all.filter(f=>f.endsWith('.js'));
  const htmlFiles = all.filter(f=>f.endsWith('.html'));

  const exportBasenames = new Set();
  for (const f of jsFiles){
    const txt = await fs.readFile(f,'utf8');
    if (/^\s*export\s/m.test(txt)) {
      exportBasenames.add(path.basename(f));
    }
  }

  // remove forbidden
  for (const b of FORBIDDEN) exportBasenames.delete(b);

  const modified = [];
  for (const h of htmlFiles){
    let txt = await fs.readFile(h,'utf8');
    let original = txt;
    for (const b of exportBasenames){
      // find script tags that include the basename and do NOT already have type=module
      const re = new RegExp(`<script([^>]*?)src=["']([^"'>]*${b})["']([^>]*)>(?:</script>)?`, 'ig');
      txt = txt.replace(re, (m, g1, g2, g3) => {
        const tag = m;
        // if tag already has type=module (unlikely) skip
        if (/type\s*=\s*["']?module["']?/i.test(tag)) return m;
        // ensure we are not modifying kgb-common or forbidden
        if (FORBIDDEN.has(b)) return m;
        // insert type="module" after <script
        return `<script type="module"${g1 ? g1 : ''}src="${g2}"${g3}>${''}`;
      });
    }
    if (txt !== original){
      await fs.writeFile(h, txt, 'utf8');
      modified.push(path.relative(root,h));
    }
  }

  console.log('Arquivos modificados:', modified.length);
  for (const m of modified) console.log('-', m);
})();
