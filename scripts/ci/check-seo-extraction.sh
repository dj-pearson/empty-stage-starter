#!/usr/bin/env bash
#
# US-553: catch an extracted SEO tab that references something it never
# imported.
#
# SeoAnalysisTabs.tsx shipped using <Input> eight times with no import, so all
# six of its tabs threw `ReferenceError: Input is not defined` on render. ESLint
# does not flag it (no-undef is off for TS, since TS is supposed to cover it)
# and the full `tsc -b` that would have caught it OOMs in some containers, so
# nothing ever printed the error.
#
# This gates on that ONE error class rather than on a clean typecheck. The
# extracted tree still carries ~130 pre-existing type errors inherited verbatim
# from SEOManager; demanding zero would fail on day one and be switched off.
# Demanding no undefined identifiers is achievable today and catches the bug
# that actually shipped.
#
#   TS2304  Cannot find name 'X'
#   TS2552  Cannot find name 'X'. Did you mean 'y'?   (when a global looks close)
set -uo pipefail

echo "Typechecking src/components/admin/seo/ for undefined identifiers ..."

output=$(npx tsc -p tsconfig.seo.json 2>&1)
undefined_names=$(printf '%s\n' "$output" | grep -E "error TS(2304|2552):" || true)

if [ -n "$undefined_names" ]; then
  echo "::error title=Undefined identifier in an extracted SEO component::a component references a name it never imports."
  printf '%s\n' "$undefined_names"
  echo
  echo "This renders as a ReferenceError and breaks the tab. Add the missing import."
  exit 1
fi

echo "No undefined identifiers in the extracted SEO components."
