# LocalStorage Migration Roadmap


Total lines scanned: 522

Literal keys: 189  |  Dynamic keys: 333


## Top 10 files (by total localStorage mentions)

1. cardapios-e-produtos.js — total: 26, literal:21, dynamic:5

2. itens-evento.html — total: 21, literal:20, dynamic:1

3. definicoes-evento.js — total: 19, literal:10, dynamic:9

4. lista-evento.html — total: 18, literal:18, dynamic:0

5. cliente-detalhado.html — total: 16, literal:16, dynamic:0

6. financeiro-categorias.js — total: 15, literal:13, dynamic:2

7. kgb-formaturas-checkin.html — total: 14, literal:0, dynamic:14

8. public/js/area-cliente.js — total: 13, literal:1, dynamic:12

9. financeiro-resumo.html — total: 11, literal:7, dynamic:4

10. kgb-common.js — total: 11, literal:5, dynamic:6


## Top 10 keys (literal)

1. API_BASE — count: 57, files: financeiro-evento.html(2), financeiro-lancamentos.html(2), kgb-common.js(2), teste-api.html(2), agenda-equipe.html(1), alertas.html(1), area-cliente.html(1), cadastro-cliente.html(1), cadastro-evento.html(1), cadastro-usuario.html(1)

2. eventos — count: 20, files: lista-evento.html(8), definicoes-evento.js(5), itens-evento.html(4), documentos-evento.js(1), eventos.html(1), public/js/area-cliente.js(1)

3. eventoSelecionado — count: 10, files: itens-evento.html(4), documentos-evento.js(2), eventos.html(1), js/utils-evento-id.js(1), lista-evento.html(1), relatorio-evento.html(1)

4. financeiroGlobal — count: 9, files: financeiro-categorias.js(5), financeiro-resumo.html(2), documentos-evento.js(1), itens-evento.html(1)

5. produtosBuffet — count: 6, files: cardapios-e-produtos.js(4), definicoes-evento.js(1), itens-evento.html(1)

6. adicionaisBuffet — count: 6, files: cardapios-e-produtos.js(5), itens-evento.html(1)

7. cardapiosBuffet — count: 6, files: cardapios-e-produtos.js(5), definicoes-evento.js(1)

8. auth.token — count: 6, files: cliente-detalhado.html(6)

9. configFinanceiro:ping — count: 6, files: financeiro-categorias.js(6)

10. servicosBuffet — count: 5, files: cardapios-e-produtos.js(4), itens-evento.html(1)


## Suggested migration blocks (example)


### Bloco 1: Cardapios/Produtos

- cardapios-e-produtos.js
- cardapios-e-produtos.html
- montagem-cardapio.html


### Bloco 2: Eventos

- itens-evento.html
- definicoes-evento.js
- lista-evento.html
- kgb-formaturas-tipos-evento.html
- documentos-evento.js
- responsavel-eventos.html
- kgb-formaturas-eventos.js
- eventos.html
- js/utils-evento-id.js
- eventos-arquivados.js


### Bloco 3: Financeiro

- definicoes-evento.js
- financeiro-categorias.js
- financeiro-resumo.html
- kgb-formaturas-financeiro.html
- financeiro-config.js
- fin-cartao.js
- financeiro-evento.html
- financeiro-lancamentos.html
- financeiro-relatorios.js
- definicoes-evento.html


### Bloco 4: Clientes

- cliente-detalhado.html
- public/js/area-cliente.js
- clientes-lista.js
- cadastro-cliente.html
- formulario-cliente.html
- area-cliente.html
- clientes-lista.html


### Bloco 5: Formaturas

- kgb-formaturas-checkin.html
- kgb-formaturas-formulario-online.html
- kgb-formaturas-tipos-evento.html
- kgb-formaturas-escolas.html
- kgb-formaturas-formularios-recebidos.html
- kgb-formaturas-relatorios.js
- kgb-formaturas-dashboard.html
- kgb-formaturas-eventos.js
- kgb-formaturas-inadimplentes-arquivo.html
- kgb-formaturas-configuracoes.html


### Bloco 6: Fotos

- public/js/fotos-shim.js
- scripts/replace-fotos-sync-reads.js


### Bloco 7: Modelos

- kgb-formaturas-modelos-convite.html
- modelos-checklist.html
- variaveis-modelos.html
- modelos.html