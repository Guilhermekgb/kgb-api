<#
run-tests.ps1
Script para iniciar o servidor local (se necessário), aguardar porta 3333 e
executar os testes: smoke, headless unit e headless E2E. Ao final, para o
<#
run-tests.ps1
Script para iniciar o servidor local (se necessário), aguardar porta 3333 e
executar os testes: smoke, headless unit e headless E2E. Ao final, para o
servidor iniciado pelo script.
Uso:
  powershell -ExecutionPolicy Bypass -File .\scripts\run-tests.ps1
#>

$ErrorActionPreference = 'Stop'

<#
run-tests.ps1
Script para iniciar o servidor local (se necessário), aguardar porta 3333 e
executar os testes: smoke, headless unit e headless E2E. Ao final, para o
servidor iniciado pelo script.

  powershell -ExecutionPolicy Bypass -File .\scripts\run-tests.ps1
#>

$ErrorActionPreference = 'Stop'

<#
run-tests.ps1
Script para iniciar o servidor local (se necessário), aguardar porta 3333 e
executar os testes: smoke, headless unit e headless E2E. Ao final, para o
servidor iniciado pelo script.
Uso:
  powershell -ExecutionPolicy Bypass -File .\scripts\run-tests.ps1
#>

$ErrorActionPreference = 'Stop'

function Wait-For-Port {
    param(
        [string]$Host = '127.0.0.1',
        [int]$Port = 3333,
        [int]$TimeoutSec = 30
    )
    $end = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $end) {
        $res = Test-NetConnection -ComputerName $Host -Port $Port -WarningAction SilentlyContinue
        if ($res -and $res.TcpTestSucceeded) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# Local do repositório: script está em ...\kgb-api\scripts
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
Set-Location $repoRoot
Write-Host "Repository root: $repoRoot"

$host = '127.0.0.1'
$port = 3333
$startedProc = $null

Write-Host "Checking port $port on $host..."
if (-not (Wait-For-Port -Host $host -Port $port -TimeoutSec 1)) {
    Write-Host "Port $port not responding — starting server.js"
    $startedProc = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $repoRoot -PassThru
    Write-Host "Started server PID: $($startedProc.Id)"
    if (-not (Wait-For-Port -Host $host -Port $port -TimeoutSec 30)) {
        Write-Error "Server did not respond on port $port after waiting. See server logs."
        if ($startedProc) { try { Stop-Process -Id $startedProc.Id -Force } catch {} }
        exit 2
    }
} else {
    Write-Host "Server already responding on ${host}:${port}"
}

$exitCode = 0

function Run-Test([string]$cmd, [string]$label) {
    Write-Host "`n=== $label ==="
    try {
        & node $cmd
        $localCode = $LASTEXITCODE
        Write-Host "$label exit code: $localCode"
        if ($localCode -ne 0) { $global:exitCode = $localCode }
    } catch {
        Write-Host "$label failed: $($_.Exception.Message)"
        $global:exitCode = 3
    }
}

Run-Test 'tests/smoke-fotos-test.js' 'SMOKE TEST'
Run-Test 'tests/headless-shim-test.js' 'HEADLESS UNIT TEST'
Run-Test 'tests/headless-shim-e2e.js' 'HEADLESS E2E TEST'

# If we started the server, stop it
if ($startedProc) {
    Write-Host "`nStopping server PID $($startedProc.Id)"
    try { Stop-Process -Id $startedProc.Id -Force; Write-Host 'Server stopped.' } catch { Write-Host "Failed to stop server: $($_.Exception.Message)" }
}

Write-Host "`nAll done. Exit code: $exitCode"
exit $exitCode
