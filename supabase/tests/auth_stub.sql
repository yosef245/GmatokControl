-- Minimal stand-in for the parts of Supabase that the migration relies on,
-- so the schema and RPCs can be tested on plain Postgres (CI and local).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), phone text, email text, email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
  instance_id uuid, aud text, role text, encrypted_password text, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
  email_change_token_new text, email_change text, banned_until timestamptz);
create table if not exists auth.identities (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null, provider text not null, identity_data jsonb not null, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz);
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;  -- where Supabase keeps it
create or replace function auth.uid() returns uuid language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
