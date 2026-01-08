# Validação pós-deploy Netlify (rode APÓS o status "Published")
# Copiar/colar no PowerShell do VS Code

mkdir tools\_netlify_dump -Force | Out-Null

Invoke-WebRequest "https://kgbprobuffet.netlify.app/api/api-config.js" -UseBasicParsing |
  Select-Object -ExpandProperty Content |
  Out-File "tools\_netlify_dump\api-config.prod.js" -Encoding utf8

Invoke-WebRequest "https://kgbprobuffet.netlify.app/kgb-common.js" -UseBasicParsing |
  Select-Object -ExpandProperty Content |
  Out-File "tools\_netlify_dump\kgb-common.prod.js" -Encoding utf8

Write-Host "`n=== PROVA: api-config.prod.js contém __KGB_API_BASE__ ? ==="
Select-String -Path "tools\_netlify_dump\api-config.prod.js" -Pattern "__KGB_API_BASE__","kgb-api\.onrender\.com","isNetlify" -CaseSensitive:$false |
  ForEach-Object { "{0}:{1}  {2}" -f $_.Path,$_.LineNumber,$_.Line.Trim() }

Write-Host "`n=== PROVA: kgb-common.prod.js contém kgbResolveApiBase/apiFetch/kgbRenderFatal ? ==="
Select-String -Path "tools\_netlify_dump\kgb-common.prod.js" -Pattern "kgbResolveApiBase","window\.apiFetch","window\.kgbRenderFatal","window\.API_BASE" -CaseSensitive:$false |
  ForEach-Object { "{0}:{1}  {2}" -f $_.Path,$_.LineNumber,$_.Line.Trim() }

# Executa o checker Puppeteer (precisa de Node.js e dependências instaladas)
node tools/prod-check-2pages.js
