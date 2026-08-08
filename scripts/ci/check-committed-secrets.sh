#!/usr/bin/env bash
#
# US-614: fail the build when a private key or provider secret is committed.
#
# Motivated by a real incident: a live Sign in with Apple ES256 signing key sat
# in generate-apple-secret.js, tracked on main, for three months. Deleting a
# leaked key does not remediate it (git history keeps it) — the only fix is
# revocation, so the cheap win is never letting the next one land.
#
# Scans TRACKED files only (`git ls-files`), so untracked scratch files and
# .env.local don't trip it.
#
# Two classes of check, because they need different discriminators:
#
#   1. PEM private keys — the header alone is NOT evidence. Setup docs
#      legitimately show `-----BEGIN PRIVATE KEY-----` with an elided body.
#      We flag only a complete BEGIN/END block whose base64 body is long
#      enough to be real key material and is not elided with "...".
#
#   2. Single-token secrets (Stripe live keys, AWS ids, service-role JWTs) —
#      matched by shape, with placeholder spellings filtered out.
set -uo pipefail

fail=0

TOKEN_PATTERNS='sk_live_[0-9a-zA-Z]{16,}|rk_live_[0-9a-zA-Z]{16,}|AKIA[0-9A-Z]{16}|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ'
PLACEHOLDER='example|placeholder|XXXX|REPLACE|your_|dummy|fake|<[a-z_]+>|\$\{|\$\('

# Only this scanner is exempt — it necessarily contains the patterns it hunts.
ALLOWLIST='^scripts/ci/check-committed-secrets\.sh$'

# Emit a line for each complete PEM block with a plausible real body.
# A block qualifies when its base64 body is >= 100 chars and never elided.
pem_hits() {
  awk '
    /-----BEGIN ([A-Z]+ )?PRIVATE KEY-----/ { inblock=1; body=""; elided=0; start=NR; next }
    inblock && /-----END ([A-Z]+ )?PRIVATE KEY-----/ {
      if (!elided && length(body) >= 100) printf "%s:%d: complete PEM private key block (%d base64 chars)\n", FILENAME, start, length(body)
      inblock=0; next
    }
    inblock {
      if (index($0, "...") > 0) elided=1
      line=$0
      gsub(/[^A-Za-z0-9+\/=]/, "", line)
      body = body line
    }
  ' "$1" 2>/dev/null
}

echo "Scanning tracked files for committed credentials..."

while IFS= read -r file; do
  [ -f "$file" ] || continue
  printf '%s\n' "$file" | grep -qE "$ALLOWLIST" && continue
  case "$file" in
    *.png|*.jpg|*.jpeg|*.webp|*.ico|*.pdf|*.db|*.rvf|package-lock.json|deno.lock) continue ;;
  esac

  if pem=$(pem_hits "$file") && [ -n "$pem" ]; then
    fail=1
    echo "::error title=Committed private key::$file contains what looks like real key material."
    printf '%s\n' "$pem" | sed 's/^/    /'
  fi

  if matches=$(grep -nEH -e "$TOKEN_PATTERNS" "$file" 2>/dev/null); then
    real=$(printf '%s\n' "$matches" | grep -viE "$PLACEHOLDER")
    if [ -n "$real" ]; then
      fail=1
      echo "::error title=Committed secret::$file appears to contain a real credential."
      printf '%s\n' "$real" | cut -c1-160 | sed 's/^/    /'
    fi
  fi
done < <(git ls-files)

if [ "$fail" -ne 0 ]; then
  cat <<'MSG'

A credential looks committed. Do NOT just delete the line — git history keeps it.
  1. REVOKE the credential at the provider (Apple / Stripe / AWS / Supabase).
  2. Issue a replacement and store it in Infisical.
  3. Change the code to read it from the environment.
See US-614 and SECURITY.md.
MSG
  exit 1
fi

echo "No committed credentials found."
