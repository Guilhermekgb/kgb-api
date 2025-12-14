<#
  apply-shim-includes.ps1

  Procura arquivos HTML no diretório pai que contenham `kgb-common.js` e insere
  as tags do storage-adapter e fotos-shim após essa importação, se ainda não
  existirem.

  Uso:
    - With WhatIf:  .\apply-shim-includes.ps1 -WhatIf
    - Apply:        .\apply-shim-includes.ps1

  O script cria um backup `*.bak` antes de sobrescrever.
#>

[CmdletBinding()]
param(
    [switch]$WhatIf
)

$parent = Join-Path -Path (Get-Location) -ChildPath ".."
$htmlFiles = Get-ChildItem -Path $parent -Filter "*.html" -Recurse -ErrorAction SilentlyContinue
if (-not $htmlFiles) {
    Write-Output "Nenhum arquivo HTML encontrado em: $parent"
    exit 0
}

$insertionA = '<script src="./kgb-api/public/api/storage-adapter.js"></script>'
$insertionB = '<script src="./kgb-api/public/js/fotos-shim.js"></script>'

foreach ($f in $htmlFiles) {
    $text = Get-Content -Raw -Path $f.FullName -ErrorAction SilentlyContinue
    if ($null -eq $text) { continue }
    if ($text -notmatch "kgb-common.js") { continue }
    if ($text -match [regex]::Escape($insertionA) -and $text -match [regex]::Escape($insertionB)) {
        Write-Output "Já contém includes: $($f.FullName)"
        continue
    }

    # Insere imediatamente após a primeira ocorrência de kgb-common.js
    $pattern = '(<script[^>]*src\s*=\s*"\./kgb-common.js"[^>]*>\s*</script>)'
    if ($text -match $pattern) {
        $replacement = "`$1`n$insertionA`n$insertionB"
        $newText = [regex]::Replace($text, $pattern, $replacement, 1)
        Write-Output "Alterando: $($f.FullName)"
        if ($WhatIf) {
            Write-Output "[WhatIf] Arquivo que seria alterado: $($f.FullName)"
        } else {
            Copy-Item -Path $f.FullName -Destination "${($f.FullName)}.bak" -Force
            Set-Content -Path $f.FullName -Value $newText -Force
            Write-Output "Atualizado (backup em .bak): $($f.FullName)"
        }
    } else {
        Write-Output "Padrão não encontrado em: $($f.FullName)"
    }
}

Write-Output "Concluído. Use -WhatIf para simular."  
