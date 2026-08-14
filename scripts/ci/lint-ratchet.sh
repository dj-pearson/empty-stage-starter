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

BASELINE_FILE=".ci/lint-baseline.txt"
LOG=/tmp/lint-ratchet.log

baseline="$(tr -dc '0-9' < "$BASELINE_FILE" 2>/dev/null)"
if [ -z "${baseline}" ]; then
  echo "::error title=Lint ratchet::missing/invalid ${BASELINE_FILE}"
  exit 1
fi

npm run lint > "$LOG" 2>&1
# eslint stylish format: "  <line>:<col>  error  <message>  <rule>"
count="$(grep -cE '^[[:space:]]+[0-9]+:[0-9]+[[:space:]]+error[[:space:]]' "$LOG" || true)"

echo "Lint errors: ${count} (baseline: ${baseline})"

if [ "$count" -gt "$baseline" ]; then
  echo "::error title=Lint regression::${count} eslint errors exceeds the baseline of ${baseline}. Your change introduced new lint errors — fix them. Do NOT raise .ci/lint-baseline.txt."
  grep -E '^[[:space:]]+[0-9]+:[0-9]+[[:space:]]+error[[:space:]]' "$LOG" | tail -40
  exit 1
fi

if [ "$count" -lt "$baseline" ]; then
  echo "::notice title=Ratchet down::lint-error count dropped to ${count} (baseline ${baseline}). Lower .ci/lint-baseline.txt to ${count} to lock in the win."
fi

exit 0
