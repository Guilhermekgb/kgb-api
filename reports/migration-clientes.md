# Migration POC — `clientes`

Objetivo
- Demonstrar a migração incremental de `clientes` do armazenamento local (localStorage/sessionStorage) para persistência centralizada (backend `kgb-api`).

O que já foi feito
- Adicionado `POST /api/storage-backup` e mecanismo de armazenamento em `kgb-api/data/backups`.
- Adicionado rotina de limpeza automática para backups.
- Implementado um adapter client-side (`api/firebase-clientes.js`) que agora tenta, em ordem:
  1. Firestore (se configurado),
 2. Backend `GET/POST/PUT /clientes` (API interna),
 3. fallback para `localStorage` quando os anteriores falham.

Plano POC (passos recomendados)
1. Teste manual: abrir `cadastro-cliente.html` no browser e salvar um cliente. Verificar que o cliente é persistido no backend (arquivo `kgb-api/data/clientes.json` e na tabela `clientes` do SQLite se aplicável).
2. Validar a listagem: abrir `clientes-lista.html` e confirmar que exibe o cliente salvo via API.
3. Adicionar testes automatizados simples (opcional): script que faz POST /clientes e GET /clientes para verificar persistência.
4. Depois de validar, replicar o mesmo padrão para outras entidades prioritárias (ex.: `eventos`, `leads`).

Notas técnicas
- O adapter em `api/firebase-clientes.js` permite a transição sem mudanças massivas nos HTMLs — o arquivo já é importado por `cadastro-cliente.html`.
- Caso deseje uma migração mais controlada, podemos modificar `cadastro-cliente.html` para exibir um banner de "Salvar no servidor" com opção de forçar local-only.

Próximo passo sugerido
- Executar o teste manual descrito no passo 1 e me reportar o resultado; posso então ajustar o adapter ou promover a migração para mais arquivos.
