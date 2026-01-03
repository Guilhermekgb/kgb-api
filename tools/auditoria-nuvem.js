// tools/auditoria-nuvem.js
// Auditoria simples: mede "cloud vs legado" por ocorrências em arquivos do projeto.

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const EXTS = new Set([".js", ".html", ".css"]);

const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", ".github", ".github-artifacts", "dist", "build", "vendor"
]);

const EXCLUDE_SUBSTR = [
  "duplicates-archive",
  "backups",
];

function walk(dir, out = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (EXCLUDE_DIRS.has(it.name)) continue;
      if (EXCLUDE_SUBSTR.some(s => full.includes(s))) continue;
      walk(full, out);
    } else {
      const ext = path.extname(it.name).toLowerCase();
      if (!EXTS.has(ext)) continue;
      if (EXCLUDE_SUBSTR.some(s => full.includes(s))) continue;
      out.push(full);
    }
  }
  return out;
}

function count(re, txt) {
  const m = txt.match(re);
  return m ? m.length : 0;
}

const files = walk(ROOT);

const rows = [];
const totals = { apiFetch: 0, localStorage: 0, sessionStorage: 0, handleRequest: 0, hardFetch: 0 };

for (const f of files) {
  let txt = "";
  try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }

  const apiFetch = count(/\bapiFetch\b/g, txt);
  const localStorage = count(/\blocalStorage\.(getItem|setItem|removeItem|clear)\b/g, txt);
  const sessionStorage = count(/\bsessionStorage\.(getItem|setItem|removeItem|clear)\b/g, txt);
  const handleRequest = count(/\bhandleRequest\b/g, txt);

  let hardFetch = 0;
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const isApiImpl = rel.endsWith("api/api-fetch.js") || rel.endsWith("api/routes.js");
  if (!isApiImpl && (rel.endsWith(".js") || rel.endsWith(".html"))) {
    hardFetch = count(/\bfetch\s*\(/g, txt);
  }

  totals.apiFetch += apiFetch;
  totals.localStorage += localStorage;
  totals.sessionStorage += sessionStorage;
  totals.handleRequest += handleRequest;
  totals.hardFetch += hardFetch;

  const sum = apiFetch + localStorage + sessionStorage + handleRequest + hardFetch;
  if (sum > 0) {
    rows.push({ file: rel, apiFetch, localStorage, sessionStorage, handleRequest, hardFetch, sum });
  }
}

const denom = totals.apiFetch + totals.localStorage + totals.sessionStorage + totals.handleRequest;
const cloudPct = denom ? (totals.apiFetch / denom) * 100 : 0;

rows.sort((a,b) => (b.localStorage + b.sessionStorage + b.handleRequest + b.hardFetch) - (a.localStorage + a.sessionStorage + a.handleRequest + a.hardFetch));

console.log("\n=== AUDITORIA NUVEM (heurística) ===");
console.log("Totais:");
console.log(" - apiFetch (cloud):", totals.apiFetch);
console.log(" - localStorage:", totals.localStorage);
console.log(" - sessionStorage:", totals.sessionStorage);
console.log(" - handleRequest (shim):", totals.handleRequest);
console.log(" - fetch() direto (atenção):", totals.hardFetch);

console.log(`\nPercentual estimado: ${cloudPct.toFixed(1)}% cloud / ${(100-cloudPct).toFixed(1)}% legado`);

console.log("\nTop 5 arquivos mais críticos (legado):");
rows.slice(0, 5).forEach(r => {
  const legacy = r.localStorage + r.sessionStorage + r.handleRequest + r.hardFetch;
  console.log(` - ${legacy}pts | LS:${r.localStorage} SS:${r.sessionStorage} HR:${r.handleRequest} fetch:${r.hardFetch} | ${r.file}`);
});

console.log("\n(OK) Auditoria concluída.\n");
