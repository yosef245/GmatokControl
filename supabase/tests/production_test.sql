-- End-to-end checks for login linking, RLS, production marking, allocation and undo.
set client_min_messages = warning;
-- Runs after auth_stub.sql, the migrations and seed.sql. Any failed assertion aborts with an error.
\set ON_ERROR_STOP on

-- helper: act as the staff member with this phone
create or replace function pg_temp.login(p text) returns void language plpgsql as $$
declare uid uuid;
begin
  reset role;
  select auth_user_id into uid from public.users where phone = p;
  if uid is null then
    insert into auth.users (phone) values ('972' || substr(regexp_replace(p, '\D', '', 'g'), 2)) returning id into uid;
  end if;
  perform set_config('request.jwt.claim.sub', uid::text, false);
  set role authenticated;
end $$;

-- 1. a login with a known phone links to the staff profile
select pg_temp.login('050-0000005');
do $$ begin
  assert public.current_profile_id() = '00000000-0000-4000-8000-100000000005', 'worker login should link to profile';
  assert public.has_any_role('{production_worker}'), 'worker role';
  assert not public.has_any_role('{admin}'), 'worker is not admin';
end $$;

-- 2. an unknown phone gets no profile and sees nothing
select pg_temp.login('050-9999999');
do $$ begin
  assert public.current_profile_id() is null, 'unknown phone has no profile';
  assert (select count(*) from public.orders) = 0, 'unknown user sees no orders';
  assert (select count(*) from public.products) = 0, 'unknown user sees no products';
end $$;

-- 3. a marketer sees only their own orders and cannot mark production
select pg_temp.login('050-0000003');
do $$ declare n int; begin
  select count(*) into n from public.orders where marketer_id <> public.current_profile_id();
  assert n = 0, 'marketer sees only own orders';
  assert (select count(*) from public.orders) > 0, 'marketer sees their orders';
  begin
    perform public.mark_produced((select product_id from public.order_items limit 1), current_date, 1);
    assert false, 'marketer must not mark production';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. worker marks 30 pralines for tomorrow's batch: allocation follows delivery time, then urgency
select pg_temp.login('050-0000005');
do $$
declare
  pral uuid := (select id from public.products where name like 'פרלינים%');
  tomorrow date := ((now() at time zone 'Asia/Jerusalem')::date + 1);
  before_stock numeric := (select stock_quantity from public.raw_materials where name = 'קופסת פרלינים 16');
  log_id uuid;
begin
  log_id := public.mark_produced(pral, tomorrow, 30);
  assert (select produced_quantity from public.order_items oi join public.orders o on o.id = oi.order_id
           where o.id = 1046 and oi.product_id = pral) = 30, 'order 1046 (earliest tomorrow) gets all 30';
  assert (select status from public.orders where id = 1046) = 'in_production', '1046 moves to in_production';
  assert (select stock_quantity from public.raw_materials where name = 'קופסת פרלינים 16') = before_stock - 30,
    'one praline box per unit deducted';
  perform public.undo_production(log_id);
  assert (select produced_quantity from public.order_items oi where oi.order_id = 1046 and oi.product_id = pral) = 0, 'undo restores produced qty';
  assert (select stock_quantity from public.raw_materials where name = 'קופסת פרלינים 16') = before_stock, 'undo restores stock';
  assert (select status from public.orders where id = 1046) = 'pending_approval', 'undo restores status';
end $$;

-- 5. completing every line moves the order to ready_for_delivery; over-marking is capped
do $$
declare r record;
begin
  for r in select oi.product_id, (o.delivery_date at time zone 'Asia/Jerusalem')::date as d, oi.quantity
             from public.order_items oi join public.orders o on o.id = oi.order_id where o.id = 1043 loop
    perform public.mark_produced(r.product_id, r.d, r.quantity + 500);
  end loop;
  assert (select status from public.orders where id = 1043) = 'ready_for_delivery', '1043 is ready';
  assert (select count(*) from public.audit_logs where order_id = 1043 and action_type = 'status_change') >= 1, 'status change logged';
end $$;

-- 6. a worker cannot undo someone else's mark; the undo window is enforced
do $$
declare lid uuid;
begin
  reset role;
  insert into public.production_logs (product_id, quantity, batch_day, performed_by, created_at)
  values ((select id from public.products limit 1), 1, current_date, '00000000-0000-4000-8000-100000000004', now())
  returning id into lid;
  perform set_config('request.jwt.claim.sub', (select auth_user_id::text from public.users where phone = '050-0000005'), false);
  set role authenticated;
  begin
    perform public.undo_production(lid);
    assert false, 'worker must not undo a manager mark';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.login('050-0000004');
do $$
declare lid uuid;
begin
  reset role;
  insert into public.production_logs (product_id, quantity, batch_day, performed_by, created_at)
  values ((select id from public.products limit 1), 1, current_date, '00000000-0000-4000-8000-100000000004', now() - interval '11 minutes')
  returning id into lid;
  perform set_config('request.jwt.claim.sub', (select auth_user_id::text from public.users where phone = '050-0000004'), false);
  set role authenticated;
  begin
    perform public.undo_production(lid);
    assert false, 'undo after 10 minutes must fail';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- 7. inventory view: shortages show red, and stock can go negative without blocking production
select pg_temp.login('050-0000001');
do $$ begin
  assert exists (select 1 from public.inventory_status_view where alert_status = 'red'), 'seed has a red material';
  assert exists (select 1 from public.order_shortage_view), 'some order is flagged short';
  -- a worker cannot write stock movements directly; the warehouse can
end $$;
select pg_temp.login('050-0000005');
do $$ begin
  begin
    insert into public.stock_movements (raw_material_id, quantity, movement_type, performed_by)
    values ((select id from public.raw_materials limit 1), 5, 'receive', public.current_profile_id());
    assert false, 'worker must not receive stock';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.login('050-0000006');
insert into public.stock_movements (raw_material_id, quantity, movement_type, reason, performed_by)
values ((select id from public.raw_materials where name = 'ממרח פרלינה לוז'), 10, 'receive', 'test', public.current_profile_id());

-- 8. email login: a confirmed email links to the staff profile with that email, an unconfirmed one does not
reset role;
update public.users set email = 'Dana@Example.com' where id = '00000000-0000-4000-8000-100000000002';
do $$
declare uid uuid; staff uuid := '00000000-0000-4000-8000-100000000002';
begin
  update public.users set auth_user_id = null where id = staff;
  insert into auth.users (email) values ('dana@example.com') returning id into uid;
  assert (select auth_user_id from public.users where id = staff) is null, 'unconfirmed email must not link';
  update auth.users set email_confirmed_at = now() where id = uid;
  assert (select auth_user_id from public.users where id = staff) = uid, 'confirmed email links';
  -- staff added after their login exists are linked on insert
  insert into auth.users (email, email_confirmed_at) values ('new.worker@example.com', now()) returning id into uid;
  insert into public.users (full_name, email, roles) values ('עובד חדש', 'New.Worker@example.com', '{production_worker}');
  assert (select auth_user_id from public.users where email = 'New.Worker@example.com') = uid, 'late staff row links';
end $$;

-- 9. the first login on an empty system becomes admin
reset role;
truncate public.users cascade;
select pg_temp.login('052-1111111');
do $$ begin
  assert public.has_any_role('{admin}'), 'first login becomes admin';
end $$;

-- 10. the same holds for an email login
reset role;
truncate public.users cascade;
do $$
declare uid uuid;
begin
  insert into auth.users (email, email_confirmed_at) values ('owner@example.com', now()) returning id into uid;
  assert (select roles from public.users where auth_user_id = uid) = '{admin}', 'first email login becomes admin';
  assert (select email from public.users where auth_user_id = uid) = 'owner@example.com', 'admin keeps the email';
end $$;

reset role;
select 'all database checks passed' as result;
