Title: Draft — Cloudinary migration (chore/cloud-migration-ready)

Resumo curto:
- Esta PR inclui scripts de preparação para migrar `fotosClientes` para Cloudinary sem perda de dados: `upload-to-cloudinary.js` (dry-run), `replace-fotos-urls.js` (codemod dry-run), runbook e um workflow de dry-run.

Checklist para revisão (manter antes do merge):
- [ ] Verificar `reports/fotos-references.md` e confirmar que todos os pontos críticos foram mapeados.
- [ ] Executar dry-run local: `node scripts/upload-to-cloudinary.js --dry-run` e revisar `data/fotos-clientes-cloud-ready.json`.
- [ ] Verificar codemod em dry-run: `node scripts/replace-fotos-urls.js` — confirmar arquivos afetados.
- [ ] Confirmar que `kgb-api/server.js` endpoints de `fotos-clientes` permanecem compatíveis.
- [ ] Confirmar que `kgb-api/monitor/check-images.js` cover as páginas-chave e que workflow `post-merge-monitor.yml` está adequado.
- [ ] Garantir que secrets `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` serão adicionados antes de qualquer upload real.

Revisores sugeridos:
- @tech-lead (arquitetura frontend)
- @devops (CI/secrets/deploy)
- @frontend-owner (validação de UI e canary)

Descrição longa (colar no PR):
This draft contains tooling and documentation to migrate client photos from localStorage to Cloudinary. It is a safe, staged process:

1. Run `upload-to-cloudinary.js --dry-run` locally to create a preview mapping file `data/fotos-clientes-cloud-ready.json`.
2. Review mapping and run `replace-fotos-urls.js` in dry-run to see affected files.
3. When repository secrets are configured, a CI job can run the upload and produce a final mapping artifact. A codemod with `--apply` will replace image references.
4. Run smoke tests and canary deploy; monitor images for 24–48h.

Important: this PR is a draft — no production changes or uploads are performed. Wait for merge of PR #12 (removal of shim) and configuration of Cloudinary secrets before performing any uploads.

Suggested squash commit message:
`chore(migration): prepare cloudinary migration tooling (dry-run scripts, codemod, runbook)`
