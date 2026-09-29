#!/usr/bin/env bash
# Runs the database checks on a throwaway Postgres.
# Uses DATABASE_URL if set (CI service container); otherwise starts a temporary local cluster.
set -euo pipefail
cd "$(dirname "$0")/.."
run() {
  psql "$1" -q -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql
  for f in supabase/migrations/*.sql; do psql "$1" -q -v ON_ERROR_STOP=1 -f "$f"; done
  psql "$1" -q -v ON_ERROR_STOP=1 -f supabase/seed.sql
  psql "$1" -q -v ON_ERROR_STOP=1 -f supabase/tests/production_test.sql
}
if [[ -n "${DATABASE_URL:-}" ]]; then run "$DATABASE_URL"; exit 0; fi
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d)"; PORT="${PGPORT:-54329}"
trap '"$PGBIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$PGBIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR" -l "$DIR/log" start -w >/dev/null
run "postgresql://postgres@localhost:$PORT/postgres?host=$DIR"
