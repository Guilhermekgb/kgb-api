$base = 'http://localhost:3333'

# Admin login
try {
  $login = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ email='admin@kgb.com'; senha='kgb12345' } | ConvertTo-Json) -ErrorAction Stop
} catch {
  $login = @{ error = $_.Exception.Message }
}

$token = $null
if ($login -is [System.Management.Automation.PSCustomObject] -or $login -is [System.Collections.Hashtable]) {
  $token = $login.token
  if (-not $token) { $token = $login.accessToken }
}

$displayLogin = $login
if ($displayLogin -and $displayLogin.PSObject.Properties.Name -contains 'token') { $displayLogin.token = '<REDACTED>' }

Write-Output '--- ADMIN_LOGIN ---'
$displayLogin | ConvertTo-Json -Depth 10 | Write-Output

# Create vendor
$headers = @{ Authorization = "Bearer $token" }
$novo = @{ nome='Vendedor Teste'; email='vendteste@kgb.com'; senha='vend12345'; perfil='Vendedor' }
try {
  $create = Invoke-RestMethod -Method POST -Uri "$base/usuarios" -Headers $headers -ContentType 'application/json' -Body ($novo | ConvertTo-Json) -ErrorAction Stop
} catch {
  $create = @{ error = $_.Exception.Message }
}

Write-Output '--- CREATE_USUARIO ---'
$create | ConvertTo-Json -Depth 20 | Write-Output

# Vendor login
try {
  $loginV = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ email='vendteste@kgb.com'; senha='vend12345' } | ConvertTo-Json) -ErrorAction Stop
} catch {
  $loginV = @{ error = $_.Exception.Message }
}
if ($loginV -and $loginV.PSObject.Properties.Name -contains 'token') { $loginV.token = '<REDACTED>' }

Write-Output '--- VENDEDOR_LOGIN ---'
$loginV | ConvertTo-Json -Depth 20 | Write-Output
