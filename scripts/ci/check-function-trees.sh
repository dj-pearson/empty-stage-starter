#!/usr/bin/env bash
#
# US-622: guard the two edge-function trees against the drift that caused the
# US-616 payments incident.
#
# THE LAYOUT (nothing else in the repo stated this, which is the root problem):
#
#   supabase/functions/   93 dirs. Handlers are `export default async (req) =>`.
#                         This is the contract edge-functions-server.ts expects,
#                         and BOTH Dockerfiles copy this tree
#                         (Dockerfile:11, Dockerfile.functions:18). This is what
#                         actually serves production traffic.
#
#   functions/            48 dirs. Handlers are `serve(...)` (Deno std / Supabase
#                         CLI style). Holds the Agentic OS — agent-* functions,
#                         the dispatcher, approval-executor, support intake,
#                         CSAT, nurture — plus ~75 shared logic modules with Deno
#                         tests. CI runs `deno test functions/_shared/...`
#                         (ci.yml:182,187), so this tree is NOT dead.
#
# 15 function names exist in BOTH trees as parallel implementations for the two
# runtimes. That ambiguity is what let the US-519 Stripe idempotency work be
# written into the tree the live server cannot even load: it used serve(), so it
# was never deployed, and the dedup table shipped empty for a month.
#
# Two checks below:
#   1. HARD  — every FUNCTIONS_MAP entry must resolve in the deployed tree.
#   2. HARD  — no NEW cross-tree name collisions. The 15 existing ones are
#              listed explicitly, mirroring how check-migration-prefixes.sh
#              grandfathers its known duplicates. Resolving them is tracked
#              work; adding a 16th is not allowed.
set -uo pipefail

DEPLOYED="supabase/functions"
LEGACY="functions"
SERVER="edge-functions-server.ts"
fail=0

# The 15 names that exist in both trees today. Do NOT add to this list to
# silence a new collision — put the function in one tree only.
KNOWN_COLLISIONS="_shared ai-meal-plan calculate-food-similarity create-checkout generate-blog-content generate-sitemap generate-social-content identify-product parse-receipt-image parse-recipe stripe-webhook suggest-foods suggest-recipe tonight-mode update-blog-image"

echo "1/2 FUNCTIONS_MAP entries resolve in ${DEPLOYED}/ ..."
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if [ ! -d "${DEPLOYED}/${name}" ]; then
    echo "::error title=Unroutable function::${SERVER} maps \"${name}\" but ${DEPLOYED}/${name}/ does not exist."
    fail=1
  fi
done < <(grep -oE '^\s*"[a-z0-9.-]+":' "$SERVER" | tr -d ' ":' )

echo "2/2 no NEW cross-tree name collisions ..."
if [ -d "$LEGACY" ]; then
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    case " $KNOWN_COLLISIONS " in
      *" $name "*) continue ;;
    esac
    echo "::error title=New function-tree collision::\"${name}\" exists in BOTH ${LEGACY}/ and ${DEPLOYED}/."
    echo "    These trees target different runtimes (serve() vs export default)."
    echo "    Pick ONE tree. A second copy silently never deploys — see US-616."
    fail=1
  done < <(comm -12 \
    <(find "$LEGACY" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' | sort) \
    <(find "$DEPLOYED" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' | sort))
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "See US-622 for the tree layout and why this matters."
  exit 1
fi

echo "Function trees OK."
