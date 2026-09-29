import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, Card, inputCls, PageTitle, Pill, Tabs } from "@/components/ui";
import { STATUS } from "@/lib/status";
import type { OrderStatus } from "@/lib/domain/types";
import { fmt, money, when } from "@/lib/format";

const VIEWS = {
  active: { label: "פתוחות", statuses: ["pending_approval", "in_production", "ready_for_delivery", "in_transit"] },
  ready: { label: "מוכנות למשלוח", statuses: ["ready_for_delivery"] },
  delivered: { label: "נמסרו", statuses: ["delivered"] },
  cancelled: { label: "בוטלו", statuses: ["cancelled"] },
  all: { label: "הכול", statuses: null },
} as const;
type View = keyof typeof VIEWS;

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "seeAllOrders") && !can(staff.roles, "createOrder")) redirect("/");
  const sp = await searchParams;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "active";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const prices = can(staff.roles, "seePrices");

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, status, delivery_date, is_urgent, total_amount, customers!inner(name), users!orders_marketer_id_fkey(full_name), order_items(quantity, produced_quantity)")
    .order("delivery_date", { ascending: view === "active" || view === "ready" })
    .limit(200);
  const statuses = VIEWS[view].statuses;
  if (statuses) query = query.in("status", [...statuses]);
  if (q) {
    if (/^\d+$/.test(q)) query = query.eq("id", Number(q));
    else query = query.ilike("customers.name", `%${q.replace(/[%,()]/g, " ")}%`);
  }
  const { data: orders, error } = await query;
  const now = new Date();

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle>הזמנות</PageTitle>
        {can(staff.roles, "createOrder") && <Link href="/orders/new" className={btnPrimary + " ms-auto"}>הזמנה חדשה</Link>}
      </div>
      <Tabs current={view} items={Object.entries(VIEWS).map(([k, v]) => ({ key: k, label: v.label, href: `/orders?view=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}` }))} />
      <form>
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={q} type="search" placeholder="חיפוש לפי שם לקוח או מספר הזמנה" className={inputCls} />
      </form>
      <Card className="p-0">
        {error && <p className="p-4 text-bad">טעינת ההזמנות נכשלה.</p>}
        {!error && (orders ?? []).length === 0 && <p className="p-4 text-muted">אין הזמנות להצגה.</p>}
        <ul className="divide-y divide-line">
          {(orders ?? []).map((o) => {
            const items = o.order_items as { quantity: number; produced_quantity: number }[];
            const total = items.reduce((s, i) => s + i.quantity, 0);
            const done = items.reduce((s, i) => s + i.produced_quantity, 0);
            const st = STATUS[o.status as OrderStatus];
            const d = new Date(o.delivery_date);
            const late = d < now && ["pending_approval", "in_production", "ready_for_delivery"].includes(o.status);
            return (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-sunken">
                  <b className="tabular-nums">#{o.id}</b>
                  <span className="min-w-0 flex-1 font-bold">{(o.customers as unknown as { name: string }).name}</span>
                  <span className={`text-sm ${late ? "font-bold text-bad" : "text-muted"}`}>{when(d, now)}</span>
                  <span className="text-sm tabular-nums text-muted" title="יוצרו מתוך הוזמנו">{fmt(done)}/{fmt(total)}</span>
                  {prices && <span className="text-sm tabular-nums">{money(Number(o.total_amount))}</span>}
                  <span className="flex gap-1.5">
                    {o.is_urgent && <Pill tone="orange">דחוף</Pill>}
                    {late && <Pill tone="red">באיחור</Pill>}
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
