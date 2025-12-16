# post_pr_comment.ps1
# Uso: execute este script localmente. Ele pede o PAT (não compartilhe) e publica o arquivo pr_comment_result.txt
# Depois de usar, revogue o token no GitHub (https://github.com/settings/tokens)

param()

$repoPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$commentFile = Join-Path $repoPath 'pr_comment_result.txt'

if (-not (Test-Path $commentFile)) {
    Write-Error "Arquivo não encontrado: $commentFile. Execute este script dentro de 'kgb-api' ou mova o arquivo para lá."
    exit 1
}

Write-Host "Este script publicará o conteúdo de:`n  $commentFile`ncomo comentário no PR #5 do repositório Guilhermekgb/kgb-api." -ForegroundColor Yellow
Write-Host "Por favor, revogue qualquer token exposto ANTES de prosseguir." -ForegroundColor Red

$secureToken = Read-Host -Prompt "Cole seu PAT aqui (será usado somente nesta sessão)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)

# Opcional: checar se token funciona
try {
    $user = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers @{ Authorization = "token $token"; 'User-Agent' = 'post-pr-comment-script' } -ErrorAction Stop
    Write-Host "Token válido para usuário: $($user.login)" -ForegroundColor Green
} catch {
    Write-Error "Falha ao validar token (HTTP 401 ou escopo insuficiente). Verifique o PAT e o escopo (para repositório privado use 'repo', para público use 'public_repo')."
    exit 1
}

$body = Get-Content -Raw $commentFile
$uri = 'https://api.github.com/repos/Guilhermekgb/kgb-api/issues/5/comments'

try {
    $payload = @{ body = $body } | ConvertTo-Json -Depth 10
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $res = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "token $token"; 'User-Agent' = 'post-pr-comment-script'; Accept = 'application/vnd.github+json' } -Body $bytes -ContentType 'application/json; charset=utf-8'
    Write-Host "Comentário publicado: $($res.html_url)" -ForegroundColor Green
} catch {
    Write-Error "Falha ao publicar comentário: $($_.Exception.Message)"
    exit 1
}

Write-Host "IMPORTANTE: Revogue o token no GitHub agora: https://github.com/settings/tokens" -ForegroundColor Yellow

# Limpar variável de token por segurança
$token = $null
$secureToken = $null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

Write-Host "Pronto." -ForegroundColor Cyan
