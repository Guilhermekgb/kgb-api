Resumo das inclusões do adapter+shim
===================================

O que foi feito localmente no workspace fora do repo `kgb-api`:

- Foram inseridas, em vários arquivos HTML que importam `./kgb-common.js`, as seguintes tags logo após essa importação:

  ```html
  <script src="./kgb-api/public/api/storage-adapter.js"></script>
  <script src="./kgb-api/public/js/fotos-shim.js"></script>
  ```

- Arquivos alterados (lista parcial): `dashboard.html`, `clientes-lista.html`, `cadastro-cliente.html`, `evento-detalhado.html`, `cadastro-evento.html`, `cliente-detalhado.html`, `agenda-equipe.html`, `itens-evento.html`, `financeiro-lancamentos.html`, `gerenciar-convites.html`, `eventos-pagos.html`, `logs.html`, `logs-tecnicos.html`, `modelos-checklist.html`, `modelos.html`, `pos-evento.html`, `backup.html`, `auditoria.html`, `alertas.html`, `agenda.html`, `checkin.html`, `categorias-gerais.html`, `checklist.html`, `checklist-materiais.html`, `cardapios-e-produtos.html`, `checklist-execucao.html`, `custos-fixo.html`, `contrato.html`, `configuracoes.html`, `comissoes.html`, `colaboradores.html` (e outros).

Por que não commitei esses HTML diretamente no repositório `kgb-api`:

- Esses arquivos estão localizados na raiz do workspace (`..\\sistema-buffet`) e não pertencem ao Git do diretório `kgb-api`. Para evitar commits em repositórios que você não queria alterar, apliquei as mudanças localmente e criei esta documentação + um script para reproduzir as alterações onde for desejado.

Como reproduzir automaticamente (opção segura):

- Existe um script PowerShell em `kgb-api/scripts/apply-shim-includes.ps1` que procura por arquivos HTML no diretório pai do repositório (`..`) que contenham `kgb-common.js` e insere as tags do adapter+shim caso não existam.

- Para executar (no Windows PowerShell, a partir de `kgb-api`):

```powershell
# execute a partir de c:\\path\\to\\sistema-buffet\\kgb-api
.\\scripts\\apply-shim-includes.ps1 -WhatIf  # primeiro veja o que seria alterado
.\\scripts\\apply-shim-includes.ps1         # remove o -WhatIf para aplicar
```

Notas de segurança:

- O script faz backup dos arquivos alterados adicionando a extensão `.bak` antes de sobrescrever.
- Teste primeiro com `-WhatIf`.

Próximo passo sugerido:

- Se quiser que eu aplique as alterações em disco e commite no repository raiz (ou inicialize um repo raiz e empurre), diga qual estratégia prefere. Caso prefira manter as alterações fora do repo `kgb-api`, posso adicionar um comentário no PR já aberto indicando que as inclusões foram feitas localmente e fornecer link para este relatório.

