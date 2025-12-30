# Deploy rápido no Render (passo-a-passo)

Este guia descreve os passos mínimos para colocar `kgb-api` online no Render — tempo estimado: 20–40 minutos.

Pré-requisitos
- Conta no Render (https://render.com) — gratuita para testes.
- Repositório GitHub `Guilhermekgb/kgb-api` com a branch `fix/fotosclients-complete-migration` ou `chore/fotos-remove-sync-reads` (já criadas).

1) Criar Web Service
- No painel do Render: New → Web Service → Connect repository → selecione `Guilhermekgb/kgb-api`.
- Escolha a branch que deseja deployar (ex.: `fix/fotosclients-complete-migration` ou `main`).

2) Build & Start
- Build Command: deixe vazio ou `npm ci` (o projeto não precisa de build step especial por agora).
- Start Command: `node server.js`
- Environment: selecione `Node` e `18.x`.

3) Adicionar variáveis de ambiente (Environment)
- Em Render → Service → Environment → Add Environment Variable, adicione:
  - `CLOUDINARY_CLOUD_NAME` = (sua cloud name)
  - `CLOUDINARY_API_KEY` = (sua api key)
  - `CLOUDINARY_API_SECRET` = (sua api secret)
  - `NODE_ENV` = `production`
  - `PORT` = `3333` (opcional — Render fornece porta automaticamente, mas definir não faz mal)

4) Deploy automático
- Salve as variáveis e clique em Deploy. O Render fará clone, instalará dependências e executará `node server.js`.

5) Testes pós-deploy
- Acesse a URL pública fornecida pelo Render (ex.: `https://kgb-api.onrender.com`).
- Teste o endpoint Health / raiz e o upload:
  - Endpoint upload: `POST https://<sua-url>/fotos-clientes/upload` (use o form ou o script `scripts/test-firebase-upload.ps1` apontando para a URL de produção).

6) Migração de uploads (opcional)
- Se você tem arquivos antigos em `public/uploads/`, use o workflow do GitHub Actions `Migrate uploads to Cloudinary` (manual run) que eu adicionei.
- Para habilitar o workflow, no GitHub repo → Settings → Secrets → Actions, adicione:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
- Depois: GitHub → Actions → Migrate uploads to Cloudinary → Run workflow → selecione branch e execute.

7) Notas de produção
- Verifique se o `data/` (onde `data/fotos-clientes.json` vive) é persistente entre deploys. Render reinicia containers entre deploys; prefira manter esse índice em um storage externo (S3, DB) se for crítico.
- Configure domínio e HTTPS via painel do Render se desejar usar domínio próprio.

Se quiser, eu gero os comandos `curl` para testar os endpoints de upload/patch/health automaticamente.
