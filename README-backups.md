# Backups (storage-backup)

Instruções rápidas para operadores e desenvolvedores sobre o endpoint de backup.

Endpoints
- `POST /api/storage-backup` — recebe um JSON com o dump do navegador (localStorage/sessionStorage).
  - Autenticação: `x-backup-token: <token>` ou Firebase Bearer token; em desenvolvimento `DISABLE_AUTH=1` permite envio sem token.
  - Salva o arquivo em `data/backups/` e (opcional) espelha para Firebase Storage quando configurado.

- `GET /api/backups` — lista arquivos gravados (protegido por `x-backup-token` ou Firebase Auth).

Configuração
- Crie um `.env` (copie de `.env.example`) contendo `BACKUP_UPLOAD_TOKEN` com um segredo forte.
- Ajuste `BACKUP_RETENTION_DAYS` para definir retenção (default 30 dias).

Uso do snippet no navegador
- O projeto contém um snippet versionado em `kgb-api/scripts/export-browser-storage.js` e também em `scripts/export-browser-storage.js` na raiz do projeto.
- No console do navegador, cole o conteúdo do snippet e use `tryUpload('/api/storage-backup', '<SEU_TOKEN>')` ou o prompt interativo.

Operações de manutenção
- Para limpar backups manualmente (por retenção), execute:
  ```powershell
  node .\scripts\cleanup-backups.js
  ```

Segurança
- Não deixe `DISABLE_AUTH=1` em produção.
- Mantenha `BACKUP_UPLOAD_TOKEN` associado a credenciais seguras e rotacione se houver suspeita de vazamento.
