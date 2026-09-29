import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { loadActiveOrders, loadMaterials, loadProducts, loadRecentMarks, loadSettings } from "@/lib/data";
import { buildBatches, capacity, israelDay } from "@/lib/domain/schedule";
import { moveBatch, resetDayOrder, undoProduction } from "@/lib/actions/production";
import { AutoRefresh } from "@/components/auto-refresh";
import { btnSecondary, Card, PageTitle } from "@/components/ui";
import { dayLabel, duration, fmt, when } from "@/lib/format";
import { BatchCard, type BatchView } from "./batch-card";

const time = (d: Date) => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function BoardPage() {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "markProduced") && !can(staff.roles, "reorderBoard")) redirect("/");
  const canMark = can(staff.roles, "markProduced");
  const canReorder = can(staff.roles, "reorderBoard");
  const isManager = staff.roles.includes("admin") || staff.roles.includes("production_manager");

  const supabase = await createClient();
  const [orders, products, settings, materials, { data: ranks }, recent] = await Promise.all([
    loadActiveOrders(),
    loadProducts(),
    loadSettings(),
    loadMaterials(),
    supabase.from("batch_ranks").select("product_id, batch_day, rank"),
    loadRecentMarks(),
  ]);

  const red = materials.filter((m) => m.color === "red");
  const redById = new Map(red.map((m) => [m.id, m.name]));
  const manual = Object.fromEntries((ranks ?? []).map((r) => [`${r.product_id}|${r.batch_day}`, r.rank]));
  const now = new Date();
  const today = israelDay(now);
  const batches = buildBatches(orders, products, settings, new Set(redById.keys()), manual);
  const cap = capacity(batches, settings, today);
  const barTone = cap.level === "over" ? "bg-bad" : cap.level === "high" ? "bg-warn" : "bg-ok";

  const days = new Map<string, typeof batches>();
  for (const b of batches) {
    const group = b.day < today ? "overdue" : b.day;
    days.set(group, [...(days.get(group) ?? []), b]);
  }

  const view = (b: (typeof batches)[number]): BatchView => ({
    key: b.key,
    productId: b.product.id,
    productName: b.product.name,
    day: b.day,
    remaining: b.remaining,
    workMinutes: b.workMinutes,
    latestStart: b.latestStart.toISOString(),
    latestStartLabel: b.latestStart.getTime() - now.getTime() > 864e5 || israelDay(b.latestStart) !== today ? when(b.latestStart, now) : time(b.latestStart),
    startLate: b.latestStart < now,
    urgent: b.urgent,
    shortMaterials: [...new Set(b.product.recipe.map((r) => redById.get(r.rawMaterialId)).filter((n): n is string => !!n))],
    entries: b.entries.map((e) => ({
      orderId: e.order.id,
      customer: e.order.customerName,
      remaining: e.remaining,
      deliveryLabel: time(e.order.deliveryDate),
      urgent: e.order.isUrgent,
    })),
  });

  return (
    <>
      <AutoRefresh />
      <PageTitle sub="באצ׳ים לפי מוצר ויום אספקה. סימון כמות שיוצרה מתחלק אוטומטית בין ההזמנות: קודם מועד האספקה, אחר כך דחוף, ואחר כך מי שהזמין קודם.">
        לוח ייצור
      </PageTitle>

      <Card title="עומס להיום">
        <div className="h-3 overflow-hidden rounded-full bg-sunken">
          <div className={`h-full ${barTone}`} style={{ width: `${Math.min(100, cap.ratio * 100)}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {duration(cap.loadMinutes)} עבודה (כולל באיחור) מתוך {duration(cap.capacityMinutes)} במשמרת
          {cap.level === "over" && <b className="text-bad"> · חורג מהקיבולת</b>}
        </p>
      </Card>

      {recent.length > 0 && (
        <Card title="סימונים אחרונים (אפשר לבטל תוך 10 דקות)">
          <ul className="divide-y divide-line">
            {recent.map((l) => {
              const mine = l.performedBy === staff.id;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                  <b>{l.productName}</b>
                  <span className="tabular-nums">× {fmt(l.quantity)}</span>
                  <span className="text-sm text-muted">
                    {time(l.at)} · {l.performerName}
                  </span>
                  {(mine || isManager) && (
                    <form action={undoProduction} className="ms-auto">
                      <input type="hidden" name="log_id" value={l.id} />
                      <button className={btnSecondary + " min-h-9 px-3 text-sm"}>ביטול</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {batches.length === 0 && (
        <Card>
          <p className="text-muted">אין מה לייצר כרגע. הזמנות חדשות יופיעו כאן אוטומטית.</p>
        </Card>
      )}

      {[...days.entries()].map(([group, list]) => {
        const keys = list.map((b) => b.key).join(",");
        const hasManual = list.some((b) => b.manualRank !== undefined);
        return (
          <section key={group} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h2 className={`font-display text-xl ${group === "overdue" ? "text-bad" : "text-accent"}`}>
                {group === "overdue" ? "באיחור" : dayLabel(list[0].earliestDelivery, now)}
              </h2>
              <span className="text-sm text-muted">{fmt(list.length)} באצ׳ים · {duration(list.reduce((s, b) => s + b.workMinutes, 0))}</span>
              {canReorder && hasManual && group !== "overdue" && (
                <form action={resetDayOrder} className="ms-auto">
                  <input type="hidden" name="day" value={group} />
                  <button className="text-sm text-accent underline">חזרה לסדר האוטומטי</button>
                </form>
              )}
            </div>
            {list.map((b, i) => (
              <BatchCard
                key={`${b.key}-${b.remaining}`}
                b={view(b)}
                canMark={canMark}
                reorder={
                  canReorder && group !== "overdue" ? (
                    <div className="flex gap-1">
                      {(["up", "down"] as const).map((dir) => (
                        <form key={dir} action={moveBatch}>
                          <input type="hidden" name="order" value={keys} />
                          <input type="hidden" name="key" value={b.key} />
                          <input type="hidden" name="dir" value={dir} />
                          <button
                            className={btnSecondary + " min-h-9 px-2.5"}
                            disabled={dir === "up" ? i === 0 : i === list.length - 1}
                            aria-label={dir === "up" ? "להעלות" : "להוריד"}
                          >
                            {dir === "up" ? "▲" : "▼"}
                          </button>
                        </form>
                      ))}
                    </div>
                  ) : undefined
                }
              />
            ))}
          </section>
        );
      })}
    </>
  );
}
