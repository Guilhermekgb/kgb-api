# Relatório PROD — Checagem de telas críticas
> Gerado em: 2026-01-07T04:16:57.594Z

## Resumo
- Páginas pretendidas: 5
- Páginas testadas: 5


---

### orcamento.html
- URL: http://127.0.0.1:5500/orcamento.html
- Abriu OK?: sim
- Chamou API Render?: não
- Teve status 4xx/5xx?: sim
  - Respostas >= 400:
    - [2026-01-07T04:16:14.198Z] 404 http://127.0.0.1:5500/catalogo/cardapios
    - [2026-01-07T04:16:14.199Z] 404 http://127.0.0.1:5500/catalogo/adicionais
    - [2026-01-07T04:16:14.200Z] 404 http://127.0.0.1:5500/catalogo/servicos
- Teve uso de localStorage? (heurística): não


---

### orcamento-detalhado.html
- URL: http://127.0.0.1:5500/orcamento-detalhado.html
- Abriu OK?: sim
- Chamou API Render?: não
- Teve status 4xx/5xx?: não
- Teve uso de localStorage? (heurística): não


---

### funil-leads.html
- URL: http://127.0.0.1:5500/funil-leads.html
- Abriu OK?: sim
- Chamou API Render?: sim
  - Rotas chamadas:
    - /funil/colunas
    - /auth/me
    - /leads
- Teve status 4xx/5xx?: não
- Teve uso de localStorage? (heurística): não


---

### cadastro-cliente.html
- URL: http://127.0.0.1:5500/cadastro-cliente.html
- Abriu OK?: sim
- Chamou API Render?: sim
  - Rotas chamadas:
    - /auth/me
- Teve status 4xx/5xx?: não
- Teve uso de localStorage? (heurística): não


---

### cliente-detalhado.html
- URL: http://127.0.0.1:5500/cliente-detalhado.html
- Abriu OK?: não
  - Erro ao abrir: `Navigation timeout of 30000 ms exceeded`
- Chamou API Render?: não
- Teve status 4xx/5xx?: não
- Teve uso de localStorage? (heurística): não
