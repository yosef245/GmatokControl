import type { Order, OrderItem, Product, ShiftSettings } from "./types";

const OPEN: Order["status"][] = ["pending_approval", "in_production"];
const TZ = "Asia/Jerusalem";

/** Calendar day (YYYY-MM-DD) in Israel time, used as the batch key. */
export function israelDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export interface BatchEntry {
  order: Order;
  item: OrderItem;
  remaining: number;
}

export interface Batch {
  key: string;
  product: Product;
  day: string;
  remaining: number;
  entries: BatchEntry[];
  earliestDelivery: Date;
  urgent: boolean;
  short: boolean;
  workMinutes: number;
  /** Latest time production can start and still make the earliest delivery (backward scheduling, SRD 4.1). */
  latestStart: Date;
  manualRank?: number;
}

/** Allocation order for a partial batch: earliest delivery, then urgent, then order close time (approved 2026-09-28). */
export function compareForAllocation(a: BatchEntry, b: BatchEntry): number {
  return (
    a.order.deliveryDate.getTime() - b.order.deliveryDate.getTime() ||
    Number(b.order.isUrgent) - Number(a.order.isUrgent) ||
    a.order.createdAt.getTime() - b.order.createdAt.getTime()
  );
}

/** Groups open order lines into same-product, same-day batches (SRD 4.2). */
export function buildBatches(
  orders: Order[],
  products: Map<string, Product>,
  settings: ShiftSettings,
  shortMaterialIds: Set<string> = new Set(),
  manualRanks: Record<string, number> = {},
): Batch[] {
  const byKey = new Map<string, Batch>();
  for (const order of orders) {
    if (!OPEN.includes(order.status)) continue;
    for (const item of order.items) {
      const remaining = item.quantity - item.producedQuantity;
      const product = products.get(item.productId);
      if (remaining <= 0 || !product) continue;
      const day = israelDay(order.deliveryDate);
      const key = `${product.id}|${day}`;
      let b = byKey.get(key);
      if (!b) {
        b = {
          key, product, day, remaining: 0, entries: [], earliestDelivery: order.deliveryDate, urgent: false,
          short: product.recipe.some((r) => shortMaterialIds.has(r.rawMaterialId)),
          workMinutes: 0, latestStart: order.deliveryDate, manualRank: manualRanks[key],
        };
        byKey.set(key, b);
      }
      b.remaining += remaining;
      b.entries.push({ order, item, remaining });
      if (order.deliveryDate < b.earliestDelivery) b.earliestDelivery = order.deliveryDate;
      b.urgent ||= order.isUrgent;
    }
  }
  const workers = Math.max(1, settings.shiftWorkers);
  const batches = [...byKey.values()];
  for (const b of batches) {
    b.entries.sort(compareForAllocation);
    b.workMinutes = b.remaining * b.product.estimatedProductionMinutes;
    b.latestStart = new Date(b.earliestDelivery.getTime() - (settings.deliveryMinutes + b.workMinutes / workers) * 60_000);
  }
  return batches.sort(compareBatches);
}

/** Board order within a day: manual rank, then feasible before short, urgent first, then latest start time. */
export function compareBatches(a: Batch, b: Batch): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  const ra = a.manualRank ?? Infinity, rb = b.manualRank ?? Infinity;
  if (ra !== rb) return ra - rb;
  if (a.short !== b.short) return a.short ? 1 : -1;
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
  return a.latestStart.getTime() - b.latestStart.getTime();
}

/** Preview of how a production mark is split between orders (the database does the real split in mark_produced). */
export function allocate(batch: Batch, quantity: number): { orderId: number; itemId: string; quantity: number }[] {
  let left = Math.min(Math.max(0, Math.floor(quantity)), batch.remaining);
  const out: { orderId: number; itemId: string; quantity: number }[] = [];
  for (const e of batch.entries) {
    if (left <= 0) break;
    const take = Math.min(left, e.remaining);
    out.push({ orderId: e.order.id, itemId: e.item.id, quantity: take });
    left -= take;
  }
  return out;
}

/** Remaining production minutes for an order. */
export function remainingMinutes(order: Order, products: Map<string, Product>): number {
  return order.items.reduce(
    (s, it) => s + Math.max(0, it.quantity - it.producedQuantity) * (products.get(it.productId)?.estimatedProductionMinutes ?? 0),
    0,
  );
}

/** SLA risk (SRD 4.3): not late yet, but the remaining work plus delivery time no longer fits before the deadline. */
export function slaState(order: Order, products: Map<string, Product>, settings: ShiftSettings, now: Date): "late" | "at_risk" | "ok" {
  const active: Order["status"][] = ["pending_approval", "in_production", "ready_for_delivery", "in_transit"];
  if (!active.includes(order.status)) return "ok";
  if (order.deliveryDate <= now) return "late";
  if (!OPEN.includes(order.status)) return "ok";
  const need = remainingMinutes(order, products) / Math.max(1, settings.shiftWorkers) + settings.deliveryMinutes;
  return now.getTime() + need * 60_000 > order.deliveryDate.getTime() ? "at_risk" : "ok";
}

/** Daily capacity bar (SRD 4.3): work due today (and overdue) against shift minutes. */
export function capacity(batches: Batch[], settings: ShiftSettings, today: string) {
  const load = batches.filter((b) => b.day <= today).reduce((s, b) => s + b.workMinutes, 0);
  const cap = settings.shiftWorkers * settings.shiftHours * 60;
  const ratio = cap > 0 ? load / cap : 0;
  return { loadMinutes: load, capacityMinutes: cap, ratio, level: ratio > 1 ? "over" : ratio > 0.85 ? "high" : "ok" } as const;
}
