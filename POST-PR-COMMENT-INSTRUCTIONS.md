# Como postar o comentário QA no PR (seguro, local)

Usei `kgb-api/pr_comment_result.txt` para gerar o comentário pronto. Recomendo postar o comentário localmente para manter seu token seguro.

Opção 1 — usar o PowerShell script que já existe (recomendado):

1. Abra PowerShell na pasta `kgb-api`:
```powershell
cd 'C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api'
```
2. Rode o script (ex.: PR #5):
```powershell
powershell -ExecutionPolicy Bypass -File .\post_pr_comment.ps1 -PRNumber 5
```
3. O script pedirá seu GitHub Personal Access Token (escopo `repo`) de forma interativa — cole o token temporário e pressione Enter.
4. O script validará o token e publicará o conteúdo de `pr_comment_result.txt` como comentário no PR. Ele mostrará a URL do comentário na saída.

Após uso, revogue o token em https://github.com/settings/tokens.

Opção 2 — usar GitHub CLI (`gh`) se preferir (é preciso autenticar `gh` anteriormente):
```powershell
gh pr comment 5 --body-file pr_comment_result.txt
```

Se preferir, eu posso copiar o texto final do comentário aqui para você revisar/colar manualmente no PR — diga se quer que eu mostre o comentário pronto agora.
