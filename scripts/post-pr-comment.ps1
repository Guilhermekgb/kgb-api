<#
post-pr-comment.ps1
Script para publicar o conteúdo de `pr_comment_result.txt` como comentário no PR.
Opções:
  -ConvertToUtf8 : regrava o arquivo de comentário em UTF-8 antes de postar (opcional)
  -UseGh         : usa `gh pr comment` (padrão)
  -Pat           : token pessoal (opcional) — se fornecido usa a API diretamente
  -PrNumber      : número do PR (padrão 5)
  -Repo          : repo no formato owner/repo (padrão Guilhermekgb/kgb-api)

Exemplos:
  .\post-pr-comment.ps1 -ConvertToUtf8
  .\post-pr-comment.ps1 -UseGh -PrNumber 5
  .\post-pr-comment.ps1 -Pat "ghp_..." -PrNumber 5
#>

param(
    [switch]$ConvertToUtf8,
    [switch]$UseGh = $true,
    [string]$CommentFile = ".\pr_comment_result.txt",
    [int]$PrNumber = 5,
    [string]$Repo = "Guilhermekgb/kgb-api",
    [string]$Pat = ""
)

function Abort($msg) {
    Write-Error $msg
    exit 1
}

# Caminho absoluto para referência
$CommentFilePath = Join-Path (Get-Location) $CommentFile
if (-not (Test-Path $CommentFilePath)) {
    Abort "Arquivo de comentário não encontrado: $CommentFilePath"
}

# Opcional: converter para UTF-8
if ($ConvertToUtf8) {
    Write-Host "Convertendo '$CommentFile' para UTF-8 (sobrescrevendo)..."
    $txt = Get-Content -Raw -Encoding Default -Path $CommentFilePath
    $txt | Out-File -FilePath $CommentFilePath -Encoding utf8
    Write-Host "Conversão completa."
}

# Ler o conteúdo final em UTF-8
try {
    $body = Get-Content -Raw -Encoding UTF8 -Path $CommentFilePath
} catch {
    Abort "Falha ao ler o arquivo como UTF-8: $_"
}

# Função para postar com PAT via API
function Post-With-Pat($token, $repo, $prNumber, $bodyText) {
    $uri = "https://api.github.com/repos/$repo/issues/$prNumber/comments"
    $payload = @{ body = $bodyText } | ConvertTo-Json -Depth 10
    Write-Host "Publicando comentário via API em: $uri"
    try {
        $headers = @{ Authorization = "token $token"; "User-Agent" = "kgb-api-bot"; "Content-Type" = "application/json; charset=utf-8" }
        Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $payload -ContentType "application/json; charset=utf-8"
        Write-Host "Comentário publicado com sucesso via PAT."
    } catch {
        Abort "Falha ao publicar via API: $_"
    }
}

# Se usar gh
if ($UseGh) {
    $ghCmd = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $ghCmd) {
        Write-Host "Comando 'gh' não encontrado. Tentarei usar PAT se disponível, ou instrua para instalar 'gh'."
        if ($Pat -and $Pat.Trim() -ne "") {
            Post-With-Pat -token $Pat -repo $Repo -prNumber $PrNumber -bodyText $body
            exit 0
        } else {
            Abort "'gh' não está instalado e nenhum PAT foi fornecido. Instale 'gh' ou forneça um PAT."
        }
    }

    try {
        # Verifica status de autenticação; se não autenticar, gh retornará não-zero
        gh auth status 2>$null
    } catch {
        Write-Host "Você não está autenticado no gh. Iniciando 'gh auth login' (siga instruções interativas)..."
        gh auth login
    }

    # Tenta publicar com gh
    try {
        Write-Host "Publicando comentário usando 'gh'..."
        gh pr comment $PrNumber --repo $Repo --body-file $CommentFilePath
        Write-Host "Comentário publicado com 'gh'."
        exit 0
    } catch {
        Write-Warning "Falha ao publicar com 'gh': $_\nTentarei usar PAT se disponível."
        if ($Pat -and $Pat.Trim() -ne "") {
            Post-With-Pat -token $Pat -repo $Repo -prNumber $PrNumber -bodyText $body
            exit 0
        }
        Abort "Falha ao publicar com 'gh' e nenhum PAT válido foi fornecido."
    }
} else {
    # usar PAT route se gh não for desejado
    $tokenToUse = $Pat
    if (-not $tokenToUse -or $tokenToUse.Trim() -eq "") {
        # tenta GITHUB_PAT env
        $envToken = $env:GITHUB_PAT
        if ($envToken -and $envToken.Trim() -ne "") {
            $tokenToUse = $envToken
        }
    }
    if (-not $tokenToUse -or $tokenToUse.Trim() -eq "") {
        Abort "Nenhum PAT fornecido e 'UseGh' está desativado. Forneça -Pat ou defina a variável de ambiente GITHUB_PAT."
    }
    Post-With-Pat -token $tokenToUse -repo $Repo -prNumber $PrNumber -bodyText $body
}

# fim do script
