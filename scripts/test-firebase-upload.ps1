# Teste rápido de upload para /fotos-clientes/upload
# Uso: abra PowerShell na raiz do repo e rode: .\scripts\test-firebase-upload.ps1

# Não alterar o Working Directory globalmente - use paths relativos ao repo root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path

$payload = @{
  key = "teste/script-upload.png"
  data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
} | ConvertTo-Json -Depth 5

Write-Host "POST /fotos-clientes/upload -> sending..." -ForegroundColor Cyan
$maxAttempts = 6
$attempt = 1
$resp = $null
while ($attempt -le $maxAttempts) {
  Write-Host "Attempt $attempt/$maxAttempts..." -ForegroundColor Cyan
  try {
    $resp = Invoke-RestMethod -Method Post -Uri "http://localhost:3333/fotos-clientes/upload" -ContentType "application/json" -Body $payload -ErrorAction Stop
    Write-Host "RESPONSE:" -ForegroundColor Green
    $resp | ConvertTo-Json -Depth 5 | Write-Host
    break
  } catch {
    Write-Host "ERROR:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) { $_.Exception.Response.StatusCode.Value__ | Write-Host; $_.Exception.Response.StatusDescription | Write-Host }
    if ($attempt -lt $maxAttempts) {
      Write-Host "Aguardando 1s antes de tentar novamente..." -ForegroundColor Yellow
      Start-Sleep -Seconds 1
    }
  }
  $attempt++
}
if (-not $resp) {
  Write-Host "Falha: não foi possível obter resposta do servidor após $maxAttempts tentativas." -ForegroundColor Red
}

Write-Host "`n== data/fotos-clientes.json ==" -ForegroundColor Cyan
$mapPath = Join-Path $repoRoot 'data\fotos-clientes.json'
if (Test-Path $mapPath) {
  Get-Content $mapPath -Raw | Write-Host
} else {
  Write-Host "$mapPath não encontrado"
}

Write-Host "`n== arquivos em public/uploads/default ==" -ForegroundColor Cyan
$uploadsDir = Join-Path $repoRoot 'public\uploads\default'
if (Test-Path $uploadsDir) {
  Get-ChildItem -Path $uploadsDir | Select-Object Name,Length,LastWriteTime | Format-Table -AutoSize | Out-String | Write-Host
} else {
  Write-Host "pasta $uploadsDir não encontrada"
}
