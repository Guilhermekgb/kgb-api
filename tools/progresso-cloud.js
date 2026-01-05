const fs = require('fs');
const path = require('path');

function walk(dir){
  let out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for(const e of entries){
    const full = path.join(dir, e.name);
    if (e.isDirectory()){
      if (e.name === 'node_modules' || e.name === '.git') continue;
      out = out.concat(walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const root = process.cwd();
const files = walk(root);
const jsFiles = files.filter(f => f.match(/\.js$|\.mjs$|\.cjs$/i));
const htmlFiles = files.filter(f => f.match(/\.html$/i));

let lsHits = [];
for(const f of jsFiles){
  try{
    const txt = fs.readFileSync(f,'utf8');
    const re = /localStorage\.(getItem|setItem|removeItem)\(/g;
    let m;
    while((m = re.exec(txt))){
      const index = m.index;
      const line = txt.slice(0, index).split('\n').length;
      const snippet = txt.split('\n')[line-1].trim();
      lsHits.push({path:f,line, snippet});
    }
  }catch(e){}
}
lsHits = lsHits.filter(h => !h.snippet.includes('KGB_TOKEN'));
const localStorageCount = lsHits.length;

let fetchHits = [];
for(const f of jsFiles){
  if (f.toLowerCase().includes('api-fetch.js')) continue;
  try{
    const txt = fs.readFileSync(f,'utf8');
    const re = /\bfetch\s*\(/g;
    let m;
    while((m = re.exec(txt))){
      const index = m.index;
      const line = txt.slice(0, index).split('\n').length;
      const snippet = txt.split('\n')[line-1].trim();
      fetchHits.push({path:f,line,snippet});
    }
  }catch(e){}
}
const fetchCount = fetchHits.length;

let absScriptHits = [];
for(const f of htmlFiles){
  try{
    const txt = fs.readFileSync(f,'utf8');
    const re = /<script[^>]+src=["']\//g;
    let m;
    while((m = re.exec(txt))){
      const index = m.index;
      const line = txt.slice(0, index).split('\n').length;
      const snippet = txt.split('\n')[line-1].trim();
      absScriptHits.push({path:f,line,snippet});
    }
  }catch(e){}
}
const absScriptCount = absScriptHits.length;

let pagesWithApi = [];
let pagesMissingCommon = [];
for(const f of htmlFiles){
  try{
    const txt = fs.readFileSync(f,'utf8');
    const usesApi = txt.includes('api-fetch.js') || txt.includes('proteger-pagina.js');
    if (usesApi){
      pagesWithApi.push(f);
      if (!txt.includes('kgb-common.js')) pagesMissingCommon.push(f);
    }
  }catch(e){}
}

// scoring
const capLS = 200, capFetch = 200, capAbs = 200, capMiss = 50;
const scoreLS = Math.max(0, 1 - (localStorageCount / capLS));
const scoreFetch = Math.max(0, 1 - (fetchCount / capFetch));
const scoreAbs = Math.max(0, 1 - (absScriptCount / capAbs));
const scoreMiss = Math.max(0, 1 - (pagesMissingCommon.length / capMiss));
const final = (0.40*scoreLS + 0.30*scoreFetch + 0.20*scoreAbs + 0.10*scoreMiss) * 100;
const finalRounded = Math.round(final*10)/10;

console.log('\n=== KGB Progresso Cloud (auditoria) ===');
console.log('Root:', root);
console.log('');
console.log('Progresso Cloud (estimado):', finalRounded + '%');
console.log('');
console.log('Métricas:');
console.log('- localStorage (exceto KGB_TOKEN):', localStorageCount);
console.log('- fetch() direto (fora api-fetch.js):', fetchCount);
console.log("- scripts com src iniciando por / (absolutos):", absScriptCount);
console.log('- páginas com API sem kgb-common.js:', pagesMissingCommon.length, '/', pagesWithApi.length);
console.log('');
console.log('Top pendências (para atacar primeiro):');
if (localStorageCount>0) console.log('- Remover localStorage legado (dados de negócio) e migrar para API.');
if (fetchCount>0) console.log('- Trocar fetch() direto por window.apiFetch() e padronizar headers/token.');
if (absScriptCount>0) console.log('- Normalizar scripts absolutos (src começando por /) para caminhos relativos ./...');
if (pagesMissingCommon.length>0) console.log('- Inserir kgb-common.js antes de api-fetch/proteger-pagina nas páginas faltantes.');

console.log('\nExemplos (primeiros 10):');
if (localStorageCount>0){
  console.log('\nlocalStorage (amostra):');
  lsHits.slice(0,10).forEach(h=> console.log('- ' + h.path + ':' + h.line + ' :: ' + h.snippet));
}
if (fetchCount>0){
  console.log('\nfetch() direto (amostra):');
  fetchHits.slice(0,10).forEach(h=> console.log('- ' + h.path + ':' + h.line + ' :: ' + h.snippet));
}
if (absScriptCount>0){
  console.log('\nscripts absolutos (amostra):');
  absScriptHits.slice(0,10).forEach(h=> console.log('- ' + h.path + ':' + h.line + ' :: ' + h.snippet));
}
if (pagesMissingCommon.length>0){
  console.log('\npáginas sem kgb-common (amostra):');
  pagesMissingCommon.slice(0,10).forEach(p=> console.log('- ' + p));
}
console.log('\n=== Fim ===\n');
