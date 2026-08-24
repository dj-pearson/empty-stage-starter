#!/usr/bin/env bash
#
# US-646/US-647: typecheck the /compare cluster.
#
# Why this exists rather than `npm run typecheck`: a full `tsc -b` needs ~4GB
# and runs past 25 minutes in the containers this project builds in, so nobody
# runs it before committing, and the app tree carries pre-existing type errors
# that would bury a new one anyway. Same reasoning, same shape, as
# scripts/ci/check-seo-extraction.sh.
#
# tsconfig.seo-pages.json scopes the compile to the files these stories own, but
# TypeScript still reports errors in whatever those files import. Two such files
# are broken today and are not this work's to fix:
#
#   src/lib/utils.ts       TS2322  number vs Timeout
#   src/pages/NotFound.tsx TS2352  Window cast to Record<string, unknown>
#
# So this gates on errors ORIGINATING in the owned files, which is achievable
# today and catches the mistake that matters: a page that does not compile.
set -uo pipefail

OWNED='^(src/lib/comparison-|src/pages/Compare\.tsx|src/pages/ComparisonPage\.|src/lib/robots-txt\.test\.ts)'

echo "Typechecking the /compare cluster ..."

output=$(npx tsc -p tsconfig.seo-pages.json 2>&1)
owned_errors=$(printf '%s\n' "$output" | grep -E "$OWNED" | grep -E "error TS" || true)

if [ -n "$owned_errors" ]; then
  echo "::error title=Type error in the /compare cluster::"
  printf '%s\n' "$owned_errors"
  exit 1
fi

inherited=$(printf '%s\n' "$output" | grep -cE "error TS" || true)
echo "No type errors in the /compare cluster (${inherited} inherited from imported files, see the header of this script)."
