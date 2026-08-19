#!/usr/bin/env bash
#
# Hard gate: every .ps1 in the repo parses.
#
# CLAUDE.md records that backup-databases.ps1 and ssl-check.ps1 sat
# unparseable for months, because nothing here ever runs a PowerShell script --
# the CI is Node, the deploys are Cloudflare and EAS, and these scripts are run
# by hand on a Windows machine, so a syntax error surfaces at the worst
# possible moment. The parser is the cheapest possible check and needs no
# Windows: pwsh is preinstalled on GitHub's ubuntu runners.
#
# This checks that a script PARSES, not that it works. It cannot tell you a
# path is wrong or an API changed.
set -uo pipefail

if ! command -v pwsh >/dev/null 2>&1; then
  echo "pwsh not found - skipping the PowerShell parse check."
  exit 0
fi

pwsh -NoProfile -Command '
$files = Get-ChildItem -Path . -Filter *.ps1 -Recurse -File |
  Where-Object { $_.FullName -notmatch "node_modules" }
$bad = 0
foreach ($f in $files) {
  $errs = $null; $tokens = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    $f.FullName, [ref]$tokens, [ref]$errs) | Out-Null
  if ($errs -and $errs.Count -gt 0) {
    $bad++
    Write-Host ("FAIL " + (Resolve-Path -Relative $f.FullName))
    $errs | Select-Object -First 3 | ForEach-Object {
      Write-Host ("      line {0}: {1}" -f $_.Extent.StartLineNumber, $_.Message)
    }
  }
}
Write-Host ""
Write-Host ("{0} .ps1 files checked, {1} with parse errors" -f $files.Count, $bad)
if ($bad -gt 0) { exit 1 }
'
