import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { loadActiveOrders, loadReportOrders } from "@/lib/data";
import { buildReport, ON_TIME_GRACE_MINUTES, RANGES, rangeFor, weekStarts, type RangeKey } from "@/lib/domain/report";
import { STATUS } from "@/lib/status";
import { fmt, money } from "@/lib/format";
import { Card, PageTitle, Pill, Tabs } from "@/components/ui";
import type { OrderStatus } from "@/lib/domain/types";

const WEEKS = 12;
const ACTIVE: OrderStatus[] = ["pending_approval", "in_production", "ready_for_delivery", "in_transit"];
const shortDate = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "seePrices")) redirect("/");
  const { range: raw } = await searchParams;
  const key: RangeKey = typeof raw === "string" && raw in RANGES ? (raw as RangeKey) : "month";
  const now = new Date();
  const range = rangeFor(key, now);
  const firstWeek = weekStarts(now, WEEKS)[0];
  const [orders, active] = await Promise.all([
    loadReportOrders(range.from < firstWeek ? range.from : firstWeek),
    loadActiveOrders(),
  ]);
  const r = buildReport(orders, range, now, WEEKS);
  const peak = Math.max(1, ...r.weeks.map((w) => w.revenue));
  const admin = staff.roles.includes("admin");

  const kpis = [
    { label: "הזמנות", value: fmt(r.orders), sub: r.cancelled ? `ועוד ${fmt(r.cancelled)} שבוטלו` : "" },
    { label: "מכירות לפני מע״מ", value: money(r.revenue), sub: "" },
    { label: "ממוצע להזמנה", value: money(r.average), sub: "" },
    {
      label: "נמסרו בזמן",
      value: r.onTimeRate === null ? "–" : `${Math.round(r.onTimeRate * 100)}%`,
      sub: `${fmt(r.onTime)} מתוך ${fmt(r.delivered)} שנמסרו`,
    },
  ];

  return (
    <>
      <PageTitle sub={admin ? "כל ההזמנות במפעל" : "ההזמנות שלך"}>דוחות</PageTitle>
      <Tabs current={key} items={(Object.keys(RANGES) as RangeKey[]).map((k) => ({ key: k, label: RANGES[k], href: `/reports?range=${k}` }))} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <div className="text-sm text-muted">{k.label}</div>
            <div className="font-display text-2xl tabular-nums md:text-3xl">{k.value}</div>
            {k.sub && <div className="text-xs text-muted">{k.sub}</div>}
          </Card>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted">מכירות לפי תאריך קבלת ההזמנה. ״בזמן״ = נמסרה עד {ON_TIME_GRACE_MINUTES} דקות אחרי המועד שהובטח.</p>

      <Card title={`מכירות לפי שבוע (${WEEKS} שבועות אחרונים)`}>
        <div dir="ltr" className="flex h-44 items-end gap-1.5" role="img" aria-label="גרף מכירות שבועי">
          {r.weeks.map((w) => (
            <div key={w.start.toISOString()} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-t bg-accent/80"
                style={{ height: `${(w.revenue / peak) * 100}%`, minHeight: w.revenue ? 4 : 0 }}
                title={`${shortDate.format(w.start)}: ${money(w.revenue)} · ${w.orders} הזמנות`}
              />
            </div>
          ))}
        </div>
        <div dir="ltr" className="mt-1 flex gap-1.5 text-[10px] text-muted">
          {r.weeks.map((w) => <span key={w.start.toISOString()} className="min-w-0 flex-1 truncate text-center">{shortDate.format(w.start)}</span>)}
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="מוצרים מובילים">
          {r.products.length === 0 ? (
            <p className="text-muted">אין הזמנות בתקופה.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {r.products.slice(0, 8).map((p) => (
                <li key={p.product}>
                  <div className="flex justify-between gap-2 text-sm"><span>{p.product}</span><b className="tabular-nums">{fmt(p.quantity)}</b></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full bg-gold" style={{ width: `${(p.quantity / r.products[0].quantity) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="הזמנות פתוחות לפי שלב">
          <ul className="flex flex-col gap-2">
            {ACTIVE.map((s) => (
              <li key={s} className="flex items-center justify-between">
                <Pill tone={STATUS[s].tone}>{STATUS[s].label}</Pill>
                <b className="tabular-nums">{fmt(active.filter((o) => o.status === s).length)}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {admin && (
        <Card title="לפי משווק" className="overflow-x-auto">
          {r.marketers.length === 0 ? (
            <p className="text-muted">אין הזמנות בתקופה.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted">
                <tr><th className="py-2 text-start">משווק</th><th className="py-2 text-start">הזמנות</th><th className="py-2 text-start">מכירות</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.marketers.map((m) => (
                  <tr key={m.marketer}>
                    <td className="py-2">{m.marketer}</td>
                    <td className="py-2 tabular-nums">{fmt(m.orders)}</td>
                    <td className="py-2 tabular-nums">{money(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}
