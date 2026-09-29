import { describe, expect, it } from "vitest";
import { buildReport, rangeFor, weekStarts, type ReportOrder } from "./report";

const now = new Date("2026-10-14T09:00:00Z"); // Wednesday 12:00 in Israel

const order = (o: Partial<ReportOrder>): ReportOrder => ({
  id: 1,
  createdAt: new Date("2026-10-05T08:00:00Z"),
  deliveryDate: new Date("2026-10-06T10:00:00Z"),
  deliveredAt: null,
  status: "pending_approval",
  total: 100,
  marketer: "דנה",
  items: [{ product: "פרלינים", quantity: 10 }],
  ...o,
});

describe("report ranges", () => {
  it("starts this month at Israel midnight", () => {
    expect(rangeFor("month", now).from.toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });
  it("covers the whole previous month", () => {
    const r = rangeFor("prev", now);
    expect(r.from.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });
  it("weeks start on Sunday, across the winter clock change", () => {
    const w = weekStarts(new Date("2026-11-04T09:00:00Z"), 3);
    expect(w.map((d) => d.toISOString())).toEqual([
      "2026-10-17T21:00:00.000Z",
      "2026-10-24T21:00:00.000Z",
      "2026-10-31T22:00:00.000Z",
    ]);
  });
});

describe("buildReport", () => {
  const orders = [
    order({ id: 1, total: 100, status: "delivered", deliveredAt: new Date("2026-10-06T10:10:00Z") }),
    order({ id: 2, total: 300, marketer: "אבי", status: "delivered", deliveredAt: new Date("2026-10-06T11:00:00Z"), items: [{ product: "מארז", quantity: 2 }] }),
    order({ id: 3, total: 50, status: "cancelled" }),
    order({ id: 4, total: 999, createdAt: new Date("2026-09-20T08:00:00Z") }),
  ];
  const r = buildReport(orders, rangeFor("month", now), now);

  it("counts orders and revenue in the range, without cancelled ones", () => {
    expect(r.orders).toBe(2);
    expect(r.revenue).toBe(400);
    expect(r.average).toBe(200);
    expect(r.cancelled).toBe(1);
  });
  it("measures on-time delivery with a short grace", () => {
    expect(r.delivered).toBe(2);
    expect(r.onTime).toBe(1);
    expect(r.onTimeRate).toBe(0.5);
  });
  it("ranks products and marketers", () => {
    expect(r.products[0]).toEqual({ product: "פרלינים", quantity: 10 });
    expect(r.marketers[0]).toEqual({ marketer: "אבי", orders: 1, revenue: 300 });
  });
  it("buckets weeks", () => {
    expect(r.weeks).toHaveLength(12);
    const week = r.weeks.find((w) => w.start.toISOString() === "2026-10-03T21:00:00.000Z")!;
    expect(week.revenue).toBe(400);
    expect(r.weeks.find((w) => w.start.toISOString() === "2026-09-19T21:00:00.000Z")!.revenue).toBe(999);
  });
});
