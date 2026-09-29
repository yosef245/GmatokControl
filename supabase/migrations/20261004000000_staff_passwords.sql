-- Staff logins managed from the app: the admin sets one initial password, and adding a worker (or pressing
-- "reset password") gives them a login with that password. They must pick their own password on first entry.
-- Unticking "active" blocks the login. No Supabase dashboard and no service-role key needed.

create extension if not exists pgcrypto with schema extensions;

alter table public.users add column must_change_password boolean not null default false;
alter table public.integration_secrets add column initial_password text;

-- The admin saves the initial password (readable only by the admin, like the webhook token).
create or replace function public.set_initial_password(p_password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_any_role('{admin}') then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'password too short' using errcode = '22023'; end if;
  update public.integration_secrets set initial_password = p_password;
end $$;
revoke execute on function public.set_initial_password(text) from public, anon;
grant execute on function public.set_initial_password(text) to authenticated;

-- Creates the worker's login, or resets its password, to the initial password. The worker must change it on entry.
create or replace function public.reset_staff_password(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.users;
  pw text := (select initial_password from public.integration_secrets);
  aid uuid;
begin
  if not public.has_any_role('{admin}') then raise exception 'not allowed' using errcode = '42501'; end if;
  if pw is null then raise exception 'set the initial password first' using errcode = 'P0001'; end if;
  select * into u from public.users where id = p_user_id for update;
  if not found then raise exception 'staff member not found' using errcode = 'P0002'; end if;
  if u.email is null then raise exception 'staff member has no email' using errcode = '22023'; end if;

  aid := u.auth_user_id;
  if aid is null then
    select a.id into aid from auth.users a
     where lower(a.email) = lower(u.email)
       and not exists (select 1 from public.users x where x.auth_user_id = a.id)
     limit 1;
  end if;

  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', aid, 'authenticated', 'authenticated', lower(u.email),
            crypt(pw, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
            '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), aid, aid::text, 'email',
            jsonb_build_object('sub', aid::text, 'email', lower(u.email), 'email_verified', true), now(), now(), now());
  else
    update auth.users
       set encrypted_password = crypt(pw, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           banned_until = case when u.is_active then null else banned_until end,
           updated_at = now()
     where id = aid;
  end if;

  update public.users set auth_user_id = aid, must_change_password = true where id = p_user_id;
end $$;
revoke execute on function public.reset_staff_password(uuid) from public, anon;
grant execute on function public.reset_staff_password(uuid) to authenticated;

-- Called right after the signed-in worker has changed their own password.
create or replace function public.password_changed()
returns void
language sql security definer set search_path = public as $$
  update public.users set must_change_password = false where id = public.current_profile_id();
$$;
revoke execute on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

-- Blocking: an inactive worker's login is banned, so they cannot sign in at all; reactivating lifts the ban.
create or replace function public.sync_staff_ban() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.auth_user_id is not null and (tg_op = 'INSERT' or new.is_active is distinct from old.is_active
                                       or new.auth_user_id is distinct from old.auth_user_id) then
    update auth.users set banned_until = case when new.is_active then null else timestamptz '2999-01-01' end
     where id = new.auth_user_id
       and banned_until is distinct from case when new.is_active then null else timestamptz '2999-01-01' end;
  end if;
  return new;
end $$;
create trigger sync_staff_ban after insert or update of is_active, auth_user_id on public.users
  for each row execute function public.sync_staff_ban();
