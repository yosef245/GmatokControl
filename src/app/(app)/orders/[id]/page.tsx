import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { loadOrder } from "@/lib/order-detail";
import { orderWhatsApp } from "@/lib/confirmation";
import { toIsraelLocal } from "@/lib/dates";
import { cancelOrder, updateOrder } from "@/lib/actions/orders";
import { ActionForm } from "@/components/action-form";
import { btnDanger, btnPrimary, btnSecondary, Card, Field, inputCls, PageTitle, Pill } from "@/components/ui";
import { STATUS } from "@/lib/status";
import { duration, fmt, money, when } from "@/lib/format";

const ACTIONS: Record<string, string> = {
  created: "ההזמנה נוצרה",
  updated: "ההזמנה עודכנה",
  cancelled: "ההזמנה בוטלה",
  status_change: "הסטטוס השתנה",
};

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const staff = (await getStaff())!;
  const { id } = await params;
  const { created } = await searchParams;
  const o = await loadOrder(Number(id));
  if (!o) notFound();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("business_name, vat_percent").single();
  const vatPercent = Number(settings?.vat_percent ?? 18);
  const prices = can(staff.roles, "seePrices");
  const editable = can(staff.roles, "editOrder") && ["draft", "pending_approval", "in_production", "ready_for_delivery"].includes(o.status);
  const wa = prices ? orderWhatsApp(o, settings?.business_name ?? "", vatPercent, true) : null;
  const st = STATUS[o.status];
  const local = toIsraelLocal(o.deliveryDate);
  const remaining = o.items.reduce((s, i) => s + Math.max(0, i.quantity - i.produced) * i.minutes, 0);

  return (
    <>
      <div>
        <Link href="/orders" className="text-sm text-accent underline">חזרה להזמנות</Link>
        <div className="flex flex-wrap items-center gap-3">
          <PageTitle>הזמנה #{o.id}</PageTitle>
          <Pill tone={st.tone}>{st.label}</Pill>
          {o.isUrgent && <Pill tone="orange">דחוף</Pill>}
        </div>
      </div>

      {created && (
        <div className="rounded-xl border border-ok/40 bg-ok-bg p-4">
          <b className="text-ok">ההזמנה נוצרה ונכנסה לתור הייצור.</b>
          <p className="mt-1 text-sm">עכשיו אפשר לשלוח ללקוח אישור בוואטסאפ, ולהדפיס או לשמור אישור כ־PDF.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {wa && <a href={wa} target="_blank" rel="noopener" className={btnPrimary}>שליחת אישור בוואטסאפ</a>}
        {prices && !wa && <span className="text-sm text-muted">מספר הטלפון של הלקוח לא מתאים לוואטסאפ.</span>}
        <Link href={`/print/orders/${o.id}`} target="_blank" className={btnSecondary}>אישור הזמנה להדפסה / PDF</Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="לקוח ואספקה">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted">לקוח</dt>
            <dd>
              {can(staff.roles, "manageCustomers") ? <Link href={`/customers/${o.customer.id}`} className="font-bold text-accent underline">{o.customer.name}</Link> : <b>{o.customer.name}</b>}
              {o.customer.contactName && <span className="text-muted"> · {o.customer.contactName}</span>}
            </dd>
            <dt className="text-muted">טלפון</dt>
            <dd><a href={`tel:${o.customer.phone}`} dir="ltr" className="underline">{o.customer.phone}</a></dd>
            <dt className="text-muted">אספקה</dt>
            <dd className="font-bold">{when(o.deliveryDate)}</dd>
            <dt className="text-muted">כתובת</dt>
            <dd>{o.address ? `${o.address.address}, ${o.address.city}` : "איסוף עצמי"}{o.address?.deliveryNotes && <div className="text-sm text-muted">{o.address.deliveryNotes}</div>}</dd>
            {o.marketer && (<><dt className="text-muted">משווק</dt><dd>{o.marketer}</dd></>)}
            {o.notes && (<><dt className="text-muted">הערות</dt><dd className="whitespace-pre-line">{o.notes}</dd></>)}
          </dl>
        </Card>

        <Card title="היסטוריה">
          <ol className="flex flex-col gap-2 border-s-2 border-line ps-4">
            {o.history.map((h, i) => (
              <li key={i}>
                <b>{ACTIONS[h.action] ?? h.action}</b>
                {h.action === "cancelled" && typeof h.details?.reason === "string" && <span>: {h.details.reason}</span>}
                {h.action === "status_change" && typeof h.details?.to === "string" && <span>: {STATUS[h.details.to as keyof typeof STATUS]?.label ?? h.details.to}</span>}
                <div className="text-sm text-muted">{when(h.at)}{h.by && ` · ${h.by}`}</div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="מוצרים">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 text-start">מוצר</th>
                <th className="py-2 text-start">כמות</th>
                <th className="py-2 text-start">יוצר</th>
                {prices && <th className="py-2 text-start">מחיר ליח׳</th>}
                {prices && <th className="py-2 text-start">סה״כ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {o.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2.5">
                    <b>{i.productName}</b>
                    {i.notes && <div className="text-muted">{i.notes}</div>}
                  </td>
                  <td className="py-2.5 tabular-nums">{fmt(i.quantity)}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-sunken">
                        <div className={`h-full ${i.produced >= i.quantity ? "bg-ok" : "bg-info"}`} style={{ width: `${Math.min(100, (i.produced / i.quantity) * 100)}%` }} />
                      </div>
                      <span className="tabular-nums">{fmt(i.produced)}</span>
                    </div>
                  </td>
                  {prices && <td className="py-2.5 tabular-nums">{money(i.unitPrice)}</td>}
                  {prices && <td className="py-2.5 tabular-nums">{money(i.unitPrice * i.quantity)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {remaining > 0 && <span className="text-sm text-muted">נשארו כ־{duration(remaining)} עבודה</span>}
          {prices && (
            <dl className="ms-auto grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted">לפני מע״מ</dt><dd className="text-end tabular-nums">{money(o.total)}</dd>
              <dt className="text-muted">מע״מ {vatPercent}%</dt><dd className="text-end tabular-nums">{money((o.total * vatPercent) / 100)}</dd>
              <dt className="font-bold">סה״כ</dt><dd className="text-end font-bold tabular-nums">{money(o.total * (1 + vatPercent / 100))}</dd>
            </dl>
          )}
        </div>
      </Card>

      {editable && (
        <Card title="עריכה">
          <details>
            <summary className="cursor-pointer font-bold text-accent">שינוי מועד, כתובת או הערות</summary>
            <ActionForm action={updateOrder} className="mt-3 grid gap-4 md:grid-cols-3">
              <input type="hidden" name="id" value={o.id} />
              <Field label="תאריך"><input type="date" name="delivery_date" defaultValue={local.date} className={inputCls} required /></Field>
              <Field label="שעה"><input type="time" name="delivery_time" defaultValue={local.time} step="900" className={inputCls} required /></Field>
              <label className="flex items-center gap-2 self-end pb-3 font-bold">
                <input type="checkbox" name="is_urgent" defaultChecked={o.isUrgent} className="size-5 accent-accent" /> דחוף
              </label>
              <Field label="כתובת" className="md:col-span-3">
                <select name="address_id" defaultValue={o.addressId ?? ""} className={inputCls}>
                  <option value="">איסוף עצמי / ללא כתובת</option>
                  {o.addresses.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
              <Field label="הערות" className="md:col-span-3"><textarea name="notes" defaultValue={o.notes ?? ""} rows={2} className={inputCls + " py-2"} /></Field>
              <div className="md:col-span-3"><button className={btnPrimary}>שמירה</button></div>
            </ActionForm>
          </details>
          <details className="mt-4 border-t border-line pt-4">
            <summary className="cursor-pointer font-bold text-bad">ביטול ההזמנה</summary>
            <ActionForm action={cancelOrder} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={o.id} />
              <Field label="סיבת הביטול" className="min-w-60 flex-1"><input name="reason" className={inputCls} required /></Field>
              <button className={btnDanger}>ביטול ההזמנה</button>
            </ActionForm>
          </details>
        </Card>
      )}
    </>
  );
}
