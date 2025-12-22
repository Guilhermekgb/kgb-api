# Relatório: referências a `fotosClientes` e leituras síncronas

Scan rápido feito em: 2025-12-19

Resumo:
- Encontrei múltiplas referências a `fotosClientes`, leituras síncronas via `localStorage.getItem` e usos do shim (`getFotosClientesSync`).
- Arquivos principais afetados (lista parcial / priorizada):

- `cadastro-evento.js` — declara `FOTOS_STORAGE_KEY` e alterna entre `getFotosClientesSync()` e `storageAdapter.getRaw('fotosClientes')` em vários pontos.
- `evento-detalhado.js` — várias leituras/escritas: `getFotosClientesSync()`, `storageAdapter.getRaw/setJSON/setRaw`, e blocos de fallback que escrevem em `localStorage.setItem('fotosClientes', ...)`.
- `cadastro-cliente.html`, `cadastro-evento.html`, `cliente-detalhado.html`, `lista-evento.html` — comentários e includes relacionados ao shim/adapter.
- `scripts/fix-sync-fotos.js` e `scripts/fix-fotos-writes.js` — codemods já existentes para substituir leituras/escritas síncronas (úteis para aplicar em massa).
- `kgb-api/server.js` — endpoints do backend que lidam com `fotosClientes` (leitura, gravação, patch) — revisar compatibilidade de API.

Detalhes (achados relevantes):

- `kgb-api/server.js` — mensagens de erro relacionadas a fotosClientes (linhas próximas: 2510, 2527, 2599).
- `cadastro-evento.js` — múltiplos usos de `getFotosClientesSync()` e chamadas a `storageAdapter.getRaw('fotosClientes')` (linhas: ~95, 99, 102, 325, 329, 645, 1311, 236+).
- `evento-detalhado.js` — leituras/fallbacks e chamadas a `storageAdapter.setJSON/setRaw` em várias seções (linhas: ~1680, 1684, 1687, 1690, 1696, 1705, 1724, 1727, 1730, 1735, 1812, 1815, 1818).
- `lista-evento.html` — lógica que procura no mapa `fotosClientes` (linhas ~334–341).
- `scripts/fix-sync-fotos.js` / `scripts/fix-fotos-writes.js` — já contém padrões (`localStorage.getItem('fotosClientes')`, `localStorage.setItem('fotosClientes', ...)`) e substituições de exemplo.

Próximos passos recomendados (prioridade):
1. Aplicar `scripts/fix-sync-fotos.js` e `scripts/fix-fotos-writes.js` em uma branch de teste para transformar leituras síncronas em chamadas `storageAdapter`/shim-safe. (Esses scripts já existem; revisar e executar em dry-run.)
2. Revisar `kgb-api/server.js` para garantir compatibilidade do endpoint `fotos-clientes` com o novo fluxo (se a migração depender de PATCH/GET do backend).
3. Rodar `node scripts/replace-fotos-urls.js` (dry-run) usando `data/fotos-clientes-cloud-ready.json` após upload preview.
4. Após PR #12 merge, executar codemods e abrir PR para remoção final de fallbacks e `.bak`.

Anexos: este relatório é um resumo; para contexto completo veja os arquivos listados no repositório.
