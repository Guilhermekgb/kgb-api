# run-tests-clean.ps1
# Script limpo para iniciar server (se necessário) e rodar os testes.
$ErrorActionPreference = 'Stop'
function Wait-For-Port {
  param([string]$Address='127.0.0.1',[int]$Port=3333,[int]$TimeoutSec=30)
  $end=(Get-Date).AddSeconds($TimeoutSec)
  while((Get-Date)-lt $end){ if((Test-NetConnection -ComputerName $Address -Port $Port -WarningAction SilentlyContinue).TcpTestSucceeded){return $true} ; Start-Sleep -Milliseconds 500 }
  return $false
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition | Resolve-Path | ForEach-Object { Join-Path $_ '..' } | Resolve-Path
Set-Location $repoRoot
Write-Host "Repo: $repoRoot"

$addr='127.0.0.1'; $port=3333; $started=$null
Write-Host "Checking ${addr}:${port}..."
if(-not (Wait-For-Port -Address $addr -Port $port -TimeoutSec 1)){
  Write-Host "Starting server.js"
  $started = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $repoRoot -PassThru
  Start-Sleep -Seconds 1
  if(-not (Wait-For-Port -Address $addr -Port $port -TimeoutSec 30)){
    Write-Error "Server did not respond on port $port"
    if($started){ Stop-Process -Id $started.Id -Force }
    exit 2
  }
} else { Write-Host "Server already up" }

function runjs($file,$label){ Write-Host "`n=== $label ==="; try{ node $file; Write-Host "$label exit code: $LASTEXITCODE" } catch{ Write-Host "$label failed: $($_.Exception.Message)" } }

runjs 'tests/smoke-fotos-test.js' 'SMOKE TEST'
runjs 'tests/headless-shim-test.js' 'HEADLESS UNIT'
runjs 'tests/headless-shim-e2e.js' 'HEADLESS E2E'

if($started){ Write-Host "Stopping server PID $($started.Id)"; Stop-Process -Id $started.Id -Force }
Write-Host 'All done.'
