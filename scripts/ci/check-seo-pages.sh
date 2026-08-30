#!/usr/bin/env bash
#
# US-646/US-647/US-650/US-651: typecheck the SEO gap work.
#
# Why this exists rather than `npm run typecheck`: a full `tsc -b` needs ~4GB
# and runs past 25 minutes in the containers this project builds in, so nobody
# runs it before committing, and the app tree carries pre-existing type errors
# that would bury a new one anyway. Same reasoning, same shape, as
# scripts/ci/check-seo-extraction.sh.
#
# tsconfig.seo-pages.json scopes the compile to the files these stories own, but
# TypeScript still reports errors in whatever those files import:
#
#   src/lib/utils.ts       TS2322  number vs Timeout
#   src/pages/NotFound.tsx TS2352  Window cast to Record<string, unknown>
#
# US-648 added src/pages/toolPagesPrerender.test.tsx, which renders
# PickyEaterQuiz.tsx and BudgetCalculator.tsx, so the whole of their import
# graphs now come along too. That took the inherited count from 2 to 18. None of
# them are this work's to fix and all of them predate it; the gate below still
# fails on anything originating in an owned file, which is the point.
#
# So this gates on errors ORIGINATING in the owned files, which is achievable
# today and catches the mistake that matters: a page that does not compile.
set -uo pipefail

OWNED='^(src/lib/comparison-|src/pages/Compare\.tsx|src/pages/ComparisonPage\.|src/lib/robots-txt\.test\.ts|src/lib/contentDecay\.test\.ts|src/lib/seo/|src/lib/seoLocales\.test\.tsx|src/components/admin/seo/SeoCannibalizationTab\.tsx|src/components/admin/seo/useSeoCannibalization\.ts|src/components/admin/seo/SeoIndexCoverageTab\.tsx|src/components/admin/seo/useSeoIndexCoverage\.ts|src/lib/prerenderManifest\.test\.ts|src/lib/meal-ideas-content\.|src/pages/MealIdeasPage\.tsx|src/lib/arfid-content\.|src/pages/ArfidPage\.|src/lib/tool-page-content\.|src/pages/toolPagesPrerender\.test\.tsx)'

echo "Typechecking the SEO gap modules ..."

output=$(npx tsc -p tsconfig.seo-pages.json 2>&1)
owned_errors=$(printf '%s\n' "$output" | grep -E "$OWNED" | grep -E "error TS" || true)

if [ -n "$owned_errors" ]; then
  echo "::error title=Type error in the SEO gap modules::"
  printf '%s\n' "$owned_errors"
  exit 1
fi

inherited=$(printf '%s\n' "$output" | grep -cE "error TS" || true)
echo "No type errors in the SEO gap modules (${inherited} inherited from imported files, see the header of this script)."
