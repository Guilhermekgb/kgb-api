# PR: Remove leituras síncronas remanescentes de `fotosClientes`

Resumo
------
Esta branch corrige leituras e escritas restantes que ainda dependem de
`localStorage.getItem('fotosClientes')` e `localStorage.setItem('fotosClientes', ...)`.
As mudanças aplicam um padrão seguro que prioriza, em ordem:

- `getFotosClientesSync()` (shim síncrono para bootstrap)
- `window.__FOTOS_CLIENTES_PRELOAD__` (preload assíncrono que o shim popula)
- `storageAdapter.getRaw('fotosClientes')` (cache em memória do adapter)
- fallback final: leitura/escrita de índice sanitizado no `localStorage`

Arquivos afetados (resumo)
- `cadastro-evento.js`
- `evento-detalhado.js`
- `lista-evento.html`
- `area-cliente.js`
- testes e arquivos auxiliares relacionados ao shim/adapter

Checklist para revisão
- [ ] Verificar que páginas (cadastro-evento, evento-detalhado, area-cliente, lista-evento) carregam fotos sem flash-of-empty.
- [ ] Confirmar que não há data-URIs grandes persistidas em `localStorage` para `fotosClientes`.
- [ ] Testar upload via endpoint `POST /fotos-clientes/upload` (servidor em http://localhost:3333 ou URL de produção).
- [ ] Rodar migração de uploads caso haja arquivos em `public/uploads/`.

Notas técnicas
- Backup automático: scripts que fiz criam `.bak.<timestamp>` para qualquer arquivo modificado.
- Para abrir o PR clique no link gerado pelo GitHub (ou copie o compare URL abaixo):

Compare URL (abrir no navegador para criar o PR):

https://github.com/Guilhermekgb/kgb-api/compare/main...chore/fotos-remove-sync-reads?expand=1&title=chore%2Ffotos-remove-sync-reads&body=Follow-up%3A+remove+sync+reads+for+fotosClientes+%0A%0ASee+PR_FOLLOWUP_REMOVE_SYNC_READS.md+for+details.
