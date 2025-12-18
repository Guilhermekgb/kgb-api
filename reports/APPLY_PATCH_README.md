Arquivo de patch criado para aplicar remoção dos includes de `fotos-shim.js`.

Opções para aplicar:

1) Aplicar o patch via `git am` (quando o repositório tem histórico e aceita mbox):














- Teste localmente servindo a raiz com `npx http-server -c-1 -p 5500` e rodando `node kgb-api/tests/headless-file-area.js`.- O patch modifica quatro arquivos no root: `cadastro-cliente.html`, `cadastro-evento.html`, `evento-detalhado.html` e `lista-evento.html`.Observações:3) Se preferir, eu posso tentar adicionar um remote e fazer push/abrir PR no GitHub — me autorize dizendo `push`.   git apply /path/to/reports/remove-fotos-shim.diff   cd /path/to/your/repo2) Aplicar o diff diretamente via `git apply` (quando preferir apenas aplicar alterações locais):   git am /path/to/reports/remove-fotos-shim.mboxn   cd /path/to/your/repo