Título: chore: remover fotos-shim e usar `storage-adapter` (pós-migração)

Resumo
- Remove a injeção do shim `fotos-shim.js` e passa a depender do `storage-adapter` e do mapping já aplicado.

Checklist de validação (pré-merge)
- [x] Backups gerados em `backups/` durante migração
- [x] Mapeamento final disponível em `kgb-api/data/fotos-clientes-cloud-ready.json`
- [x] Smoke tests headless executados (relatório em `kgb-api/reports/post-merge-tests.json`)
- [x] Monitor agendado (workflow `/.github/workflows/post-merge-monitor.yml`)

Checklist pós-merge
- [ ] Monitorar 24h/48h: agregue `kgb-api/reports/monitor-*` e valide 0 fails
- [ ] Se 48h sem regressões, remover arquivos `.bak` e entradas legacy

Rollback
- Reverter PR (git revert) para restaurar `fotos-shim.js` se forem detectadas imagens quebradas.
- Restaurar `backups/` conforme instruções em `kgb-api/DEPLOY_RUNBOOK.md`.

Notas técnicas
- O monitor roda `node kgb-api/monitor/check-images.js` e captura apenas URLs estáticos. Para validar injeção em runtime, execute localmente:
  - `node kgb-api/dev-server.js` e então `node kgb-api/tests/headless-inject-and-checks.js`
