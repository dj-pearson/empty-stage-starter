#!/usr/bin/env bash
#
# US-547: fail on NEW duplicate migration version prefixes.
#
# Two migrations sharing a version prefix make `supabase db push` ordering
# ambiguous. This gate fails when a NEW duplicate prefix appears.
#
# The 7 pre-existing duplicate prefixes are GRANDFATHERED: those migrations are
# already applied to production, and renaming an applied migration gives it a
# new version that Supabase would RE-RUN (duplicate seed-data INSERTs,
# non-idempotent DDL errors). Resolving them safely requires coordinated
# migration-table surgery in a maintenance window, not a blind file rename — so
# they are accepted here while every NEW duplicate is blocked.
set -uo pipefail

MIG_DIR="supabase/migrations"

# Pre-existing duplicate prefixes (see US-547). Do NOT add to this list to
# silence a new dupe — renumber the new migration instead.
GRANDFATHERED="20251107000000 20251110000001 20260205000000 20260510000000 20260511000000 20260512000000 20260513000000"

dupes="$(ls "$MIG_DIR"/*.sql 2>/dev/null | xargs -n1 basename | sed -E 's/^([0-9]+)_.*/\1/' | sort | uniq -d)"

new_dupes=""
for p in $dupes; do
  case " $GRANDFATHERED " in
    *" $p "*) : ;;                      # grandfathered — accepted
    *) new_dupes="${new_dupes} ${p}" ;; # new dup — reject
  esac
done

if [ -n "${new_dupes// /}" ]; then
  echo "::error title=Duplicate migration prefix::new duplicate migration version prefix(es):${new_dupes}. Renumber the newer migration to a unique, monotonically-increasing timestamp."
  for p in ${new_dupes}; do ls "$MIG_DIR"/"${p}"_*.sql; done
  exit 1
fi

echo "No new duplicate migration version prefixes (7 pre-existing dupes grandfathered)."
exit 0
