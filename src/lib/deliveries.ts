import { createClient } from "./supabase/server";
import type { OrderStatus } from "./domain/types";

export interface DeliveryRow {
  id: number;
  status: OrderStatus;
  deliveryDate: Date;
  isUrgent: boolean;
  customerName: string;
  customerPhone: string;
  address: string | null;
  deliveryNotes: string | null;
  units: number;
  produced: number;
  courier: string | null;
  departedAt: Date | null;
  deliveredAt: Date | null;
  receiver: string | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const date = (v: string | null | undefined) => (v ? new Date(v) : null);

/** Orders the deliveries page shows: ready, on the way, delivered in the last two days, and still in production for the next day. */
export async function loadDeliveries(): Promise<DeliveryRow[]> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, status, delivery_date, is_urgent, updated_at,
       customers(name, phone), customer_addresses(address, city, delivery_notes),
       deliveries(courier_name, departed_at, delivered_at, receiver_name),
       order_items(quantity, produced_quantity)`,
    )
    .or(
      [
        "status.in.(ready_for_delivery,in_transit)",
        `and(status.eq.delivered,updated_at.gte.${new Date(now - 2 * 864e5).toISOString()})`,
        `and(status.in.(pending_approval,in_production),delivery_date.lt.${new Date(now + 864e5).toISOString()})`,
      ].join(","),
    )
    .order("delivery_date");
  if (error) throw error;
  return (data ?? []).map((o) => {
    const c = one(o.customers as unknown as { name: string; phone: string });
    const a = one(o.customer_addresses as unknown as { address: string; city: string; delivery_notes: string | null });
    const d = one(o.deliveries as unknown as { courier_name: string | null; departed_at: string | null; delivered_at: string | null; receiver_name: string | null });
    const items = (o.order_items ?? []) as { quantity: number; produced_quantity: number }[];
    return {
      id: o.id,
      status: o.status as OrderStatus,
      deliveryDate: new Date(o.delivery_date),
      isUrgent: o.is_urgent,
      customerName: c?.name ?? "",
      customerPhone: c?.phone ?? "",
      address: a ? `${a.address}, ${a.city}` : null,
      deliveryNotes: a?.delivery_notes ?? null,
      units: items.reduce((s, i) => s + i.quantity, 0),
      produced: items.reduce((s, i) => s + i.produced_quantity, 0),
      courier: d?.courier_name ?? null,
      departedAt: date(d?.departed_at),
      deliveredAt: date(d?.delivered_at),
      receiver: d?.receiver_name ?? null,
    };
  });
}

/** Staff who can take an order out: the warehouse team. */
export async function loadCouriers(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("id, full_name").eq("is_active", true).contains("roles", ["warehouse"]).order("full_name");
  return (data ?? []).map((u) => ({ id: u.id, name: u.full_name }));
}
