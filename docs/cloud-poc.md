# POC: Migração `fotosClientes` para "cloud" (POC local)

Este documento descreve o POC implementado no repositório para migrar a persistência de `fotosClientes` — inicialmente gravada como data-URIs em `localStorage` — para um backend que armazena arquivos e retorna URLs.

Resumo do que foi implementado (POC):

- Endpoint server-side: `POST /fotos-clientes/upload` (requer autenticação como os endpoints existentes).
  - Input: JSON `{ key, data }` onde `data` é uma data-URL base64 (ex.: `data:image/png;base64,...`).
  - Comportamento POC: salva o arquivo em `public/uploads/<tenantId>/<key>-<timestamp>.png` e atualiza `data/fotos-clientes.json` para que a chave aponte para a URL retornada (`/uploads/<tenantId>/...`).
  - Resposta: `{ ok: true, url: "/uploads/tenant/arquivo.png" }`.
  - Nota: se o Firebase Storage estiver configurado (`FIREBASE_*` no `.env`), o código existente também fará upload de JSONs para o bucket, mas a rota de upload por enquanto salva localmente.

- Cliente: `api/storage-adapter.js` foi adaptado:
  - `patchFotos`: se o valor a ser gravado for uma data-URL (`data:`), o adapter enviará `POST /fotos-clientes/upload` com `{ key, data }` e, se o upload retornar `url`, usará esse URL para atualizar o mapa (`PATCH /fotos-clientes` com `{ key, value: url }`).
  - Backward compatible: se upload falhar, o adapter faz o `PATCH` normal com o conteúdo original.

  - Presign S3 (opcional): o servidor agora expõe `POST /fotos-clientes/presign` quando as variáveis AWS estiverem configuradas. O fluxo é:
    1. Cliente pede `POST /fotos-clientes/presign` com `{ key, contentType }`.
    2. O servidor responde `{ ok: true, presignUrl, publicUrl }`.
    3. O cliente faz `PUT` direto para `presignUrl` com o corpo binário e `Content-Type` adequado.
    4. Depois do `PUT` bem-sucedido, o cliente grava `publicUrl` no mapa via `PATCH /fotos-clientes`.

    Para ativar isso em produção, defina as variáveis de ambiente no servidor / CI:
    - `AWS_ACCESS_KEY_ID`
    - `AWS_SECRET_ACCESS_KEY`
    - `S3_BUCKET`
    - `AWS_REGION`
    Sem essas variáveis o servidor continuará respondendo o endpoint de upload POC local (`/fotos-clientes/upload`).

- Vantagem imediata: reduz o peso do JSON `fotos-clientes.json` (removendo data-URIs enormes), permitindo armazenar as imagens como arquivos e o mapa apenas com referências.

Próximos passos recomendados para produção (opcional):

1. Trocar o POC local por um upload direto para S3/Firebase/GCS:
   - Implementar upload para S3 ou geração de `presigned URLs` usando AWS SDK (requer adicionar dependência e configurar `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `AWS_REGION` como secrets/vars). Ou usar Firebase Storage já iniciado no projeto (preencher `FIREBASE_*` vars).
   - Tornar o retorno do endpoint um URL público (ou presigned) e manter a gravação do mapa `fotos-clientes.json` apontando para esse URL.

2. CI: não incluir chaves no código. Adicionar secrets no GitHub (`Settings -> Secrets`) quando for habilitar integração com S3/Firebase para testes em CI.

3. Limpeza/retention: considerar lifecycle policies no bucket (S3) ou TTL para arquivos antigos e remoção ao sobrescrever/remover chave (quando `value === null`).

4. Caching/CDN: usar um CDN (CloudFront / Firebase CDN) para servir imagens em produção.

Como testar localmente:

- Rode a API localmente (`node server.js` ou via `scripts/run-tests-clean.ps1` que já inicia o servidor). 
- Na UI, selecione/adicione uma foto (o shim do frontend já chama `storageAdapter.patchFotos`) — o adapter fará upload ao endpoint que criei e atualizará o mapa com a URL.
- Verifique `public/uploads/<tenantId>/` e `data/fotos-clientes.json`.

Se quiser, eu prossigo e implemento o upload direto para S3 (POC), mas vou precisar que você adicione secrets no repositório ou me autorize a trabalhar com variáveis locais aqui.  

---

Implementado por: mudanças automáticas solicitadas no repositório (POC local).