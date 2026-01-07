# Relatório de Auditoria Frontend

> Gerado em: 2026-01-07T03:20:55.405Z
> Comando: node tools/auditar-frontend.js

## Resumo
- Páginas testadas: 112
- Base URL: http://127.0.0.1:5500/

---

### _audit/hub-testes.html
URL: http://127.0.0.1:5500/_audit/hub-testes.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### acesso-negado.html
URL: http://127.0.0.1:5500/acesso-negado.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:13:12.554Z] [remote-adapter] stub carregado (disabled)

---

### agenda-equipe.html
URL: http://127.0.0.1:5500/agenda-equipe.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### agenda.html
URL: http://127.0.0.1:5500/agenda.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### alertas.html
URL: http://127.0.0.1:5500/alertas.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### area-cliente.html
URL: http://127.0.0.1:5500/area-cliente.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### assinatura.html
URL: http://127.0.0.1:5500/assinatura.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### auditoria.html
URL: http://127.0.0.1:5500/auditoria.html
- console.error: 4
- console.warn: 4
- exceções JS (uncaught): 0
- requests falhados: 2
- respostas com status >= 400: 0

**console.error**
- [2026-01-07T03:13:33.121Z] Access to fetch at 'https://kgb-api.onrender.com/audit/log?from=2025-12-31&to=2026-01-07&tenantId=default' from origin 'http://127.0.0.1:5500' has been blocked by CORS policy: Request header field x-tenant-id is not allowed by Access-Control-Allow-Headers in preflight response.
- [2026-01-07T03:13:33.123Z] Failed to load resource: net::ERR_FAILED
- [2026-01-07T03:13:33.124Z] Access to fetch at 'https://kgb-api.onrender.com/audit/log?limit=500' from origin 'http://127.0.0.1:5500' has been blocked by CORS policy: Request header field x-tenant-id is not allowed by Access-Control-Allow-Headers in preflight response.
- [2026-01-07T03:13:33.124Z] Failed to load resource: net::ERR_FAILED

**console.warn**
- [2026-01-07T03:13:33.123Z] [Auditoria] fetch remoto falhou, tentando handlers locais → Failed to fetch
- [2026-01-07T03:13:33.124Z] [Auditoria] Nenhum handler de API disponível (remoto/local).
- [2026-01-07T03:13:33.124Z] [Auditoria] Falha ao carregar registros JSHandle@object
- [2026-01-07T03:13:33.124Z] [Auditoria] falhou: JSHandle@error

**Requests falhados**
- [2026-01-07T03:13:33.122Z] GET https://kgb-api.onrender.com/audit/log?from=2025-12-31&to=2026-01-07&tenantId=default — net::ERR_FAILED
- [2026-01-07T03:13:33.124Z] GET https://kgb-api.onrender.com/audit/log?limit=500 — net::ERR_FAILED

---

### backup.html
URL: http://127.0.0.1:5500/backup.html
- console.error: 2
- console.warn: 3
- exceções JS (uncaught): 0
- requests falhados: 1
- respostas com status >= 400: 0

**console.error**
- [2026-01-07T03:13:36.122Z] Access to fetch at 'https://kgb-api.onrender.com/backup/snapshot' from origin 'http://127.0.0.1:5500' has been blocked by CORS policy: Request header field x-tenant-id is not allowed by Access-Control-Allow-Headers in preflight response.
- [2026-01-07T03:13:36.127Z] Failed to load resource: net::ERR_FAILED

**console.warn**
- [2026-01-07T03:13:35.686Z] GET /backup/snapshot falhou: JSHandle@error
- [2026-01-07T03:13:35.699Z] GET /backup/snapshot falhou: JSHandle@error
- [2026-01-07T03:13:36.129Z] GET /backup/snapshot falhou: JSHandle@error

**Requests falhados**
- [2026-01-07T03:13:36.125Z] GET https://kgb-api.onrender.com/backup/snapshot — net::ERR_FAILED

---

### cadastro-cliente.html
URL: http://127.0.0.1:5500/cadastro-cliente.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### cadastro-evento.html
URL: http://127.0.0.1:5500/cadastro-evento.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:13:40.624Z] Falha ao carregar vendedores via API, usando memória interna. JSHandle@error

---

### cadastro-usuario.html
URL: http://127.0.0.1:5500/cadastro-usuario.html
- console.error: 1
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 1

**console.error**
- [2026-01-07T03:13:43.127Z] Failed to load resource: the server responded with a status of 404 ()

**console.warn**
- [2026-01-07T03:13:42.784Z] [remote-adapter] stub carregado (disabled)

**Respostas HTTP >= 400**
- [2026-01-07T03:13:43.126Z] 404 https://kgb-api.onrender.com/perfis — 

---

### cardapios-e-produtos.html
URL: http://127.0.0.1:5500/cardapios-e-produtos.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:13:46.537Z] [remote-adapter] stub carregado (disabled)

---

### categorias-gerais.html
URL: http://127.0.0.1:5500/categorias-gerais.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### checkin.html
URL: http://127.0.0.1:5500/checkin.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### checklist-execucao.html
URL: http://127.0.0.1:5500/checklist-execucao.html
- Erro ao abrir: `Navigation timeout of 30000 ms exceeded`
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### checklist-materiais.html
URL: http://127.0.0.1:5500/checklist-materiais.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### checklist.html
URL: http://127.0.0.1:5500/checklist.html
- Erro ao abrir: `Navigation timeout of 30000 ms exceeded`
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### cliente-detalhado.html
URL: http://127.0.0.1:5500/cliente-detalhado.html
- Erro ao abrir: `Navigation timeout of 30000 ms exceeded`
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:15:00.479Z] [remote-adapter] stub carregado (disabled)

---

### clientes-lista.html
URL: http://127.0.0.1:5500/clientes-lista.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### colaboradores.html
URL: http://127.0.0.1:5500/colaboradores.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### comissoes.html
URL: http://127.0.0.1:5500/comissoes.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### configuracoes.html
URL: http://127.0.0.1:5500/configuracoes.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### contrato.html
URL: http://127.0.0.1:5500/contrato.html
- console.error: 2
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 2

**console.error**
- [2026-01-07T03:15:41.217Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:15:41.224Z] Failed to load resource: the server responded with a status of 404 (Not Found)

**Respostas HTTP >= 400**
- [2026-01-07T03:15:41.216Z] 404 http://127.0.0.1:5500/health — Not Found
- [2026-01-07T03:15:41.224Z] 404 http://127.0.0.1:5500/health — Not Found

---

### criar-lead-teste.html
URL: http://127.0.0.1:5500/criar-lead-teste.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### custos-fixo.html
URL: http://127.0.0.1:5500/custos-fixo.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:15:46.851Z] [custos-fixo] elemento não encontrado: .total-item (linha da planilha)

---

### dashboard.html
URL: http://127.0.0.1:5500/dashboard.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### definicoes-evento.html
URL: http://127.0.0.1:5500/definicoes-evento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### degustacoes-disponiveis.html
URL: http://127.0.0.1:5500/degustacoes-disponiveis.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### detalhes-responsavel-evento.html
URL: http://127.0.0.1:5500/detalhes-responsavel-evento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### documentacao-api.html
URL: http://127.0.0.1:5500/documentacao-api.html
- console.error: 3
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 3

**console.error**
- [2026-01-07T03:16:00.250Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:16:00.560Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:16:01.070Z] Failed to load resource: the server responded with a status of 404 (Not Found)

**console.warn**
- [2026-01-07T03:16:01.075Z] [AUTH] Não autenticado (após segunda tentativa).

**Respostas HTTP >= 400**
- [2026-01-07T03:16:00.244Z] 404 http://127.0.0.1:5500/auth/me — Not Found
- [2026-01-07T03:16:00.561Z] 404 http://127.0.0.1:5500/auth/me — Not Found
- [2026-01-07T03:16:01.076Z] 404 http://127.0.0.1:5500/auth/me — Not Found

---

### documentos-evento.html
URL: http://127.0.0.1:5500/documentos-evento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### entradas-saidas.html
URL: http://127.0.0.1:5500/entradas-saidas.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### equipe.html
URL: http://127.0.0.1:5500/equipe.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### escala-evento.html
URL: http://127.0.0.1:5500/escala-evento.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 1
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:16:09.863Z] [remote-adapter] stub carregado (disabled)

**Requests falhados**
- [2026-01-07T03:16:09.803Z] GET https://unpkg.com/lucide@0.562.0/dist/umd/lucide.min.js — net::ERR_ABORTED

---

### esqueci-senha.html
URL: http://127.0.0.1:5500/esqueci-senha.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:16:13.470Z] [remote-adapter] stub carregado (disabled)

---

### estoque-insumos.html
URL: http://127.0.0.1:5500/estoque-insumos.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### estoque-materiais.html
URL: http://127.0.0.1:5500/estoque-materiais.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:16:18.432Z] guard.enforce requested — not persisted in cloud-only mode

---

### estoque-setores.html
URL: http://127.0.0.1:5500/estoque-setores.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### etiquetas.html
URL: http://127.0.0.1:5500/etiquetas.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### evento-detalhado.html
URL: http://127.0.0.1:5500/evento-detalhado.html
- Erro ao abrir: `Navigation timeout of 30000 ms exceeded`
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:16:25.800Z] [Evento detalhado] Nenhum ID de evento encontrado na URL/memória.

---

### eventos-arquivados.html
URL: http://127.0.0.1:5500/eventos-arquivados.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:16:56.636Z] [arq] Falha ao carregar eventos da API; retornando lista vazia. JSHandle@error

---

### eventos-pagos.html
URL: http://127.0.0.1:5500/eventos-pagos.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:16:58.930Z] guard.enforce requested for preview (not persisted)

---

### eventos.html
URL: http://127.0.0.1:5500/eventos.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### feiras.html
URL: http://127.0.0.1:5500/feiras.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### fichas-tecnicas.html
URL: http://127.0.0.1:5500/fichas-tecnicas.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### financeiro-analises.html
URL: http://127.0.0.1:5500/financeiro-analises.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### financeiro-categorias.html
URL: http://127.0.0.1:5500/financeiro-categorias.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### financeiro-config.html
URL: http://127.0.0.1:5500/financeiro-config.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### financeiro-evento.html
URL: http://127.0.0.1:5500/financeiro-evento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### financeiro-lancamentos.html
URL: http://127.0.0.1:5500/financeiro-lancamentos.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### financeiro-resumo.html
URL: http://127.0.0.1:5500/financeiro-resumo.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### formulario-cliente.html
URL: http://127.0.0.1:5500/formulario-cliente.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### formulario-lead.html
URL: http://127.0.0.1:5500/formulario-lead.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### fornecedores.html
URL: http://127.0.0.1:5500/fornecedores.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### funil-leads.html
URL: http://127.0.0.1:5500/funil-leads.html
- console.error: 0
- console.warn: 5
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:17:32.555Z] [remote-adapter] stub carregado (disabled)
- [2026-01-07T03:17:33.324Z] [HIST] Erro ao preparar envio de movimentação para API: JSHandle@error
- [2026-01-07T03:17:33.325Z] [HIST] Erro ao preparar envio de movimentação para API: JSHandle@error
- [2026-01-07T03:17:33.327Z] [HIST] Erro ao preparar envio de movimentação para API: JSHandle@error
- [2026-01-07T03:17:33.336Z] [HIST] Erro ao preparar envio de movimentação para API: JSHandle@error

---

### gerenciar-convites.html
URL: http://127.0.0.1:5500/gerenciar-convites.html
- console.error: 1
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 1
- respostas com status >= 400: 1

**console.error**
- [2026-01-07T03:17:34.560Z] Failed to load resource: the server responded with a status of 404 (Not Found)

**Requests falhados**
- [2026-01-07T03:17:34.564Z] GET http://127.0.0.1:5500/js/convites.js — net::ERR_ABORTED

**Respostas HTTP >= 400**
- [2026-01-07T03:17:34.564Z] 404 http://127.0.0.1:5500/js/convites.js — Not Found

---

### index.html
URL: http://127.0.0.1:5500/index.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### integracoes.html
URL: http://127.0.0.1:5500/integracoes.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### itens-evento.html
URL: http://127.0.0.1:5500/itens-evento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-aluno-detalhe.html
URL: http://127.0.0.1:5500/kgb-formaturas-aluno-detalhe.html
- console.error: 1
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 1

**console.error**
- [2026-01-07T03:17:45.022Z] Failed to load resource: the server responded with a status of 404 (Not Found)

**Respostas HTTP >= 400**
- [2026-01-07T03:17:45.021Z] 404 http://127.0.0.1:5500/logo-kgb-dourado.png — Not Found

---

### kgb-formaturas-alunos.html
URL: http://127.0.0.1:5500/kgb-formaturas-alunos.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-checkin.html
URL: http://127.0.0.1:5500/kgb-formaturas-checkin.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-configuracoes.html
URL: http://127.0.0.1:5500/kgb-formaturas-configuracoes.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-contratos.html
URL: http://127.0.0.1:5500/kgb-formaturas-contratos.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:17:54.696Z] portalWrite failed JSHandle@error

---

### kgb-formaturas-dashboard.html
URL: http://127.0.0.1:5500/kgb-formaturas-dashboard.html
- console.error: 0
- console.warn: 8
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:17:57.231Z] Não foi possível carregar logo salvo: JSHandle@error
- [2026-01-07T03:17:57.234Z] Erro ao carregar chave kgb_formaturas_financeiro_alunos JSHandle@error
- [2026-01-07T03:17:57.238Z] Erro ao carregar chave kgb_formaturas_arquivo_alunos JSHandle@error
- [2026-01-07T03:17:57.239Z] Erro ao carregar chave kgb_formaturas_formularios JSHandle@error
- [2026-01-07T03:17:57.241Z] Erro ao carregar chave kgb_formaturas_tiposEvento JSHandle@error
- [2026-01-07T03:17:57.241Z] Erro ao carregar chave kgb_formaturas_eventos JSHandle@error
- [2026-01-07T03:17:57.241Z] Erro ao carregar chave kgb-formaturas-escolas JSHandle@error
- [2026-01-07T03:17:57.242Z] Erro ao ler kgb-formaturas-escolas no resumo por escola: JSHandle@error

---

### kgb-formaturas-escolas.html
URL: http://127.0.0.1:5500/kgb-formaturas-escolas.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-eventos.html
URL: http://127.0.0.1:5500/kgb-formaturas-eventos.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-financeiro.html
URL: http://127.0.0.1:5500/kgb-formaturas-financeiro.html
- console.error: 0
- console.warn: 2
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:18:04.387Z] <i data-lucide="list-details"></i> icon name was not found in the provided icons object.
- [2026-01-07T03:18:04.406Z] <i data-lucide="list-details"></i> icon name was not found in the provided icons object.

---

### kgb-formaturas-formulario-online.html
URL: http://127.0.0.1:5500/kgb-formaturas-formulario-online.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-formularios-recebidos.html
URL: http://127.0.0.1:5500/kgb-formaturas-formularios-recebidos.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-inadimplentes-arquivo.html
URL: http://127.0.0.1:5500/kgb-formaturas-inadimplentes-arquivo.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-modelos-convite.html
URL: http://127.0.0.1:5500/kgb-formaturas-modelos-convite.html
- console.error: 0
- console.warn: 4
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:18:13.866Z] Erro ao carregar tipos de evento para modelos de convite JSHandle@error
- [2026-01-07T03:18:13.867Z] Erro ao carregar modelos de convite JSHandle@error
- [2026-01-07T03:18:13.872Z] Erro ao carregar logo da formatura JSHandle@error
- [2026-01-07T03:18:13.876Z] Erro ao carregar logo da formatura JSHandle@error

---

### kgb-formaturas-relatorios.html
URL: http://127.0.0.1:5500/kgb-formaturas-relatorios.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### kgb-formaturas-tipos-evento.html
URL: http://127.0.0.1:5500/kgb-formaturas-tipos-evento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### layout-editor.html
URL: http://127.0.0.1:5500/layout-editor.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### links.html
URL: http://127.0.0.1:5500/links.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### lista-evento.html
URL: http://127.0.0.1:5500/lista-evento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### lista-propostas.html
URL: http://127.0.0.1:5500/lista-propostas.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### login.html
URL: http://127.0.0.1:5500/login.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### logs-tecnicos.html
URL: http://127.0.0.1:5500/logs-tecnicos.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:18:34.569Z] portalWrite failed JSHandle@error

---

### logs.html
URL: http://127.0.0.1:5500/logs.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### menu-lateral.html
URL: http://127.0.0.1:5500/menu-lateral.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### modelo-base.html
URL: http://127.0.0.1:5500/modelo-base.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### modelos-checklist.html
URL: http://127.0.0.1:5500/modelos-checklist.html
- console.error: 2
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 1
- respostas com status >= 400: 2

**console.error**
- [2026-01-07T03:18:46.123Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:18:46.269Z] Failed to load resource: the server responded with a status of 404 (Not Found)

**Requests falhados**
- [2026-01-07T03:18:46.124Z] GET http://127.0.0.1:5500/api/auth.js — net::ERR_ABORTED

**Respostas HTTP >= 400**
- [2026-01-07T03:18:46.124Z] 404 http://127.0.0.1:5500/api/auth.js — Not Found
- [2026-01-07T03:18:46.269Z] 404 http://127.0.0.1:5500/auth/me — Not Found

---

### modelos.html
URL: http://127.0.0.1:5500/modelos.html
- Erro ao abrir: `Navigation timeout of 30000 ms exceeded`
- console.error: 2
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 1

**console.error**
- [2026-01-07T03:18:48.837Z] Failed to load resource: the server responded with a status of 404 ()
- [2026-01-07T03:18:48.839Z] JSHandle@error

**Respostas HTTP >= 400**
- [2026-01-07T03:18:48.834Z] 404 https://kgb-api.onrender.com/modelos — 

---

### montagem-cardapio.html
URL: http://127.0.0.1:5500/montagem-cardapio.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### notificacoes-internas.html
URL: http://127.0.0.1:5500/notificacoes-internas.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:19:23.479Z] [notificacoes-internas] falha ao sincronizar da nuvem: JSHandle@error

---

### notificacoes-responsavel.html
URL: http://127.0.0.1:5500/notificacoes-responsavel.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:19:25.761Z] [notificacoes-internas] falha ao sincronizar da nuvem: JSHandle@error

---

### notificacoes-vendedor.html
URL: http://127.0.0.1:5500/notificacoes-vendedor.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### notificacoes.html
URL: http://127.0.0.1:5500/notificacoes.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### obrigado.html
URL: http://127.0.0.1:5500/obrigado.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### orcamento-arquivado.html
URL: http://127.0.0.1:5500/orcamento-arquivado.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### orcamento-detalhado.html
URL: http://127.0.0.1:5500/orcamento-detalhado.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### orcamento.html
URL: http://127.0.0.1:5500/orcamento.html
- console.error: 3
- console.warn: 2
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 3

**console.error**
- [2026-01-07T03:19:41.534Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:19:41.535Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:19:41.536Z] Failed to load resource: the server responded with a status of 404 (Not Found)

**console.warn**
- [2026-01-07T03:19:41.476Z] [API_BASE] __API_BASE__ é read-only, mantendo valor atual
- [2026-01-07T03:19:41.544Z] [CATÁLOGO] Falha ao carregar catálogos da nuvem JSHandle@error

**Respostas HTTP >= 400**
- [2026-01-07T03:19:41.534Z] 404 http://127.0.0.1:5500/catalogo/cardapios — Not Found
- [2026-01-07T03:19:41.535Z] 404 http://127.0.0.1:5500/catalogo/adicionais — Not Found
- [2026-01-07T03:19:41.535Z] 404 http://127.0.0.1:5500/catalogo/servicos — Not Found

---

### painel-cobrancas.html
URL: http://127.0.0.1:5500/painel-cobrancas.html
- console.error: 0
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.warn**
- [2026-01-07T03:19:44.103Z] [painel-cobrancas] erro ao sincronizar com backend: JSHandle@error

---

### painel-leads.html
URL: http://127.0.0.1:5500/painel-leads.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### pdv.html
URL: http://127.0.0.1:5500/pdv.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### perfis.html
URL: http://127.0.0.1:5500/perfis.html
- console.error: 1
- console.warn: 2
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 1

**console.error**
- [2026-01-07T03:19:51.110Z] Failed to load resource: the server responded with a status of 404 ()

**console.warn**
- [2026-01-07T03:19:51.111Z] Não foi possível carregar perfis da API, usando apenas perfis fixos. JSHandle@error
- [2026-01-07T03:19:51.119Z] JSHandle@error

**Respostas HTTP >= 400**
- [2026-01-07T03:19:51.110Z] 404 https://kgb-api.onrender.com/perfis — 

---

### permissoes.html
URL: http://127.0.0.1:5500/permissoes.html
- console.error: 5
- console.warn: 4
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 5

**console.error**
- [2026-01-07T03:19:53.390Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:19:53.578Z] Failed to load resource: the server responded with a status of 404 ()
- [2026-01-07T03:19:53.774Z] Failed to load resource: the server responded with a status of 404 ()
- [2026-01-07T03:19:53.994Z] Failed to load resource: the server responded with a status of 404 ()
- [2026-01-07T03:19:54.230Z] Failed to load resource: the server responded with a status of 404 ()

**console.warn**
- [2026-01-07T03:19:53.587Z] Não foi possível carregar perfis da API. Usando apenas perfis fixos.
- [2026-01-07T03:19:53.783Z] Não foi possível carregar perfis da API. Usando apenas perfis fixos.
- [2026-01-07T03:19:54.000Z] Não foi possível carregar RBAC da API:
- [2026-01-07T03:19:54.235Z] Não foi possível carregar permissões da API.

**Respostas HTTP >= 400**
- [2026-01-07T03:19:53.387Z] 404 http://127.0.0.1:5500/auth/me — Not Found
- [2026-01-07T03:19:53.574Z] 404 https://kgb-api.onrender.com/perfis — 
- [2026-01-07T03:19:53.772Z] 404 https://kgb-api.onrender.com/perfis — 
- [2026-01-07T03:19:53.990Z] 404 https://kgb-api.onrender.com/permissoesApi — 
- [2026-01-07T03:19:54.226Z] 404 https://kgb-api.onrender.com/permissoesUi — 

---

### planilha-eventos.html
URL: http://127.0.0.1:5500/planilha-eventos.html
- Erro ao abrir: `Navigation timeout of 30000 ms exceeded`
- console.error: 2
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 1

**console.error**
- [2026-01-07T03:19:56.760Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:19:56.761Z] Erro ao carregar eventos: JSHandle@error

**Respostas HTTP >= 400**
- [2026-01-07T03:19:56.760Z] 404 http://127.0.0.1:5500/eventos — Not Found

---

### pos-evento.html
URL: http://127.0.0.1:5500/pos-evento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### proposta.html
URL: http://127.0.0.1:5500/proposta.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### redefinir-senha.html
URL: http://127.0.0.1:5500/redefinir-senha.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### relatorio-evento.html
URL: http://127.0.0.1:5500/relatorio-evento.html
- console.error: 2
- console.warn: 1
- exceções JS (uncaught): 0
- requests falhados: 1
- respostas com status >= 400: 0

**console.error**
- [2026-01-07T03:20:37.040Z] Access to fetch at 'https://kgb-api.onrender.com/fin/relatorios/extrato' from origin 'http://127.0.0.1:5500' has been blocked by CORS policy: Request header field x-tenant-id is not allowed by Access-Control-Allow-Headers in preflight response.
- [2026-01-07T03:20:37.045Z] Failed to load resource: net::ERR_FAILED

**console.warn**
- [2026-01-07T03:20:37.046Z] [Extrato evento] erro: JSHandle@error

**Requests falhados**
- [2026-01-07T03:20:37.042Z] GET https://kgb-api.onrender.com/fin/relatorios/extrato — net::ERR_FAILED

---

### responsavel-eventos.html
URL: http://127.0.0.1:5500/responsavel-eventos.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### seguranca.html
URL: http://127.0.0.1:5500/seguranca.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### set-api.html
URL: http://127.0.0.1:5500/set-api.html
- console.error: 2
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 2

**console.error**
- [2026-01-07T03:20:44.040Z] Failed to load resource: the server responded with a status of 404 (Not Found)
- [2026-01-07T03:20:44.050Z] Failed to load resource: the server responded with a status of 404 (Not Found)

**Respostas HTTP >= 400**
- [2026-01-07T03:20:44.039Z] 404 http://127.0.0.1:5500/health — Not Found
- [2026-01-07T03:20:44.050Z] 404 http://127.0.0.1:5500/health — Not Found

---

### teste-api.html
URL: http://127.0.0.1:5500/teste-api.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### uploads/orcamento.html
URL: http://127.0.0.1:5500/uploads/orcamento.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

---

### usuarios.html
URL: http://127.0.0.1:5500/usuarios.html
- console.error: 1
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0

**console.error**
- [2026-01-07T03:20:50.674Z] Erro ao carregar usuários: JSHandle@object

---

### variaveis-modelos.html
URL: http://127.0.0.1:5500/variaveis-modelos.html
- console.error: 0
- console.warn: 0
- exceções JS (uncaught): 0
- requests falhados: 0
- respostas com status >= 400: 0