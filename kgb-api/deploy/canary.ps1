param(
  [string]$stagingPath = "C:\staging\site",
  [string]$artifactPath = ".\build"
)

Write-Output "[canary] Preparing to deploy $artifactPath to $stagingPath"
if (-Not (Test-Path $artifactPath)){
  Write-Error "Artifact path $artifactPath not found. Build first."
  exit 2
}

# Simple local copy-based deploy for staging (adapt for your infra)
Write-Output "[canary] Copying files..."
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$stagingPath\*"
Copy-Item -Path "$artifactPath\*" -Destination $stagingPath -Recurse -Force
Write-Output "[canary] Files copied. Starting image checks..."

# Run monitor script (requires node)
Push-Location "$PSScriptRoot\.."
try {
  node .\kgb-api\monitor\check-images.js ..\cadastro-cliente.html --cloud dzw8u1h69
  $rc = $LASTEXITCODE
} catch {
  Write-Error "Monitor failed: $_"
  $rc = 3
}
Pop-Location

if ($rc -ne 0) {
  Write-Error "[canary] Image checks failed (code $rc). Consider rollback to backup/restore-fotos-shim"
  exit $rc
}

Write-Output "[canary] Image checks passed. Canary deploy complete. Monitor for 24-48h."
