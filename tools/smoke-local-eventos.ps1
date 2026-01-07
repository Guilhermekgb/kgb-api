param(
  [int]$Port = 3010
)

$ErrorActionPreference = "Stop"
$base = "http://localhost:$Port"

Write-Host "Killing any node processes..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Starting server in background on PORT=$Port ..." -ForegroundColor Cyan
$env:PORT = "$Port"
$proc = Start-Process -NoNewWindow -PassThru -FilePath node -ArgumentList "server.js" -WorkingDirectory (Resolve-Path "kgb-api").Path

try {
  Write-Host "Waiting for $base/__debug/boot ..." -ForegroundColor Cyan
  $ok = $false
  for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $r = Invoke-WebRequest -Uri "$base/__debug/boot" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
  }
  if (-not $ok) { throw "Server did not become ready on port $Port" }

  Write-Host "BOOT:" -ForegroundColor Green
  (Invoke-WebRequest -Uri "$base/__debug/boot" -UseBasicParsing).Content

  Write-Host "`nRunning Node test for /eventos ..." -ForegroundColor Cyan
  node -e "(async()=>{const base='$base'; const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@kgb.com',senha:'123'})}); const lj=await login.json(); const token=lj.token; console.log('LOGIN',login.status,JSON.stringify(lj)); const h={Authorization:'Bearer '+token,'content-type':'application/json'}; const g1=await fetch(base+'/eventos',{headers:h}); console.log('GET1',g1.status,await g1.text()); const put=await fetch(base+'/eventos',{method:'PUT',headers:h,body:JSON.stringify({data:[{id:'e1',nome:'Evento Teste',data:'2026-01-05'}]})}); console.log('PUT',put.status,await put.text()); const g2=await fetch(base+'/eventos',{headers:h}); console.log('GET2',g2.status,await g2.text()); })().catch(e=>{console.error('ERROR',e.message);process.exit(1)})"
}
finally {
  Write-Host "`nStopping server process..." -ForegroundColor Yellow
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
