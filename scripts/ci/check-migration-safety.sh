#!/usr/bin/env bash
#
# Backward-compatibility gate for NEW migrations.
#
# The database is shared by every shipped iOS version still on a phone. CLAUDE.md
# spells out what that forbids in a single migration -- DROP COLUMN, DROP TABLE,
# RENAME, adding NOT NULL without a satisfying default, and so on -- because an
# old client that still reads the old shape breaks the moment the migration
# lands, and there is no rolling it back out of the App Store.
#
# Nothing enforced any of that. The rules lived in a document.
#
# DIFF-SCOPED, like no-new-any.sh: only migrations added on this branch are
# checked. The existing tree stays as it is -- notably
# 20260513000000_drop_user_profiles_scaffold.sql, which legitimately drops
# eleven leftover template tables (projects, teams, materials, financial_*) and
# carries its own refuse-if-data-present guard.
#
# ESCAPE HATCH: a migration that genuinely needs one of these -- the last step
# of a completed multi-release deprecation, or an urgent security fix paired
# with a min-build bump -- declares it in the file:
#
#   -- migration-safety: allow drop-column (US-123, release N+1 of the ladder rename)
#
# The reason is required. The point is that removing a column becomes a
# deliberate, reviewable line in the diff rather than something noticed later.
set -uo pipefail

BASE="${1:-origin/main}"
MIGRATIONS="supabase/migrations"

if ! git rev-parse --verify --quiet "${BASE}" >/dev/null; then
  git fetch --quiet --depth=1 origin "${BASE#origin/}" 2>/dev/null || true
fi
if ! git rev-parse --verify --quiet "${BASE}" >/dev/null; then
  echo "::notice title=Migration safety::base ref '${BASE}' unavailable; skipping diff-scoped check."
  exit 0
fi

added_files="$(git diff --name-only --diff-filter=A "${BASE}...HEAD" -- "${MIGRATIONS}/*.sql" 2>/dev/null || true)"

if [ -z "${added_files}" ]; then
  echo "No new migrations on this branch."
  exit 0
fi

fail=0
check() {
  local file="$1" token="$2" pattern="$3" why="$4"
  grep -qiE "^[[:space:]]*--[[:space:]]*migration-safety:[[:space:]]*allow[[:space:]]+${token}\b" "$file" && return 0
  local hits
  hits="$(grep -inE "$pattern" "$file" | grep -vE '^[0-9]+:[[:space:]]*--' || true)"
  [ -z "$hits" ] && return 0
  echo "::error title=Backward-incompatible migration::${file} uses ${token}."
  printf '%s\n' "$hits" | sed 's/^/      /'
  echo "      ${why}"
  echo "      If this is deliberate, add: -- migration-safety: allow ${token} (<reason>)"
  fail=1
}

echo "Checking $(printf '%s\n' "${added_files}" | grep -c .) new migration(s) for backward-incompatible DDL ..."

for file in ${added_files}; do
  [ -f "$file" ] || continue
  check "$file" "drop-column"  'alter[[:space:]]+table[^;]*drop[[:space:]]+column' \
        "An old client still SELECTing that column breaks. Deprecate over two releases."
  check "$file" "drop-table"   'drop[[:space:]]+table' \
        "An old client still reading that table breaks. Deprecate over two releases."
  check "$file" "rename"       'rename[[:space:]]+(column[[:space:]]+[a-z_.\"]+[[:space:]]+)?to|rename[[:space:]]+column' \
        "Old clients query the old name. Add the new shape, dual-write, then retire."
  check "$file" "set-not-null" 'set[[:space:]]+not[[:space:]]+null' \
        "An old client INSERT that omits the column starts failing. Add a default first."
  check "$file" "drop-policy"  'drop[[:space:]]+policy' \
        "Dropping a SELECT policy can cut off a shipped client. Confirm no live build reads through it."
  check "$file" "type-change"  'alter[[:space:]]+column[^;]*type' \
        "Changing a type in place breaks old readers and writers. Add a new column and migrate."
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "See the Migration Rules section of CLAUDE.md for the deprecation flow."
  exit 1
fi

echo "New migrations are backward-compatible."
