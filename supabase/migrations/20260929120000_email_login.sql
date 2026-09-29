-- Email + password login (SMS can come later). Staff are matched to their login by email or phone.
-- Accounts are created by the admin in Supabase (Authentication → Users → Add user, auto-confirm),
-- so a login links only once its email is confirmed.

alter table public.users add column email text;
alter table public.users alter column phone drop not null;
create unique index users_email_key on public.users (lower(email));
alter table public.users add constraint users_email_or_phone check (email is not null or phone is not null);

create or replace function public.link_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  norm text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  mail text := case when new.email_confirmed_at is not null then lower(nullif(new.email, '')) end;
begin
  if exists (select 1 from public.users where auth_user_id = new.id) then return new; end if;
  if mail is not null then
    update public.users set auth_user_id = new.id where auth_user_id is null and lower(email) = mail;
    if found then return new; end if;
  end if;
  if norm <> '' then
    update public.users
       set auth_user_id = new.id
     where auth_user_id is null
       and regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^0', '972') = regexp_replace(norm, '^0', '972');
    if found then return new; end if;
  end if;
  if (mail is not null or norm <> '') and not exists (select 1 from public.users) then
    insert into public.users (auth_user_id, full_name, email, phone, roles)
    values (new.id, 'מנהל המפעל', mail, nullif(new.phone, ''), '{admin}');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email_confirmed_at on auth.users
  for each row execute function public.link_auth_user();

-- staff added after their login already exists get linked straight away
create or replace function public.link_staff_to_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.auth_user_id is null and new.email is not null then
    select a.id into new.auth_user_id
      from auth.users a
     where lower(a.email) = lower(new.email)
       and a.email_confirmed_at is not null
       and not exists (select 1 from public.users u where u.auth_user_id = a.id)
     limit 1;
  end if;
  return new;
end $$;
create trigger link_staff_to_auth before insert or update of email on public.users
  for each row execute function public.link_staff_to_auth();
