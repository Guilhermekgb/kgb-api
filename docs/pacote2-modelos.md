# Pacote 2 — Modelos de Dados (resumo implícito pelas telas)

Entidades identificadas e campos mínimos (só campos essenciais para começar a API):

## LEAD / ORCAMENTO
- Entidade principal usada por: `orcamento.html`, `orcamento-detalhado.html`, `lista-propostas.html`, `funil-leads.html`.
- Campos mínimos:
  - `id` (string)
  - `nome` (string)
  - `email` (string)
  - `whatsapp` / `telefone` (string)
  - `data_evento` (YYYY-MM-DD) / `dataISO` (string)
  - `horario_evento` (HH:MM)
  - `local_evento` (string)
  - `convidados` / `qtd` (number)
  - `tipo_evento` (string)
  - `como_conheceu` (string)
  - `responsavel` / `responsavel_nome` (string)
  - `observacoes` (string)
  - `itens` (array) — cardápios, adicionais, pacotes (estrutura livre inicialmente)
  - `valor_total_cents` (integer) ou `valor_total` (string) — preferir cents no backend
  - `desconto_cents` / `desconto_percent` (opcional)
  - `status` (string: ex. `novo|enviada|vista|aceita|recusada|arquivado`)
  - `criadoEm` / `created_at` (ISO)
  - `arquivado` (boolean)
  - `stats` (obj: `views`, `lastView`)

Operações necessárias:
- listar (`GET /leads`), filtrar por `?q=`, `?status=`, `?from=&to=`, `?vendedor_id=`, paginação
- detalhar (`GET /leads/:id`)
- criar (`POST /leads`)
- atualizar (`PUT /leads/:id`)
- excluir / arquivar (`DELETE /leads/:id` ou `PUT status=arquivado`)

---

## PROPOSTA
- Muitas telas tratam `proposta` como apresentação de um `lead/orcamento`. Inicialmente pode ser o mesmo recurso `leads` com `mode=proposta`.
- Campos mínimos:
  - `id`, `lead_id`, `criadoEm`, `status`, `visualizacoes`, `responsavel`, `valores`.

Operações:
- listar propostas (pode ser `GET /leads?type=proposta`)
- detalhar (`GET /leads/:id`)

---

## DEGUSTACAO (slots disponíveis)
- Usada por `degustacoes-disponiveis.html` e integrada ao fluxo de agendamento.
- Campos mínimos (slot):
  - `id` (string) — para persistência
  - `data` (YYYY-MM-DD)
  - `hora` (HH:MM)
  - `cardapio` (string)
  - `local` (string)

Operações necessárias:
- listar slots (`GET /degustacoes`)
- criar slot (`POST /degustacoes`)
- detalhar (`GET /degustacoes/:id`)
- atualizar (`PUT /degustacoes/:id`)
- excluir (`DELETE /degustacoes/:id`)

Adicional: agenda/agendamentos (confirmados)
- `agenda` entries (tipo: `degustacao`) com: `id`, `tipo`, `titulo`, `data`, `hora`, `local`, `casalNome`, `casalWhats`, `acompanhantes`, `pessoasTotal`, `compareceu`, `observacoes`, `criadoEm`.
- Endpoints: `GET /agenda?tipo=degustacao`, `POST /agenda`, `PUT /agenda/:id`, `DELETE /agenda/:id`.

---

## COMISSAO
- Usada por `comissoes.html`.
- Campos mínimos:
  - `id`, `vencimento_iso`, `evento_id`/`evento_nome`, `vendedor_id`/`vendedor_nome`, `valor_cents`, `status` (`pendente|pago`), `pago_em_iso`.

Operações:
- `GET /comissoes` (filtros por mês, status, vendedor)
- `PUT /comissoes/:id` (ex.: marcar como pago)

---

## NOTIFICACAO_VENDEDOR (notificações internas)
- Usada por `notificacoes-vendedor.html`.
- Campos mínimos:
  - `id`, `titulo`, `mensagem`/`body`, `tipo`, `lida` (boolean), `created_at`, `usuario_id`, `link` (opcional)

Operações:
- `GET /notificacoes?usuario_id=&unread=true` 
- `PUT /notificacoes/:id` para marcar lida
- `PUT /notificacoes/mark-read` (bulk)

---

Observação final: adotar representação de valores em CENTS (inteiros) e timestamps em ISO no backend, conforme padrão existente no repositório.
