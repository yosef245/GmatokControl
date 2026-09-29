import { fromIsraelLocal, toIsraelLocal } from "../dates";
import type { OrderStatus } from "./types";

export interface ReportOrder {
  id: number;
  createdAt: Date;
  deliveryDate: Date;
  deliveredAt: Date | null;
  status: OrderStatus;
  total: number;
  marketer: string | null;
  items: { product: string; quantity: number }[];
}

export const RANGES = {
  week: "7 ימים",
  month: "החודש",
  prev: "החודש שעבר",
  quarter: "90 יום",
} as const;
export type RangeKey = keyof typeof RANGES;

/** A delivery counts as on time up to this many minutes after the promised time. */
export const ON_TIME_GRACE_MINUTES = 15;

const DAY = 864e5;

/** Israel calendar date shifted by whole days, as YYYY-MM-DD. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const midnight = (date: string) => fromIsraelLocal(date, "00:00")!;

export function rangeFor(key: RangeKey, now: Date): { from: Date; to: Date } {
  const today = toIsraelLocal(now).date;
  const monthStart = today.slice(0, 8) + "01";
  if (key === "month") return { from: midnight(monthStart), to: now };
  if (key === "prev") {
    const [y, m] = monthStart.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    return { from: midnight(prev), to: midnight(monthStart) };
  }
  return { from: new Date(now.getTime() - (key === "week" ? 7 : 90) * DAY), to: now };
}

/** Start of each of the last `count` weeks (Sunday 00:00 Israel time), oldest first. */
export function weekStarts(now: Date, count: number): Date[] {
  const today = toIsraelLocal(now).date;
  const [y, m, d] = today.split("-").map(Number);
  const sunday = shiftDate(today, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
  return Array.from({ length: count }, (_, i) => midnight(shiftDate(sunday, -7 * (count - 1 - i))));
}

export interface Report {
  orders: number;
  revenue: number;
  average: number;
  cancelled: number;
  delivered: number;
  onTime: number;
  onTimeRate: number | null;
  products: { product: string; quantity: number }[];
  marketers: { marketer: string; orders: number; revenue: number }[];
  weeks: { start: Date; revenue: number; orders: number }[];
}

export function buildReport(all: ReportOrder[], range: { from: Date; to: Date }, now: Date, weekCount = 12): Report {
  const inRange = (d: Date | null) => !!d && d >= range.from && d < range.to;
  const created = all.filter((o) => inRange(o.createdAt));
  const live = created.filter((o) => o.status !== "cancelled" && o.status !== "draft");
  const revenue = live.reduce((s, o) => s + o.total, 0);

  const delivered = all.filter((o) => o.status === "delivered" && inRange(o.deliveredAt));
  const onTime = delivered.filter((o) => o.deliveredAt!.getTime() <= o.deliveryDate.getTime() + ON_TIME_GRACE_MINUTES * 60_000).length;

  const byProduct = new Map<string, number>();
  const byMarketer = new Map<string, { orders: number; revenue: number }>();
  for (const o of live) {
    for (const i of o.items) byProduct.set(i.product, (byProduct.get(i.product) ?? 0) + i.quantity);
    const k = o.marketer ?? "ללא משווק";
    const m = byMarketer.get(k) ?? { orders: 0, revenue: 0 };
    m.orders += 1;
    m.revenue += o.total;
    byMarketer.set(k, m);
  }

  const starts = weekStarts(now, weekCount);
  const weeks = starts.map((start, i) => {
    const end = starts[i + 1] ?? new Date(Math.max(now.getTime(), start.getTime()) + 1);
    const list = all.filter((o) => o.createdAt >= start && o.createdAt < end && o.status !== "cancelled" && o.status !== "draft");
    return { start, orders: list.length, revenue: list.reduce((s, o) => s + o.total, 0) };
  });

  return {
    orders: live.length,
    revenue,
    average: live.length ? revenue / live.length : 0,
    cancelled: created.length - live.length,
    delivered: delivered.length,
    onTime,
    onTimeRate: delivered.length ? onTime / delivered.length : null,
    products: [...byProduct].map(([product, quantity]) => ({ product, quantity })).sort((a, b) => b.quantity - a.quantity),
    marketers: [...byMarketer].map(([marketer, v]) => ({ marketer, ...v })).sort((a, b) => b.revenue - a.revenue),
    weeks,
  };
}
