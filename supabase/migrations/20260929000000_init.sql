-- גוונים של מתוק: schema for orders, production, raw materials and deliveries.
-- Based on the approved SRD (section 8.2) plus the changes approved on 2026-09-28:
--   * stock may go negative (shown as a red alert instead of blocking production)
--   * production_logs, stock_movements and deliveries tables
--   * partial batches are allocated by earliest delivery time, then urgent, then order close time
--   * a production mark can be undone within 10 minutes
-- Other decisions made while implementing:
--   * users.auth_user_id links a staff profile to its Supabase Auth user. The manager adds staff by phone;
--     the profile is linked on that person's first SMS login. The very first login becomes the admin.
--   * the material-shortage flag is computed (order_shortage_view) rather than stored, so it cannot go stale.
--   * production_log_allocations records which order lines each production mark was split into.

create extension if not exists pgcrypto;

-- ============ enums ============
create type public.user_role as enum ('admin', 'marketer', 'production_manager', 'production_worker', 'warehouse');
create type public.order_status as enum ('draft', 'pending_approval', 'in_production', 'ready_for_delivery', 'in_transit', 'delivered', 'cancelled');
create type public.customer_type as enum ('private', 'business');
create type public.stock_movement_type as enum ('opening', 'receive', 'count', 'waste', 'production', 'production_undo');

-- ============ tables ============
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  phone text not null unique,
  roles public.user_role[] not null default '{marketer}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text not null,
  type public.customer_type not null default 'private',
  assigned_marketer_id uuid references public.users(id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  address text not null,
  city text not null,
  delivery_notes text,
  is_default boolean not null default false
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  category text,
  price numeric(10, 2) not null check (price >= 0),
  estimated_production_minutes int not null default 0 check (estimated_production_minutes >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_of_measure text not null,
  stock_quantity numeric(12, 3) not null default 0, -- may go negative (approved change)
  minimum_threshold numeric(12, 3) not null default 0,
  supplier_name text,
  supplier_phone text,
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials(id) on delete restrict,
  quantity_per_unit numeric(12, 3) not null check (quantity_per_unit > 0),
  unique (product_id, raw_material_id)
);

create table public.orders (
  id serial primary key,
  customer_id uuid not null references public.customers(id),
  address_id uuid references public.customer_addresses(id),
  marketer_id uuid not null references public.users(id),
  delivery_date timestamptz not null,
  is_urgent boolean not null default false,
  status public.order_status not null default 'pending_approval',
  total_amount numeric(10, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.orders_id_seq restart with 1001;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id int not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity int not null check (quantity > 0),
  produced_quantity int not null default 0 check (produced_quantity >= 0 and produced_quantity <= quantity),
  unit_price numeric(10, 2) not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  order_id int references public.orders(id) on delete set null,
  action_type text not null,
  performed_by uuid references public.users(id),
  details jsonb,
  created_at timestamptz not null default now()
);

create table public.production_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  quantity int not null check (quantity > 0),
  batch_day date not null,
  performed_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references public.users(id)
);

create table public.production_log_allocations (
  id uuid primary key default gen_random_uuid(),
  production_log_id uuid not null references public.production_logs(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  quantity int not null check (quantity > 0)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid not null references public.raw_materials(id) on delete cascade,
  quantity numeric(12, 3) not null, -- signed: positive adds to stock, negative removes
  movement_type public.stock_movement_type not null,
  reason text,
  production_log_id uuid references public.production_logs(id) on delete set null,
  performed_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id int not null unique references public.orders(id) on delete cascade,
  courier_user_id uuid references public.users(id),
  courier_name text,
  assigned_at timestamptz,
  departed_at timestamptz,
  delivered_at timestamptz,
  receiver_name text,
  notes text
);

-- single-row business settings (PDF header, VAT, shift capacity)
create table public.settings (
  id boolean primary key default true check (id),
  business_name text not null default 'גוונים של מתוק',
  business_phone text,
  business_address text,
  business_tax_id text,
  vat_percent numeric(5, 2) not null default 18,
  shift_workers int not null default 3,
  shift_hours numeric(4, 1) not null default 8,
  delivery_minutes int not null default 45
);
insert into public.settings default values;

create index on public.orders (status, delivery_date);
create index on public.orders (marketer_id);
create index on public.order_items (order_id);
create index on public.order_items (product_id);
create index on public.stock_movements (raw_material_id, created_at desc);
create index on public.production_log_allocations (production_log_id);
create index on public.audit_logs (order_id, created_at desc);

-- ============ helpers ============
create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.users where auth_user_id = auth.uid() and is_active
$$;

create or replace function public.has_any_role(wanted public.user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select roles && wanted from public.users where auth_user_id = auth.uid() and is_active), false)
$$;

create or replace function public.order_has_production(p_order_id int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.order_items where order_id = p_order_id and produced_quantity > 0)
$$;

-- keep raw_materials.stock_quantity equal to the sum of its movements
create or replace function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.raw_materials
     set stock_quantity = stock_quantity + new.quantity, updated_at = now()
   where id = new.raw_material_id;
  return new;
end $$;
create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- link a staff profile to its auth user on first login; the first login ever becomes admin
create or replace function public.link_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  norm text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  if norm = '' then return new; end if;
  update public.users
     set auth_user_id = new.id
   where auth_user_id is null
     and regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^0', '972') = regexp_replace(norm, '^0', '972');
  if not found and not exists (select 1 from public.users) then
    insert into public.users (auth_user_id, full_name, phone, roles)
    values (new.id, 'מנהל המפעל', new.phone, '{admin}');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.link_auth_user();

-- ============ derived views ============
create or replace view public.inventory_status_view with (security_invoker = true) as
with reserved_stock as (
  select r.raw_material_id,
         sum((oi.quantity - oi.produced_quantity) * r.quantity_per_unit) as total_reserved
    from public.order_items oi
    join public.orders o on oi.order_id = o.id
    join public.recipes r on oi.product_id = r.product_id
   where o.status in ('pending_approval', 'in_production')
     and oi.quantity > oi.produced_quantity
   group by r.raw_material_id
)
select rm.id as raw_material_id,
       rm.name,
       rm.unit_of_measure,
       rm.supplier_name,
       rm.supplier_phone,
       rm.stock_quantity as in_stock,
       coalesce(rs.total_reserved, 0) as reserved_quantity,
       rm.stock_quantity - coalesce(rs.total_reserved, 0) as available_quantity,
       rm.minimum_threshold,
       case
         when rm.stock_quantity - coalesce(rs.total_reserved, 0) < 0
           then coalesce(rs.total_reserved, 0) - rm.stock_quantity + rm.minimum_threshold
         when rm.stock_quantity - coalesce(rs.total_reserved, 0) < rm.minimum_threshold
           then rm.minimum_threshold - (rm.stock_quantity - coalesce(rs.total_reserved, 0))
         else 0
       end as quantity_to_order,
       case
         when rm.stock_quantity - coalesce(rs.total_reserved, 0) < 0 then 'red'
         when rm.stock_quantity - coalesce(rs.total_reserved, 0) < rm.minimum_threshold then 'orange'
         else 'green'
       end as alert_status
  from public.raw_materials rm
  left join reserved_stock rs on rm.id = rs.raw_material_id;

-- orders that still need a material that is short (available < 0)
create or replace view public.order_shortage_view with (security_invoker = true) as
select o.id as order_id,
       array_agg(distinct inv.raw_material_id) as short_material_ids
  from public.orders o
  join public.order_items oi on oi.order_id = o.id and oi.quantity > oi.produced_quantity
  join public.recipes r on r.product_id = oi.product_id
  join public.inventory_status_view inv on inv.raw_material_id = r.raw_material_id and inv.alert_status = 'red'
 where o.status in ('pending_approval', 'in_production')
 group by o.id;

-- ============ production RPCs ============
-- Mark `qty` units of a product as produced for the batch of `p_batch_day`.
-- Splits across open order lines by delivery time, then urgent, then order close time,
-- deducts raw materials by recipe and moves fully produced orders to ready_for_delivery.
create or replace function public.mark_produced(p_product_id uuid, p_batch_day date, p_quantity int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  log_id uuid;
  left_qty int := p_quantity;
  take int;
  line record;
  touched int[] := '{}';
begin
  if not public.has_any_role('{admin,production_manager,production_worker}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  insert into public.production_logs (product_id, quantity, batch_day, performed_by)
  values (p_product_id, p_quantity, p_batch_day, me)
  returning id into log_id;

  for line in
    select oi.id, oi.order_id, oi.quantity - oi.produced_quantity as remaining
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.product_id = p_product_id
       and o.status in ('pending_approval', 'in_production')
       and (o.delivery_date at time zone 'Asia/Jerusalem')::date = p_batch_day
       and oi.quantity > oi.produced_quantity
     order by o.delivery_date, o.is_urgent desc, o.created_at, oi.created_at
     for update of oi
  loop
    exit when left_qty <= 0;
    take := least(left_qty, line.remaining);
    update public.order_items set produced_quantity = produced_quantity + take where id = line.id;
    insert into public.production_log_allocations (production_log_id, order_item_id, quantity)
    values (log_id, line.id, take);
    left_qty := left_qty - take;
    touched := array_append(touched, line.order_id);
  end loop;

  if left_qty = p_quantity then
    raise exception 'nothing left to produce for this batch' using errcode = 'P0002';
  end if;
  if left_qty > 0 then
    -- never record more than the batch needs
    update public.production_logs set quantity = p_quantity - left_qty where id = log_id;
  end if;

  insert into public.stock_movements (raw_material_id, quantity, movement_type, production_log_id, performed_by)
  select r.raw_material_id, -(r.quantity_per_unit * (p_quantity - left_qty)), 'production', log_id, me
    from public.recipes r where r.product_id = p_product_id;

  perform public.refresh_order_status(t.order_id, me) from unnest(touched) as t(order_id);
  return log_id;
end $$;

-- Undo a production mark within 10 minutes (by whoever made it, or a manager).
create or replace function public.undo_production(p_log_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  lg public.production_logs;
  touched int[];
begin
  select * into lg from public.production_logs where id = p_log_id for update;
  if not found then raise exception 'production log not found' using errcode = 'P0002'; end if;
  if lg.undone_at is not null then raise exception 'already undone' using errcode = '22023'; end if;
  if not (lg.performed_by = me and public.has_any_role('{production_worker}')
          or public.has_any_role('{admin,production_manager}')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if now() - lg.created_at > interval '10 minutes' then
    raise exception 'undo window has passed' using errcode = '22023';
  end if;

  select array_agg(distinct oi.order_id) into touched
    from public.production_log_allocations a join public.order_items oi on oi.id = a.order_item_id
   where a.production_log_id = p_log_id;

  update public.order_items oi set produced_quantity = oi.produced_quantity - a.quantity
    from public.production_log_allocations a
   where a.production_log_id = p_log_id and oi.id = a.order_item_id;

  insert into public.stock_movements (raw_material_id, quantity, movement_type, production_log_id, performed_by)
  select raw_material_id, -quantity, 'production_undo', p_log_id, me
    from public.stock_movements where production_log_id = p_log_id and movement_type = 'production';

  update public.production_logs set undone_at = now(), undone_by = me where id = p_log_id;
  perform public.refresh_order_status(t.order_id, me) from unnest(coalesce(touched, '{}')) as t(order_id);
end $$;

-- Recompute an open order's status from its production progress.
create or replace function public.refresh_order_status(p_order_id int, p_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cur public.order_status;
  total int; done int;
  nxt public.order_status;
begin
  select status into cur from public.orders where id = p_order_id for update;
  if cur not in ('pending_approval', 'in_production', 'ready_for_delivery') then return; end if;
  select sum(quantity), sum(produced_quantity) into total, done from public.order_items where order_id = p_order_id;
  nxt := case when done >= total then 'ready_for_delivery'
              when done > 0 then 'in_production'
              else 'pending_approval' end;
  if nxt <> cur then
    update public.orders set status = nxt where id = p_order_id;
    insert into public.audit_logs (order_id, action_type, performed_by, details)
    values (p_order_id, 'status_change', p_by, jsonb_build_object('from', cur, 'to', nxt));
  end if;
end $$;

revoke execute on function public.refresh_order_status(int, uuid) from public, anon, authenticated;
revoke execute on function public.apply_stock_movement() from public, anon, authenticated;
revoke execute on function public.link_auth_user() from public, anon, authenticated;
grant execute on function public.mark_produced(uuid, date, int) to authenticated;
grant execute on function public.undo_production(uuid) to authenticated;

-- ============ row level security ============
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.products enable row level security;
alter table public.raw_materials enable row level security;
alter table public.recipes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.audit_logs enable row level security;
alter table public.production_logs enable row level security;
alter table public.production_log_allocations enable row level security;
alter table public.stock_movements enable row level security;
alter table public.deliveries enable row level security;
alter table public.settings enable row level security;

-- staff directory: every active staff member can read it; only the admin edits it
create policy users_read on public.users for select to authenticated using (public.current_profile_id() is not null);
create policy users_admin on public.users for all to authenticated
  using (public.has_any_role('{admin}')) with check (public.has_any_role('{admin}'));

-- customers: admin, production and warehouse see all; a marketer sees and edits their own
create policy customers_read on public.customers for select to authenticated using (
  public.has_any_role('{admin,production_manager,production_worker,warehouse}')
  or (public.has_any_role('{marketer}') and (assigned_marketer_id = public.current_profile_id() or assigned_marketer_id is null)));
create policy customers_insert on public.customers for insert to authenticated with check (
  public.has_any_role('{admin}') or (public.has_any_role('{marketer}') and assigned_marketer_id = public.current_profile_id()));
create policy customers_update on public.customers for update to authenticated using (
  public.has_any_role('{admin}') or (public.has_any_role('{marketer}') and assigned_marketer_id = public.current_profile_id()));
create policy customers_delete on public.customers for delete to authenticated using (public.has_any_role('{admin}'));

create policy addresses_read on public.customer_addresses for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id));
create policy addresses_write on public.customer_addresses for all to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id
                  and (public.has_any_role('{admin}') or c.assigned_marketer_id = public.current_profile_id())))
  with check (exists (select 1 from public.customers c where c.id = customer_id
                  and (public.has_any_role('{admin}') or c.assigned_marketer_id = public.current_profile_id())));

-- catalog: readable by staff, edited by the admin
create policy products_read on public.products for select to authenticated using (public.current_profile_id() is not null);
create policy products_admin on public.products for all to authenticated
  using (public.has_any_role('{admin}')) with check (public.has_any_role('{admin}'));
create policy recipes_read on public.recipes for select to authenticated using (public.current_profile_id() is not null);
create policy recipes_admin on public.recipes for all to authenticated
  using (public.has_any_role('{admin}')) with check (public.has_any_role('{admin}'));
create policy materials_read on public.raw_materials for select to authenticated using (public.current_profile_id() is not null);
create policy materials_admin on public.raw_materials for all to authenticated
  using (public.has_any_role('{admin}')) with check (public.has_any_role('{admin}'));

-- orders: managers, production and warehouse see all; a marketer sees their own
create policy orders_read on public.orders for select to authenticated using (
  public.has_any_role('{admin,production_manager,production_worker,warehouse}')
  or marketer_id = public.current_profile_id());
create policy orders_insert on public.orders for insert to authenticated with check (
  public.has_any_role('{admin}') or (public.has_any_role('{marketer}') and marketer_id = public.current_profile_id()));
create policy orders_update on public.orders for update to authenticated using (
  public.has_any_role('{admin,production_manager,warehouse}')
  or (marketer_id = public.current_profile_id() and status = 'draft'));

create policy items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy items_write on public.order_items for all to authenticated
  using (public.has_any_role('{admin,production_manager}')
         or exists (select 1 from public.orders o where o.id = order_id and o.marketer_id = public.current_profile_id() and o.status in ('draft', 'pending_approval') and not public.order_has_production(o.id)))
  with check (public.has_any_role('{admin,production_manager}')
         or exists (select 1 from public.orders o where o.id = order_id and o.marketer_id = public.current_profile_id() and o.status in ('draft', 'pending_approval')));

create policy audit_read on public.audit_logs for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id) or public.has_any_role('{admin}'));
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (performed_by = public.current_profile_id());

-- production and stock ledgers: readable by staff; production rows are written only by the RPCs above
create policy plogs_read on public.production_logs for select to authenticated using (public.current_profile_id() is not null);
create policy alloc_read on public.production_log_allocations for select to authenticated using (public.current_profile_id() is not null);
create policy moves_read on public.stock_movements for select to authenticated
  using (public.has_any_role('{admin,production_manager,warehouse}'));
create policy moves_insert on public.stock_movements for insert to authenticated with check (
  public.has_any_role('{admin,production_manager,warehouse}')
  and movement_type in ('opening', 'receive', 'count', 'waste')
  and performed_by = public.current_profile_id());

create policy deliveries_read on public.deliveries for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy deliveries_write on public.deliveries for all to authenticated
  using (public.has_any_role('{admin,warehouse}')) with check (public.has_any_role('{admin,warehouse}'));

create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_admin on public.settings for update to authenticated using (public.has_any_role('{admin}'));
