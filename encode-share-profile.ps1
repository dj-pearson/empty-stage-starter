# US-562: signing material must not live in the project directory.
#
# This script used to read the .mobileprovision from the repo root and write
# the base64 next to it, which is precisely what kept distribution secrets
# inside a working tree. Both paths now come from outside the repo: set
# EATPAL_SIGNING_DIR to wherever the signing material is kept (a secrets
# manager checkout, an encrypted volume, 1Password CLI export dir - anywhere
# that is not this repository), or pass -SourcePath and -OutPath explicitly.
#
# The base64 value is never printed, only its length.

[CmdletBinding()]
param(
    [string] $SourcePath,
    [string] $OutPath
)

$ErrorActionPreference = 'Stop'

$profileName = 'EatPal_Share_App_Store.mobileprovision'

if (-not $SourcePath) {
    if (-not $env:EATPAL_SIGNING_DIR) {
        Write-Error "Set EATPAL_SIGNING_DIR to the directory holding $profileName (outside this repo), or pass -SourcePath."
        exit 1
    }
    $SourcePath = Join-Path $env:EATPAL_SIGNING_DIR $profileName
}

if (-not $OutPath) {
    # Default beside the source, never inside the repository.
    $OutPath = [IO.Path]::ChangeExtension($SourcePath, '.base64.txt')
}

if (-not (Test-Path -LiteralPath $SourcePath)) {
    Write-Error "Source profile not found: $SourcePath"
    exit 1
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$outFull  = [IO.Path]::GetFullPath($OutPath)
# Compare on a directory BOUNDARY, not a bare prefix. A plain StartsWith makes
# any sibling whose name merely extends the repo's a false positive -- with the
# repo at .../empty-stage-starter, a perfectly good secrets directory at
# .../empty-stage-starter-secrets was refused. That is the first place someone
# following this story would put the material. It failed closed, so nothing
# leaked; it just refused the correct setup with a message accusing you of the
# opposite of what you did.
$repoPrefix = $repoRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if ($outFull.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $outFull.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "Refusing to write signing material into the repository: $outFull"
    exit 1
}

$bytes  = [IO.File]::ReadAllBytes($SourcePath)
$base64 = [Convert]::ToBase64String($bytes)
[IO.File]::WriteAllText($OutPath, $base64)

Write-Host "Wrote $OutPath ($($base64.Length) chars)"
Write-Host "Paste into GitHub secret: IOS_SHARE_PROVISIONING_PROFILE_BASE64"
Write-Host "Delete $OutPath once the secret is set."
