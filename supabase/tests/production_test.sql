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

-- 7b. create_order: a marketer creates an order for their customer, a worker cannot
select pg_temp.login('050-0000002');
do $$
declare cust uuid; prod uuid; new_id int;
begin
  select id into cust from public.customers where assigned_marketer_id = public.current_profile_id() limit 1;
  select id into prod from public.products where is_active limit 1;
  new_id := public.create_order(cust, null, now() + interval '2 days', true, ' בדיקה ',
    jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 3)));
  assert (select status from public.orders where id = new_id) = 'pending_approval', 'new order waits for production';
  assert (select total_amount from public.orders where id = new_id) = 3 * (select price from public.products where id = prod), 'total uses list price';
  assert (select notes from public.orders where id = new_id) = 'בדיקה', 'notes trimmed';
  assert exists (select 1 from public.audit_logs where order_id = new_id and action_type = 'created'), 'creation is audited';
  begin
    perform public.create_order(cust, null, now(), false, null, '[]'::jsonb);
    assert false, 'empty order must fail';
  exception when invalid_parameter_value then null;
  end;
end $$;
select pg_temp.login('050-0000005');
do $$ begin
  begin
    perform public.create_order((select id from public.customers limit 1), null, now(), false, null,
      jsonb_build_array(jsonb_build_object('product_id', (select id from public.products limit 1), 'quantity', 1)));
    assert false, 'worker must not create orders';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 7c. stock actions: receive adds, waste removes, count sets; a worker may not; ranks are for managers
select pg_temp.login('050-0000006');
do $$
declare mat uuid; before numeric;
begin
  select id, stock_quantity into mat, before from public.raw_materials order by name limit 1;
  assert public.record_stock(mat, 'receive', 5, 'ספק') = 5, 'receive returns +5';
  assert public.record_stock(mat, 'waste', 2, 'נשפך') = -2, 'waste returns -2';
  assert (select stock_quantity from public.raw_materials where id = mat) = before + 3, 'stock follows receive and waste';
  perform public.record_stock(mat, 'count', 40, null);
  assert (select stock_quantity from public.raw_materials where id = mat) = 40, 'count sets the stock';
  assert public.record_stock(mat, 'count', 40, null) = 0, 'recount with no change records nothing';
  begin
    perform public.record_stock(mat, 'waste', -1, null);
    assert false, 'negative waste must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.batch_ranks (product_id, batch_day, rank) values ((select id from public.products limit 1), current_date, 1);
    assert false, 'warehouse must not reorder the board';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.login('050-0000005');
do $$ begin
  begin
    perform public.record_stock((select id from public.raw_materials limit 1), 'receive', 1, null);
    assert false, 'worker must not receive stock';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.login('050-0000004');
insert into public.batch_ranks (product_id, batch_day, rank, updated_by)
values ((select id from public.products limit 1), current_date, 1, public.current_profile_id());

-- 7d. deliveries: courier, departure, return and hand-over by the warehouse; others may not
select pg_temp.login('050-0000006');
do $$
declare oid int;
begin
  select id into oid from public.orders where status = 'ready_for_delivery' order by id limit 1;
  assert oid is not null, 'a ready order exists from the production checks';
  begin
    perform public.delivery_step(oid, 'depart');
    assert false, 'departure needs a courier';
  exception when invalid_parameter_value then null;
  end;
  assert public.delivery_step(oid, 'assign', null, ' גט טקסי ') = 'ready_for_delivery', 'assigning keeps the status';
  assert (select courier_name from public.deliveries where order_id = oid) = 'גט טקסי', 'courier name saved';
  perform public.delivery_step(oid, 'assign', '00000000-0000-4000-8000-100000000006');
  assert (select courier_user_id from public.deliveries where order_id = oid) = '00000000-0000-4000-8000-100000000006', 'staff courier replaces the name';
  assert public.delivery_step(oid, 'depart') = 'in_transit', 'departs';
  assert (select departed_at from public.deliveries where order_id = oid) is not null, 'departure time saved';
  assert public.delivery_step(oid, 'return', p_notes => 'לא היה בבית') = 'ready_for_delivery', 'returns';
  perform public.delivery_step(oid, 'depart');
  assert public.delivery_step(oid, 'deliver', p_receiver_name => 'משה') = 'delivered', 'delivers';
  assert (select receiver_name from public.deliveries where order_id = oid) = 'משה', 'receiver saved';
  assert (select count(*) from public.audit_logs where order_id = oid and action_type = 'status_change' and details->>'to' = 'in_transit') = 2, 'each departure audited';
  assert exists (select 1 from public.audit_logs where order_id = oid and details->>'receiver' = 'משה'), 'hand-over audited with receiver';
  begin
    perform public.delivery_step(oid, 'deliver');
    assert false, 'cannot deliver twice';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.delivery_step((select id from public.orders where status = 'pending_approval' limit 1), 'assign', null, 'x');
    assert false, 'only ready orders get a courier';
  exception when invalid_parameter_value then null;
  end;
end $$;
select pg_temp.login('050-0000005');
do $$ begin
  begin
    perform public.delivery_step((select id from public.orders limit 1), 'deliver');
    assert false, 'worker must not deliver';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 7e. price lists: an order line without a price takes the customer's list price, then the product price
select pg_temp.login('050-0000001');
do $$
declare lst uuid; cust uuid; p1 uuid; p2 uuid;
begin
  select id into cust from public.customers where assigned_marketer_id = '00000000-0000-4000-8000-100000000002' limit 1;
  select id into p1 from public.products where is_active order by name limit 1;
  select id into p2 from public.products where is_active order by name offset 1 limit 1;
  insert into public.price_lists (name) values ('סיטונאי') returning id into lst;
  insert into public.price_list_items values (lst, p1, 1.5);
  update public.customers set price_list_id = lst where id = cust;
  assert public.customer_price(cust, p1) = 1.5, 'list price';
  assert public.customer_price(cust, p2) = (select price from public.products where id = p2), 'falls back to product price';
end $$;
select pg_temp.login('050-0000002');
do $$
declare cust uuid; p1 uuid; p2 uuid; new_id int;
begin
  select id into cust from public.customers where price_list_id is not null limit 1;
  select id into p1 from public.products where is_active order by name limit 1;
  select id into p2 from public.products where is_active order by name offset 1 limit 1;
  new_id := public.create_order(cust, null, now() + interval '3 days', false, null,
    jsonb_build_array(jsonb_build_object('product_id', p1, 'quantity', 10), jsonb_build_object('product_id', p2, 'quantity', 1)));
  assert (select total_amount from public.orders where id = new_id) = 15 + (select price from public.products where id = p2), 'order total uses the price list';
  assert exists (select 1 from public.price_lists), 'marketer reads price lists';
  begin
    insert into public.price_lists (name) values ('של משווק');
    assert false, 'marketer must not create price lists';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.login('050-0000005');
do $$ begin
  assert not exists (select 1 from public.price_lists), 'production does not see price lists';
end $$;

-- 7f. import: adds new rows, updates matches, records opening stock, and fails as a whole on a bad row
select pg_temp.login('050-0000001');
do $$
declare res jsonb; before int;
begin
  res := public.import_rows('products', '[{"name":"עוגיית שוקולד צ׳יפס","category":"עוגיות","price":6.5,"minutes":1},
                                          {"name":" עוגיית שוקולד צ׳יפס ","price":7}]');
  assert res = '{"added": 1, "updated": 1}', 'products: one added then updated, got ' || res;
  assert (select price from public.products where name = 'עוגיית שוקולד צ׳יפס') = 7, 'second row updates the price';

  res := public.import_rows('materials', '[{"name":"שקדים","unit":"ק״ג","stock":12,"minimum":3,"supplier_name":"אגוזי הגליל"}]');
  assert (select stock_quantity from public.raw_materials where name = 'שקדים') = 12, 'opening stock';
  assert exists (select 1 from public.stock_movements m join public.raw_materials r on r.id = m.raw_material_id
                  where r.name = 'שקדים' and m.movement_type = 'opening'), 'opening movement recorded';
  perform public.import_rows('materials', '[{"name":"שקדים","stock":10}]');
  assert (select stock_quantity from public.raw_materials where name = 'שקדים') = 10, 'reimport counts the stock';
  assert (select unit_of_measure from public.raw_materials where name = 'שקדים') = 'ק״ג', 'unit kept';

  res := public.import_rows('customers', '[{"name":"קפה גלית","phone":"052-7777777","type":"business","address":"הרצל 5","city":"חיפה","price_list":"סיטונאי","marketer_email":""},
                                           {"name":"קפה גלית בע״מ","phone":"+972 52 777 7777","address":"הרצל 5","city":"חיפה"}]');
  assert res = '{"added": 1, "updated": 1}', 'customers matched by phone, got ' || res;
  assert (select count(*) from public.customer_addresses a join public.customers c on c.id = a.customer_id where c.phone = '052-7777777') = 1, 'same address not added twice';
  assert (select name from public.customers where phone = '052-7777777') = 'קפה גלית בע״מ', 'name updated';
  assert (select l.name from public.customers c join public.price_lists l on l.id = c.price_list_id where c.phone = '052-7777777') = 'סיטונאי', 'price list set';

  res := public.import_rows('prices', '[{"price_list":"אירועים","product":"עוגיית שוקולד צ׳יפס","price":5}]');
  assert res = '{"added": 1, "updated": 0}', 'prices: new list and item, got ' || res;

  select count(*) into before from public.products;
  begin
    perform public.import_rows('prices', '[{"price_list":"אירועים","product":"עוגיית שוקולד צ׳יפס","price":4},{"price_list":"אירועים","product":"אין כזה","price":1}]');
    assert false, 'unknown product must fail';
  exception when no_data_found then null;
  end;
  assert (select i.price from public.price_list_items i join public.price_lists l on l.id = i.price_list_id where l.name = 'אירועים') = 5, 'failed import changes nothing';
end $$;
select pg_temp.login('050-0000002');
do $$ begin
  begin
    perform public.import_rows('products', '[]');
    assert false, 'marketer must not import';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 7g. WhatsApp log: staff log messages for orders they see; statuses need the webhook token and never go backwards
select pg_temp.login('050-0000002');
do $$
declare oid int := (select id from public.orders where marketer_id = public.current_profile_id() limit 1);
begin
  insert into public.whatsapp_messages (order_id, to_phone, template, kind, wa_message_id, sent_by)
  values (oid, '972500000000', 'order_confirmation', 'confirm', 'wamid.A', public.current_profile_id());
  begin
    insert into public.whatsapp_messages (to_phone, template, kind, sent_by)
    values ('972500000000', 'x', 'test', '00000000-0000-4000-8000-100000000001');
    assert false, 'cannot log a message as someone else';
  exception when insufficient_privilege then null;
  end;
  assert not exists (select 1 from public.integration_secrets), 'marketer cannot read the webhook token';
end $$;
reset role;
set role anon;
do $$ begin
  assert public.whatsapp_status('wrong', 'wamid.A', 'read') = false, 'wrong token ignored';
end $$;
reset role;
do $$
declare tok text := (select whatsapp_webhook_token from public.integration_secrets);
begin
  set local role anon;
  assert public.whatsapp_status(tok, 'wamid.A', 'read'), 'read recorded';
  assert public.whatsapp_status(tok, 'wamid.A', 'delivered') = false, 'status does not go back';
  assert public.whatsapp_status(tok, 'wamid.A', 'failed', 'blocked') , 'failure recorded';
  reset role;
  assert (select status from public.whatsapp_messages where wa_message_id = 'wamid.A') = 'failed', 'final status failed';
  assert (select error from public.whatsapp_messages where wa_message_id = 'wamid.A') = 'blocked', 'error kept';
end $$;
select pg_temp.login('050-0000005');
do $$ begin
  assert not exists (select 1 from public.whatsapp_messages where kind = 'supplier'), 'worker sees no supplier messages';
end $$;

-- 7h. staff logins from the app: initial password, reset, forced change and blocking
select pg_temp.login('050-0000002');
do $$ begin
  begin perform public.set_initial_password('secret1'); assert false, 'marketer cannot set the initial password';
  exception when insufficient_privilege then null; end;
  begin perform public.reset_staff_password('00000000-0000-4000-8000-100000000005'); assert false, 'marketer cannot reset passwords';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.login('050-0000001');
do $$
declare sid uuid; aid uuid;
begin
  insert into public.users (full_name, email, roles) values ('עובדת חדשה', 'Fresh@Example.com', '{production_worker}') returning id into sid;
  begin perform public.reset_staff_password(sid); assert false, 'needs an initial password first';
  exception when raise_exception then null; end;
  begin perform public.set_initial_password('abc'); assert false, 'short initial password refused';
  exception when invalid_parameter_value then null; end;
  perform public.set_initial_password('start123');
  perform public.reset_staff_password(sid);
  select auth_user_id into aid from public.users where id = sid;
  assert aid is not null, 'login created and linked';
  assert (select must_change_password from public.users where id = sid), 'must change password';
  reset role;  -- auth.users is not visible to app users
  assert (select encrypted_password = extensions.crypt('start123', encrypted_password) and email = 'fresh@example.com'
            and email_confirmed_at is not null from auth.users where id = aid), 'login has the hashed initial password';
  assert (select count(*) from auth.identities where user_id = aid and provider = 'email') = 1, 'email identity created';
  -- blocking bans the login, reactivating lifts it
  update public.users set is_active = false where id = sid;
  assert (select banned_until > now() from auth.users where id = aid), 'inactive login banned';
  update public.users set is_active = true where id = sid;
  assert (select banned_until is null from auth.users where id = aid), 'active login unbanned';
  -- a reset changes the same login, not a new one
  update public.integration_secrets set initial_password = 'again456';
  perform public.reset_staff_password(sid);
  assert (select auth_user_id from public.users where id = sid) = aid, 'reset keeps the login';
  assert (select encrypted_password = extensions.crypt('again456', encrypted_password) from auth.users where id = aid), 'reset sets the password';
  -- the worker clears the flag after choosing a password
  reset role;
  perform set_config('request.jwt.claim.sub', aid::text, false);
  set role authenticated;
  perform public.password_changed();
  assert not (select must_change_password from public.users where id = sid), 'flag cleared';
end $$;

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
