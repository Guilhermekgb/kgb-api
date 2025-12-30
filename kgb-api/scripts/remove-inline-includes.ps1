# Remove includes redundantes de storage-adapter e fotos-shim em HTML
# Cria backup .bak antes de sobrescrever (se ainda não existir)
# Uso: execute a partir da raiz do workspace ou dentro de PowerShell

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path (Resolve-Path "$root\..\..") -ErrorAction SilentlyContinue | Out-Null

Write-Output "[remove-inline-includes] Raiz atual: $(Get-Location)"

$patterns = @( 
    '<script\s+src="\.\/kgb-api\/public\/api\/storage-adapter.js"\s*><\/script>\s*',
    '<script\s+src="\.\/kgb-api\/public\/js\/fotos-shim.js"\s*><\/script>\s*'
)

$files = Get-ChildItem -Path . -Recurse -Include *.html -File -ErrorAction SilentlyContinue
$modified = @()

foreach($f in $files){
    try{
        $txt = Get-Content $f.FullName -Raw -ErrorAction Stop
        $orig = $txt
        $new = $txt
        foreach($pat in $patterns){
            $new = [System.Text.RegularExpressions.Regex]::Replace($new, $pat, '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        }
        if($new -ne $orig){
            $bak = $f.FullName + '.bak'
            if(-not (Test-Path $bak)){
                Copy-Item -Path $f.FullName -Destination $bak -Force
                Write-Output "[backup] $bak"
            } else {
                Write-Output "[backup exists] $bak"
            }
            Set-Content -Path $f.FullName -Value $new -Force
            Write-Output "[modified] $($f.FullName)"
            $modified += $f.FullName
        }
    }catch{
        Write-Output "[error] $_"
    }
}

if($modified.Count -eq 0){
    Write-Output "No files modified."
} else {
    Write-Output "Total modified: $($modified.Count)"
    $modified | ForEach-Object { Write-Output " - $_" }
}
