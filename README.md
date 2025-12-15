# kgb-api

[![Run tests](https://github.com/Guilhermekgb/kgb-api/actions/workflows/run-tests.yml/badge.svg)](https://github.com/Guilhermekgb/kgb-api/actions/workflows/run-tests.yml)

## Cloudinary (Upload de fotosClientes)

Pequenas instruções para configurar uploads de `fotosClientes` usando o Cloudinary (modo sem custos para desenvolvimento):

- **Variáveis de ambiente**: adicione as chaves abaixo no seu `.env` (não comitar `.env`):
	- `CLOUDINARY_CLOUD_NAME`
	- `CLOUDINARY_API_KEY`
	- `CLOUDINARY_API_SECRET`
	- `STORAGE_MODE=cloudinary`  # força uso do Cloudinary
- **Como testar**: o script `scripts/test-firebase-upload.ps1` envia uma requisição de exemplo para `POST /fotos-clientes/upload` e atualiza `data/fotos-clientes.json` com a URL pública retornada.
- **Fallbacks**: o servidor tenta (na ordem) Cloudinary -> Firebase Storage -> gravação local em `public/uploads/<tenant>`.
- **Limpeza local**: para remover arquivos de teste criados localmente execute (PowerShell):
	- `Remove-Item -Path .\public\uploads\default\* -Recurse -Force -WhatIf`  # remove (preview)
	- Remova `-WhatIf` para executar de fato.

Recomenda-se manter as chaves sensíveis fora do repositório (usar variáveis de ambiente na máquina ou no host de produção).