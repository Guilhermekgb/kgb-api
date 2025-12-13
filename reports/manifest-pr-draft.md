# PR Draft: report: localstorage uses manifest

Resumo
- Este PR adiciona o arquivo `kgb-api/reports/localstorage-uses.json` — um manifesto machine-readable com todas as ocorrências de `localStorage` e `sessionStorage` no repositório.

Por que
- Fornece inventário preciso para planejar a migração do armazenamento local para um backend/cloud.

O que contém
- `kgb-api/reports/localstorage-uses.json` (1.833 matches)
- `kgb-api/reports/filters/` — views filtradas por palavras-chave (geradas automaticamente).

Próximos passos sugeridos
1. Revisar o manifesto e priorizar entidades (ex.: `clientes`, `eventos`, `token`).
2. Implementar endpoint `/api/storage-backup` para receber exports do navegador.
3. Migrar incrementalmente módulos, começando por `clientes` (POC).

Notas
- Este PR é um rascunho: não altera código de runtime, apenas adiciona artefatos de relatório.
