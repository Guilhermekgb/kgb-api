# DEPLOY RUNBOOK — Fotos Cloudinary Migration

Objetivo:
- Procedimento de deploy canary e rollback para a migração de `fotosClientes` do `localStorage` para Cloudinary.

Pré-requisitos:
- Ter branch `backup/restore-fotos-shim` disponível para rollback rápido.
- Acesso ao servidor de staging e permissão para copiar artefatos.
- `node` instalado para rodar `monitor/check-images.js`.

Passos de deploy canary (curto):
1. Gerar build estático no repositório: `npm run build` (ou passo equivalente).
2. Copiar artifacts para staging (o script de canary local: `deploy/canary.ps1`).
   - Exemplo: `.
un.ps1 -artifactPath .\build -stagingPath C:\staging\site`
3. Rodar o monitor de imagens: `node kgb-api/monitor/check-images.js cadastro-cliente.html --cloud dzw8u1h69`
4. Se o monitor reportar falhas, executar rollback imediato (veja abaixo).

Rollback rápido:
- Se detectar falhas graves, restaurar branch backup:
  1. Voltar os arquivos removidos do shim a partir de `backup/restore-fotos-shim`.
  2. Revert/checkout dos arquivos necessários e redeploy para staging.
- Comandos git (exemplo):
  - `git fetch origin` 
  - `git checkout -b tmp-rollback origin/backup/restore-fotos-shim`
  - Copiar os arquivos para staging e reiniciar serviço.

Monitoramento pós-merge (24–48h):
- Agendar checks a cada 4 horas usando cron/Task Scheduler para executar `node kgb-api/monitor/check-images.js` nas páginas-chave.
- Notificar time via Slack/email se houver falhas.

Limpeza final após canary estável:
- Remover backups e `.bak` locais com commit único (branch `chore/cleanup-baks`).
