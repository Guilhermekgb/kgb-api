Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
$proc = Start-Process -FilePath 'node.exe' -ArgumentList '.\scripts\mini_server.js' -WorkingDirectory 'C:\Users\user\OneDrive\Desktop\sistema-buffet' -PassThru
Write-Output ("MINI PID: $($proc.Id)")
Start-Sleep -Seconds 1
Get-Process -Id $proc.Id | Select-Object Id,ProcessName,StartTime,Path | Format-List | Out-String | Write-Output
Write-Output '--- NETSTAT ---'
$ns = netstat -ano | findstr ':3333' ; if ($ns) { $ns } else { Write-Output 'NO_LISTEN_3333' }
Write-Output '--- CURL ---'
try { curl.exe -i http://127.0.0.1:3333/ | Out-String | Write-Output } catch { Write-Output ('curl failed: ' + $_.Exception.Message) }
