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

# Skipping when pwsh is absent keeps this runnable on a developer machine that
# has no PowerShell. On CI it is the inert-gate failure mode: a runner image
# that quietly stops shipping pwsh would turn this into a step that always
# passes, and nobody would notice for months -- which is exactly how the two
# unparseable .ps1 files this gate exists for survived. So on CI, missing pwsh
# is a failure.
if ! command -v pwsh >/dev/null 2>&1; then
  if [ -n "${CI:-}" ]; then
    echo "::error title=PowerShell parse check::pwsh is not available on this runner."
    echo "      This gate cannot run, and a gate that cannot run must not report success."
    echo "      Install PowerShell in the workflow, or drop this step deliberately."
    exit 1
  fi
  echo "pwsh not found - skipping the PowerShell parse check (set CI=1 to make this fatal)."
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

# ---------------------------------------------------------------------------
# US-562: the signing encoders, RUN rather than parsed.
#
# A parse says the file is syntactically valid. It cannot say the guard works,
# and the guard is the whole point of these two scripts: they exist so that
# signing material stops being written into a working tree.
#
# It was not working correctly. The check was a bare
# $outFull.StartsWith($repoRoot), which treats any sibling whose name merely
# extends the repo's as inside it -- with the repo at .../empty-stage-starter,
# a secrets directory at .../empty-stage-starter-secrets was refused. It failed
# closed, so nothing ever leaked, but it rejected the most obvious correct
# setup while printing an accusation of the opposite.
#
# Synthetic fixtures throughout: random bytes standing in for a
# .mobileprovision. Nothing real is needed, which is exactly why this could
# have been run at any point in the last five rounds of the story.
# ---------------------------------------------------------------------------
echo
echo "Running the signing encoders against synthetic profiles ..."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sign="$tmp/signing"; sibling="$(pwd)-encoder-check"
mkdir -p "$sign" "$sibling"

enc_fail=0
note() { echo "  FAIL $1"; enc_fail=1; }

for script in encode-app-profile.ps1 encode-share-profile.ps1; do
  [ -f "$script" ] || { note "$script is missing"; continue; }

  # Read the expected filename out of the script rather than hardcoding it.
  # Hardcoding a guess here already produced one false accusation: the share
  # script wants EatPal_Share_App_Store.mobileprovision, the fixture was named
  # EatPal_Share_Extension, and the resulting "Source profile not found" was
  # reported as "refused a sibling directory".
  profile="$(sed -n "s/^\$profileName *= *'\([^']*\)'.*/\1/p" "$script" | head -1)"
  if [ -z "$profile" ]; then note "$script: cannot read \$profileName"; continue; fi
  src="$sign/$profile"
  head -c 512 /dev/urandom > "$src"

  # 1. Refuses with a non-zero exit when it has no idea where the material is.
  if env -u EATPAL_SIGNING_DIR pwsh -NoProfile -File "./$script" >/dev/null 2>&1; then
    note "$script exits 0 with no EATPAL_SIGNING_DIR"
  fi

  # 2. Refuses a source that is not there, rather than writing an empty secret.
  if EATPAL_SIGNING_DIR="$tmp/nowhere" pwsh -NoProfile -File "./$script" >/dev/null 2>&1; then
    note "$script exits 0 when the profile is missing"
  fi

  # 3. Refuses to write inside the repository, and writes nothing.
  target="$(pwd)/.encoder-check-leak.txt"
  rm -f "$target"
  if EATPAL_SIGNING_DIR="$sign" pwsh -NoProfile -File "./$script" -OutPath "$target" >/dev/null 2>&1; then
    note "$script wrote into the repository"
  fi
  if [ -e "$target" ]; then note "$script left $target behind"; rm -f "$target"; fi

  # 4. Accepts a sibling directory whose name merely extends the repo's. This
  #    is the regression the bare StartsWith caused.
  out_file="$sibling/${profile%.mobileprovision}.base64.txt"
  rm -f "$out_file"
  if ! EATPAL_SIGNING_DIR="$sign" pwsh -NoProfile -File "./$script" \
        -OutPath "$out_file" >/dev/null 2>&1; then
    note "$script refused a sibling directory outside the repo"
  fi

  # 5. The base64 it wrote decodes back to exactly the source bytes.
  if [ ! -f "$out_file" ]; then
    note "$script produced no output file"
  elif ! base64 -d < "$out_file" 2>/dev/null | cmp -s - "$src"; then
    note "$script produced base64 that does not round-trip"
  fi

  # 6. Never prints the encoded value, only its length.
  if [ -f "$out_file" ]; then
    out="$(EATPAL_SIGNING_DIR="$sign" pwsh -NoProfile -File "./$script" \
          -OutPath "$out_file" 2>&1 || true)"
    if printf '%s' "$out" | grep -qF "$(head -c 40 "$out_file")"; then
      note "$script printed the encoded material to stdout"
    fi
  fi
done

rm -rf "$sibling"

if [ "$enc_fail" -ne 0 ]; then
  echo "::error title=Signing encoder check::an encoder guard did not behave as documented."
  exit 1
fi
echo "Both signing encoders refuse the repo, accept a sibling, round-trip, and stay quiet."
