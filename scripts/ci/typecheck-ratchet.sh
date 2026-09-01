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
LOG=/tmp/typecheck-ratchet.log

baseline="$(tr -dc '0-9' < "$BASELINE_FILE" 2>/dev/null)"
if [ -z "${baseline}" ]; then
  echo "::error title=Typecheck ratchet::missing/invalid ${BASELINE_FILE}"
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

if [ "$count" -gt "$baseline" ]; then
  echo "::error title=Typecheck regression::${count} type errors exceeds the baseline of ${baseline}. Your change introduced new type errors — fix them. Do NOT raise .ci/typecheck-baseline.txt."
  # Surface a sample of the errors to aid debugging.
  grep -E 'error TS' "$LOG" | tail -40
  exit 1
fi

if [ "$count" -lt "$baseline" ]; then
  echo "::notice title=Ratchet down::type-error count dropped to ${count} (baseline ${baseline}). Lower .ci/typecheck-baseline.txt to ${count} to lock in the win."
fi

exit 0
