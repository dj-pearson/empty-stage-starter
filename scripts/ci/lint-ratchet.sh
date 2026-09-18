#!/usr/bin/env bash
#
# ESLint error-count ratchet — the same shape as typecheck-ratchet.sh (US-545),
# applied to the US-342 lint backlog.
#
# Runs `npm run lint` once, counts the `error` rows, and compares against the
# committed baseline in .ci/lint-baseline.txt. The build FAILS if the count grows
# past the baseline, so the backlog can only shrink: a PR can add zero net-new
# lint errors. When the count drops, the step passes and prints a notice to
# ratchet the baseline down. At 0, set the baseline to 0 and promote
# `npm run lint` to a plain hard gate (delete this script and its callers).
#
# Warnings are deliberately not counted — eslint exits non-zero only on errors,
# and the backlog being burned down (no-explicit-any, no-unused-vars) is all
# error-severity.
set -uo pipefail

# US-773 raised this baseline once, from 1137 to 1172, and the reason is the
# only one that justifies raising it: 17 handlers under supabase/functions/ did
# not PARSE, so eslint reported one parse error each and never saw the rest of
# their contents. Fixing the stray `});` each of them ended with made 56 real
# errors visible (43 no-explicit-any, 12 no-unused-vars, 1 prefer-const) and
# retired 17 parse errors. The tree did not get worse; the gate started looking
# at it.
#
# US-870 cleared all 56 and the baseline came back down past where it started:
# 1172 -> 1118. That is the only direction this number is allowed to move
# without the paragraph above.
#
BASELINE_FILE=".ci/lint-baseline.txt"
# US-802: a stable path, so the workflow can upload it as an artifact.
LOG="${LINT_LOG:-/tmp/lint-ratchet.log}"

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
  echo "::error title=Lint ratchet::missing/invalid ${BASELINE_FILE}"
  exit 1
fi

npm run lint > "$LOG" 2>&1
status=$?
# eslint stylish format: "  <line>:<col>  error  <message>  <rule>"
count="$(grep -cE '^[[:space:]]+[0-9]+:[0-9]+[[:space:]]+error[[:space:]]' "$LOG" || true)"

# The same hole this script inherited from typecheck-ratchet.sh: eslint exits
# non-zero whenever it reports errors, so only "failed AND reported nothing"
# distinguishes a crash from the ordinary backlog. A config error or a missing
# plugin otherwise reads as a lint-clean tree.
if [ "$status" -ne 0 ] && [ "$count" -eq 0 ]; then
  echo "::error title=Lint did not run::\`npm run lint\` exited ${status} without reporting a single error, so the log cannot be trusted (crash, config error, or a broken setup). NOT treating this as zero errors."
  tail -40 "$LOG"
  exit 1
fi

echo "Lint errors: ${count} (baseline: ${baseline})"

if [ "$count" -gt "$baseline" ]; then
  echo "::error title=Lint regression::${count} eslint errors exceeds the baseline of ${baseline}. Your change introduced new lint errors — fix them. Do NOT raise .ci/lint-baseline.txt."
  explain_regression lint "$LOG" "npm run lint"
  echo ""
  echo "The full log is at ${LOG} and is uploaded as the 'lint-log' artifact."
  exit 1
fi

if [ "$count" -lt "$baseline" ]; then
  echo "::notice title=Ratchet down::lint-error count dropped to ${count} (baseline ${baseline}). Lower .ci/lint-baseline.txt to ${count} to lock in the win."
fi

exit 0
