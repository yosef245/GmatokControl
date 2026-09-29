import Link from "next/link";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { loadActiveOrders, loadMaterials, loadProducts, loadSettings } from "@/lib/data";
import { buildBatches, capacity, israelDay, slaState } from "@/lib/domain/schedule";
import { STATUS } from "@/lib/status";
import { duration, fmt, when } from "@/lib/format";
import { Card, PageTitle, Pill } from "@/components/ui";


export default async function HomePage() {
  const staff = (await getStaff())!;
  const [orders, products, settings, materials] = await Promise.all([
    loadActiveOrders(),
    loadProducts(),
    loadSettings(),
    can(staff.roles, "manageStock") || can(staff.roles, "reorderBoard") ? loadMaterials() : Promise.resolve([]),
  ]);
  const now = new Date();
  const today = israelDay(now);
  const tomorrow = israelDay(new Date(now.getTime() + 864e5));

  const red = materials.filter((m) => m.color === "red");
  const low = materials.filter((m) => m.color === "orange");
  const shortIds = new Set(red.map((m) => m.id));
  const batches = buildBatches(orders, products, settings, shortIds);
  const cap = capacity(batches, settings, today);
  const risk = orders.map((o) => ({ o, sla: slaState(o, products, settings, now) }));
  const late = risk.filter((r) => r.sla === "late");
  const atRisk = risk.filter((r) => r.sla === "at_risk");
  const open = orders.filter((o) => o.status === "pending_approval" || o.status === "in_production");
  const ready = orders.filter((o) => o.status === "ready_for_delivery");
  const soon = risk.filter(({ o }) => israelDay(o.deliveryDate) <= tomorrow);
  const shortOrders = new Set(
    batches.filter((b) => b.short).flatMap((b) => b.entries.map((e) => e.order.id)),
  );

  const kpis: { label: string; value: number; tone: string }[] = [
    { label: "הזמנות פתוחות", value: open.length, tone: "text-fg" },
    { label: "באיחור או בסיכון", value: late.length + atRisk.length, tone: late.length + atRisk.length ? "text-bad" : "text-ok" },
    ...(materials.length ? [{ label: "חומרים באדום", value: red.length, tone: red.length ? "text-bad" : "text-ok" }] : []),
    { label: "מוכנות למשלוח", value: ready.length, tone: "text-ok" },
  ];
  const barTone = cap.level === "over" ? "bg-bad" : cap.level === "high" ? "bg-warn" : "bg-ok";

  return (
    <>
      <PageTitle sub={`שלום ${staff.fullName}`}>מבט על</PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <div className="text-sm text-muted">{k.label}</div>
            <div className={`font-display text-3xl ${k.tone}`}>{fmt(k.value)}</div>
          </Card>
        ))}
      </div>

      {can(staff.roles, "markProduced") && (
        <Card title="עומס ייצור להיום">
          <div className="h-3 overflow-hidden rounded-full bg-sunken">
            <div className={`h-full ${barTone}`} style={{ width: `${Math.min(100, cap.ratio * 100)}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {duration(cap.loadMinutes)} עבודה מתוך {duration(cap.capacityMinutes)} במשמרת ({settings.shiftWorkers} עובדים)
            {cap.level === "over" && <b className="text-bad"> · חורג מהקיבולת</b>}
          </p>
        </Card>
      )}

      {(late.length > 0 || atRisk.length > 0 || red.length > 0 || low.length > 0) && (
        <Card title="התראות">
          <ul className="flex flex-col gap-2">
            {late.map(({ o }) => (
              <li key={`l${o.id}`} className="flex flex-wrap items-center gap-2">
                <Pill tone="red">באיחור</Pill> הזמנה {o.id} · {o.customerName} · הייתה אמורה לצאת {when(o.deliveryDate, now)}
              </li>
            ))}
            {atRisk.map(({ o }) => (
              <li key={`r${o.id}`} className="flex flex-wrap items-center gap-2">
                <Pill tone="orange">בסיכון</Pill> הזמנה {o.id} · {o.customerName} · העבודה שנשארה לא נכנסת עד {when(o.deliveryDate, now)}
              </li>
            ))}
            {red.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <Pill tone="red">חוסר</Pill> {m.name}: חסרים {fmt(m.toOrder)} {m.unit}
                {m.supplierName && <span className="text-muted">· ספק {m.supplierName}</span>}
              </li>
            ))}
            {low.length > 0 && (
              <li className="flex flex-wrap items-center gap-2">
                <Pill tone="orange">מלאי נמוך</Pill> {low.map((m) => m.name).join(", ")}
                <Link href="/inventory" className="text-sm font-bold text-accent underline">להזמנה מספקים</Link>
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card title="יוצאות היום ומחר">
        {soon.length === 0 ? (
          <p className="text-muted">אין הזמנות ליום הזה.</p>
        ) : (
          <ul className="divide-y divide-line">
            {soon.map(({ o, sla }) => {
              const total = o.items.reduce((s, i) => s + i.quantity, 0);
              const done = o.items.reduce((s, i) => s + i.producedQuantity, 0);
              const { label, tone } = STATUS[o.status];
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <b className="tabular-nums">#{o.id}</b>
                  <span className="min-w-0 flex-1">{o.customerName}</span>
                  <span className="text-sm text-muted">{when(o.deliveryDate, now)}</span>
                  <span className="text-sm tabular-nums text-muted">
                    {fmt(done)}/{fmt(total)}
                  </span>
                  {o.isUrgent && <Pill tone="orange">דחוף</Pill>}
                  {shortOrders.has(o.id) && <Pill tone="red">חסר חומר</Pill>}
                  {sla === "late" && <Pill tone="red">באיחור</Pill>}
                  <Pill tone={tone}>{label}</Pill>
                </li>
              );
            })}
          </ul>
        )}
        {materials.length > 0 && (
          <p className="mt-3 text-sm">
            <Link href="/inventory" className="font-bold text-accent underline underline-offset-4">
              למלאי המלא
            </Link>
          </p>
        )}
      </Card>
    </>
  );
}
