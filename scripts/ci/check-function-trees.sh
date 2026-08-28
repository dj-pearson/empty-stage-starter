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
# 13 function names exist in BOTH trees as parallel implementations for the two
# runtimes. That ambiguity is what let the US-519 Stripe idempotency work be
# written into the tree the live server cannot even load: it used serve(), so it
# was never deployed, and the dedup table shipped empty for a month.
#
# Two checks below:
#   1. HARD  — every FUNCTIONS_MAP entry must resolve in the deployed tree.
#   2. HARD  — no NEW cross-tree name collisions. The 13 existing ones are
#              listed explicitly, mirroring how check-migration-prefixes.sh
#              grandfathers its known duplicates. Resolving them is tracked
#              work; adding a 14th is not allowed.
set -uo pipefail

DEPLOYED="supabase/functions"
LEGACY="functions"
SERVER="edge-functions-server.ts"
fail=0

# The 13 names that exist in both trees today. Do NOT add to this list to
# silence a new collision — put the function in one tree only.
#
# create-checkout came off this list in US-626: the two copies answered
# different contracts, only supabase/functions/ was ever called, and the
# non-deployed copy was deleted after its method check, its
# Stripe-not-configured branch, its status codes and its US-532 error-detail
# containment were ported into the deployed one.
#
# tonight-mode came off it the same way. Check 3 below has failed on main since
# it was added, because the June US-324/US-325 hardening went into the serve()
# copy: the IDOR check the deployed copy already did natively, and a rate limit
# it did not. rate_limit_config had carried a tonight-mode budget since that
# same commit with no code reading it. enforceRateLimit is now in
# supabase/functions/_shared/rate-limit.ts and called by the deployed handler;
# the serve() copy (index.ts + its private scoring.ts, imported by nothing else,
# covered by no Deno test) is deleted.
KNOWN_COLLISIONS="_shared ai-meal-plan calculate-food-similarity generate-blog-content generate-sitemap generate-social-content identify-product parse-receipt-image parse-recipe stripe-webhook suggest-foods suggest-recipe update-blog-image"

echo "1/3 FUNCTIONS_MAP entries resolve in ${DEPLOYED}/ ..."
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if [ ! -d "${DEPLOYED}/${name}" ]; then
    echo "::error title=Unroutable function::${SERVER} maps \"${name}\" but ${DEPLOYED}/${name}/ does not exist."
    fail=1
  fi
done < <(grep -oE '^\s*"[a-z0-9.-]+":' "$SERVER" | tr -d ' ":' )

echo "2/3 no NEW cross-tree name collisions ..."
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

# US-616 happened because a NON-DEPLOYED copy got the fix and the deployed one
# did not: the Stripe idempotency work went into the serve() tree the live
# server cannot load, so it never shipped and the dedup table stayed empty for a
# month. US-626 found create-checkout heading the same way, its top-level copy
# newer than the deployed one by a month.
#
# Check 2 above only stops NEW collisions. It cannot see an existing pair
# drifting, which is the shape the incident actually takes. So: for every known
# collision, if the top-level copy has a NEWER last-commit date than the
# deployed one, someone has almost certainly edited the copy that does not ship.
#
# Needs history. CI checks out with fetch-depth: 0 (ci.yml:26); if a date comes
# back empty -- a shallow clone, or a path with no commits -- skip that pair
# rather than failing on missing information.
echo "3/3 no known collision has a newer copy in the non-deployed tree ..."
for name in $KNOWN_COLLISIONS; do
  [ "$name" = "_shared" ] && continue
  [ -d "${DEPLOYED}/${name}" ] && [ -d "${LEGACY}/${name}" ] || continue

  deployed_at="$(git log -1 --format=%ct -- "${DEPLOYED}/${name}" 2>/dev/null || true)"
  legacy_at="$(git log -1 --format=%ct -- "${LEGACY}/${name}" 2>/dev/null || true)"
  [ -n "$deployed_at" ] && [ -n "$legacy_at" ] || continue

  if [ "$legacy_at" -gt "$deployed_at" ]; then
    echo "::error title=Non-deployed copy is newer::${LEGACY}/${name} was edited more recently than ${DEPLOYED}/${name}."
    echo "    The deployed tree is ${DEPLOYED}/. A change made only in ${LEGACY}/ does not ship."
    echo "    Port it across, or delete the copy that is not deployed."
    fail=1
  fi
done


if [ "$fail" -ne 0 ]; then
  echo ""
  echo "See US-622 for the tree layout and why this matters."
  exit 1
fi

echo "Function trees OK."
