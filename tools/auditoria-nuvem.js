/**
 * Auditoria de Cloudificação - Sistema KGB Buffet
 * Mede sinais de "nuvem" vs "local":
 * - localStorage
 * - window.apiFetch
 * - window.handleRequest (shim/local)
 *
 * Como rodar:
 *   node tools/auditoria-nuvem.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

// pastas pra ignorar (pra não contar node_modules, .git, etc)
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".bak",
  "dist",
  "build",
  ".netlify",
  ".vscode",
  "coverage",
]);

// arquivos relevantes
const EXT_OK = new Set([".js", ".html"]);

// Arquivos/exceções que devem ser ignoradas (provedores e backend)
const EXCEPT_FILES = new Set([
  'api/api-fetch.js'
]);

function walk(dir, out = []) {
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const it of items) {
    const full = path.join(dir, it.name);
    const rel = path.relative(ROOT, full);

    if (it.isDirectory()) {
      if (IGNORE_DIRS.has(it.name)) continue;
      walk(full, out);
    } else {
      const ext = path.extname(it.name).toLowerCase();
      if (!EXT_OK.has(ext)) continue;
      // Normalize rel for matching
      const reln = rel.replace(/\\/g, '/');
      if (EXCEPT_FILES.has(reln)) continue;
      if (reln.startsWith('kgb-api/')) continue;
      out.push({ full, rel: reln });
    }
  }
  return out;
}

function countRegex(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

const files = walk(ROOT);
const rows = [];

let totals = {
  files: 0,
  localStorageHits: 0,
  apiFetchHits: 0,
  handleRequestHits: 0,
  hardFetchHits: 0,
};

for (const f of files) {
  let txt = "";
  try {
    txt = fs.readFileSync(f.full, "utf8");
  } catch {
    continue;
  }

  // sinais
  const localStorageHits = countRegex(txt, /\blocalStorage\b/g);
  const apiFetchHits = countRegex(txt, /\bapiFetch\b/g);
  const handleRequestHits = countRegex(txt, /\bhandleRequest\b/g);

  // fetch direto (quando alguém usa fetch() ao invés de apiFetch)
  const hardFetchHits = countRegex(txt, /\bfetch\s*\(/g);

  // só contamos como "relevante pra nuvem/local" se tiver pelo menos 1 desses sinais
  const relevant = (localStorageHits + apiFetchHits + handleRequestHits + hardFetchHits) > 0;
  if (!relevant) continue;

  totals.files += 1;
  totals.localStorageHits += localStorageHits;
  totals.apiFetchHits += apiFetchHits;
  totals.handleRequestHits += handleRequestHits;
  totals.hardFetchHits += hardFetchHits;

  rows.push({
    file: f.rel,
    localStorageHits,
    apiFetchHits,
    handleRequestHits,
    hardFetchHits,
  });
}

// métricas (heurísticas)
// Métricas REPO (tudo exceto as exceções já removidas na varredura)
const cloudSignalsRepo = totals.apiFetchHits;
const localSignalsRepo = totals.localStorageHits + totals.handleRequestHits;

// Métricas CORE: consideramos arquivos na raiz (sem '/') e em 'js/' (excluindo api/ e tools/)
const coreRows = rows.filter(r => {
  const p = r.file;
  if (p.startsWith('api/') || p.startsWith('tools/')) return false;
  if (p.indexOf('/') === -1) return true; // arquivo na raiz
  if (p.startsWith('js/')) return true;
  return false;
});

let totalsCore = { localStorageHits:0, apiFetchHits:0, handleRequestHits:0, hardFetchHits:0, files:0 };
for (const r of coreRows) {
  totalsCore.files += 1;
  totalsCore.localStorageHits += r.localStorageHits;
  totalsCore.apiFetchHits += r.apiFetchHits;
  totalsCore.handleRequestHits += r.handleRequestHits;
  totalsCore.hardFetchHits += r.hardFetchHits;
}

const cloudSignalsCore = totalsCore.apiFetchHits;
const localSignalsCore = totalsCore.localStorageHits + totalsCore.handleRequestHits;

// % por sinal (nota: usamos métricas separadas para REPO e CORE abaixo)

// % por arquivo (mais fácil de entender)
const filesCloudOnly = rows.filter(r => r.apiFetchHits > 0 && r.localStorageHits === 0 && r.handleRequestHits === 0).length;
const filesLocalOnly  = rows.filter(r => r.localStorageHits > 0 && r.apiFetchHits === 0).length;
const filesMixed      = rows.filter(r => r.localStorageHits > 0 && r.apiFetchHits > 0).length;

console.log("\n==============================");
console.log("AUDITORIA DE NUVEM (KGB Buffet)");
console.log("==============================\n");

console.log("Arquivos relevantes analisados:", totals.files);
console.log("Sinais encontrados:");
console.log(" - localStorage:", totals.localStorageHits);
console.log(" - apiFetch:", totals.apiFetchHits);
console.log(" - handleRequest (shim):", totals.handleRequestHits);
console.log(" - fetch() direto (atenção):", totals.hardFetchHits);

console.log("\n% (por sinais - estimativa) - REPO:");
const denomRepo = cloudSignalsRepo + localSignalsRepo;
const cloudPctRepo = denomRepo > 0 ? Math.round((cloudSignalsRepo / denomRepo) * 100) : 0;
const localPctRepo = 100 - cloudPctRepo;
console.log(" - Em nuvem (apiFetch):", cloudPctRepo + "%");
console.log(" - Ainda local/shim:", localPctRepo + "%");

console.log("\n% (por sinais - estimativa) - CORE (root + js/):");
const denomCore = cloudSignalsCore + localSignalsCore;
const cloudPctCore = denomCore > 0 ? Math.round((cloudSignalsCore / denomCore) * 100) : 0;
const localPctCore = 100 - cloudPctCore;
console.log(" - Em nuvem (apiFetch):", cloudPctCore + "%");
console.log(" - Ainda local/shim:", localPctCore + "%");

console.log("\nDistribuição (por arquivo) - REPO:");
console.log(" - Cloud-only:", filesCloudOnly);
console.log(" - Local-only:", filesLocalOnly);
console.log(" - Mixed:", filesMixed);

console.log("\nDistribuição (por arquivo) - CORE:");
const filesCloudOnlyCore = coreRows.filter(r => r.apiFetchHits > 0 && r.localStorageHits === 0 && r.handleRequestHits === 0).length;
const filesLocalOnlyCore  = coreRows.filter(r => r.localStorageHits > 0 && r.apiFetchHits === 0).length;
const filesMixedCore      = coreRows.filter(r => r.localStorageHits > 0 && r.apiFetchHits > 0).length;
console.log(" - Cloud-only:", filesCloudOnlyCore);
console.log(" - Local-only:", filesLocalOnlyCore);
console.log(" - Mixed:", filesMixedCore);

console.log("\nTop 20 arquivos com MAIS localStorage (REPO):");
rows
  .slice()
  .sort((a, b) => b.localStorageHits - a.localStorageHits)
  .slice(0, 20)
  .forEach(r => console.log(` - ${r.localStorageHits}x localStorage | ${r.file}`));

console.log("\nTop 20 arquivos com MAIS localStorage (CORE):");
coreRows
  .slice()
  .sort((a,b)=> b.localStorageHits - a.localStorageHits)
  .slice(0,20)
  .forEach(r=> console.log(` - ${r.localStorageHits}x localStorage | ${r.file}`));

console.log("\nTop 20 arquivos com MAIS handleRequest (shim) (REPO):");
rows
  .slice()
  .sort((a, b) => b.handleRequestHits - a.handleRequestHits)
  .slice(0, 20)
  .forEach(r => console.log(` - ${r.handleRequestHits}x handleRequest | ${r.file}`));

console.log("\nTop 20 arquivos com MAIS handleRequest (shim) (CORE):");
coreRows
  .slice()
  .sort((a,b)=> b.handleRequestHits - a.handleRequestHits)
  .slice(0,20)
  .forEach(r=> console.log(` - ${r.handleRequestHits}x handleRequest | ${r.file}`));

console.log("\nTop 20 arquivos com MAIS apiFetch (REPO):");
rows
  .slice()
  .sort((a, b) => b.apiFetchHits - a.apiFetchHits)
  .slice(0, 20)
  .forEach(r => console.log(` - ${r.apiFetchHits}x apiFetch | ${r.file}`));

console.log("\nTop 20 arquivos com MAIS apiFetch (CORE):");
coreRows
  .slice()
  .sort((a,b)=> b.apiFetchHits - a.apiFetchHits)
  .slice(0,20)
  .forEach(r=> console.log(` - ${r.apiFetchHits}x apiFetch | ${r.file}`));

console.log("\n✅ DICA: A meta é:");
console.log(" - localStorage = 0");
console.log(" - handleRequest = 0");
console.log(" - fetch() direto = 0 (usar sempre apiFetch)");
console.log("");
