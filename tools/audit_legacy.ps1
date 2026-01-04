$files = Get-ChildItem -Recurse -Include *.html,*.js | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\tests\\' -and $_.FullName -notmatch '\\kgb-api\\' }
$total = $files.Count
$legacy = @()
foreach($f in $files){
  $p=$f.FullName; $lines=Get-Content $p
  $hasGet=$false; $hasSetReal=$false; $hasFetch=$false; $hasHandle=$false
  foreach($ln in $lines){
    if($ln -match 'localStorage\\.getItem\\('){ $hasGet=$true }
    if($ln -match 'localStorage\\.setItem\\('){
      if($ln -notmatch 'setItem\("API_BASE"' -and $ln -notmatch "setItem('API_BASE'" -and $ln -notmatch 'setItem\("guard\\.enforce"' -and $ln -notmatch "setItem('guard.enforce'" ){
        $hasSetReal=$true
      }
    }
    if($ln -match 'fetch\\('){ $hasFetch=$true }
    if($ln -match 'handleRequest'){ $hasHandle=$true }
  }
  if($hasGet -or $hasSetReal -or $hasFetch -or $hasHandle){
    $legacy += [PSCustomObject]@{ File=$p; getItem=$hasGet; setItemReal=$hasSetReal; fetch=$hasFetch; handle=$hasHandle }
  }
}
$legacyCount = $legacy.Count
$cloudPct = if($total -gt 0){ [math]::Round((($total-$legacyCount)*100.0)/$total,2) } else { 0 }
Write-Host ('TOTAL arquivos: ' + $total)
Write-Host ('LEGADO real:   ' + $legacyCount)
Write-Host ('CLOUD real:    ' + $cloudPct + '%')
Write-Host ''
$legacy | Sort-Object File | Select-Object File,getItem,setItemReal,fetch,handle | Format-Table -AutoSize
