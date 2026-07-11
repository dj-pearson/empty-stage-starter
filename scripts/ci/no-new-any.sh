#!/usr/bin/env bash
#
# US-545: diff-scoped "no new explicit any" gate.
#
# Fails when a change ADDS an explicit `any` at a TypeScript boundary in src/
# (the exact spots where the generated Supabase types matter). It only inspects
# ADDED lines against the base branch, so the large pre-existing `any` backlog
# does not block PRs — only newly-introduced `any` does. Generated types and
# test files are exempt.
#
# Usage: no-new-any.sh [base-ref]   (base-ref defaults to origin/main)
set -uo pipefail

BASE="${1:-origin/main}"

# Resolve a usable base commit; skip gracefully if it can't be determined
# (e.g. a shallow checkout with no base) rather than failing the build.
if ! git rev-parse --verify --quiet "${BASE}" >/dev/null; then
  git fetch --quiet --depth=1 origin "${BASE#origin/}" 2>/dev/null || true
fi
if ! git rev-parse --verify --quiet "${BASE}" >/dev/null; then
  echo "::notice title=no-new-any::base ref '${BASE}' unavailable; skipping diff-scoped any check."
  exit 0
fi

# Added (+) lines in non-test, non-generated TS/TSX under src/.
added="$(
  git diff "${BASE}...HEAD" -- 'src/**/*.ts' 'src/**/*.tsx' \
    ':(exclude)src/integrations/supabase/types.ts' \
    ':(exclude)src/**/*.test.ts' ':(exclude)src/**/*.test.tsx' 2>/dev/null \
  | grep -E '^\+' | grep -vE '^\+\+\+' \
  | grep -nE ':[[:space:]]*any\b|<any>|as any\b|Array<any>|Promise<any>|Record<[^,]*,[[:space:]]*any>' \
  || true
)"

if [ -n "${added}" ]; then
  echo "::error title=No new explicit any::this change adds explicit 'any' at a TS boundary. Use a concrete type (e.g. Database['public']['Tables'][...]['Row'] + a normalizer) or 'unknown' + a guard."
  echo "${added}"
  exit 1
fi

echo "No new explicit 'any' added under src/."
exit 0
