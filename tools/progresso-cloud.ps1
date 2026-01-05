param(
  [string]$Root = "."
)

Write-Host ""
Write-Host "=== KGB Progresso Cloud (auditoria) ===" -ForegroundColor Cyan
Write-Host ("Root: " + (Resolve-Path $Root)) -ForegroundColor DarkGray
Write-Host ""

# Arquivos alvo
$js = Get-ChildItem -Path $Root -Recurse -File -Include *.js,*.mjs,*.cjs -ErrorAction SilentlyContinue
$html = Get-ChildItem -Path $Root -Recurse -File -Include *.html -ErrorAction SilentlyContinue

# 1) localStorage (exceto KGB_TOKEN)
$lsHits = @()
foreach ($f in $js) {
  $txt = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
  if (!$txt) { continue }
  if ($txt -match "localStorage\.") {
    # contar ocorrências que NÃO sejam KGB_TOKEN
    $m = Select-String -Path $f.FullName -Pattern "localStorage\.(getItem|setItem|removeItem)\(" -AllMatches
    foreach ($mm in $m.Matches) {
      $line = $mm.Value
    }
    $lsHits += (Select-String -Path $f.FullName -Pattern "localStorage\.(getItem|setItem|removeItem)\(" -AllMatches)
  }
}

# filtra linhas que mencionem KGB_TOKEN (permitido)
$lsFiltered = @()
foreach ($hit in $lsHits) {
  if ($hit.Line -match "KGB_TOKEN") { continue }
  $lsFiltered += $hit
}
$localStorageCount = $lsFiltered.Count

# 2) fetch direto (preferimos apiFetch)
$fetchHits = @()
foreach ($f in $js) {
  $txt = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
  if (!$txt) { continue }
  if ($txt -match "\bfetch\s*\(") {
    # ignorar api-fetch.js
    if ($f.FullName -match "api-fetch\.js") { continue }
    $fetchHits += (Select-String -Path $f.FullName -Pattern "\bfetch\s*\(" -AllMatches)
  }
}
$fetchCount = $fetchHits.Count

# 3) scripts absolutos no HTML (src="/...")
$absScriptHits = @()
foreach ($h in $html) {
  $absScriptHits += (Select-String -Path $h.FullName -Pattern "<script[^>]+src=\"/" -AllMatches)
}
$absScriptCount = $absScriptHits.Count

# 4) ordem/ausência de kgb-common em páginas que usam api-fetch/proteger-pagina
$pagesWithApi = @()
$pagesMissingCommon = @()

foreach ($h in $html) {
  $raw = Get-Content $h.FullName -Raw -ErrorAction SilentlyContinue
  if (!$raw) { continue }

  $usesApi = ($raw -match "api-fetch\.js") -or ($raw -match "proteger-pagina\.js")
  if ($usesApi) {
    $pagesWithApi += $h
    $hasCommon = ($raw -match "kgb-common\.js")
    if (!$hasCommon) {
      $pagesMissingCommon += $h
    }
  }
}

# Score (pesos simples)
# quanto maior o número de ocorrências, mais “falta”
# pesos: localStorage 40%, fetch 30%, scripts absolutos 20%, missing common 10%
# normalização por limites "alvo" (ajuste se precisar)
$capLS = 200
$capFetch = 200
$capAbs = 200
$capMiss = 50

$scoreLS = [Math]::Max(0, 1 - ($localStorageCount / $capLS))
$scoreFetch = [Math]::Max(0, 1 - ($fetchCount / $capFetch))
$scoreAbs = [Math]::Max(0, 1 - ($absScriptCount / $capAbs))
$scoreMiss = [Math]::Max(0, 1 - ($pagesMissingCommon.Count / $capMiss))

$final = (0.40*$scoreLS + 0.30*$scoreFetch + 0.20*$scoreAbs + 0.10*$scoreMiss) * 100
$finalRounded = [Math]::Round($final, 1)

Write-Host ("Progresso Cloud (estimado): " + $finalRounded + "%") -ForegroundColor Green
Write-Host ""

Write-Host "Métricas:" -ForegroundColor Yellow
Write-Host ("- localStorage (exceto KGB_TOKEN): " + $localStorageCount)
Write-Host ('- fetch() direto (fora api-fetch.js): ' + $fetchCount)
Write-Host ('- scripts com src iniciando por / (absolutos): ' + $absScriptCount)
Write-Host ("- páginas com API sem kgb-common.js: " + $pagesMissingCommon.Count + " / " + $pagesWithApi.Count)

Write-Host ""
Write-Host "Top pendências (para atacar primeiro):" -ForegroundColor Yellow
if ($localStorageCount -gt 0) { Write-Host "- Remover localStorage legado (dados de negócio) e migrar para API." }
if ($fetchCount -gt 0) { Write-Host '- Trocar fetch() direto por window.apiFetch() e padronizar headers/token.' }
if ($absScriptCount -gt 0) { Write-Host '- Normalizar scripts absolutos (src começando por /) para caminhos relativos ./...' }
if ($pagesMissingCommon.Count -gt 0) { Write-Host "- Inserir kgb-common.js antes de api-fetch/proteger-pagina nas páginas faltantes." }

Write-Host ""
Write-Host "Exemplos (primeiros 10):" -ForegroundColor Yellow

if ($localStorageCount -gt 0) {
  Write-Host ""
  Write-Host "localStorage (amostra):" -ForegroundColor DarkYellow
  $lsFiltered | Select-Object -First 10 | ForEach-Object { Write-Host ("- " + $_.Path + ":" + $_.LineNumber + " :: " + $_.Line.Trim()) }
}

if ($fetchCount -gt 0) {
  Write-Host ""
  Write-Host 'fetch() direto (amostra):' -ForegroundColor DarkYellow
  $fetchHits | Select-Object -First 10 | ForEach-Object { Write-Host ("- " + $_.Path + ":" + $_.LineNumber + " :: " + $_.Line.Trim()) }
}

if ($absScriptCount -gt 0) {
  Write-Host ""
  Write-Host "scripts absolutos (amostra):" -ForegroundColor DarkYellow
  $absScriptHits | Select-Object -First 10 | ForEach-Object { Write-Host ("- " + $_.Path + ":" + $_.LineNumber + " :: " + $_.Line.Trim()) }
}

if ($pagesMissingCommon.Count -gt 0) {
  Write-Host ""
  Write-Host "páginas sem kgb-common (amostra):" -ForegroundColor DarkYellow
  $pagesMissingCommon | Select-Object -First 10 | ForEach-Object { Write-Host ("- " + $_.FullName) }
}

Write-Host ""
Write-Host "=== Fim ===" -ForegroundColor Cyan
