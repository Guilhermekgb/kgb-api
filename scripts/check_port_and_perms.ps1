# PASSO A: netstat line, PID, process info
$lineObj = netstat -ano | Select-String ':3333' | Select-Object -First 1
if (-not $lineObj) {
  Write-Output 'NETSTAT: <no-entry-for-:3333>'
} else {
  $line = $lineObj.Line
  Write-Output ('NETSTAT: ' + $line)
  $pid = ($line -split '\s+')[-1]
  Write-Output ('PID_PORTA_3333: ' + $pid)
  try {
    Get-Process -Id ([int]$pid) | Select-Object Id,ProcessName,Path,StartTime | Format-List | Out-String | Write-Output
  } catch {
    Write-Output ('Get-Process failed: ' + $_.Exception.Message)
  }
}

# PASSO B: call /permissoesUi via 127.0.0.1
$base = 'http://127.0.0.1:3333'
try {
  $login = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ email='admin@kgb.com'; senha='kgb12345' } | ConvertTo-Json) -ErrorAction Stop
  $token = $login.token; if (-not $token) { $token = $login.accessToken }
  $headers = @{ Authorization = "Bearer $token" }
  $res = Invoke-RestMethod -Method GET -Uri "$base/permissoesUi" -Headers $headers -ErrorAction Stop
  Write-Output '--- /permissoesUi JSON ---'
  $res | ConvertTo-Json -Depth 30 | Write-Output
} catch {
  Write-Output ('PERMS_ERROR: ' + $_.Exception.Message)
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-Output $_.ErrorDetails.Message }
}
