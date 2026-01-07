const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, 'relatorio-auditoria-frontend.md');
if (!fs.existsSync(file)) {
  console.error('Arquivo relatorio-auditoria-frontend.md não encontrado em tools/');
  process.exit(2);
}

const txt = fs.readFileSync(file, 'utf8');

// Divide o relatório por blocos de página iniciados por "### "
const pageRe = /(^###\s*(.+?)\n[\s\S]*?)(?=\n---\n\n### |\n$)/gm;
let m;
const pages = [];
while ((m = pageRe.exec(txt)) !== null) {
  const block = m[1];
  const titleLine = (m[2] || '').trim();
  // extrai nome da página (pode ser "_audit/hub-testes.html" etc.)
  const pageName = titleLine.split('\n')[0].trim();
  pages.push({ name: pageName, block });
}

// Fallback: if no pages found, tentar buscar por seções '### '
if (!pages.length) {
  const lines = txt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('### ')) {
      const name = lines[i].replace(/^###\s*/, '').trim();
      // pega até próximo '---' ou EOF
      let j = i+1; let acc = lines[i] + '\n';
      while (j < lines.length && !lines[j].startsWith('---')) { acc += lines[j] + '\n'; j++; }
      pages.push({ name, block: acc });
      i = j;
    }
  }
}

let stable = [];
let unstable = [];
let skipped = [];
const exceptionMessages = [];

for (const p of pages) {
  const b = p.block;
  // se tiver Erro ao abrir (nav timeout / connection refused), consideramos skipped
  if (/^- Erro ao abrir:/m.test(b)) { skipped.push(p.name); continue; }

  const exMatch = b.match(/- exceções JS \(uncaught\):\s*(\d+)/i);
  if (!exMatch) {
    // sem linha de exceções JS — não contamos
    skipped.push(p.name);
    continue;
  }
  const count = parseInt(exMatch[1], 10);
  if (count === 0) stable.push(p.name);
  else unstable.push({ name: p.name, count, block: b });

  // Extrair linhas de exceção dentro do bloco (linhas que começam com '- [' e contêm Error/SyntaxError/ReferenceError/TypeError)
  const exLines = [];
  const exLineRe = /^- \[[^\]]+\]\s*(.+(?:Error|SyntaxError|ReferenceError|TypeError|Exception).*)$/gim;
  let mm;
  while ((mm = exLineRe.exec(b)) !== null) {
    exLines.push(mm[1].trim());
  }
  // também coletar linhas que começam com '**Exceções JS**' followed by '- ...'
  const exSectionRe = /\*\*Exceções JS\*\*[\s\S]*?(?:\n(- .+\n?)+)/i;
  const sec = b.match(exSectionRe);
  if (sec) {
    const lines = sec[0].split('\n').slice(1).map(s => s.trim()).filter(Boolean).map(s => s.replace(/^-\s*/,'').trim());
    lines.forEach(l => exLines.push(l));
  }

  for (const l of exLines) {
    exceptionMessages.push({ page: p.name, msg: l });
  }
}

const usedTotal = stable.length + unstable.length;
const zeros = stable.length;
const pct = usedTotal ? (zeros / usedTotal) * 100 : 0;

console.log(`STAB: ${zeros}/${usedTotal} = ${pct.toFixed(1)}%`);
console.log('\nStable pages (exceções JS = 0):');
stable.forEach(s => console.log('- ' + s));
console.log('\nUnstable pages (exceções JS > 0):');
unstable.forEach(u => console.log(`- ${u.name} (exceções: ${u.count})`));

// Top exception messages
const freq = new Map();
for (const e of exceptionMessages) {
  const key = e.msg.replace(/\[[^\]]+\]\s*/,'').trim();
  freq.set(key, (freq.get(key) || 0) + 1);
}

const top = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20);
console.log('\nTop exception messages (sample):');
top.forEach(([msg,cnt]) => console.log(`${cnt}x — ${msg}`));

// For each unstable page, extract first matching exception line (if any)
console.log('\nTop pages with exceptions (first message):');
const unstableSorted = unstable.slice().sort((a,b)=>b.count - a.count).slice(0,50);
const primaryMsgs = [];
for (const u of unstableSorted.slice(0,50)) {
  // localizar bloco a partir do texto completo para garantir consistência
  const startToken = '\n### ' + u.name;
  let idx = txt.indexOf(startToken);
  if (idx === -1) idx = txt.indexOf('### ' + u.name); // fallback sem newline
  let b = u.block;
  if (idx !== -1) {
    const rest = txt.slice(idx);
    const endIdx = rest.indexOf('\n---\n');
    b = endIdx === -1 ? rest : rest.slice(0, endIdx);
  }
  // try timestamped line
  let m1 = b.match(/- \[[^\]]+\]\s*(.+(?:Error|SyntaxError|ReferenceError|TypeError|Identifier|Exception).*)/i);
  let msg = m1 ? m1[1].trim() : null;
  if (!msg) {
    // procurar seção explícita **Exceções JS** e extrair a primeira linha listada
    const exSectionMatch = b.match(/\*\*Exceções JS\*\*([\s\S]*?)(?:\n\*\*|\n---|$)/i);
    if (exSectionMatch && exSectionMatch[1]) {
      const sub = exSectionMatch[1];
      const lineRe = /- \[[^\]]+\]\s*(.+)/g;
      const found = lineRe.exec(sub);
      if (found && found[1]) msg = found[1].trim();
    }
    if (!msg) {
      const m2 = b.match(/(SyntaxError|ReferenceError|TypeError|Identifier|Unexpected token|Cannot read properties of undefined|Cannot use import statement)[^\n]*/i);
      msg = m2 ? m2[0].trim() : '(mensagem não encontrada)';
    }
  }
  primaryMsgs.push({ page: u.name, count: u.count, msg });
}

primaryMsgs.slice(0,10).forEach(p => console.log(`- ${p.page} (${p.count}) -> ${p.msg}`));

// Pages with 'Unexpected token \'export\'' occurrences
const exportPages = pages.filter(p => p.block.indexOf("Unexpected token 'export'") !== -1).map(p=>p.name);
console.log(`\n'Unexpected token \'export\' occurrences: ${exportPages.length}`);
exportPages.slice(0,20).forEach(pn => console.log('- ' + pn));

// Also search for other keywords in the whole report and show page hits
const keywords = ["apiFetch","API_BASE","__API_BASE__","Cannot read properties of undefined","is not a function","guard","Unexpected token 'export'","Cannot use import statement","module"];
console.log('\nKeyword occurrences (pages):');
for (const kw of keywords) {
  const pagesWith = [];
  for (const p of pages) {
    if (p.block.indexOf(kw) !== -1) pagesWith.push(p.name);
  }
  if (pagesWith.length) console.log(`${kw}: ${pagesWith.length} -> ${pagesWith.slice(0,10).join(', ')}`);
}

// Print lists for copy if needed
console.log('\nSkipped pages (failed to open or missing exception info):');
skipped.forEach(s=>console.log('- '+s));

// Count exact occurrences of the phrase "Unexpected token 'export'" and map to pages
const phrase = "Unexpected token 'export'";
let idx = 0;
const exportMap = new Map();
while (true) {
  const found = txt.indexOf(phrase, idx);
  if (found === -1) break;
  // find preceding page header
  const before = txt.slice(0, found);
  const lastHeader = before.lastIndexOf('\n### ');
  let pageName = '(unknown)';
  if (lastHeader !== -1) {
    const lineEnd = txt.indexOf('\n', lastHeader + 1);
    pageName = txt.slice(lastHeader + 4, lineEnd).trim();
  }
  exportMap.set(pageName, (exportMap.get(pageName) || 0) + 1);
  idx = found + phrase.length;
}
const exportEntries = Array.from(exportMap.entries()).sort((a,b)=>b[1]-a[1]);
console.log(`\nExact '${phrase}' occurrences: ${Array.from(exportMap.values()).reduce((s,v)=>s+v,0)}`);
exportEntries.slice(0,10).forEach(([pn,c])=>console.log(`${c}x - ${pn}`));
