# Bloco 1 — Migração Cardápios/Produtos (Resumo)

Data: (automatic)

Resumo das alterações aplicadas em `cardapios-e-produtos.js`:

- Adicionados helpers:
  - `apiGet(path, fallbackKey, fallbackValue)` — tenta buscar via `window.apiFetch`, e em caso de falha lê `localStorage` (fallbackKey).
  - `apiPut(path, data, fallbackKey)` — tenta enviar via `window.apiFetch` (PUT { data }), e em caso de falha grava no `localStorage` (fallbackKey).

- Alterado fluxo de carregamento inicial (`carregarDadosIniciais`) para usar API-first:
  - Endpoints consultados (preferenciais):
    - `/buffet/cardapios` -> fallback `produtosBuffet`
    - `/buffet/adicionais` -> fallback `adicionaisBuffet`
    - `/buffet/servicos` -> fallback `servicosBuffet`
  - Se a API responder, dados são usados e em seguida espelhados no `localStorage` (compatibilidade).
  - Se a API falhar, dados são carregados do `localStorage` como fallback.

- Alterado `salvarNoLocalStorage()` para manter gravação local, e os helpers `apiPut` podem ser usados para gravar remotamente com fallback automático para `localStorage`.

Chaves locais afetadas (legado):
- `produtosBuffet`
- `cardapiosBuffet` (espelho derivado de `produtosBuffet`)
- `adicionaisBuffet`
- `servicosBuffet`

Observações / próximos passos:
- Backend: confirme existência dos endpoints GET/PUT em `/buffet/*` (ou adapte para `/catalogo/*` se preferir manter o backend atual).
- É intencional manter uma cópia em `localStorage` para compatibilidade com telas legadas; ao estabilizar a API, podemos remover gradualmente a dependência local.
- Testes: abrir a tela de cardápios, validar carregamento sem erros com e sem API disponível; verificar console para mensagens de fallback.

Commit sugerido:
- `Cloud: migrate buffet produtos/cardapios to apiFetch with fallback`
