import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { loadCouriers, loadDeliveries, type DeliveryRow } from "@/lib/deliveries";
import { fmt, when } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";
import { btnSecondary, Card, PageTitle, Pill } from "@/components/ui";
import { DeliveryActions } from "./delivery-actions";

type Courier = { id: string; name: string };

export default async function DeliveriesPage() {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageDeliveries")) redirect("/");
  const [rows, couriers] = await Promise.all([loadDeliveries(), loadCouriers()]);
  const now = new Date();
  const ready = rows.filter((r) => r.status === "ready_for_delivery");
  const transit = rows.filter((r) => r.status === "in_transit");
  const coming = rows.filter((r) => r.status === "pending_approval" || r.status === "in_production");
  const done = rows
    .filter((r) => r.status === "delivered")
    .sort((a, b) => (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0));

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageTitle sub="משבצים שליח להזמנה מוכנה, מסמנים יציאה, ובמסירה רושמים את שם המקבל.">משלוחים</PageTitle>
      <Section title="מוכנות למשלוח" list={ready} empty="אין הזמנות שמחכות למשלוח." now={now} couriers={couriers} />
      <Section title="בדרך" list={transit} empty="אין משלוחים בדרך." now={now} couriers={couriers} />
      <Section title="עוד בייצור, יוצאות עד מחר" list={coming} empty="אין הזמנות בייצור שיוצאות עד מחר." now={now} />
      <Section title="נמסרו ביומיים האחרונים" list={done} empty="לא נמסרו הזמנות ביומיים האחרונים." now={now} />
    </>
  );
}

function Row({ r, now, children }: { r: DeliveryRow; now: Date; children?: ReactNode }) {
  const late = r.status !== "delivered" && r.deliveryDate < now;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/orders/${r.id}`} className="font-bold text-accent underline">#{r.id}</Link>
          <b>{r.customerName}</b>
          {r.isUrgent && <Pill tone="orange">דחוף</Pill>}
          {late && <Pill tone="red">באיחור</Pill>}
          {!r.address && <Pill tone="neutral">איסוף עצמי</Pill>}
        </div>
        <div className="text-sm">
          <span className="font-bold">{when(r.deliveryDate, now)}</span>
          {r.address && <span> · {r.address}</span>}
          {r.customerPhone && <> · <a href={`tel:${r.customerPhone}`} dir="ltr" className="underline">{r.customerPhone}</a></>}
        </div>
        {r.deliveryNotes && <div className="text-sm text-muted">{r.deliveryNotes}</div>}
        <div className="text-sm text-muted">
          {fmt(r.units)} יחידות
          {r.courier && <> · שליח: <b className="text-fg">{r.courier}</b></>}
          {r.departedAt && r.status === "in_transit" && <> · יצא {when(r.departedAt, now)}</>}
          {r.deliveredAt && <> · נמסר {when(r.deliveredAt, now)}{r.receiver && ` ל${r.receiver}`}</>}
        </div>
      </div>
      {children && <div className="md:w-[380px]">{children}</div>}
    </li>
  );
}

function Section({ title, list, empty, now, couriers }: { title: string; list: DeliveryRow[]; empty: string; now: Date; couriers?: Courier[] }) {
  return (
    <Card title={`${title} (${fmt(list.length)})`} className="p-0 [&>h2]:px-4 [&>h2]:pt-4">
      {list.length === 0 ? (
        <p className="px-4 pb-4 text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((r) => (
            <Row key={r.id} r={r} now={now}>
              {couriers && (
                <>
                  <DeliveryActions id={r.id} status={r.status} courier={r.courier} pickup={!r.address} couriers={couriers} />
                  <Link href={`/print/orders/${r.id}?doc=delivery`} target="_blank" className={btnSecondary + " mt-2 min-h-9 px-3 text-sm"}>
                    תעודת משלוח
                  </Link>
                </>
              )}
            </Row>
          ))}
        </ul>
      )}
    </Card>
  );
}

