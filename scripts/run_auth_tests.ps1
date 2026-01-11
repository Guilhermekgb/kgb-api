$base = 'http://localhost:3333'
function Login($email,$senha){
  $body = @{ email = $email; senha = $senha } | ConvertTo-Json
  try { Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body $body -ErrorAction Stop }
  catch { $body2 = @{ email = $email; password = $senha } | ConvertTo-Json; Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body $body2 -ErrorAction Stop }
}
function DumpMe($token){
  $headers = @{ Authorization = "Bearer $token" }
  try { Invoke-RestMethod -Method GET -Uri "$base/auth/me" -Headers $headers -ErrorAction Stop | ConvertTo-Json -Depth 20 }
  catch { @{ error = $_.Exception.Message } | ConvertTo-Json -Depth 20 }
}
function DumpPermsUi($token){
  $headers = @{ Authorization = "Bearer $token" }
  try { Invoke-RestMethod -Method GET -Uri "$base/permissoesUi" -Headers $headers -ErrorAction Stop | ConvertTo-Json -Depth 20 }
  catch { @{ error = $_.Exception.Message } | ConvertTo-Json -Depth 20 }
}
function DumpUsuarios($token){
  $headers = @{ Authorization = "Bearer $token" }
  try { Invoke-RestMethod -Method GET -Uri "$base/usuarios" -Headers $headers -ErrorAction Stop | ConvertTo-Json -Depth 20 }
  catch { @{ error = $_.Exception.Message } | ConvertTo-Json -Depth 20 }
}

$results = @{}

try { $loginA = Login 'admin@kgb.com' 'kgb12345' } catch { $loginA = @{ error = $_.Exception.Message } }
$tokenA = $null
if ($loginA -is [System.Management.Automation.PSCustomObject] -or $loginA -is [System.Collections.Hashtable]) { $tokenA = $loginA.token; if(-not $tokenA){ $tokenA = $loginA.accessToken } }
$results.Admin_login = $loginA
if ($tokenA) { $maskedA = $loginA.PSObject.Copy(); $maskedA.token = '<REDACTED>'; $results.Admin_login = $maskedA }
$results.Admin_me = if ($tokenA) { DumpMe $tokenA } else { @{ error = 'no-token' } | ConvertTo-Json -Depth 20 }
$results.Admin_permissoesUi = if ($tokenA) { DumpPermsUi $tokenA } else { @{ error = 'no-token' } | ConvertTo-Json -Depth 20 }

try { $loginV = Login 'vendedor@kgb.com' 'SENHA_DO_VENDEDOR' } catch { $loginV = @{ error = $_.Exception.Message } }
$tokenV = $null
if ($loginV -is [System.Management.Automation.PSCustomObject] -or $loginV -is [System.Collections.Hashtable]) { $tokenV = $loginV.token; if(-not $tokenV){ $tokenV = $loginV.accessToken } }
$results.Vendedor_login = $loginV
if ($tokenV) { $maskedV = $loginV.PSObject.Copy(); $maskedV.token = '<REDACTED>'; $results.Vendedor_login = $maskedV }
$results.Vendedor_me = if ($tokenV) { DumpMe $tokenV } else { @{ error = 'no-token' } | ConvertTo-Json -Depth 20 }
$results.Vendedor_usuarios = if ($tokenV) { DumpUsuarios $tokenV } else { @{ error = 'no-token' } | ConvertTo-Json -Depth 20 }

$results | ConvertTo-Json -Depth 50 | Write-Output
