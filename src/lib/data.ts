import { createClient } from "./supabase/server";
import type { AlertColor, Order, OrderStatus, Product, ShiftSettings } from "./domain/types";
import type { ReportOrder } from "./domain/report";

export interface MaterialRow {
  id: string;
  name: string;
  unit: string;
  supplierName: string | null;
  supplierPhone: string | null;
  inStock: number;
  reserved: number;
  available: number;
  minimum: number;
  toOrder: number;
  color: AlertColor;
}

const n = (v: unknown) => Number(v ?? 0);

export async function loadSettings(): Promise<ShiftSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("shift_workers, shift_hours, delivery_minutes").maybeSingle();
  return {
    shiftWorkers: n(data?.shift_workers ?? 3),
    shiftHours: n(data?.shift_hours ?? 8),
    deliveryMinutes: n(data?.delivery_minutes ?? 45),
  };
}

export async function loadProducts(): Promise<Map<string, Product>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, estimated_production_minutes, recipes(raw_material_id, quantity_per_unit)");
  if (error) throw error;
  return new Map(
    (data ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        estimatedProductionMinutes: n(p.estimated_production_minutes),
        recipe: (p.recipes ?? []).map((r) => ({ rawMaterialId: r.raw_material_id, quantityPerUnit: n(r.quantity_per_unit) })),
      },
    ]),
  );
}

/** Orders the signed-in user may see (row-level security decides which), excluding delivered and cancelled. */
export async function loadActiveOrders(): Promise<Order[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, delivery_date, is_urgent, status, created_at, customers(name), order_items(id, product_id, quantity, produced_quantity)")
    .not("status", "in", "(delivered,cancelled,draft)")
    .order("delivery_date");
  if (error) throw error;
  return (data ?? []).map((o) => {
    const customer = o.customers as unknown as { name: string } | null;
    return {
      id: o.id,
      customerName: customer?.name ?? "",
      deliveryDate: new Date(o.delivery_date),
      isUrgent: o.is_urgent,
      status: o.status as OrderStatus,
      createdAt: new Date(o.created_at),
      items: (o.order_items ?? []).map((i) => ({
        id: i.id,
        productId: i.product_id,
        quantity: i.quantity,
        producedQuantity: i.produced_quantity,
      })),
    };
  });
}

export async function loadMaterials(): Promise<MaterialRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory_status_view").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.raw_material_id,
    name: m.name,
    unit: m.unit_of_measure,
    supplierName: m.supplier_name,
    supplierPhone: m.supplier_phone,
    inStock: n(m.in_stock),
    reserved: n(m.reserved_quantity),
    available: n(m.available_quantity),
    minimum: n(m.minimum_threshold),
    toOrder: n(m.quantity_to_order),
    color: m.alert_status as AlertColor,
  }));
}

export interface RecentMark {
  id: string;
  productName: string;
  quantity: number;
  at: Date;
  performedBy: string | null;
  performerName: string | null;
}

/** Production marks from the last 10 minutes that can still be undone. */
export async function loadRecentMarks(): Promise<RecentMark[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("production_logs")
    .select("id, quantity, created_at, performed_by, products(name), users!production_logs_performed_by_fkey(full_name)")
    .is("undone_at", null)
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .order("created_at", { ascending: false });
  return (data ?? []).map((l) => ({
    id: l.id,
    productName: (l.products as unknown as { name: string }).name,
    quantity: l.quantity,
    at: new Date(l.created_at),
    performedBy: l.performed_by,
    performerName: (l.users as unknown as { full_name: string } | null)?.full_name ?? null,
  }));
}

/** Orders for the reports page: created since `since`, or changed since then (to catch deliveries). */
export async function loadReportOrders(since: Date): Promise<ReportOrder[]> {
  const supabase = await createClient();
  const iso = since.toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, created_at, delivery_date, status, total_amount,
       users!orders_marketer_id_fkey(full_name), deliveries(delivered_at),
       order_items(quantity, products(name))`,
    )
    .or(`created_at.gte.${iso},updated_at.gte.${iso}`);
  if (error) throw error;
  return (data ?? []).map((o) => {
    const dv = o.deliveries as unknown as { delivered_at: string | null } | { delivered_at: string | null }[] | null;
    const d = Array.isArray(dv) ? dv[0] : dv;
    return {
      id: o.id,
      createdAt: new Date(o.created_at),
      deliveryDate: new Date(o.delivery_date),
      deliveredAt: d?.delivered_at ? new Date(d.delivered_at) : null,
      status: o.status as OrderStatus,
      total: n(o.total_amount),
      marketer: (o.users as unknown as { full_name: string } | null)?.full_name ?? null,
      items: (o.order_items as unknown as { quantity: number; products: { name: string } }[]).map((i) => ({
        product: i.products.name,
        quantity: i.quantity,
      })),
    };
  });
}
