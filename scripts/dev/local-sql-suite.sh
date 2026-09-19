#!/usr/bin/env bash
#
# Run the Migration Test job's content against a throwaway Postgres.
#
# WHY THIS EXISTS. ci.yml's Migration Test job applies supabase/migrations and
# then runs every supabase/tests/*.test.sql. That job needs `supabase start`,
# which needs Docker, which a sandboxed container usually does not have -- so
# the SQL half of this repo is the half a local session cannot check, and the
# shim that makes it checkable has now been written from scratch twice and
# thrown away twice. This is that shim, kept.
#
# It is NOT a replacement for the CI job. Postgres here is bare: pgvector is
# not installed, so 20260709000004_agent_knowledge.sql cannot apply, and the
# roles are stand-ins rather than the real GoTrue/PostgREST setup. What it does
# cover is the question that actually bites -- does the migration history apply
# in order, and do the SQL suites pass against what it builds.
#
# Usage:
#   bash scripts/dev/local-sql-suite.sh              # migrations + every suite
#   bash scripts/dev/local-sql-suite.sh --keep       # leave the server running
#   PGPORT=5544 bash scripts/dev/local-sql-suite.sh  # a different port
set -uo pipefail

PORT="${PGPORT:-5433}"
RUNDIR="${PGRUNDIR:-/var/tmp/eatpal-pg}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "No local Postgres found (looked for /usr/lib/postgresql/*/bin)." >&2
  echo "Install postgresql, or run the real job with: supabase start" >&2
  exit 2
fi

cleanup() {
  [ "$KEEP" -eq 1 ] && { echo "Server left running on port ${PORT} (socket ${RUNDIR})."; return; }
  su_run "$PGBIN/pg_ctl -D $RUNDIR/data -m immediate stop" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# initdb refuses to run as root, which is what a container usually is.
su_run() {
  if [ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1; then
    su postgres -c "$1"
  else
    bash -c "$1"
  fi
}

echo "1/4 starting Postgres on ${PORT} ..."
rm -rf "$RUNDIR"
mkdir -p "$RUNDIR"
if [ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1; then chown -R postgres:postgres "$RUNDIR"; fi
su_run "$PGBIN/initdb -D $RUNDIR/data -U postgres --auth=trust" > "$RUNDIR/initdb.log" 2>&1 || {
  tail -5 "$RUNDIR/initdb.log" >&2; exit 1;
}
su_run "$PGBIN/pg_ctl -D $RUNDIR/data -l $RUNDIR/pg.log -o '-k $RUNDIR -p $PORT -c wal_level=logical' start" >/dev/null 2>&1
for _ in $(seq 1 20); do
  psql -h "$RUNDIR" -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done
psql -h "$RUNDIR" -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1 || {
  echo "Postgres did not start:" >&2; tail -10 "$RUNDIR/pg.log" >&2; exit 1;
}

PSQL="psql -h $RUNDIR -p $PORT -U postgres -q -v ON_ERROR_STOP=1"

echo "2/4 applying the Supabase stand-ins ..."
$PSQL -f scripts/dev/supabase-shim.sql || exit 1

echo "3/4 applying $(ls supabase/migrations/*.sql | wc -l) migrations ..."
applied=0; skipped=""
for f in $(ls supabase/migrations/*.sql | sort); do
  if $PSQL -f "$f" > "$RUNDIR/last.log" 2>&1; then
    applied=$((applied + 1))
  elif grep -q 'extension "vector" is not available' "$RUNDIR/last.log"; then
    # pgvector is not packaged here; CI's `supabase start` has it.
    skipped="$skipped $(basename "$f")"
  else
    echo "::error::migration failed: $f"
    grep -E 'ERROR|FATAL' "$RUNDIR/last.log" | head -3
    exit 1
  fi
done
echo "    applied ${applied}; skipped for a missing extension:${skipped:- none}"

# Supabase grants these on `public` by default and RLS still applies on top.
# Without them every suite that does SET ROLE authenticated fails on
# "permission denied for table" rather than on anything it meant to assert.
$PSQL -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
          GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;" || exit 1

echo "4/4 running supabase/tests/*.test.sql ..."
failed=""; passed=0
for f in supabase/tests/*.test.sql; do
  if psql -h "$RUNDIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -f "$f" > "$RUNDIR/t.log" 2>&1; then
    passed=$((passed + 1))
    echo "    ok   $(basename "$f")"
  else
    failed="$failed $(basename "$f")"
    echo "    FAIL $(basename "$f")"
    grep -E 'ERROR' "$RUNDIR/t.log" | head -2 | sed 's/^/         /'
  fi
done

echo ""
if [ -n "$failed" ]; then
  echo "::error::SQL suites failed:$failed"
  exit 1
fi
echo "${passed} SQL suites passed against a database built from the migration history."
