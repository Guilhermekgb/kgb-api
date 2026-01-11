# Start kgb-api persistently and capture logs
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

$wd = "C:\Users\user\OneDrive\Desktop\sistema-buffet\kgb-api"
$out = Join-Path $wd "server.out.log"
$err = Join-Path $wd "server.err.log"

# limpa logs pra ficar fácil
Remove-Item $out,$err -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath "node.exe" `
  -ArgumentList ".\server.js" `
  -WorkingDirectory $wd `
  -RedirectStandardOutput $out `
  -RedirectStandardError  $err `
  -PassThru

Write-Output ("API_PID: $($proc.Id)")
Start-Sleep -Seconds 1

# confirma que o processo ainda existe
if (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) {
  Write-Output "API_STATUS: RUNNING"
} else {
  Write-Output "API_STATUS: DEAD"
}

Write-Output "--- NETSTAT :3333 ---"
$ns = netstat -ano | findstr ":3333"
if ($ns) { $ns } else { Write-Output "NO_LISTEN_3333" }

Write-Output "--- OUT LOG (tail) ---"
if (Test-Path $out) { Get-Content $out -Tail 120 } else { Write-Output "NO_OUT_LOG" }

Write-Output "--- ERR LOG (tail) ---"
if (Test-Path $err) { Get-Content $err -Tail 120 } else { Write-Output "NO_ERR_LOG" }
