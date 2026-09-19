#!/usr/bin/env bash
#
# US-622: guard the two edge-function trees against the drift that caused the
# US-616 payments incident.
#
# THE LAYOUT (nothing else in the repo stated this, which is the root problem):
#
#   supabase/functions/   95 dirs (93 with an index.ts). Handlers are `export default async (req) =>`.
#                         This is the contract edge-functions-server.ts expects,
#                         and BOTH Dockerfiles copy this tree
#                         (Dockerfile:11, Dockerfile.functions:18). This is what
#                         actually serves production traffic.
#
#   functions/            35 dirs after US-773 removed the twelve duplicates.
#                         Handlers are `serve(...)` (Deno std / Supabase CLI
#                         style). Holds the Agentic OS — agent-* functions, the
#                         dispatcher, approval-executor, support intake, CSAT,
#                         nurture — plus ~75 shared logic modules with Deno
#                         tests. CI runs `deno test functions/_shared/...`, and
#                         config.toml gives some of these an explicit
#                         entrypoint (agent-blog-writer is live from here), so
#                         this tree is NOT dead and is NOT merely internal.
#
# 13 function names used to exist in BOTH trees as parallel implementations for
# the two runtimes. That ambiguity is what let the US-519 Stripe idempotency
# work be written into the tree the live server cannot even load: it used
# serve(), so it was never deployed, and the dedup table shipped empty for a
# month. US-773 resolved the last twelve; only `_shared` remains, deliberately.
#
# Three checks below:
#   1. HARD  — the router reaches every deployed handler, and routes nothing that
#             does not exist.
#   2. HARD  — no cross-tree name collisions at all, bar `_shared`.
#   3. HARD  — no remaining collision has a newer copy in the non-deployed tree.
set -uo pipefail

DEPLOYED="supabase/functions"
LEGACY="functions"
SERVER="edge-functions-server.ts"
fail=0

# US-773 resolved the last of them. `_shared` is the ONE name that stays in
# both trees, and it is not the same kind of thing: it is a directory of helper
# modules per tree, not two implementations of one endpoint. Both trees need
# somewhere to put shared code, and the 75 modules under functions/_shared back
# the Agentic OS functions that config.toml still deploys from that tree.
#
# Everything else came off this list by the same route, one function at a time:
# diff the pair, port what the deployed copy lacks, delete the copy that does
# not ship. create-checkout (US-626) and tonight-mode went first. The remaining
# twelve went in US-773, which found that the guards were consistently in the
# copy that never runs -- a method check on eleven of them, a per-user budget on
# nine, and on update-blog-image an SSRF check and a byte cap on a `fetch()` of
# an admin-supplied URL, which is the US-710 story over again.
#
# Do NOT add a name here to silence a collision. Put the function in one tree.
KNOWN_COLLISIONS="_shared"

echo "1/3 ${SERVER} routes every handler in ${DEPLOYED}/ ..."
# Both directions. A mapped name with no directory is a route that 500s; a
# directory with no route is a function that 404s, which is what US-774 found:
# ten handlers, delete-account and both bind-email-* among them, shipped in the
# deployed tree and were missing from a hand-written FUNCTIONS_MAP. The server
# now derives the table with Deno.readDirSync, so the second direction is
# satisfied by construction -- this check fails if that ever goes back to a list.
# _-prefixed directories are internals and are not owed a route.
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if [ ! -d "${DEPLOYED}/${name}" ]; then
    echo "::error title=Unroutable function::${SERVER} maps \"${name}\" but ${DEPLOYED}/${name}/ does not exist."
    fail=1
  fi
done < <(grep -oE '^\s*"[a-z0-9.-]+":\s*"\./functions/' "$SERVER" | grep -oE '"[a-z0-9.-]+":' | tr -d ' ":' )

if grep -qE 'Deno\.readDirSync\(' "$SERVER"; then
  : # table is derived from the tree, so no handler can be left out of it
else
  while IFS= read -r dir; do
    name="$(basename "$dir")"
    # _-prefixed directories are internals the router deliberately skips:
    # _shared/ is helper modules, _health/ would re-expose configuration detail
    # the server's own /health branch was hardened to withhold (US-623).
    case "$name" in _*) continue ;; esac
    [ -f "${DEPLOYED}/${name}/index.ts" ] || continue
    if ! grep -qE "^\s*\"${name}\":" "$SERVER"; then
      echo "::error title=Unrouted function::${DEPLOYED}/${name}/ ships but ${SERVER} has no route for it, so it answers 404."
      echo "    Derive FUNCTIONS_MAP from the directory instead of listing names -- see US-774."
      fail=1
    fi
  done < <(find "$DEPLOYED" -maxdepth 1 -mindepth 1 -type d | sort)
fi

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
