# PR Ready: feat(storage): migrate fotosClientes to storage-adapter (POC)

Branch: `cloud-migration-backup`
Compare URL: https://github.com/Guilhermekgb/kgb-api/compare/main...cloud-migration-backup?expand=1

## Resumo

Este PR introduz um `storage-adapter` cliente e um shim para migrar gradualmente o mapa `fotosClientes` do `localStorage` para uma API central (`/fotos-clientes`). A abordagem é incremental e não-destrutiva: o frontend continua funcional com `localStorage` enquanto o adapter tenta sincronizar para o backend.

## Principais mudanças

- `kgb-api/public/api/storage-adapter.js` — adapter público com `getFotos`, `patchFotos` e `preload`.
- `kgb-api/public/js/fotos-shim.js` — shim que espelha gravações em `localStorage.fotosClientes` para `storageAdapter.patchFotos`.
- `kgb-api/server.js` — endpoints `GET|PUT|PATCH /fotos-clientes` e persistência local em `kgb-api/data/`.
- Removidos preloads inline duplicados e centralizado o loader em `kgb-common.js`.

## Testes realizados

- Teste unit/headless: `tests/headless-shim-test.js` — PASSOU (shim chama `storageAdapter.patchFotos`).
- Smoke: reiniciado `kgb-api` e enviado `PATCH /fotos-clientes` + `GET` — PASSOU (mapa atualizado, verificado no terminal).

## Checklist para revisão

- [ ] Revisar `public/api/storage-adapter.js` (filtros, erros e limitações de CORS).
- [ ] Revisar `public/js/fotos-shim.js` (resiliência, tempo de debounce e proteções contra loops).
- [ ] Testar manualmente em páginas-chave (`cadastro-evento.html`, `evento-detalhado.html`, `agenda-equipe.html`) via Live Server: executar `localStorage.setItem('fotosClientes', ...)` e verificar PATCH no Network.
- [ ] Garantir que variáveis de ambiente de produção (AUTH, BACKUP_UPLOAD_TOKEN, credenciais Firebase) não estão definidas inadvertidamente.

## Instruções rápidas para abrir o PR

1. Confirme o branch `cloud-migration-backup` e o push (já foi enviado).
2. Abra o link de comparação acima e cole este conteúdo como corpo do PR.

Se quiser que eu tente abrir o PR automaticamente, posso tentar usar `gh` (necessita configuração/auth); caso contrário, cole o corpo acima e crie o PR via interface web.

---
Autor: automação (atualizações locais e testes realizados)
