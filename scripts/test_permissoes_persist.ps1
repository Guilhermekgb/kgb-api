$base = "http://127.0.0.1:3333"

try {
  $login = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType "application/json" -Body (@{ email="admin@kgb.com"; senha="kgb12345" } | ConvertTo-Json)
} catch {
  Write-Host "Login falhou:" $_.Exception.Message
  exit 1
}

$token = $login.token
if (-not $token) { Write-Host "Token não retornado"; exit 1 }
$h = @{ Authorization = "Bearer $token" }

Write-Host "ANTES:"
$before = Invoke-RestMethod -Method GET -Uri "$base/permissoesUi" -Headers $h
$before | ConvertTo-Json -Depth 10

$payload = @(
  @{ perfil="Administrador"; permissoes=@("*") }
  @{ perfil="Vendedor"; permissoes=@("page:dashboard.html","page:orcamento.html","page:usuarios.html") }
) | ConvertTo-Json -Depth 10

Write-Host "PUT..."
Invoke-RestMethod -Method PUT -Uri "$base/permissoesUi" -Headers $h -ContentType "application/json" -Body $payload | ConvertTo-Json -Depth 5

Write-Host "DEPOIS:"
$after = Invoke-RestMethod -Method GET -Uri "$base/permissoesUi" -Headers $h
$after | ConvertTo-Json -Depth 10

Write-Host "OK"
