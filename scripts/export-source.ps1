$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $changes = git status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Run from a Git checkout with Git installed.' }
    if ($changes) { throw 'Commit or resolve working-tree changes before exporting HEAD.' }
    $revision = git rev-parse --short HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Cannot determine source version.' }
    $outputDirectory = Join-Path $repoRoot 'share'
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    $archive = Join-Path $outputDirectory ("pokemon-capsule-factory-source-{0}.zip" -f $revision.Trim())
    git archive --format=zip --prefix=pokemon-capsule-factory/ "--output=$archive" HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Source export failed.' }
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $(Split-Path -Leaf $archive)" | Set-Content -LiteralPath "$archive.sha256" -Encoding ASCII
    Get-Item -LiteralPath $archive | Select-Object FullName, Length
} finally {
    Pop-Location
}
