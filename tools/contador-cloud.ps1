# ===== CONTADOR CLOUD DETALHADO =====

# Config
$ignoreDirs = @('node_modules','\.git','tools','dist')
$root = Get-Location

# Varrer arquivos .js e .html e excluir pastas indesejadas
$all = Get-ChildItem -Recurse -File -Include *.js,*.html -ErrorAction SilentlyContinue
$exRegex = '\\(' + ($ignoreDirs -join '|') + ')\\'
$files = $all | Where-Object { -not ($_.FullName -match $exRegex) }

$total = $files.Count
$legacy = 0
$legacyList = @()

# Padrões (case-insensitive)
$patterns = [ordered]@{
  'localStorage.getItem' = 'localStorage.getItem('
  'localStorage.setItem' = 'localStorage.setItem('
  'localStorage.removeItem' = 'localStorage.removeItem('
  'sessionStorage' = 'sessionStorage.'
  'fetch_direct' = '\bfetch\s*\('
  'apiFetch' = 'apiFetch'
  'API_BASE_decl' = '\b(?:const|let|var)\s+API_BASE\b'
  'mock_data' = '\b(mock|fake|exemplo|dadosTeste|dados_teste|mocked)\b'
}

foreach($f in $files){
  try{
    $raw = Get-Content -Raw -LiteralPath $f.FullName -ErrorAction SilentlyContinue
    if(-not $raw) { continue }
    $lr = $raw.ToLower()

    $reasons = @()

    if ($lr -match 'localstorage.getitem') { $reasons += 'localStorage.getItem' }
    if ($lr -match 'localstorage.setitem') { $reasons += 'localStorage.setItem' }
    if ($lr -match 'localstorage.removeitem') { $reasons += 'localStorage.removeItem' }
    if ($lr -match 'sessionstorage.') { $reasons += 'sessionStorage' }

    # fetch heuristic: contains fetch( and does NOT use apiFetch
    $hasFetch = ($raw -match $patterns['fetch_direct']) -or ($lr -match 'fetch(')
    $hasApiFetch = ($raw -match $patterns['apiFetch']) -or ($lr -match 'apifetch')
    if ($hasFetch -and -not $hasApiFetch) { $reasons += 'fetch (direct HTTP call)' }

    if ($raw -match $patterns['API_BASE_decl']) { $reasons += 'API_BASE declared locally' }

    if ($raw -match $patterns['mock_data']) { $reasons += 'mock/test data' }

    # Normalize reasons unique
    $reasons = $reasons | Select-Object -Unique

    if ($reasons.Count -gt 0) {
      $legacy++
      $legacyList += [PSCustomObject]@{
        File = $f.FullName.Substring($root.Path.Length).TrimStart('\')
        Reasons = $reasons -join '; '
      }
    }
  } catch {
    # ignore read errors
  }
}

$cloudPct = if($total -gt 0){ [math]::Round((($total-$legacy)*100.0)/$total,2) } else { 0 }

Write-Host ("TOTAL arquivos: " + $total)
Write-Host ("LEGADO real:   " + $legacy)
Write-Host ("CLOUD real:    " + $cloudPct + "%")

# Gerar relatório detalhado
$reportPath = Join-Path $root 'tools\relatorio-cloud-detalhado.md'
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

$sb = New-Object System.Text.StringBuilder
$sb.AppendLine("# Relatório Cloud / Legado - gerado em $ts`)" ) > $null
$sb.AppendLine("") > $null
$sb.AppendLine("Total arquivos: $total  ") > $null
$sb.AppendLine("Arquivos LEGADO: $legacy  ") > $null
$sb.AppendLine("Cloud %: $cloudPct%  ") > $null
$sb.AppendLine("") > $null
$sb.AppendLine("## Arquivos marcados como LEGADO") > $null
$sb.AppendLine("") > $null
$sb.AppendLine("| Arquivo | Motivos |") > $null
$sb.AppendLine("|---|---|") > $null

foreach($item in $legacyList | Sort-Object File){
  $fileEsc = $item.File -replace '\\','/'
  $sb.AppendLine("| $fileEsc | $($item.Reasons) |") > $null
}

$sb.AppendLine("") > $null
$sb.AppendLine("## Top motivos") > $null
$sb.AppendLine("") > $null

# Contagem de motivos
$motCounts = @{}
foreach($it in $legacyList){
  $parts = $it.Reasons -split ';\s*'
  foreach($p in $parts){
    if(-not $motCounts.ContainsKey($p)) { $motCounts[$p] = 0 }
    $motCounts[$p] = $motCounts[$p] + 1
  }
}

foreach($kv in $motCounts.GetEnumerator() | Sort-Object -Property Value -Descending){
  $sb.AppendLine("- $($kv.Key): $($kv.Value)") > $null
}

# Escrever arquivo
try{
  $dir = Split-Path $reportPath -Parent
  if(-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $sb.ToString() | Out-File -FilePath $reportPath -Encoding UTF8
  Write-Host "Relatório detalhado salvo em: $reportPath"
} catch {
  Write-Host "Falha ao salvar relatório detalhado: $_"
}
