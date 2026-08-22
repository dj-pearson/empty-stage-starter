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
# Applying these rules retrospectively to all 207 existing migrations: zero use
# DROP COLUMN, RENAME, SET NOT NULL or a type change, and the single DROP TABLE
# is the scaffold cleanup named below. So the repo has in fact followed the rule
# it never enforced, and this gate is about keeping it that way rather than
# burning down a backlog.
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


# Same as check(), plus an exclusion. Needed because Postgres makes COLUMN
# optional: `ALTER TABLE t DROP c` drops a column just as `DROP COLUMN c` does,
# and `ALTER TABLE t ALTER c TYPE x` changes a type just as `ALTER COLUMN` does.
# Both walked past this gate, which names those exact operations as forbidden.
# A pattern broad enough to catch the short form also catches the entirely
# legitimate DROP CONSTRAINT, DROP DEFAULT and DROP NOT NULL, so: match wide,
# then subtract the safe spellings.
#
# Known limit: a single statement containing BOTH a safe drop and a column drop
# is excluded. Splitting statements properly is a parser's job.
check_excluding() {
  local file="$1" token="$2" pattern="$3" safe="$4" why="$5"
  grep -qiE "^[[:space:]]*--[[:space:]]*migration-safety:[[:space:]]*allow[[:space:]]+${token}\b" "$file" && return 0
  local hits
  hits="$(grep -inE "$pattern" "$file" | grep -vE '^[0-9]+:[[:space:]]*--' | grep -viE "$safe" || true)"
  [ -z "$hits" ] && return 0
  echo "::error title=Backward-incompatible migration::${file} uses ${token}."
  printf '%s\n' "$hits" | sed 's/^/      /'
  echo "      ${why}"
  echo "      If this is deliberate, add: -- migration-safety: allow ${token} (<reason>)"
  fail=1
}

# DROP POLICY on its own is not a signal. The idiomatic way to make a policy
# migration re-runnable is DROP POLICY IF EXISTS followed by CREATE POLICY with
# the same name, and across this repo's 207 migrations that accounts for 147 of
# 206 drops. Flagging all of them would train everyone to add the escape hatch
# by reflex, which is how a gate stops meaning anything.
#
# What matters is a policy dropped and NOT put back under the same name on the
# same table: either access was deliberately removed, or it was replaced by a
# differently-named, narrower policy -- which is exactly the US-627 shape, and
# exactly what wants a second pair of eyes before it reaches a shipped client.
policy_pairs() {
  # "<name> on <table>", lowercased, unquoted, one per line. Comments stripped
  # and newlines flattened first, since CREATE POLICY "x" usually puts ON on the
  # following line.
  local file="$1" verb="$2"
  sed 's/--.*//' "$file" | tr '\n' ' ' |
    grep -oiE "${verb}[[:space:]]+policy[[:space:]]+(if[[:space:]]+exists[[:space:]]+)?(\"[^\"]+\"|[A-Za-z0-9_]+)[[:space:]]+on[[:space:]]+[A-Za-z0-9_.\"]+" |
    sed -E "s/^${verb}[[:space:]]+policy[[:space:]]+//I; s/^if[[:space:]]+exists[[:space:]]+//I" |
    tr -d '"' | tr '[:upper:]' '[:lower:]' | tr -s ' ' | sed 's/[[:space:]]*$//' |
    sort -u
}

check_policy_removal() {
  local file="$1"
  grep -qiE '^[[:space:]]*--[[:space:]]*migration-safety:[[:space:]]*allow[[:space:]]+drop-policy\b' "$file" && return 0

  local removed
  removed="$(comm -23 <(policy_pairs "$file" drop) <(policy_pairs "$file" create))"
  [ -z "$removed" ] && return 0

  echo "::error title=Backward-incompatible migration::${file} removes a policy without replacing it."
  printf '%s\n' "$removed" | sed 's/^/      /'
  echo "      A shipped client reading through that policy loses access the moment this lands."
  echo "      Re-creating it under a DIFFERENT name counts as removal here, because a narrower"
  echo "      replacement is still a narrowing. Confirm no live build depends on it."
  echo "      If this is deliberate, add: -- migration-safety: allow drop-policy (<reason>)"
  fail=1
}

echo "Checking $(printf '%s\n' "${added_files}" | grep -c .) new migration(s) for backward-incompatible DDL ..."

for file in ${added_files}; do
  [ -f "$file" ] || continue
  check_excluding "$file" "drop-column" \
        'alter[[:space:]]+table[^;]*drop[[:space:]]+(column[[:space:]]+)?(if[[:space:]]+exists[[:space:]]+)?["a-z_]' \
        'drop[[:space:]]+(constraint|default|not[[:space:]]+null|identity|expression|generated)' \
        "An old client still SELECTing that column breaks. Deprecate over two releases."
  check "$file" "drop-table"   'drop[[:space:]]+table' \
        "An old client still reading that table breaks. Deprecate over two releases."
  check "$file" "rename"       'rename[[:space:]]+(column[[:space:]]+[a-z_.\"]+[[:space:]]+)?to|rename[[:space:]]+column' \
        "Old clients query the old name. Add the new shape, dual-write, then retire."
  check "$file" "set-not-null" 'set[[:space:]]+not[[:space:]]+null' \
        "An old client INSERT that omits the column starts failing. Add a default first."
  check_policy_removal "$file"
  check "$file" "type-change" \
        'alter[[:space:]]+column[^;]*type|alter[[:space:]]+table[^;]*[[:space:]]alter[[:space:]]+(column[[:space:]]+)?["a-z_]+[[:space:]]+type[[:space:]]' \
        "Changing a type in place breaks old readers and writers. Add a new column and migrate."
done

# A new table without RLS is readable and writable by anyone holding the anon
# key, which is shipped in the client. CLAUDE.md says "Always enable RLS on new
# tables"; all 304 existing tables comply, so this is about keeping it that way.
#
# Collected ACROSS the branch's new migrations rather than per file, because
# creating a table in one migration and enabling RLS in the next is legitimate.
created_tables="$(
  cat ${added_files} 2>/dev/null \
    | sed 's/--.*//' \
    | grep -ioE 'create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?[a-z_."]+' \
    | awk '{print tolower($NF)}' | tr -d '"' | sed 's/^public\.//' | sort -u
)"
rls_enabled="$(
  cat ${added_files} 2>/dev/null \
    | sed 's/--.*//' \
    | grep -ioE 'alter[[:space:]]+table[[:space:]]+[a-z_."]+[[:space:]]+enable[[:space:]]+row[[:space:]]+level[[:space:]]+security' \
    | awk '{print tolower($3)}' | tr -d '"' | sed 's/^public\.//' | sort -u
)"

for table in ${created_tables}; do
  printf '%s\n' "${rls_enabled}" | grep -qx "${table}" && continue
  grep -qiE "^[[:space:]]*--[[:space:]]*migration-safety:[[:space:]]*allow[[:space:]]+no-rls\b" ${added_files} && continue
  echo "::error title=New table without RLS::public.${table} is created but never gets ENABLE ROW LEVEL SECURITY."
  echo "      Without it the table is readable and writable by anyone holding the anon key."
  echo "      Add: ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; plus per-command policies."
  fail=1
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "See the Migration Rules section of CLAUDE.md for the deprecation flow."
  exit 1
fi

echo "New migrations are backward-compatible and enable RLS on any new table."
