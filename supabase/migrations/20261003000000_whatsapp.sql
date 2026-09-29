-- Sprint 4: sending WhatsApp messages through the WhatsApp Business (Cloud) API.
-- The access token lives only in the server's environment; the database keeps the settings,
-- a log of every message sent, and the delivery / read statuses Meta reports back.

alter table public.settings
  add column wa_auto_confirm boolean not null default false,   -- send the order confirmation when an order is created
  add column wa_auto_transit boolean not null default false,   -- tell the customer when the order leaves
  add column wa_auto_delivered boolean not null default false, -- thank the customer when it is delivered
  add column wa_lang text not null default 'he',
  add column wa_tpl_confirm text not null default 'order_confirmation',
  add column wa_tpl_transit text not null default 'order_on_the_way',
  add column wa_tpl_delivered text not null default 'order_delivered',
  add column wa_tpl_supplier text not null default 'supplier_order';

create type public.wa_status as enum ('sent', 'delivered', 'read', 'failed');

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  order_id int references public.orders(id) on delete set null,
  raw_material_supplier text,          -- supplier name, for orders sent to suppliers
  to_phone text not null,
  template text not null,
  kind text not null,                  -- confirm | transit | delivered | supplier | test
  wa_message_id text unique,
  status public.wa_status not null default 'sent',
  error text,
  automatic boolean not null default false,
  sent_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.whatsapp_messages (order_id, created_at);

alter table public.whatsapp_messages enable row level security;
-- anyone who can see the order sees its messages; supplier and test messages are for the admin and stock staff
create policy wa_read on public.whatsapp_messages for select to authenticated using (
  (order_id is not null and exists (select 1 from public.orders o where o.id = order_id))
  or public.has_any_role('{admin}')
  or (kind = 'supplier' and public.has_any_role('{production_manager,warehouse}')));
create policy wa_insert on public.whatsapp_messages for insert to authenticated with check (
  sent_by = public.current_profile_id()
  and (order_id is null or exists (select 1 from public.orders o where o.id = order_id)));

-- The token that Meta's status webhook must present (the webhook route passes it from the server's environment).
create table public.integration_secrets (
  id boolean primary key default true check (id),
  whatsapp_webhook_token text not null default replace(gen_random_uuid()::text, '-', '')
);
insert into public.integration_secrets default values;
alter table public.integration_secrets enable row level security;
create policy secrets_admin on public.integration_secrets for select to authenticated using (public.has_any_role('{admin}'));

-- Called by the webhook route for each status Meta reports. Never moves a status backwards
-- (read beats delivered beats sent), except that a failure is always recorded.
create or replace function public.whatsapp_status(p_token text, p_wa_id text, p_status text, p_error text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token is distinct from (select whatsapp_webhook_token from public.integration_secrets) then
    return false;
  end if;
  if p_status not in ('sent', 'delivered', 'read', 'failed') then return false; end if;
  update public.whatsapp_messages
     set status = p_status::public.wa_status,
         error = case when p_status = 'failed' then left(p_error, 500) else error end,
         updated_at = now()
   where wa_message_id = p_wa_id
     and (p_status = 'failed'
          or array_position(array['sent', 'delivered', 'read'], p_status)
             > coalesce(array_position(array['sent', 'delivered', 'read'], status::text), 0));
  return found;
end $$;
revoke execute on function public.whatsapp_status(text, text, text, text) from public;
grant execute on function public.whatsapp_status(text, text, text, text) to anon, authenticated;
