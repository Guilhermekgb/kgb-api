Write-Output '--- NETSTAT :3333 ---'
try { netstat -ano | findstr ":3333" } catch { Write-Output 'netstat failed' }

Write-Output '--- CURL 127.0.0.1 ---'
try { curl.exe -i http://127.0.0.1:3333/ | Write-Output } catch { Write-Output 'curl 127.0.0.1 failed' }

Write-Output '--- CURL localhost ---'
try { curl.exe -i http://localhost:3333/ | Write-Output } catch { Write-Output 'curl localhost failed' }

Write-Output '--- CURL 0.0.0.0 ---'
try { curl.exe -i http://0.0.0.0:3333/ | Write-Output } catch { Write-Output 'curl 0.0.0.0 failed' }
