-- Speed and security fixes from the review of 2026-09-29.

-- ============ speed ============
-- Row-level security calls these helper functions for every row it checks. Postgres assumed each call was
-- expensive (its default estimate), so even a query over a handful of rows looked costly enough to compile to
-- machine code first (JIT), which added about a fifth of a second to pages like the customer list.
-- They are quick indexed lookups, so tell the planner that.
alter function public.has_any_role(public.user_role[]) cost 1;
alter function public.current_profile_id() cost 1;
alter function public.order_has_production(int) cost 1;

-- addresses are always fetched per customer
create index if not exists customer_addresses_customer_id_idx on public.customer_addresses (customer_id);

-- ============ staff passwords ============
-- One shared initial password let any worker who knew it sign in as a newly added or reset colleague (even an
-- admin). Now every create/reset makes a random temporary password for that worker only, shown once to the admin.
drop function if exists public.set_initial_password(text);
alter table public.integration_secrets drop column if exists initial_password;
drop function if exists public.reset_staff_password(uuid);

create function public.reset_staff_password(p_user_id uuid)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.users;
  letters constant text := 'abcdefghjkmnpqrstuvwxyz23456789';  -- no look-alikes (l/1, o/0, i)
  pw text;
  aid uuid;
begin
  if not public.has_any_role('{admin}') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into u from public.users where id = p_user_id for update;
  if not found then raise exception 'staff member not found' using errcode = 'P0002'; end if;
  if u.email is null then raise exception 'staff member has no email' using errcode = '22023'; end if;

  select string_agg(substr(letters, get_byte(b, i) % length(letters) + 1, 1), '' order by i)
    into pw
    from (select gen_random_bytes(10) as b) r, generate_series(0, 9) as i;

  aid := u.auth_user_id;
  if aid is null then
    -- adopt only a login whose email is confirmed, never one someone else could have registered
    select a.id into aid from auth.users a
     where lower(a.email) = lower(u.email)
       and a.email_confirmed_at is not null
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
  return pw;
end $$;
revoke execute on function public.reset_staff_password(uuid) from public, anon;
grant execute on function public.reset_staff_password(uuid) to authenticated;

-- ============ linking logins to staff ============
-- A phone number is linked only once the phone is confirmed (before, signing up with a staff member's
-- number was enough to take over their profile).
create or replace function public.link_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  norm text := case when new.phone_confirmed_at is not null then regexp_replace(coalesce(new.phone, ''), '\D', '', 'g') else '' end;
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
create trigger on_auth_user_created after insert or update of email_confirmed_at, phone_confirmed_at on auth.users
  for each row execute function public.link_auth_user();

-- ============ orders ============
-- Orders are created only through create_order, which checks everything (before, a marketer could insert an
-- order or items directly with any status or produced quantity). It now runs with its own rights, so it
-- checks the customer itself instead of relying on row-level security.
create or replace function public.create_order(
  p_customer_id uuid,
  p_address_id uuid,
  p_delivery_date timestamptz,
  p_is_urgent boolean,
  p_notes text,
  p_items jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  new_id int;
  lines int;
begin
  if me is null or not public.has_any_role('{admin,marketer}') then
    raise exception 'not allowed to create orders' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one item' using errcode = '22023';
  end if;
  -- a marketer orders only for their own customers or unassigned ones (the same rule as the customer list)
  if not exists (select 1 from public.customers
                  where id = p_customer_id
                    and (public.has_any_role('{admin}') or assigned_marketer_id = me or assigned_marketer_id is null)) then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;
  if p_address_id is not null and not exists (
    select 1 from public.customer_addresses where id = p_address_id and customer_id = p_customer_id) then
    raise exception 'address does not belong to the customer' using errcode = '22023';
  end if;

  create temp table if not exists _new_items (position smallint, product_id uuid, quantity int, unit_price numeric, notes text) on commit drop;
  truncate _new_items;
  insert into _new_items
  select i.n, p.id, (i.j->>'quantity')::int,
         coalesce((i.j->>'unit_price')::numeric, public.customer_price(p_customer_id, p.id)),
         nullif(trim(i.j->>'notes'), '')
    from jsonb_array_elements(p_items) with ordinality as i(j, n)
    join public.products p on p.id = (i.j->>'product_id')::uuid and p.is_active;
  get diagnostics lines = row_count;
  if lines <> jsonb_array_length(p_items) then
    raise exception 'unknown or inactive product' using errcode = '22023';
  end if;
  if exists (select 1 from _new_items where quantity is null or quantity <= 0 or unit_price < 0) then
    raise exception 'quantities must be positive' using errcode = '22023';
  end if;

  insert into public.orders (customer_id, address_id, marketer_id, delivery_date, is_urgent, notes, total_amount)
  values (p_customer_id, p_address_id, me, p_delivery_date, coalesce(p_is_urgent, false), nullif(trim(p_notes), ''),
          (select sum(quantity * unit_price) from _new_items))
  returning id into new_id;

  insert into public.order_items (order_id, position, product_id, quantity, unit_price, notes)
  select new_id, position, product_id, quantity, unit_price, notes from _new_items;

  insert into public.audit_logs (order_id, action_type, performed_by, details)
  values (new_id, 'created', me, jsonb_build_object('items', lines));
  return new_id;
end $$;
revoke execute on function public.create_order(uuid, uuid, timestamptz, boolean, text, jsonb) from public, anon;
grant execute on function public.create_order(uuid, uuid, timestamptz, boolean, text, jsonb) to authenticated;

drop policy orders_insert on public.orders;
-- orders are edited only by the admin and the production manager; the warehouse moves them through delivery_step
drop policy orders_update on public.orders;
create policy orders_update on public.orders for update to authenticated
  using (public.has_any_role('{admin,production_manager}'))
  with check (public.has_any_role('{admin,production_manager}'));
drop policy items_write on public.order_items;
create policy items_write on public.order_items for all to authenticated
  using (public.has_any_role('{admin,production_manager}'))
  with check (public.has_any_role('{admin,production_manager}'));

-- an order's address must be one of its customer's addresses
create or replace function public.check_order_address() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.address_id is not null and not exists (
    select 1 from public.customer_addresses where id = new.address_id and customer_id = new.customer_id) then
    raise exception 'address does not belong to the customer' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.check_order_address() from public, anon, authenticated;
create trigger check_order_address before insert or update of address_id, customer_id on public.orders
  for each row execute function public.check_order_address();

-- ============ customers ============
-- Only the admin decides a customer's marketer and price list (the screen hid these; now the database agrees).
-- runs with the caller's rights, so current_user tells a direct request from staff apart from the admin's tools
create or replace function public.guard_customer_admin_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.has_any_role('{admin}') then
    if tg_op = 'INSERT' and new.price_list_id is not null then
      raise exception 'only the admin sets a price list' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.price_list_id is distinct from old.price_list_id
                             or new.assigned_marketer_id is distinct from old.assigned_marketer_id) then
      raise exception 'only the admin changes the marketer or price list' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_customer_admin_fields() from public, anon, authenticated;
create trigger guard_customer_admin_fields before insert or update on public.customers
  for each row execute function public.guard_customer_admin_fields();

-- ============ logs and settings ============
-- audit entries only on orders the writer can see; WhatsApp log rows only as sent or failed
drop policy audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (performed_by = public.current_profile_id() and exists (select 1 from public.orders o where o.id = order_id));
drop policy wa_insert on public.whatsapp_messages;
create policy wa_insert on public.whatsapp_messages for insert to authenticated with check (
  sent_by = public.current_profile_id()
  and status in ('sent', 'failed')
  and (order_id is null or exists (select 1 from public.orders o where o.id = order_id)));
-- business details only for staff, not for any signed-in account
drop policy settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (public.current_profile_id() is not null);

-- ============ function access ============
-- Postgres lets everyone (including signed-out visitors) run new functions by default. Take that away from
-- signed-out visitors; staff keep exactly what they had. Only the WhatsApp status webhook runs signed out.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname <> 'whatsapp_status'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if has_function_privilege('authenticated', f.sig, 'execute') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated;
