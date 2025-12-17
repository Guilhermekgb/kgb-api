<#
restart-and-validate.ps1

Usage: powershell -ExecutionPolicy Bypass -File .\restart-and-validate.ps1

Este script auxilia a reiniciar/validar o servidor local do kgb-api:
- checa se a porta 3333 está ocupada e mostra PID/linha de comando
- pergunta se você quer matar o processo (opcional)
- inicia o `node server.js` em background via Start-Process
- aguarda e valida que a porta está escutando
- executa `scripts/test-firebase-upload.ps1` se existir
- mostra o conteúdo de `data/fotos-clientes.json` se existir
- testa endpoints raiz e upload/presign
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Check-Port([int]$port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction Stop
        return $conn
    } catch {
        return $null
    }
}

Push-Location (Split-Path -Parent $MyInvocation.MyCommand.Definition)

$port = 3333
Write-Host "Verificando porta $port..."
$conn = Check-Port $port
if ($conn) {
    $ownerPid = $conn.OwningProcess
    Write-Host "Porta $port em uso por PID: $ownerPid" -ForegroundColor Yellow
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" | Select-Object ProcessId,CommandLine
    if ($proc) {
        Write-Host "Linha de comando do processo:" -ForegroundColor Cyan
        Write-Host $proc.CommandLine
    }
    $kill = Read-Host "Deseja encerrar esse processo? (s/N)"
    if ($kill -match '^[sS]') {
        try {
            Stop-Process -Id $ownerPid -Force -ErrorAction Stop
            Write-Host "Processo $ownerPid finalizado." -ForegroundColor Green
        } catch {
            Write-Host "Falha ao finalizar processo: $_" -ForegroundColor Red
            Pop-Location
            exit 1
        }
    } else {
        Write-Host "Não vou matar o processo. Você pode iniciar em porta alternativa quando quiser." -ForegroundColor Yellow
    }
} else {
    Write-Host "Porta $port livre." -ForegroundColor Green
}

# Iniciar o servidor em background (Start-Process) ou em foreground
$mode = Read-Host "Iniciar servidor em background? (s/N)"
if ($mode -match '^[sS]') {
    Write-Host "Iniciando node server.js em background..."
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Write-Host "Comando 'node' não encontrado - instale/adicione ao PATH." -ForegroundColor Red
        Pop-Location
        exit 1
    }
    try {
        $proc = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory (Get-Location) -PassThru
        Write-Host "Processo node iniciado com Id: $($proc.Id)" -ForegroundColor Green
    } catch {
        Write-Host "Falha ao iniciar node em background: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} else {
    Write-Host "Iniciando node server.js em foreground - este terminal ficará ocupado pelos logs (use Ctrl+C para parar)." -ForegroundColor Cyan
    Write-Host "Se quiser, abra outro terminal para rodar os testes." -ForegroundColor Cyan
    try {
        node server.js
    } finally {
        Pop-Location
    }
    exit 0
}

Start-Sleep -Seconds 2

# validar que a porta está escutando
$conn2 = Check-Port $port
if ($conn2) {
    Write-Host "Servidor escutando na porta $port (PID: $($conn2.OwningProcess))." -ForegroundColor Green
} else {
    Write-Host "Servidor NÃO está escutando na porta $port depois do start." -ForegroundColor Red
}

# executar script de teste de upload se existir
if (Test-Path .\scripts\test-firebase-upload.ps1) {
    Write-Host "Executando scripts/test-firebase-upload.ps1..." -ForegroundColor Cyan
    try {
        powershell -ExecutionPolicy Bypass -File .\scripts\test-firebase-upload.ps1
    } catch {
        Write-Host "Erro ao executar script de teste: $_" -ForegroundColor Red
    }
} else {
    Write-Host "Nenhum script de teste encontrado em scripts/test-firebase-upload.ps1" -ForegroundColor Yellow
}

# mostrar conteúdo do mapeamento
if (Test-Path .\data\fotos-clientes.json) {
    Write-Host "Conteúdo de data/fotos-clientes.json:" -ForegroundColor Cyan
    try {
        Get-Content .\data\fotos-clientes.json -Raw | ConvertFrom-Json | Format-List
    } catch {
        Write-Host "Falha ao ler/parsear data/fotos-clientes.json: $_" -ForegroundColor Red
    }
} else {
    Write-Host "Arquivo data/fotos-clientes.json não encontrado." -ForegroundColor Yellow
}

# testar endpoints básicos
Write-Host "Testando endpoint raiz..." -ForegroundColor Cyan
try {
    $root = Invoke-WebRequest http://localhost:$port/ -UseBasicParsing -ErrorAction Stop
    Write-Host "Raiz retornou status: $($root.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "Falha ao acessar raiz: $_" -ForegroundColor Red
}

Write-Host "Testando endpoint de presign/upload (tentativa padrão)..." -ForegroundColor Cyan
try {
    # Primeiro tenta /fotos-clientes/presign, senão /fotos-clientes/upload
    $presign = Invoke-RestMethod http://localhost:$port/fotos-clientes/presign -Method Post -Body (@{filename='teste.png'} | ConvertTo-Json) -ContentType 'application/json' -ErrorAction SilentlyContinue
    if ($presign) {
        Write-Host ("presign: " + (ConvertTo-Json $presign -Depth 4)) -ForegroundColor Green
    } else {
        $upl = Invoke-RestMethod http://localhost:$port/fotos-clientes/upload -Method Post -Body @{dummy='1'} -ErrorAction SilentlyContinue
        if ($upl) { Write-Host ("upload: " + (ConvertTo-Json $upl -Depth 4)) -ForegroundColor Green }
        else { Write-Host "Nenhuma resposta de presign/upload (endpoint pode ser diferente)." -ForegroundColor Yellow }
    }
} catch {
    Write-Host "Erro ao testar endpoints de fotos: $_" -ForegroundColor Yellow
}

Write-Host "Pronto. Se quiser que eu rode a migração para Cloudinary, execute: node .\scripts\migrate-uploads-to-cloudinary.js" -ForegroundColor Cyan

Pop-Location

Write-Host "Fim do script." -ForegroundColor Green
