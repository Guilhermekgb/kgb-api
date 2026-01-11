param(
  [string]$UiBase = "http://127.0.0.1:5500",
  [string]$ApiBase = "http://127.0.0.1:3333"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Preparing to run E2E Puppeteer test for permissions..." -ForegroundColor Cyan
Write-Host "UI base = $UiBase" -ForegroundColor Cyan
Write-Host "API base = $ApiBase" -ForegroundColor Cyan

# Ensure puppeteer is installed in workspace node_modules
if (-not (Test-Path -Path "./node_modules/puppeteer")) {
  Write-Host "Installing puppeteer (this may take a while)..." -ForegroundColor Yellow
  npm install puppeteer --no-audit --no-fund | Write-Output
}

# Export env vars used by the test
$env:UI_BASE = $UiBase
$env:API_BASE = $ApiBase

Write-Host "Running test script..." -ForegroundColor Cyan
node ./scripts/e2e_permissoes.spec.js
$exit = $LASTEXITCODE
if ($exit -eq 0) { Write-Host "E2E PASSED" -ForegroundColor Green } else { Write-Host "E2E FAILED (exit $exit)" -ForegroundColor Red }
exit $exit
