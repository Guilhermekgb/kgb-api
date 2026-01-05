# Bloco2 — Migração frontend: eventos (resumo)

## Endpoints criados
- GET  /eventos        -> retorna array de eventos
- PUT  /eventos        -> substitui lista completa de eventos
- GET  /eventos/:id    -> retorna 1 evento por id
- PUT  /eventos/:id    -> atualiza (upsert) um evento

Todos usam autenticação via `requireAuth` e persistem em `kv_store` (chave: `eventos`).

## Arquivos frontend alterados
- lista-evento.html: agora usa `eventosApiGet` para carregar (API-first) e `eventosApiPut` ao excluir eventos; mantém fallback local.
- definicoes-evento.js: `carregarEvento` tenta `eventosApiGet` quando não encontra o evento no `localStorage`.
- itens-evento.html: handler de salvar itens agora chama `eventosApiPut` (API-first) com fallback para `localStorage`.
- kgb-common.js: adicionados helpers `eventosApiGet` e `eventosApiPut` (expostos em `window`) que usam `window.apiFetch`/`fetch` e espelham resultados no `localStorage`.

## Chaves `localStorage` ainda usadas (temporário)
- `eventoSelecionado` — permanece como seleção local temporária (não migrado).
- `eventos` — ainda usado como fallback local e espelhamento temporário.
- Vários módulos continuam lendo `eventos` para compatibilidade; migração por fases para `m30.eventos`/K_KEYS pode ocorrer futuramente.

## Observações
- A migração é não intrusiva: quando a API estiver disponível, as telas carregam os eventos da nuvem e espelham no `localStorage` para compatibilidade.
- Salvamentos preferem a API (`PUT /eventos`) e caem para o `localStorage` em caso de falha.

## Próximo passo sugerido
- Testar `lista-evento.html` em Live Server: criar evento, salvar e reload; confirmar que `/eventos` na API contém o registro.
- Se estiver OK, commit + push das mudanças frontend.
