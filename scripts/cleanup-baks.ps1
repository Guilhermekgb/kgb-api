Write-Output "Cleaning up .bak and .orig files (dry-run first)"
$dry = $true
if ($args -contains '--apply') { $dry = $false }

$root = Resolve-Path "$PSScriptRoot\.."
$patterns = @('*.bak','*.orig')
$items = Get-ChildItem -Path $root -Include $patterns -File -Recurse -ErrorAction SilentlyContinue
if (-not $items) { Write-Output "No .bak/.orig files found."; exit 0 }

foreach ($it in $items) {
  if ($dry) { Write-Output "DRY: $($it.FullName)" } else { Write-Output "REMOVE: $($it.FullName)"; Remove-Item $it.FullName -Force }
}

if ($dry) { Write-Output "Dry-run complete. Rerun with --apply to delete files." }
