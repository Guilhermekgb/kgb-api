# Auditoria Pacote 2 — telas comerciais

Resumo rápido:
- Páginas auditadas: `orcamento.html`, `orcamento-detalhado.html`, `funil-leads.html`, `lista-propostas.html`, `degustacoes-disponiveis.html`, `comissoes.html`, `notificacoes-vendedor.html`.
- Objetivo: localizar usos de `localStorage`, `fetch`, `apiFetch`, `__API_BASE__`, e mocks em memória.

---

## orcamento.html
- Usa `localStorage.setItem('guard.enforce','1')` (linha ~12).
- Inclui `./api/api-config.js`, `./kgb-common.js`, `./api/proteger-pagina.js`, `./api/api-fetch.js` e `orcamento.js`.
- Chamada `window.guard()` no final do `<body>` (linha ~385).
- Resumo: Usa `localStorage` (pequeno flag), depende de `apiFetch` e `window.__API_BASE__` via `api-config.js`.

## orcamento-detalhado.html
- Define `window.__API_BASE__ = base` no patch (linhas ~10–30) — sem gravação em `localStorage`.
- Inclui `menu-lateral.js`, `orcamento-detalhado.js` e há tags `<script>` de helpers/guard no fim.
- Observação: há trechos com tags `<script type="module" src="...">` malformadas (vários `script` sem fechamento correto) — documentar para correção no Lote 1.
- Chamada `window.guard()` ao final (linha ~568).
- Resumo: não grava em `localStorage` para API_BASE; usa `window.__API_BASE__` em runtime.

## funil-leads.html
- Patch auto define `window.__API_BASE__ = base` e tenta `localStorage.setItem("API_BASE", base)` (linha ~26).
- Inclui `./api/remote-adapter.js`, `menu-lateral.js`, `funil-leads.js`, `./api/api-fetch.js`, `./kgb-common.js`, `./api/proteger-pagina.js`.
- Chamada `window.guard()` ao final (linha ~233).
- Resumo: grava `API_BASE` em `localStorage`; usa `apiFetch` para carregar `/leads` indiretamente.

## lista-propostas.html
- Patch define `window.__API_BASE__` (linha ~23) sem gravação; usa `window.apiFetch(base + '/leads')` (linha ~216) e `window.apiFetch(...'/leads/:id')` (linha ~412).
- Usa cache em memória (`memoryStore`) — não usa `localStorage` para dados de negócio.
- Chamada `window.guard()` ao final (linha ~255).
- Resumo: depende de endpoint `/leads` e `window.apiFetch`.

## degustacoes-disponiveis.html
- Implementa `portalRead` / `portalWrite` helpers que usam `window.localStorage` quando não estiver em modo portal (linhas ~11–31).
- Patch usa `portalWrite("API_BASE", base)` (linha ~57) — logo, grava `API_BASE` via `portalWrite` (que delega a `localStorage` em modo normal).
- Usa chaves locais: `degustacoesDisponiveis` (LS), `agenda` (LS) — funções `lerSlots`, `salvarSlots`, `lerAgenda`, `salvarAgenda` (linhas ~279–290 e arredores).
- Chamada `window.guard({ permissao })` (linha ~71).
- Resumo: grava listas (degustações e agenda) em `localStorage` quando não estiver em “portal mode”. Usa `fetch` fallback via `window.fetch` em `apiRequest`.

## comissoes.html
- Não foi encontrada gravação/leituras diretas em `localStorage` nos trechos desta página.
- Inclui `comissoes.js`, `kgb-common.js` e `./api/api-fetch.js` e `./api/proteger-pagina.js`.
- Chamada `window.guard()` ao final (linha ~228).
- Resumo: depende de backend para listas (`/comissoes`) via `apiFetch` presumível; não usa `localStorage` localmente.

## notificacoes-vendedor.html
- Patch auto tenta `localStorage.setItem("API_BASE", base)` (linha ~18) e define `window.__API_BASE__` (linha ~19).
- Inclui `kgb-common.js`, `js/auth-helper.js`, `./api/proteger-pagina.js` e `notificacoes.js`.
- Chamada `window.guard()` ao final (linha ~136).
- Resumo: grava `API_BASE` em `localStorage` e depende de `apiFetch`/backend para notificações.

---

### Observações / próximos passos (rápido)
- Páginas que gravam dados de negócio no `localStorage`: `degustacoes-disponiveis.html` (degustacoes/agenda keys). Essas precisam migrar para endpoints ou usar `portal` runtime.
- Páginas que gravam apenas `API_BASE` ou flags (guard.enforce): `funil-leads.html`, `lista-propostas.html` (define `__API_BASE__`), `notificacoes-vendedor.html`, `orcamento.html` grava apenas um flag `guard.enforce`.
- Há um problema de script malformado em `orcamento-detalhado.html` (corrigir no Lote 1).

---

Arquivo gerado automaticamente para guiar Lote 1.
