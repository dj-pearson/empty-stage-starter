#!/usr/bin/env bash
#
# US-547: fail on duplicate migration version prefixes.
#
# Two migrations sharing a version prefix are not merely ambiguous — they are
# unappliable. supabase_migrations.schema_migrations has its primary key on
# `version` alone, so replaying the tree into a clean database dies on the
# second file of any colliding pair:
#
#   ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
#   Key (version)=(20251107000000) already exists.
#
# That is exactly what kept the Migration Test and Types Drift jobs red. The 7
# formerly-grandfathered collisions (9 files) have been renumbered to unique
# prefixes, and each renumbered file was made re-runnable first — indexes gained
# IF NOT EXISTS, policies and triggers gained a preceding DROP ... IF EXISTS, and
# the hidden_veggie_techniques seed is gated on the table being empty — so a
# replay against a database that already recorded the old version is a no-op
# rather than an error or a duplicate-row mess.
#
# There is no allowlist any more. A duplicate prefix is a hard failure.
set -uo pipefail

MIG_DIR="supabase/migrations"

dupes="$(ls "$MIG_DIR"/*.sql 2>/dev/null | xargs -n1 basename | sed -E 's/^([0-9]+)_.*/\1/' | sort | uniq -d)"

if [ -n "${dupes// /}" ]; then
  echo "::error title=Duplicate migration prefix::duplicate migration version prefix(es): ${dupes}. Renumber the newer migration to a unique, monotonically-increasing timestamp — a collision cannot be applied to a clean database."
  for p in ${dupes}; do ls "$MIG_DIR"/"${p}"_*.sql; done
  exit 1
fi

echo "No duplicate migration version prefixes."
exit 0
