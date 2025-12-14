# Copilot instructions for this repo

This repository follows a user preference to always receive concise suggestions from the assistant and optionally allow the assistant to apply approved changes automatically.

Preference source: the file `.copilot-preferences.json` at the repository root controls assistant behavior. The keys are:

- `alwaysSuggest` (boolean): when `true`, the assistant always includes a short suggestion block in its replies.
- `autoApply` (boolean): when `true`, the assistant may proceed to implement non-destructive changes without asking for additional confirmation. When `false`, the assistant will ask for confirmation before applying changes.

Default suggestion format (the assistant will use this structure):

- **Sugestão:** ação concreta e curta (1 frase).
- **Por que:** motivo/resumo do benefício (1 frase).
- **Como executar:** comandos exatos em `powershell` ou trechos de código (copiar/colar).
- **Arquivos afetados:** lista de `caminho/arquivo` a editar.
- **Riscos/testes:** pontos a validar e comandos de teste.
- **Próximo passo:** opção para o usuário indicar `sim` ou `não` para que o assistente execute.

When making code changes, the assistant will create a small todo list entry (tracked in the agent UI) and update the repository with minimal, focused edits. The assistant will not perform destructive changes unless the user explicitly authorizes them.

If you prefer a different default (for example `autoApply: true`), edit `.copilot-preferences.json` or tell the assistant to change it for you.
<!-- Copilot instructions for kgb-api -->
# Resumo rápido

Este repositório contém duas peças principais:
- `server.js`: monólito Express (CommonJS) que implementa a maior parte das APIs (eventos, cobranças, assinaturas, arquivos, PDV e armazenamento). Usa SQLite via `better-sqlite3` e alguns dados são persistidos em arquivos JSON sob `data/`.
- `api.js` (ESM): micro-serviço menor focado em integrações de pagamento (usa `providers/mercadopago.js`).

Padrões importantes:
- Node >= 18 (usa ESM em alguns módulos e `fetch` nativo).
- Dinâmica: tokens/API keys podem vir por `.env` ou por payload (ex.: Mercado Pago provider aceita `credentials` no body).
- Dinheiro é representado em CENTS (inteiros). Datas e tempos são ISO strings (`*_iso` / `YYYY-MM-DD` para vencimentos).
- IDs são strings (UUIDs via `crypto.randomUUID()` em código).

# Execução / Debug
- Instalação: `npm install` dentro do diretório do serviço (`kgb-api`).
- Rodar durante desenvolvimento: `npm run dev` (executa `node server.js`).
- Porta padrão: `PORT` (ex.: 3333 no monólito; `api.js` usa 3001 por padrão). Use `.env` para configurar.

# Variáveis de ambiente importantes
- `PORT` — porta do servidor
- `WEBHOOK_SECRET` — segredo para webhooks
- `SQLITE_FILE` — caminho do banco SQLite (default: `./data.db`)
- `ALLOWED_ORIGINS` / `ALLOWLIST_ORIGINS` — origens permitidas para CORS (CSV)
- Firebase: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (atenção: **quebra de linha** precisa ser aplicada com replace de `\\n` → `\n` — já feito no código), `FIREBASE_STORAGE_BUCKET`
- Mercado Pago: `MP_ACCESS_TOKEN` / `MP_ACCESS_TOKEN_SANDBOX` (provider também aceita `credentials` em requests)

# Integrações & pontos de atenção
- Firebase Storage é opcional — o servidor inicializa o `admin` somente se todas as variáveis de credencial estiverem presentes.
- `mercadopago.mjs` é ESM; `server.js` usa import dinâmico para carregar providers (ver `getMercadoPagoProvider`).
- Roteiros úteis: `POST /api/providers/test` (valida credenciais do provider de pagamentos).
- Uploads são feitos com `multer` em memória e, se habilitado Firebase, gravados no bucket.

# Convenções de código e banco
- Tabelas SQLite usam campos `*_iso` para timestamps/datas e `*_cents` para valores monetários.
- Status/Enums estão codificados nas definições de tabela (ex.: `status` em parcelas: `pendente|pago|atrasado`). Siga os valores existentes ao adicionar lógica.
- Arquivos JSON de sincronização e configs ficam em `data/` (ex.: `clients`, `leads`, `journal.json`, `portal-tokens.json`).

# Como ajudar como assistente de codificação (exemplos práticos)
- Ao implementar rotas novas, preserve o padrão de resposta `{ ok: true, data }` ou `status`/`error` com mensagens claras.
- Use `crypto.randomUUID()` para gerar IDs quando padrão do projeto exigir strings únicas.
- Para alterações que tocam dados: documente migrações para a tabela SQLite e verifique índices (`CREATE INDEX IF NOT EXISTS` já usados no `server.js`).
- Para acesso a secrets (ex.: Firebase private key), adicionar instruções claras no `.env.example` e mencionar a necessidade de `replace('\\n', '\n')`.

# Referências rápidas (arquivos chave)
- `server.js` — monólito com a maior parte da lógica
- `api.js` — micro-serviço de pagamentos (ESM)
- `mercadopago.mjs` — provider Mercado Pago (exemplos de `testConnection` e `createCharge`)
- `package.json` — scripts e engines (Node >=18)

Se algo estiver impreciso ou faltar detalhe sobre fluxo de dados específico, me indique a área (ex.: cobranças, assinaturas, PDV) que eu gero instruções mais detalhadas e exemplos de mudanças.
