# ===== CONTADOR CLOUD REAL (3 linhas) =====
$files=Get-ChildItem -Recurse -Include *.html,*.js | ?{ $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\tests\\' -and $_.FullName -notmatch '\\kgb-api\\' };
$total=$files.Count; $legacy=0;

foreach($f in $files){
  $lines=Get-Content $f.FullName;
  $hasGet=($lines -match 'localStorage\.getItem\(').Count -gt 0;
  $hasSetReal=(($lines -match 'localStorage\.setItem\(') | ?{
    $_ -notmatch 'API_BASE' -and
    $_ -notmatch 'guard\.enforce'
  }).Count -gt 0;
  $hasFetch=($lines -match 'fetch\(').Count -gt 0;
  $hasHandle=($lines -match 'handleRequest').Count -gt 0;

  if($hasGet -or $hasSetReal -or $hasFetch -or $hasHandle){ $legacy++ }
}

$cloudPct=if($total -gt 0){ [math]::Round((($total-$legacy)*100.0)/$total,2) } else { 0 };

Write-Host ("TOTAL arquivos: " + $total)
Write-Host ("LEGADO real:   " + $legacy)
Write-Host ("CLOUD real:    " + $cloudPct + "%")
