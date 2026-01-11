# Pacote 2 — Endpoints mínimos propostos

Base: todas as rotas assumem autenticação JWT via `Authorization: Bearer <token>` e `requireAuth` no backend.

## LEADS / ORCAMENTOS / PROPOSTAS
- GET /leads
  - Query: `?q=&status=&from=&to=&vendedor_id=&page=&pageSize=` 
  - Retorna lista paginada `{ ok: true, data: [...], total }`
- POST /leads
  - Body: lead parcial/complete (criação ou upsert)
- GET /leads/:id
  - Retorna lead completo
- PUT /leads/:id
  - Atualiza lead (status, responsável, valores, itens)
- DELETE /leads/:id
  - Remove ou marca como `arquivado` (design: preferir marcar `status=arquivado`)

Notas: propostas podem ser derivadas dos `leads` (ex.: `type=proposta` ou `status=proposta`).

## DEGUSTAÇÕES (slots)
- GET /degustacoes
- POST /degustacoes
- GET /degustacoes/:id
- PUT /degustacoes/:id
- DELETE /degustacoes/:id

## AGENDA / AGENDAMENTOS
- GET /agenda?tipo=degustacao&from=&to=&vendedor_id=
- POST /agenda
- PUT /agenda/:id
- DELETE /agenda/:id

## COMISSÕES
- GET /comissoes?mes=YYYY-MM&status=&vendedor_id=&page=&pageSize=
- GET /comissoes/:id
- PUT /comissoes/:id (ex.: marcar pagamento)

## NOTIFICAÇÕES
- GET /notificacoes?usuario_id=&unread=true&page=&pageSize=
- PUT /notificacoes/:id (marcar lida)
- PUT /notificacoes/mark-read (body: { ids: [...] })

## Endpoints auxiliares úteis
- GET /cardapios (se necessário para preencher listas em `orcamento`)
- GET /responsaveis (listar vendedores/usuarios para selects)
- GET /degustacoes/slots (mesma coisa que /degustacoes)

## Filtros/pagination padrão
- `?q=` — busca texto livre sobre campos nome, local, status.
- `?status=` — status enumerado.
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — filtro por data do evento/vencimento.
- `?vendedor_id=` — restringe a um vendedor (RBAC: vendedor só vê seus registros).
- `?page=&pageSize=` — paginação simples.

## RBAC (descrição, não implementação)
- Admin: acesso total
- Vendedor: normalmente `GET` e `POST` apenas para seus registros; listar deveria aplicar `vendedor_id` automaticamente se necessário.
