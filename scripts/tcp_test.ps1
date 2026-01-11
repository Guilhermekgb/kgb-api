Write-Output '--- Test-NetConnection ---'
try { Test-NetConnection -ComputerName 127.0.0.1 -Port 3333 | ConvertTo-Json -Depth 5 | Write-Output } catch { Write-Output 'Test-NetConnection failed' }

Write-Output '--- Get-NetTCPConnection ---'
try { Get-NetTCPConnection -LocalPort 3333 | Format-List * | Out-String | Write-Output } catch { Write-Output 'Get-NetTCPConnection failed' }
