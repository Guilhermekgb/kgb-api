$base = 'http://localhost:3333'
try {
  $login = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ email='admin@kgb.com'; senha='kgb12345' } | ConvertTo-Json) -ErrorAction Stop
} catch {
  Write-Output "LOGIN_ERROR: $($_.Exception.Message)"
  exit 1
}

$token = $login.token; if (-not $token) { $token = $login.accessToken }
$headers = @{ Authorization = "Bearer $token" }
try {
  $res = Invoke-RestMethod -Method GET -Uri "$base/permissoesUi" -Headers $headers -ErrorAction Stop
  $res | ConvertTo-Json -Depth 20 | Write-Output
} catch {
  Write-Output "GET_ERROR: $($_.Exception.Message)"
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-Output $_.ErrorDetails.Message }
}
