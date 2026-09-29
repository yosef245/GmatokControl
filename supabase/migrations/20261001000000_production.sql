-- Sprint 2: manual batch order on the production board, and stock receiving / counting / waste.

-- A manager's manual position for a batch (product + delivery day) within its day on the board.
create table public.batch_ranks (
  product_id uuid not null references public.products(id) on delete cascade,
  batch_day date not null,
  rank int not null,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  primary key (product_id, batch_day)
);
alter table public.batch_ranks enable row level security;
create policy ranks_read on public.batch_ranks for select to authenticated using (public.current_profile_id() is not null);
create policy ranks_write on public.batch_ranks for all to authenticated
  using (public.has_any_role('{admin,production_manager}'))
  with check (public.has_any_role('{admin,production_manager}'));

-- One stock action by the warehouse or production:
--   receive  → adds p_quantity
--   waste    → removes p_quantity
--   count    → sets the stock to p_quantity (records the difference)
--   opening  → same as count, for the first stock-take
-- Returns the signed change that was recorded.
create or replace function public.record_stock(p_material_id uuid, p_type public.stock_movement_type, p_quantity numeric, p_reason text)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_profile_id();
  current_qty numeric;
  delta numeric;
begin
  if not public.has_any_role('{admin,production_manager,warehouse}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_type not in ('receive', 'waste', 'count', 'opening') then
    raise exception 'unsupported movement type' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or (p_type in ('receive', 'waste') and p_quantity = 0) then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;
  select stock_quantity into current_qty from public.raw_materials where id = p_material_id for update;
  if not found then raise exception 'material not found' using errcode = 'P0002'; end if;
  delta := case p_type
    when 'receive' then p_quantity
    when 'waste' then -p_quantity
    else p_quantity - current_qty
  end;
  if delta = 0 then return 0; end if;
  insert into public.stock_movements (raw_material_id, quantity, movement_type, reason, performed_by)
  values (p_material_id, delta, p_type, nullif(trim(p_reason), ''), me);
  return delta;
end $$;
revoke execute on function public.record_stock(uuid, public.stock_movement_type, numeric, text) from public, anon;
grant execute on function public.record_stock(uuid, public.stock_movement_type, numeric, text) to authenticated;
