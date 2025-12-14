# PR Draft: Cloud migration (storage adapter + fotos shim)

Branch: `cloud-migration-backup`

Resumo
-------
Este PR implementa um caminho incremental para migrar a persistência do navegador (localStorage) para um backend (API local/remote), começando pelo mapa de fotos de clientes (`fotosClientes`). As mudanças incluem:

- Um `storageAdapter` público (`public/api/storage-adapter.js`) com métodos `getFotos`, `patchFotos` e `preload`.
- Um shim leve (`public/js/fotos-shim.js`) que espelha gravações em `localStorage.fotosClientes` para `storageAdapter.patchFotos` e chama `preload()` no carregamento para evitar flash-of-empty-state.
- Endpoints no servidor (`/fotos-clientes`) suportando `GET`, `PUT` e `PATCH` (merge por chave, suportando `null` para sinalizar remoção).
- Ajuste no `server.js` para reduzir severidade de logs quando o upload para Firebase falha (ex.: bucket ausente), mantendo gravação local em `kgb-api/data/`.
- Scripts de teste: `tests/smoke-fotos-test.js` (smoke test que adiciona, verifica e sinaliza remoção de uma foto de teste).
- Inclusões do adapter+shim nas páginas públicas principais (`dashboard.html`, `clientes-lista.html`, `cadastro-cliente.html`) como prova de conceito.

Motivação
----------
Mover persistência para um armazenamento centralizado oferece: backup confiável, compartilhamento entre dispositivos, e possibilidades de sincronização/ingestão. A abordagem incremental (shim + adapter + endpoints) minimiza risco e permite rollback rápido.

Testes manuais realizados
------------------------
- Executado `tests/smoke-fotos-test.js` com `API_BASE=http://localhost:3333` — PASSOU. O servidor gravou localmente e o fluxo PATCH/GET/PATCH(null)/GET funcionou. Observação: tentativa de upload para Firebase gerou WARN quando bucket inexistente (tratado no `server.js`).

Checklist de revisão (PR)
------------------------
- [ ] Revisar `public/api/storage-adapter.js` (segurança e fallback quando API_BASE não está definida)
- [ ] Revisar `public/js/fotos-shim.js` (não bloqueante, tolerância a erros)
- [ ] Verificar endpoints em `server.js` (`/fotos-clientes`) para validação/escopo multi-tenant
- [ ] Executar smoke tests localmente (instruções abaixo)
- [ ] Validar inclusão do shim nas páginas públicas e comportamento em navegadores (abrir `dashboard.html`, `clientes-lista.html`, `cadastro-cliente.html` e observar console/localStorage)
- [ ] Confirmar que o upload para Firebase é opcional e que logs não poluem ambientes sem credenciais

Instruções para testes locais
----------------------------
1. Iniciar API em modo dev (auth desativada):

```powershell
Push-Location 'C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api'
$env:DISABLE_AUTH='1'; node .\server.js; Pop-Location
```

2. Executar smoke test (numa nova janela PowerShell):

```powershell
Push-Location 'C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api'
$env:API_BASE='http://localhost:3333'; node .\tests\smoke-fotos-test.js; Pop-Location
```

3. Manual: abrir `cadastro-cliente.html` (arquivo local) no navegador (localhost file:// ou servido por um servidor estático), abrir DevTools → Console e verificar que `storageAdapter.preload()` foi chamado e que `localStorage.fotosClientes` foi preenchido quando vazio.

Observações e próximos passos sugeridos
-----------------------------------
- Expandir a inclusão do shim para outras páginas (automatizar inserção em todas as HTML que importam `kgb-common.js`).
- Adicionar `storageAdapter.preload()` para outras chaves críticas (`clientes`, `eventos`) com fallback cuidadoso para não sobrescrever dados locais não sincronizados.
- Adicionar teste headless (Puppeteer) para simular UI e confirmar que o shim dispara `PATCH /fotos-clientes`.
- Preparar documentação para migrar dados existentes (backup/ingestão), e instruções de rollback.

Se aprovado, posso abrir o PR draft no GitHub (se desejar, preciso de autorização/token ou instruções manuais para criar o PR). Também posso automatizar a inclusão do shim em todas as páginas.
# PR Draft: cloud-migration-backup → main

Resumo

Este PR contém trabalho inicial e um POC para migrar a persistência do frontend de `localStorage` para um backend centralizado (API + SQLite) e preparar integração com Firestore. A estratégia é incremental e não-destrutiva: o frontend continua funcionando com `localStorage` enquanto o `storage-adapter` prioriza adaptadores remotos → API → `localStorage`.

Principais mudanças

- Backend (`kgb-api/server.js`)
  - Corrigido `GET /clientes` para usar `better-sqlite3` (`db.prepare(...).all()`).
  - `POST /clientes` agora grava em disco e sincroniza com tabela `clientes` no SQLite.
  - Adicionado endpoint `/api/storage-backup` para ingestão de dumps do browser e rotina de limpeza/retenção.

- Frontend
  - Introduzido `storage-adapter` (público) com `preload`/cache e shims que permitem que módulos existentes leiam de um cache preenchido pelo adapter.
  - Implementado shim/module-scope nos módulos críticos `cadastro-evento.js` e `evento-detalhado.js` para que `localStorage` passe a usar o adapter quando presente (compatibilidade retroativa sem grandes refatorações).
  - POC de migração `clientes`: `api/firebase-clientes.js` (adapter que tenta Firestore → API → localStorage) e mudanças em páginas-chaves (`cadastro-cliente.html`, `clientes-lista.js`, `cadastro-evento.js`) para usar o adapter/POC.

Arquivos adicionados/alterados (destaque)

- Adicionados: `kgb-api/public/api/storage-adapter.js`, `api/storage-adapter.js`, `kgb-api/reports/localstorage-uses.json`, scripts de análise/relatórios.
- Alterados: `cadastro-cliente.html`, `cadastro-evento.html`, `cadastro-evento.js`, `evento-detalhado.js`, `evento-detalhado.html`, `kgb-api/server.js` (e outros ajustes pequenos).

Como testar localmente

1. No diretório `kgb-api`, rode o servidor em modo dev (exemplo PowerShell):

```powershell
Push-Location 'C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api'
$env:DISABLE_AUTH='1'
node .\server.js
Pop-Location
```

2. Testes básicos de API:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3333/clientes
Invoke-RestMethod -Method Post -Uri http://localhost:3333/clientes -Body (ConvertTo-Json @{nome='Teste'}) -ContentType 'application/json'
Invoke-RestMethod -Method Get -Uri http://localhost:3333/clientes
```

3. Abra as páginas no navegador e verifique fluxos:
- `clientes-lista.html` — listar/filtrar clientes
- `cadastro-cliente.html` — criar/editar cliente
- `cadastro-evento.html` e `evento-detalhado.html` — validar que fotos e seleção de cliente funcionam com o preload/cache

Notas e recomendações

- Estratégia não-destrutiva: manter `localStorage` enquanto migramos módulos incrementalmente.
- Prioridade para próximos módulos: `evento-detalhado.js`, `area-cliente.js`, além de `fotosClientes`.
- Em produção, desabilitar `DISABLE_AUTH` e configurar `BACKUP_UPLOAD_TOKEN` e credenciais do Firebase (se usadas).

Checklist para merge

- [ ] Revisar mudanças no backend (`kgb-api/server.js`).
- [ ] Validar fluxos CRUD de clientes no ambiente dev.
- [ ] Testar páginas principais em desktop e mobile.
- [ ] Garantir configurações de segurança/variáveis de ambiente para produção.

PR pronto para abrir

- Branch: `cloud-migration-backup`
- Compare URL: https://github.com/Guilhermekgb/kgb-api/compare/main...cloud-migration-backup?expand=1

Sugestão de título (PR):
`feat: migrate storage adapter + backup ingestion (POC clientes)`

Sugestão de corpo (PR body):

Este PR implementa uma abordagem incremental para migrar persistência de `localStorage` para um backend centralizado (API/SQLite) e prepara integração com Firestore. As mudanças são não-destrutivas: o frontend continuará funcionando com `localStorage` enquanto um `storage-adapter` tenta priorizar adaptadores remotos (Firestore) → API → `localStorage`.

Principais pontos:
- Endpoint `/api/storage-backup` para ingestão segura de dumps do browser
- `storage-adapter` com `preload`/cache para leituras síncronas em módulos existentes
- Shims em módulos críticos para que chamadas a `localStorage` passem a usar o adapter quando presente
- POC de migração `clientes` e ajustes em endpoints para garantir persistência em SQLite

Testes realizados: testes locais de POST/GET clientes, validação de backups via `/api/storage-backup`, e verificação manual das páginas principais.

Testes adicionais (executados localmente):

- Iniciado servidor em background com `DISABLE_AUTH=1` e verificado que `GET /fotos-clientes` e `PATCH /fotos-clientes` funcionam corretamente (merge parcial confirmou as chaves `foto1` e `foto2`).
- Confirmei que `PATCH /fotos-clientes` retorna o mapa atualizado e que `GET /fotos-clientes` devolve o mapa com as entradas mescladas.

Observação: durante testes iniciais, arquivos temporários do SQLite (`data.db-shm`, `data.db-wal`) foram acidentalmente adicionados ao índice; já foram removidos do repositório e `.gitignore` atualizado para evitar futuros commits desses arquivos.

Notas de deploy/segurança:
- Não usar `DISABLE_AUTH=1` em produção
- Definir `BACKUP_UPLOAD_TOKEN` e variáveis de ambiente para credenciais do Firebase se necessário

Se preferir, eu abro o PR automaticamente (preciso de autorização/credenciais), ou você pode abrir manualmente usando o link de comparação acima.