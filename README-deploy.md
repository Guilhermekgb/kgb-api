# Deploy instructions (quick start)

Este arquivo descreve passos rápidos para colocar o `kgb-api` online.

1) Preparar variáveis de ambiente

- Configure estas variáveis no provedor (Render, Railway, Fly, etc.) ou em um arquivo `.env` local:
  - `CLOUDINARY_CLOUD_NAME` ou `CLOUDINARY_URL`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
  - `NODE_ENV=production`
  - `PORT` (se necessário)

2) Rodar localmente com Docker (teste rápido)

```powershell
cd 'C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api'
docker build -t kgb-api:latest .
docker run -p 3333:3333 -e NODE_ENV=production -e PORT=3333 -v ${PWD}:/usr/src/app/data kgb-api:latest
```

ou com `docker-compose`:

```powershell
cd 'C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api'
docker-compose up --build -d
```

3) Deploy rápido em PaaS (Render / Railway)

- Conecte o repositório e a branch.
- Configure a build command (normalmente `npm ci && npm run build` se houver build) e o start command `node server.js`.
- Adicione as variáveis de ambiente no painel do serviço.

4) CI: Build e publicar imagem

- Recomendo criar um workflow no GitHub Actions para buildar e publicar a imagem no `ghcr.io` ou Docker Hub e opcionalmente chamar a API do provedor para fazer o deploy.

5) Migrar assets

Se tiver arquivos em `public/uploads/`, rode o script de migração localmente:

```powershell
cd 'C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api'
node .\scripts\migrate-uploads-to-cloudinary.js
```

6) Segurança

- Nunca exponha chaves no cliente. Use apenas endpoints server-side.
- Depois de criar tokens temporários para deploy, revoke-os se necessário.
