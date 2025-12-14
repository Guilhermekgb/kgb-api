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