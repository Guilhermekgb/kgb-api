Title: Remover shim síncrono de fotos (migrate fotosClientes para Cloudinary)

Descrição:
- Remove o arquivo `public/js/fotos-shim.js` e as inclusões nas páginas. O projeto agora usa `public/api/storage-adapter.js` (Cloudinary) com fallback offline mínimo.

Checklist antes do merge:
- [ ] CI (smoke-tests) verde
- [ ] Pelo menos 1 aprovação técnica
- [ ] Backup branch `backup/restore-fotos-shim` disponível (para rollback rápido)
- [ ] Runbook de deploy (`kgb-api/DEPLOY_RUNBOOK.md`) revisado

Sugestão de mensagem para *Squash and merge*:
`chore(fotos): remove fotos-shim and migrate fotosClientes to Cloudinary (storage-adapter)`

Notas de deploy/canary:
- Após merge, executar o script `kgb-api/deploy/canary.ps1` em staging e verificar o workflow `post-merge-monitor.yml`.
