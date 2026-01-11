param(
  [string]$Base = "http://127.0.0.1:3333",
  [string]$AdminEmail = "admin@kgb.com",
  [string]$AdminSenha = "kgb12345"
)

$ErrorActionPreference = "Stop"

Write-Host "== LOGIN ADMIN ==" -ForegroundColor Cyan
$login = Invoke-RestMethod -Method POST -Uri "$Base/auth/login" -ContentType "application/json" -Body (@{ email=$AdminEmail; senha=$AdminSenha } | ConvertTo-Json)
$token = $login.token
if (-not $token) { throw "Login não retornou token. Response: $($login | ConvertTo-Json -Depth 10)" }
$headers = @{ Authorization = "Bearer $token" }

Write-Host "== GET /permissoesUi (ANTES) ==" -ForegroundColor Cyan
$before = Invoke-RestMethod -Method GET -Uri "$Base/permissoesUi" -Headers $headers
$before | ConvertTo-Json -Depth 50

Write-Host "== POST /usuarios (CRIAR VENDEDOR) ==" -ForegroundColor Cyan
$emailVend = ("vend_" + [Guid]::NewGuid().ToString("N").Substring(0,6) + "@kgb.com")
$bodyVend = @{ nome="Vendedor Debug"; email=$emailVend; senha="vend12345"; perfil="Vendedor" } | ConvertTo-Json
try {
  $created = Invoke-RestMethod -Method POST -Uri "$Base/usuarios" -Headers $headers -ContentType "application/json" -Body $bodyVend
  Write-Host "CRIADO OK: $emailVend" -ForegroundColor Green
  $created | ConvertTo-Json -Depth 20
} catch {
  Write-Host "ERRO AO CRIAR VENDEDOR:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow }
  throw
}

Write-Host "== GET /usuarios (LISTAR) ==" -ForegroundColor Cyan
$users = Invoke-RestMethod -Method GET -Uri "$Base/usuarios" -Headers $headers
$users | ConvertTo-Json -Depth 50

Write-Host "== OK. Se o vendedor não aparecer aqui, o problema é API/backend (não é tela)." -ForegroundColor Green
