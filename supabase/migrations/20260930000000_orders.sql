-- Sprint 1: creating an order and its lines in one step, with the total and an audit entry.
alter table public.order_items add column position smallint not null default 0;

-- Runs as the caller (security invoker), so the row-level policies decide who may do it.
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
  select i.n, p.id, (i.j->>'quantity')::int, coalesce((i.j->>'unit_price')::numeric, p.price), nullif(trim(i.j->>'notes'), '')
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

grant execute on function public.create_order(uuid, uuid, timestamptz, boolean, text, jsonb) to authenticated;
