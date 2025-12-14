# PR Draft: cloud-migration-backup → main

Resumo

Este PR contém o trabalho inicial de migração da persistência cliente/localStorage → API/SQLite + adapter para Firestore/API/localStorage (fallback). A abordagem é não-destrutiva: o frontend continuará a funcionar com localStorage enquanto o adapter tenta Firestore → backend → localStorage.

Principais mudanças

- backend (`kgb-api/server.js`)
  - Corrigido `GET /clientes` para usar `better-sqlite3` (`db.prepare(...).all()`).
  - `POST /clientes` agora grava em `clientes.json` e também insere/atualiza a tabela `clientes` no SQLite.
  - Adicionado endpoint de backups (`/api/storage-backup`) e limpeza automática (implementado anteriormente).

- frontend
  - `api/firebase-clientes.js` adaptador atualizado (Firestore → API → localStorage) e copiado para `kgb-api/public/api/firebase-clientes.js` para facilitar testes locais.
  - `clientes-lista.js`: assegurada a mesclagem correta entre clientes remotos e locais (definição de `clientesLocais`).
  - `cadastro-evento.js`: substituições das leituras diretas de `localStorage.getItem('clientes')` por um helper `getClientes()` que tenta localStorage e, se vazio, chama `firebaseClientes.list()`.
  - `cliente-detalhado.html`: fallback para `firebaseClientes.list()` quando localStorage não contém o cliente.

Arquivos adicionados/alterados (destacados)

- Modificados: `kgb-api/server.js`, `clientes-lista.js`, `cadastro-evento.js`, `cliente-detalhado.html`
- Adicionados: `kgb-api/public/api/firebase-clientes.js`, `kgb-api/reports/localstorage-uses.json`, `kgb-api/reports/filters/*` (relatórios)

Como testar localmente

1. No diretório `kgb-api`, suba o servidor em dev (exemplo):

```powershell
Push-Location 'C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api'
$env:DISABLE_AUTH='1'
node .\server.js
Pop-Location
```

2. Validar endpoints:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3333/clientes
Invoke-RestMethod -Method Post -Uri http://localhost:3333/clientes -Body (ConvertTo-Json @{nome='Teste'}) -ContentType 'application/json'
Invoke-RestMethod -Method Get -Uri http://localhost:3333/clientes
```

3. Abrir as páginas no navegador (ou servidor estático) e testar fluxos:
- `clientes-lista.html` — listar, filtrar
- `cadastro-cliente.html` — criar/editar cliente (usa `firebaseClientes.upsert()`)
- `cadastro-evento.html` — acionar picker de clientes (usa helper `getClientes()`)

Notas e recomendações

- Estratégia não-destrutiva: manter localStorage ativo enquanto migramos módulos incrementalmente.
- Próximos módulos com prioridade: `evento-detalhado.js`, `area-cliente.js`, e módulos que usam `fotosClientes`.
- Produção: configure `BACKUP_UPLOAD_TOKEN` e desative `DISABLE_AUTH` no `.env` antes de ativar em produção.

Checklist para merge

- [ ] Revisar mudanças de backend (alterações em `server.js`).
- [ ] Validar fluxos CRUD de clientes no ambiente dev.
- [ ] Testar páginas em dispositivos móveis (responsividade do menu não foi alterada).
- [ ] Remover `DISABLE_AUTH=1` antes do deploy e garantir tokens/credenciais corretas.


Se quiser, eu abro o PR diretamente no GitHub (posso criar o PR se você me autorizar a usar a API/GitHub CLI), ou você pode revisar este rascunho e abrir manualmente.