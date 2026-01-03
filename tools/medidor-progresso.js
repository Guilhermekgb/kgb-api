// tools/medidor-progresso.js
// Medidor geral: gera % cloud e % "pronto pra uso" com pesos.
// Heurístico, porém consistente e repetível (serve como termômetro real de avanço).

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const cfgPath = path.join(ROOT, "tools", "medidor-config.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

const EXTS = new Set(cfg.scans.include_ext);
const EXCLUDE_DIRS = new Set(cfg.scans.exclude_dirs);

function walk(dir, out = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (it.isDirectory()) {
      if (EXCLUDE_DIRS.has(it.name)) continue;
      if ([...EXCLUDE_DIRS].some(d => rel.includes(d))) continue;
      walk(full, out);
    } else {
      const ext = path.extname(it.name).toLowerCase();
      if (!EXTS.has(ext)) continue;
      if ([...EXCLUDE_DIRS].some(d => rel.includes(d))) continue;
      out.push(full);
    }
  }
  return out;
}

function count(re, txt) {
  const m = txt.match(re);
  return m ? m.length : 0;
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ---------- 1) Cloud migration (reaproveita lógica parecida com auditoria-nuvem) ----------
const files = walk(ROOT);

let totals = { apiFetch: 0, legacyStorage: 0, legacyFetch: 0 };
const rows = [];

const reApiFetch = new RegExp(cfg.patterns.cloud.join("|"), "g");
const reStorage = new RegExp(cfg.patterns.legacy_storage.join("|"), "g");
const reFetch = new RegExp(cfg.patterns.legacy_fetch.join("|"), "g");

for (const f of files) {
  let txt = "";
  try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }

  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const apiFetch = count(reApiFetch, txt);
  const legacyStorage = count(reStorage, txt);
  const legacyFetch = count(reFetch, txt);

  totals.apiFetch += apiFetch;
  totals.legacyStorage += legacyStorage;
  totals.legacyFetch += legacyFetch;

  const sum = apiFetch + legacyStorage + legacyFetch;
  if (sum > 0) {
    rows.push({ file: rel, apiFetch, legacyStorage, legacyFetch, sum });
  }
}

const denomCloud = totals.apiFetch + totals.legacyStorage;
const cloudPct = denomCloud ? (totals.apiFetch / denomCloud) * 100 : 0;

// ---------- 2) Smokes ----------
let smokesOk = 0;
let smokesTotal = cfg.targets.smokes_must_exist.length;
const smokesMissing = [];
for (const p of cfg.targets.smokes_must_exist) {
  if (exists(p)) smokesOk++;
  else smokesMissing.push(p);
}
const smokesPct = smokesTotal ? (smokesOk / smokesTotal) * 100 : 0;

// ---------- 3) Permissions/guard presence (heurístico) ----------
const guardSignals = cfg.patterns.guard;
let guardHits = 0;
for (const f of files) {
  let txt = "";
  try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  // só faz sentido em HTML/JS do frontend
  if (!rel.endsWith(".html") && !rel.endsWith(".js")) continue;

  for (const g of guardSignals) {
    const re = new RegExp(g, "g");
    guardHits += count(re, txt);
  }
}
// normaliza (guardHits grande ≠ 100% pronto), então usamos uma curva simples:
const guardPct = Math.max(0, Math.min(100, guardHits >= 30 ? 100 : (guardHits / 30) * 100));

// ---------- 4) No direct fetch (quanto menos fetch direto, melhor) ----------
const fetchPct = Math.max(0, Math.min(100, totals.legacyFetch === 0 ? 100 : (1 / (1 + totals.legacyFetch / 50)) * 100));

// ---------- 5) No storage literals (quanto menos local/sessionStorage literal, melhor) ----------
const storagePct = Math.max(0, Math.min(100, totals.legacyStorage === 0 ? 100 : (1 / (1 + totals.legacyStorage / 200)) * 100));

// ---------- Score geral ----------
const w = cfg.weights;
const overall =
  w.cloud_migration * cloudPct +
  w.tests_smokes * smokesPct +
  w.permissions_guard * guardPct +
  w.no_direct_fetch * fetchPct +
  w.no_storage_literals * storagePct;

// Top atrasos: mais “legado” e “fetch”
rows.sort((a,b) => (b.legacyStorage + b.legacyFetch) - (a.legacyStorage + a.legacyFetch));
const top = rows.slice(0, 10);

console.log("\n=== MEDIDOR GERAL DO SISTEMA ===\n");
console.log("1) Cloud migration (apiFetch vs storage):", cloudPct.toFixed(1) + "%");
console.log("2) Smokes presentes:", `${smokesOk}/${smokesTotal} -> ${smokesPct.toFixed(1)}%`);
if (smokesMissing.length) console.log("   Smokes faltando:", smokesMissing);
console.log("3) Sinais de permissões/guard (heurístico):", guardPct.toFixed(1) + "%");
console.log("4) Saúde fetch direto (heurístico):", fetchPct.toFixed(1) + "%");
console.log("5) Saúde storage literal (heurístico):", storagePct.toFixed(1) + "%");

console.log("\n✅ SCORE GERAL (pronto p/ uso multiusuário) =", overall.toFixed(1) + "%");
console.log("   (Pesos:", w, ")");

console.log("\nTop 10 arquivos mais atrasados (legado):");
top.forEach(r => {
  console.log(` - ${(r.legacyStorage+r.legacyFetch)}pts | storage:${r.legacyStorage} fetch:${r.legacyFetch} cloud:${r.apiFetch} | ${r.file}`);
});

console.log("\n(OK) Medidor concluído.\n");
