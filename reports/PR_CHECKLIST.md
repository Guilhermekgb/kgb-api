Checklist de validação antes de mesclar `chore/remove-fotos-shim-file`

- [ ] Smoke local: executar `node tests/headless-file-area.js` (file://) e `BASE_URL=http://localhost:5500 node tests/headless-inject-and-checks.js` (HTTP) — ambos devem mostrar `fotoCliente` vindo do Cloudinary (campo `cloud: true` ou `cloudinaryPresent: true`).
- [ ] CI: todas as checks do GitHub Actions devem passar na PR.
- [ ] Revisão técnica: 1 reviewer aprovado (verificar mudanças em HTMLs que removeram o include do shim).
- [ ] Rollout canary: deploy controlado para staging/canary com logs habilitados.
- [ ] Monitoramento 24–48h: checar ausência de regressões (imagens quebradas, flashes de UI, erros JS relacionados a `getFotosClientesSync`).

Rollback / Mitigação

- Se imagens faltarem em produção, reverter a merge e restaurar `public/js/fotos-shim.js` a partir da branch `chore/remove-fotos-shim-file` ou do arquivo em `kgb-api/reports/remove-fotos-shim.mbox`.
- Como workaround temporário, re-injetar o shim via tag `<script src="/kgb-api/public/js/fotos-shim.js"></script>` nas páginas afetadas até correção.

Observações técnicas

- Testes HTTP foram executados com sucesso localmente após reiniciar processos `node` e iniciar `dev-server.js` na porta 5500.
- Se CI executar em ambiente com restrição de processos, usar os testes file:// como fallback e validar via canary.

Responsáveis

- Autor da PR: `Guilhermekgb` (branch `chore/remove-fotos-shim-file`)
- Reviewer técnico sugerido: @tech-lead
- Product owner / QA: @product-owner

Data da verificação: TODO (preencher ao validar).