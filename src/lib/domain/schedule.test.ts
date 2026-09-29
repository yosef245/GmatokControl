import { describe, expect, it } from "vitest";
import { allocate, buildBatches, capacity, israelDay, slaState } from "./schedule";
import { inventoryFigures } from "./inventory";
import type { Order, Product, ShiftSettings } from "./types";

const settings: ShiftSettings = { shiftWorkers: 3, shiftHours: 8, deliveryMinutes: 45 };
const pral: Product = { id: "pral", name: "פרלינים", estimatedProductionMinutes: 14, recipe: [{ rawMaterialId: "box", quantityPerUnit: 1 }] };
const cookie: Product = { id: "cookie", name: "עוגיות", estimatedProductionMinutes: 6, recipe: [{ rawMaterialId: "flour", quantityPerUnit: 0.2 }] };
const products = new Map([pral, cookie].map((p) => [p.id, p]));

// 2026-09-30 in Israel (UTC+3)
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 30, h - 3, m));
function order(id: number, h: number, opts: Partial<Order> = {}, items = [{ id: `i${id}`, productId: "pral", quantity: 10, producedQuantity: 0 }]): Order {
  return { id, customerName: `c${id}`, deliveryDate: at(h), isUrgent: false, status: "pending_approval", createdAt: at(0, id), items, ...opts };
}

describe("buildBatches", () => {
  it("merges the same product for the same day across orders", () => {
    const bs = buildBatches([order(1, 12), order(2, 9), order(3, 16)], products, settings);
    expect(bs).toHaveLength(1);
    expect(bs[0].remaining).toBe(30);
    expect(bs[0].entries.map((e) => e.order.id)).toEqual([2, 1, 3]);
    expect(israelDay(bs[0].earliestDelivery)).toBe("2026-09-30");
  });

  it("skips finished lines and closed orders", () => {
    const done = order(1, 12, {}, [{ id: "a", productId: "pral", quantity: 5, producedQuantity: 5 }]);
    const shipped = order(2, 12, { status: "in_transit" });
    expect(buildBatches([done, shipped], products, settings)).toHaveLength(0);
  });

  it("sorts urgent first and short materials last, and respects manual rank", () => {
    const orders = [
      order(1, 9, {}, [{ id: "a", productId: "cookie", quantity: 10, producedQuantity: 0 }]),
      order(2, 16, { isUrgent: true }),
    ];
    expect(buildBatches(orders, products, settings).map((b) => b.product.id)).toEqual(["pral", "cookie"]);
    expect(buildBatches(orders, products, settings, new Set(["box"])).map((b) => b.product.id)).toEqual(["cookie", "pral"]);
    const ranks = { "cookie|2026-09-30": 0 };
    expect(buildBatches(orders, products, settings, new Set(), ranks).map((b) => b.product.id)).toEqual(["cookie", "pral"]);
  });

  it("computes the latest start time backwards from delivery", () => {
    const [b] = buildBatches([order(1, 12)], products, settings);
    // 10 units × 14 min / 3 workers ≈ 46.7 min, plus 45 min delivery
    expect(b.latestStart.getTime()).toBe(at(12).getTime() - (45 + 140 / 3) * 60_000);
  });
});

describe("allocate", () => {
  it("fills the earliest delivery first, then urgent, then earlier close time", () => {
    const orders = [order(1, 12), order(2, 12, { isUrgent: true }), order(3, 9)];
    const [b] = buildBatches(orders, products, settings);
    expect(allocate(b, 25)).toEqual([
      { orderId: 3, itemId: "i3", quantity: 10 },
      { orderId: 2, itemId: "i2", quantity: 10 },
      { orderId: 1, itemId: "i1", quantity: 5 },
    ]);
  });

  it("never allocates more than the batch needs", () => {
    const [b] = buildBatches([order(1, 12)], products, settings);
    expect(allocate(b, 99).reduce((s, a) => s + a.quantity, 0)).toBe(10);
  });
});

describe("slaState and capacity", () => {
  it("flags late and at-risk orders", () => {
    expect(slaState(order(1, 12), products, settings, at(12, 30))).toBe("late");
    expect(slaState(order(1, 12), products, settings, at(10, 40))).toBe("at_risk");
    expect(slaState(order(1, 12), products, settings, at(8))).toBe("ok");
  });

  it("measures today's load against the shift", () => {
    const bs = buildBatches([order(1, 12)], products, settings);
    const c = capacity(bs, settings, "2026-09-30");
    expect(c.loadMinutes).toBe(140);
    expect(c.capacityMinutes).toBe(1440);
    expect(c.level).toBe("ok");
  });
});

describe("inventoryFigures", () => {
  it("matches the SRD colour and to-order rules", () => {
    expect(inventoryFigures(10, 12, 3)).toMatchObject({ available: -2, color: "red", toOrder: 5 });
    expect(inventoryFigures(10, 8, 3)).toMatchObject({ available: 2, color: "orange", toOrder: 1 });
    expect(inventoryFigures(10, 2, 3)).toMatchObject({ available: 8, color: "green", toOrder: 0 });
  });
});
