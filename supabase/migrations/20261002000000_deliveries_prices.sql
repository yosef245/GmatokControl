-- Sprint 3: deliveries (courier, departure, hand-over), customer price lists and importing data from Excel.

-- ============ price lists ============
-- A named set of prices (before VAT). A customer on a list gets its price for the products it covers,
-- and the product's list price for the rest.
create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index price_lists_name_key on public.price_lists (lower(trim(name)));

create table public.price_list_items (
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  primary key (price_list_id, product_id)
);

alter table public.customers add column price_list_id uuid references public.price_lists(id) on delete set null;

alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;
create policy price_lists_read on public.price_lists for select to authenticated using (public.has_any_role('{admin,marketer}'));
create policy price_lists_admin on public.price_lists for all to authenticated
  using (public.has_any_role('{admin}')) with check (public.has_any_role('{admin}'));
create policy price_items_read on public.price_list_items for select to authenticated using (public.has_any_role('{admin,marketer}'));
create policy price_items_admin on public.price_list_items for all to authenticated
  using (public.has_any_role('{admin}')) with check (public.has_any_role('{admin}'));

-- A customer's price for a product: their active price list first, then the product's list price.
create or replace function public.customer_price(p_customer_id uuid, p_product_id uuid) returns numeric
language sql stable set search_path = public as $$
  select coalesce(
    (select i.price from public.customers c
       join public.price_lists l on l.id = c.price_list_id and l.is_active
       join public.price_list_items i on i.price_list_id = l.id and i.product_id = p_product_id
      where c.id = p_customer_id),
    (select price from public.products where id = p_product_id))
$$;
grant execute on function public.customer_price(uuid, uuid) to authenticated;

-- Same as Sprint 1, except a line without an explicit price now takes the customer's price-list price.
create or replace function public.create_order(
  p_customer_id uuid,
  p_address_id uuid,
  p_delivery_date timestamptz,
  p_is_urgent boolean,
  p_notes text,
  p_items jsonb
) returns int
language plpgsql set search_path = public as $$
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
  if not exists (select 1 from public.customers where id = p_customer_id) then
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

-- ============ deliveries ============
-- One delivery step by the warehouse or the admin:
--   assign  → sets (or replaces) the courier of a ready order: a staff member or a free-text name
--   depart  → ready order with a courier leaves: in_transit
--   deliver → hands the order over (from in_transit, or straight from ready for self pick-up): delivered
--   return  → a courier came back without delivering: back to ready_for_delivery
-- Returns the order's status after the step.
create or replace function public.delivery_step(
  p_order_id int,
  p_step text,
  p_courier_user_id uuid default null,
  p_courier_name text default null,
  p_receiver_name text default null,
  p_notes text default null
) returns public.order_status
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  cur public.order_status;
  nxt public.order_status;
  courier text;
  d public.deliveries;
begin
  if me is null or not public.has_any_role('{admin,warehouse}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select status into cur from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  select * into d from public.deliveries where order_id = p_order_id;

  if p_step = 'assign' then
    if cur <> 'ready_for_delivery' then
      raise exception 'order is not ready for delivery' using errcode = '22023';
    end if;
    courier := coalesce(nullif(trim(p_courier_name), ''),
                        (select full_name from public.users where id = p_courier_user_id and is_active));
    if courier is null then raise exception 'courier is required' using errcode = '22023'; end if;
    insert into public.deliveries (order_id, courier_user_id, courier_name, assigned_at)
    values (p_order_id, case when nullif(trim(p_courier_name), '') is null then p_courier_user_id end, courier, now())
    on conflict (order_id) do update
      set courier_user_id = excluded.courier_user_id, courier_name = excluded.courier_name, assigned_at = excluded.assigned_at;
    insert into public.audit_logs (order_id, action_type, performed_by, details)
    values (p_order_id, 'courier_assigned', me, jsonb_build_object('courier', courier));
    return cur;
  end if;

  if p_step = 'depart' then
    if cur <> 'ready_for_delivery' then
      raise exception 'order is not ready for delivery' using errcode = '22023';
    end if;
    if d.courier_name is null then raise exception 'assign a courier first' using errcode = '22023'; end if;
    update public.deliveries set departed_at = now() where order_id = p_order_id;
    nxt := 'in_transit';
  elsif p_step = 'deliver' then
    if cur not in ('ready_for_delivery', 'in_transit') then
      raise exception 'order cannot be delivered now' using errcode = '22023';
    end if;
    insert into public.deliveries (order_id, delivered_at, receiver_name, notes)
    values (p_order_id, now(), nullif(trim(p_receiver_name), ''), nullif(trim(p_notes), ''))
    on conflict (order_id) do update
      set delivered_at = now(), receiver_name = excluded.receiver_name,
          notes = coalesce(excluded.notes, public.deliveries.notes);
    nxt := 'delivered';
  elsif p_step = 'return' then
    if cur <> 'in_transit' then raise exception 'order is not on the way' using errcode = '22023'; end if;
    update public.deliveries set departed_at = null, notes = coalesce(nullif(trim(p_notes), ''), notes)
     where order_id = p_order_id;
    nxt := 'ready_for_delivery';
  else
    raise exception 'unknown step' using errcode = '22023';
  end if;

  update public.orders set status = nxt where id = p_order_id;
  insert into public.audit_logs (order_id, action_type, performed_by, details)
  values (p_order_id, 'status_change', me, jsonb_strip_nulls(jsonb_build_object(
    'from', cur, 'to', nxt,
    'receiver', nullif(trim(p_receiver_name), ''),
    'reason', case when p_step = 'return' then nullif(trim(p_notes), '') end)));
  return nxt;
end $$;
revoke execute on function public.delivery_step(int, text, uuid, text, text, text) from public, anon;
grant execute on function public.delivery_step(int, text, uuid, text, text, text) to authenticated;

-- ============ import ============
-- Adds or updates rows from a spreadsheet in one transaction (all or nothing). Admin only.
-- Rows are matched to existing data so a file can be imported again safely:
--   customers → by phone digits; products, materials, price lists → by name.
-- p_kind: customers | products | materials | prices. Returns {"added": n, "updated": n}.
create or replace function public.import_rows(p_kind text, p_rows jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  r jsonb;
  found_id uuid;
  list_id uuid;
  cur numeric;
  target numeric;
  is_new boolean;
  added int := 0;
  updated int := 0;
begin
  if me is null or not public.has_any_role('{admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be an array' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    if p_kind = 'products' then
      select id into found_id from public.products where lower(trim(name)) = lower(trim(r->>'name')) limit 1;
      if found_id is null then
        insert into public.products (name, category, price, estimated_production_minutes)
        values (trim(r->>'name'), nullif(trim(r->>'category'), ''), (r->>'price')::numeric,
                coalesce((r->>'minutes')::int, 0));
        added := added + 1;
      else
        update public.products
           set category = coalesce(nullif(trim(r->>'category'), ''), category),
               price = coalesce((r->>'price')::numeric, price),
               estimated_production_minutes = coalesce((r->>'minutes')::int, estimated_production_minutes)
         where id = found_id;
        updated := updated + 1;
      end if;

    elsif p_kind = 'materials' then
      select id, stock_quantity into found_id, cur from public.raw_materials
       where lower(trim(name)) = lower(trim(r->>'name')) limit 1;
      if found_id is null then
        insert into public.raw_materials (name, unit_of_measure, minimum_threshold, supplier_name, supplier_phone)
        values (trim(r->>'name'), trim(r->>'unit'), coalesce((r->>'minimum')::numeric, 0),
                nullif(trim(r->>'supplier_name'), ''), nullif(trim(r->>'supplier_phone'), ''))
        returning id into found_id;
        cur := 0;
        is_new := true;
        added := added + 1;
      else
        update public.raw_materials
           set unit_of_measure = coalesce(nullif(trim(r->>'unit'), ''), unit_of_measure),
               minimum_threshold = coalesce((r->>'minimum')::numeric, minimum_threshold),
               supplier_name = coalesce(nullif(trim(r->>'supplier_name'), ''), supplier_name),
               supplier_phone = coalesce(nullif(trim(r->>'supplier_phone'), ''), supplier_phone)
         where id = found_id;
        is_new := false;
        updated := updated + 1;
      end if;
      target := (r->>'stock')::numeric;
      if target is not null and target <> cur then
        insert into public.stock_movements (raw_material_id, quantity, movement_type, reason, performed_by)
        values (found_id, target - cur, case when is_new then 'opening' else 'count' end::public.stock_movement_type,
                'ייבוא מקובץ', me);
      end if;

    elsif p_kind = 'customers' then
      select id into found_id from public.customers
       where regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^972', '0')
           = regexp_replace(regexp_replace(r->>'phone', '\D', '', 'g'), '^972', '0')
       limit 1;
      list_id := null;
      if nullif(trim(r->>'price_list'), '') is not null then
        select id into list_id from public.price_lists where lower(trim(name)) = lower(trim(r->>'price_list'));
        if list_id is null then
          raise exception 'price list "%" not found', r->>'price_list' using errcode = 'P0002';
        end if;
      end if;
      if found_id is null then
        insert into public.customers (name, contact_name, phone, type, notes, assigned_marketer_id, price_list_id)
        values (trim(r->>'name'), nullif(trim(r->>'contact_name'), ''), trim(r->>'phone'),
                coalesce(nullif(r->>'type', ''), 'private')::public.customer_type, nullif(trim(r->>'notes'), ''),
                (select id from public.users where lower(email) = lower(trim(r->>'marketer_email'))), list_id)
        returning id into found_id;
        added := added + 1;
      else
        update public.customers
           set name = trim(r->>'name'),
               contact_name = coalesce(nullif(trim(r->>'contact_name'), ''), contact_name),
               type = coalesce(nullif(r->>'type', '')::public.customer_type, type),
               notes = coalesce(nullif(trim(r->>'notes'), ''), notes),
               assigned_marketer_id = coalesce((select id from public.users where lower(email) = lower(trim(r->>'marketer_email'))), assigned_marketer_id),
               price_list_id = coalesce(list_id, price_list_id)
         where id = found_id;
        updated := updated + 1;
      end if;
      if nullif(trim(r->>'address'), '') is not null and nullif(trim(r->>'city'), '') is not null
         and not exists (select 1 from public.customer_addresses
                          where customer_id = found_id
                            and lower(trim(address)) = lower(trim(r->>'address'))
                            and lower(trim(city)) = lower(trim(r->>'city'))) then
        insert into public.customer_addresses (customer_id, address, city, delivery_notes, is_default)
        values (found_id, trim(r->>'address'), trim(r->>'city'), nullif(trim(r->>'delivery_notes'), ''),
                not exists (select 1 from public.customer_addresses where customer_id = found_id and is_default));
      end if;

    elsif p_kind = 'prices' then
      select id into list_id from public.price_lists where lower(trim(name)) = lower(trim(r->>'price_list'));
      if list_id is null then
        insert into public.price_lists (name) values (trim(r->>'price_list')) returning id into list_id;
      end if;
      select id into found_id from public.products where lower(trim(name)) = lower(trim(r->>'product')) limit 1;
      if found_id is null then
        raise exception 'product "%" not found', r->>'product' using errcode = 'P0002';
      end if;
      if exists (select 1 from public.price_list_items where price_list_id = list_id and product_id = found_id) then
        update public.price_list_items set price = (r->>'price')::numeric
         where price_list_id = list_id and product_id = found_id;
        updated := updated + 1;
      else
        insert into public.price_list_items (price_list_id, product_id, price)
        values (list_id, found_id, (r->>'price')::numeric);
        added := added + 1;
      end if;
    else
      raise exception 'unknown import kind' using errcode = '22023';
    end if;
  end loop;

  return jsonb_build_object('added', added, 'updated', updated);
end $$;
grant execute on function public.import_rows(text, jsonb) to authenticated;
