// Lê variáveis cadastradas (página Variáveis grava em localStorage)
export function getVars(){
  try { return JSON.parse(localStorage.getItem('variaveis_modelos') || '[]'); }
  catch { return []; }
}

// Substitui {{chave}} por valores em 1 passada.
// - values: { chave: valor } (opcional)
// - useExemplos: se true, usa "exemplo" das variáveis como fallback
// - opts.escape: escapa HTML dos valores (false por padrão, preserva comportamento atual)
// - opts.missing: valor padrão quando não houver valor ('' por padrão)
// - opts.onMissing: (key) => void   callback para chaves faltantes
export function replaceVars(html, values = {}, useExemplos = true, opts = {}) {
  const { escape = false, missing = '', onMissing } = opts;

  // Monta base a partir das variáveis salvas
  const vars = getVars();
  const base = useExemplos
    ? Object.fromEntries(vars.map(v => [v.chave, v.exemplo ?? '']))
    : {};

  // Merge: valores do usuário têm precedência
  const map = { ...base, ...values };

  // util: escape opcional de HTML
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (!escape) return s;
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // 1 passada: substitui qualquer {{ chave }} válida
  // chaves aceitas: começam por letra e seguem com [a-zA-Z0-9_]
  return String(html).replace(/{{\s*([a-zA-Z][\w]*)\s*}}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return esc(map[key]);
    }
    // faltante
    if (typeof onMissing === 'function') onMissing(key);
    return esc(missing);
  });
}

// Opcional: extrai todas as chaves {{...}} do HTML (útil pra montar formulários)
export function getTemplateKeys(html){
  const set = new Set();
  const re = /{{\s*([a-zA-Z][\w]*)\s*}}/g;
  let m; while((m = re.exec(html))){ set.add(m[1]); }
  return [...set];
}

// Opcional: após aplicar replaceVars, encontra placeholders que ficaram sem valor
export function findUnresolvedPlaceholders(html){
  const set = new Set();
  const re = /{{\s*([a-zA-Z][\w]*)\s*}}/g;
  let m; while((m = re.exec(html))){ set.add(m[1]); }
  return [...set];
}
