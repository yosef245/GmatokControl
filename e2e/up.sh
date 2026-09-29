#!/usr/bin/env bash
# Starts a throwaway local stack for browser tests and screenshots:
#   Postgres (schema + seed + logins u1..u6@test.local / password "pw") on :54330,
#   PostgREST on :54331, and a small Supabase-like gateway on :54321.
# plus a stand-in for Meta's WhatsApp API on :54332. Then run the app with:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev
# and, for e2e/whatsapp.mjs, also: WHATSAPP_TOKEN=e2e-token WHATSAPP_PHONE_NUMBER_ID=e2e WHATSAPP_API_BASE=http://127.0.0.1:54332
#   WHATSAPP_VERIFY_TOKEN=e2e-verify-token WHATSAPP_APP_SECRET=e2e-app-secret
# Postgres refuses to run as root, so run this as a normal user.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$ROOT/.e2e"; mkdir -p "$W"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGRST_VERSION=v12.2.3
if [[ ! -x "$W/postgrest" ]]; then
  curl -fsSL -o "$W/postgrest.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x64.tar.xz"
  tar xJf "$W/postgrest.tar.xz" -C "$W" && rm "$W/postgrest.tar.xz"
fi
pkill -f "[p]ostgrest $W/pgrst.conf" || true
pkill -f "[n]ode $ROOT/e2e/gateway.mjs" || true
pkill -f "[n]ode $ROOT/e2e/fake-whatsapp.mjs" || true
"$PGBIN/pg_ctl" -D "$W/pg" stop -m fast >/dev/null 2>&1 || true
rm -rf "$W/pg"
"$PGBIN/initdb" -D "$W/pg" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$W/pg" -o "-p 54330 -k $W/pg" -l "$W/pg.log" start -w >/dev/null
DB="postgresql://postgres@localhost:54330/postgres?host=$W/pg"
psql "$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do psql "$DB" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql"
psql "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
alter table auth.users add column if not exists encrypted_password text;
update public.users set email = 'u' || right(id::text, 1) || '@test.local';
insert into auth.users (email, email_confirmed_at, encrypted_password) select email, now(), 'pw' from public.users;
update public.integration_secrets set whatsapp_webhook_token = 'e2e-verify-token';
SQL
cat > "$W/pgrst.conf" <<CONF
db-uri = "$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "local-e2e-secret-local-e2e-secret-0123"
server-port = 54331
CONF
nohup "$W/postgrest" "$W/pgrst.conf" > "$W/pgrst.log" 2>&1 &
E2E_DB="$DB" nohup node "$ROOT/e2e/gateway.mjs" > "$W/gateway.log" 2>&1 &
nohup node "$ROOT/e2e/fake-whatsapp.mjs" > "$W/fake-whatsapp.log" 2>&1 &
sleep 2
curl -sf -XPOST 'localhost:54321/auth/v1/token?grant_type=password' -d '{"email":"u1@test.local","password":"pw"}' >/dev/null
echo "local stack ready: logins u1..u6@test.local, password pw"
