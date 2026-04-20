<#
.SYNOPSIS
  Mirrors https://github.com/mattpocock/skills into every .claude/skills
  directory found under a search root.

.DESCRIPTION
  Clones (or updates) the mattpocock/skills repo into a local cache, then
  copies each skill folder into every .claude/skills directory found under
  -SearchRoot. Existing non-mattpocock skills are left untouched; skill
  folders with matching names are overwritten.

.PARAMETER DryRun
  Show what would be copied without making changes.

.PARAMETER Refresh
  git pull the cached source before syncing.

.PARAMETER Here
  Only sync to this repo's .claude/skills (skip the scan).

.PARAMETER SearchRoot
  Directory to scan for .claude/skills folders.
  Default: C:\Users\dpearson\Documents

.EXAMPLE
  .\scripts\sync-mattpocock-skills.ps1 -DryRun
  .\scripts\sync-mattpocock-skills.ps1 -Refresh
  .\scripts\sync-mattpocock-skills.ps1 -Here
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Refresh,
    [switch]$Here,
    [string]$SearchRoot = 'C:\Users\dpearson\Documents'
)

$ErrorActionPreference = 'Stop'

$SourceRepo = 'https://github.com/mattpocock/skills.git'
$CacheDir   = Join-Path $env:USERPROFILE '.cache\claude-skills-mattpocock'
$RepoRoot   = Split-Path -Parent $PSScriptRoot

# 1. Ensure source cache.
if (-not (Test-Path (Join-Path $CacheDir '.git'))) {
    Write-Host "Cloning mattpocock/skills -> $CacheDir"
    $parent = Split-Path -Parent $CacheDir
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    git clone --depth 1 $SourceRepo $CacheDir
    if ($LASTEXITCODE -ne 0) { throw "git clone failed" }
}
elseif ($Refresh) {
    Write-Host "Refreshing $CacheDir"
    git -C $CacheDir pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "git pull failed" }
}

# 2. Collect skill folders (each top-level dir with a SKILL.md).
$SkillDirs = Get-ChildItem -Path $CacheDir -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') } |
    Sort-Object Name

if ($SkillDirs.Count -eq 0) {
    throw "No skills found in $CacheDir"
}
Write-Host "Source skills: $($SkillDirs.Count)"

# 3. Collect targets.
if ($Here) {
    $hereSkills = Join-Path $RepoRoot '.claude\skills'
    if (-not (Test-Path $hereSkills)) {
        New-Item -ItemType Directory -Path $hereSkills -Force | Out-Null
    }
    $Targets = @((Get-Item $hereSkills).FullName)
}
else {
    $Targets = Get-ChildItem -Path $SearchRoot -Recurse -Directory -Depth 6 -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\\.claude\\skills$' } |
        Select-Object -ExpandProperty FullName |
        Sort-Object
}

if (-not $Targets -or $Targets.Count -eq 0) {
    throw "No .claude/skills dirs found under $SearchRoot"
}

Write-Host "Targets: $($Targets.Count)"
$Targets | ForEach-Object { Write-Host "  - $_" }
Write-Host ""

if ($DryRun) { Write-Host "(dry-run - no changes will be made)`n" }

# 4. Copy.
foreach ($target in $Targets) {
    foreach ($skill in $SkillDirs) {
        $dest = Join-Path $target $skill.Name
        if ($DryRun) {
            Write-Host "would sync: $($skill.Name) -> $target\"
        }
        else {
            if (Test-Path $dest) { Remove-Item -Path $dest -Recurse -Force }
            Copy-Item -Path $skill.FullName -Destination $dest -Recurse -Force
            Write-Host "synced: $($skill.Name) -> $target\"
        }
    }
}

Write-Host ""
Write-Host "Done. Synced $($SkillDirs.Count) skills to $($Targets.Count) target(s)."
