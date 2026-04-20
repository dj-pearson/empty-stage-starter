$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $root 'EatPal_App_Store.mobileprovision'
$dst  = Join-Path $root 'EatPal_App_Store.base64.txt'

if (-not (Test-Path -LiteralPath $src)) {
    Write-Error "Source profile not found: $src"
    exit 1
}

$bytes  = [IO.File]::ReadAllBytes($src)
$base64 = [Convert]::ToBase64String($bytes)
[IO.File]::WriteAllText($dst, $base64)

Write-Host "Wrote $dst ($($base64.Length) chars)"
Write-Host "Paste into GitHub secret: IOS_PROVISIONING_PROFILE_BASE64"
