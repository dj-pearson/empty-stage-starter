#!/usr/bin/env bash
#
# US-545: typecheck error-count ratchet.
#
# Runs `npm run typecheck` (tsc -b) once, counts the `error TS` lines, and
# compares to the committed baseline in .ci/typecheck-baseline.txt. The build
# FAILS if the count grows beyond the baseline, so the pre-existing backlog can
# only shrink — a PR can never add net-new type errors. When the count drops the
# step passes and prints a notice to ratchet the baseline down. When the count
# reaches 0 the baseline should be set to 0 and `npm run typecheck` promoted to
# a plain hard gate (drop this script + the continue-on-error wrappers).
#
# Runs the typecheck ONCE and reuses the log for both the ratchet and the
# human-readable backlog annotation (tsc -b is slow; don't run it twice).
set -uo pipefail

BASELINE_FILE=".ci/typecheck-baseline.txt"
# US-802: a stable path, so the workflow can upload it as an artifact and a
# developer can read the whole thing without reproducing the build.
LOG="${TYPECHECK_LOG:-/tmp/typecheck-ratchet.log}"

# ---------------------------------------------------------------------------
# US-802: on a regression, show what THIS branch added.
#
# The old answer was `grep ... | tail -40`. Errors sort by path and this repo's
# backlog lives in src/pages/*, so that tail is a CONSTANT -- the same forty
# pre-existing errors print every time and the ones the branch added are
# earlier in the walk, never shown. It cost two round trips once.
#
# The merge-base run is expensive, so it is paid ONLY when the ratchet is about
# to fail. On the happy path nothing extra runs. node_modules is symlinked into
# the worktree rather than reinstalled -- a second `npm ci` would cost more than
# the answer is worth, and the dependency tree is the same commit-to-commit for
# the overwhelming majority of PRs (if it is not, the base run simply fails and
# we fall back to the grouped listing).
#
# $1 = kind (typecheck|lint)   $2 = head log   $3 = command to run in the base
explain_regression() {
  local kind="$1" head_log="$2" base_cmd="$3"
  local base_ref="${GITHUB_BASE_REF:-}" base_sha="" worktree base_log

  if [ -n "$base_ref" ]; then
    git fetch --quiet --depth=50 origin "$base_ref" 2>/dev/null || true
    base_sha="$(git merge-base HEAD "origin/${base_ref}" 2>/dev/null || true)"
  fi
  if [ -z "$base_sha" ]; then
    base_sha="$(git merge-base HEAD origin/main 2>/dev/null || true)"
  fi

  if [ -z "$base_sha" ]; then
    echo "No merge base available, so the list below is every error, grouped by file."
    node scripts/ci/new-errors.mjs --kind="$kind" --head="$head_log" --head-root="$(pwd)"
    return 0
  fi

  worktree="$(mktemp -d)/base"
  base_log="$(mktemp)"
  if ! git worktree add --quiet --detach "$worktree" "$base_sha" 2>/dev/null; then
    echo "Could not check out the merge base ${base_sha}; listing every error by file instead."
    node scripts/ci/new-errors.mjs --kind="$kind" --head="$head_log" --head-root="$(pwd)"
    return 0
  fi

  ln -s "$(pwd)/node_modules" "$worktree/node_modules" 2>/dev/null || true
  echo "Re-running ${kind} on the merge base (${base_sha}) to isolate what this branch added..."
  ( cd "$worktree" && eval "$base_cmd" ) > "$base_log" 2>&1 || true

  node scripts/ci/new-errors.mjs --kind="$kind" --head="$head_log" --base="$base_log" \
    --head-root="$(pwd)" --base-root="$worktree"

  git worktree remove --force "$worktree" 2>/dev/null || true
}

baseline="$(tr -dc '0-9' < "$BASELINE_FILE" 2>/dev/null)"
if [ -z "${baseline}" ]; then
  echo "::error title=Typecheck ratchet::missing/invalid ${BASELINE_FILE}"
  exit 1
fi

# A polluted node_modules is not this tree.
#
# `deno` with the default DENO_DIR writes its package store to
# node_modules/.deno INSIDE the repo -- 1.3 GB of a second dependency tree,
# the US-813 second-React problem. tsc walks it for @types and the count comes
# back HIGHER than the tree's own: measured 838 against a true 805 on the same
# commit, and the merge-base worktree this script builds symlinks the same
# node_modules, so even the "what did this branch add" isolation below reports
# phantom regressions.
#
# That is a whole afternoon if you do not know to look, and the shape of it is
# a local number nobody can reproduce later -- which is exactly the discrepancy
# US-790 exists to explain. src/test/reactEnvironment.test.tsx catches the
# directory for the vitest run; this catches it for the count.
#
# Refuse rather than report. A number measured against the wrong dependency
# tree is worse than no number, because it looks like a number.
if [ -d "node_modules/.deno" ]; then
  echo "::error title=Polluted node_modules::node_modules/.deno exists, so tsc is reading a second dependency tree layered under this one and the count would be wrong (measured +33 on a tree whose true count was 805)."
  echo "    Deno wrote it because DENO_DIR was left at its default inside the repo."
  echo "    Fix:   rm -rf node_modules/.deno && npm ci"
  echo "    Avoid: export DENO_DIR=\"\${TMPDIR:-/tmp}/deno-cache\" before running deno."
  exit 1
fi

npm run typecheck > "$LOG" 2>&1
status=$?
count="$(grep -cE 'error TS' "$LOG" || true)"

# A crashed tsc is not a clean tsc.
#
# tsc exits non-zero whenever it reports errors, which is the NORMAL state here
# while the backlog is non-empty, so a bare exit-code check would fail every
# run. The signal that something actually went wrong is the combination: the
# tool failed AND reported no errors at all. That is what an OOM kill, a
# SIGTERM, a missing node_modules or a bad tsconfig looks like.
#
# Without this the ratchet reads a truncated log as a clean tree: it prints
# "Typecheck errors: 0 (baseline: N)", passes, and helpfully suggests lowering
# the baseline to zero. Observed for real by killing a tsc mid-run.
if [ "$status" -ne 0 ] && [ "$count" -eq 0 ]; then
  echo "::error title=Typecheck did not run::\`npm run typecheck\` exited ${status} without reporting a single type error, so the log cannot be trusted (OOM, crash, or a broken setup). NOT treating this as zero errors."
  tail -40 "$LOG"
  exit 1
fi

echo "Typecheck errors: ${count} (baseline: ${baseline})"

# US-856: two error codes are held at ZERO, whatever the baseline says.
#
# TS2304 "Cannot find name" and TS2503 "Cannot find namespace" are not type
# nits. They mean an identifier the code evaluates is not bound anywhere, so the
# line throws ReferenceError the moment it runs. Everything else in the backlog
# is a wrong type on code that still executes; these do not execute at all.
#
# One of them was src/pages/Pantry.tsx calling t('pantry.emptyTitle') in a
# component with no useTranslation(), which crashed the whole pantry screen to
# the route error boundary for every user whose pantry was empty -- that is, for
# every new account. It sat in a backlog of 800+ errors where nobody reads the
# list, and the ratchet passed because the count had not grown.
#
# Held separately rather than by lowering the baseline: the backlog shrinks
# slowly, and this class must never come back at all.
fatal="$(grep -E 'error TS(2304|2503)' "$LOG" || true)"
if [ -n "$fatal" ]; then
  echo "::error title=Unbound identifier::TS2304/TS2503 mean an identifier is not bound, so the line throws ReferenceError when it runs. These are held at zero regardless of the baseline."
  echo "$fatal"
  exit 1
fi

if [ "$count" -gt "$baseline" ]; then
  echo "::error title=Typecheck regression::${count} type errors exceeds the baseline of ${baseline}. Your change introduced new type errors — fix them. Do NOT raise .ci/typecheck-baseline.txt."
  explain_regression typecheck "$LOG" "npm run typecheck"
  echo ""
  echo "The full log is at ${LOG} and is uploaded as the 'typecheck-log' artifact."
  exit 1
fi

if [ "$count" -lt "$baseline" ]; then
  echo "::notice title=Ratchet down::type-error count dropped to ${count} (baseline ${baseline}). Lower .ci/typecheck-baseline.txt to ${count} to lock in the win."
fi

exit 0
