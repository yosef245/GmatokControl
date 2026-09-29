import { createClient } from "./supabase/server";
import type { OrderStatus } from "./domain/types";

export interface OrderDetail {
  id: number;
  status: OrderStatus;
  deliveryDate: Date;
  createdAt: Date;
  isUrgent: boolean;
  notes: string | null;
  total: number;
  addressId: string | null;
  customer: { id: string; name: string; contactName: string | null; phone: string };
  address: { address: string; city: string; deliveryNotes: string | null } | null;
  addresses: { id: string; label: string }[];
  marketer: string | null;
  items: { id: string; productName: string; quantity: number; produced: number; unitPrice: number; notes: string | null; minutes: number }[];
  history: { at: Date; action: string; by: string | null; details: Record<string, unknown> | null }[];
}

export async function loadOrder(id: number): Promise<OrderDetail | null> {
  if (!Number.isInteger(id)) return null;
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("orders")
    .select(
      `id, status, delivery_date, created_at, is_urgent, notes, total_amount, address_id,
       customers(id, name, contact_name, phone, customer_addresses(id, address, city)),
       customer_addresses(address, city, delivery_notes),
       users!orders_marketer_id_fkey(full_name),
       order_items(id, position, quantity, produced_quantity, unit_price, notes, created_at, products(name, estimated_production_minutes)),
       audit_logs(created_at, action_type, details, users(full_name))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!o) return null;
  type Row = Record<string, never>;
  const c = o.customers as unknown as { id: string; name: string; contact_name: string | null; phone: string; customer_addresses: { id: string; address: string; city: string }[] };
  const a = o.customer_addresses as unknown as { address: string; city: string; delivery_notes: string | null } | null;
  const items = (o.order_items as unknown as { id: string; position: number; quantity: number; produced_quantity: number; unit_price: number; notes: string | null; created_at: string; products: { name: string; estimated_production_minutes: number } }[])
    .sort((x, y) => x.position - y.position || x.created_at.localeCompare(y.created_at));
  const logs = o.audit_logs as unknown as { created_at: string; action_type: string; details: Row | null; users: { full_name: string } | null }[];
  return {
    id: o.id,
    status: o.status as OrderStatus,
    deliveryDate: new Date(o.delivery_date),
    createdAt: new Date(o.created_at),
    isUrgent: o.is_urgent,
    notes: o.notes,
    total: Number(o.total_amount),
    addressId: o.address_id,
    customer: { id: c.id, name: c.name, contactName: c.contact_name, phone: c.phone },
    address: a ? { address: a.address, city: a.city, deliveryNotes: a.delivery_notes } : null,
    addresses: c.customer_addresses.map((x) => ({ id: x.id, label: `${x.address}, ${x.city}` })),
    marketer: (o.users as unknown as { full_name: string } | null)?.full_name ?? null,
    items: items.map((i) => ({
      id: i.id,
      productName: i.products.name,
      quantity: i.quantity,
      produced: i.produced_quantity,
      unitPrice: Number(i.unit_price),
      notes: i.notes,
      minutes: i.products.estimated_production_minutes,
    })),
    history: logs
      .map((l) => ({ at: new Date(l.created_at), action: l.action_type, by: l.users?.full_name ?? null, details: l.details }))
      .sort((x, y) => x.at.getTime() - y.at.getTime()),
  };
}
