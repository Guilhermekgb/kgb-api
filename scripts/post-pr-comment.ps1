param(
    [int]$PrNumber = 8,
    [string]$Owner = 'Guilhermekgb',
    [string]$Repo = 'kgb-api'
)

# Usage:
# In PowerShell: $env:GITHUB_TOKEN='ghp_xxx'; .\scripts\post-pr-comment.ps1 -PrNumber 8

if (-not $env:GITHUB_TOKEN) {
    Write-Error "GITHUB_TOKEN environment variable is not set. Create a GitHub PAT with 'repo' scope and set it in this session: $env:GITHUB_TOKEN='ghp_...' ."
    exit 2
}

$bodyPath = Join-Path $PSScriptRoot '..\PR_FOLLOWUP_REMOVE_SYNC_READS.md'
if (-not (Test-Path $bodyPath)) {
    Write-Error "File not found: $bodyPath"
    exit 2
}

$body = Get-Content -Raw $bodyPath

$uri = "https://api.github.com/repos/$Owner/$Repo/issues/$PrNumber/comments"

Write-Host "Posting comment to PR #$PrNumber at $Owner/$Repo..."

try {
    $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "token $env:GITHUB_TOKEN"; "User-Agent" = "kgb-migration-agent" } -Body (@{ body = $body } | ConvertTo-Json -Depth 10)
    Write-Host "Comment posted: id=$($resp.id) url=$($resp.html_url)"
} catch {
    Write-Error "Failed to post comment: $($_.Exception.Message)"
    exit 2
}
