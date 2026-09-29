import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { addAddress, removeAddress, saveCustomer, setDefaultAddress } from "@/lib/actions/customers";
import { ActionForm } from "@/components/action-form";
import { CustomerFields } from "@/components/customer-fields";
import { btnDanger, btnPrimary, btnSecondary, Card, Field, inputCls, PageTitle, Pill } from "@/components/ui";
import { STATUS } from "@/lib/status";
import type { OrderStatus } from "@/lib/domain/types";
import { money, when } from "@/lib/format";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageCustomers")) redirect("/");
  const { id } = await params;
  const isAdmin = staff.roles.includes("admin");
  const supabase = await createClient();
  const [{ data: c }, { data: orders }, { data: marketers }] = await Promise.all([
    supabase.from("customers").select("*, customer_addresses(*)").eq("id", id).maybeSingle(),
    supabase.from("orders").select("id, delivery_date, status, total_amount").eq("customer_id", id).order("delivery_date", { ascending: false }).limit(30),
    isAdmin
      ? supabase.from("users").select("id, full_name").contains("roles", ["marketer"]).order("full_name")
      : Promise.resolve({ data: undefined }),
  ]);
  if (!c) notFound();
  const canEdit = isAdmin || c.assigned_marketer_id === staff.id;
  const addresses = (c.customer_addresses as { id: string; address: string; city: string; delivery_notes: string | null; is_default: boolean }[])
    .sort((a, b) => Number(b.is_default) - Number(a.is_default));

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Link href="/customers" className="text-sm text-accent underline">חזרה ללקוחות</Link>
          <PageTitle>{c.name}</PageTitle>
        </div>
        <Link href={`/orders/new?customer=${c.id}`} className={btnPrimary + " ms-auto"}>הזמנה חדשה ללקוח</Link>
      </div>

      <Card title="פרטים">
        <ActionForm action={saveCustomer} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={c.id} />
          <CustomerFields c={c} marketers={marketers ?? undefined} />
          {canEdit && <div className="md:col-span-2"><button className={btnPrimary}>שמירה</button></div>}
        </ActionForm>
      </Card>

      <Card title="כתובות למשלוח">
        {addresses.length === 0 && <p className="mb-3 text-muted">עוד אין כתובת.</p>}
        <ul className="mb-4 divide-y divide-line">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="font-bold">{a.address}, {a.city}</span>
              {a.delivery_notes && <span className="text-sm text-muted">{a.delivery_notes}</span>}
              {a.is_default && <Pill tone="green">ברירת מחדל</Pill>}
              {canEdit && (
                <span className="ms-auto flex gap-2">
                  {!a.is_default && (
                    <form action={setDefaultAddress}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="customer_id" value={c.id} />
                      <button className={btnSecondary + " min-h-9 px-3 text-sm"}>ברירת מחדל</button>
                    </form>
                  )}
                  <form action={removeAddress}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="customer_id" value={c.id} />
                    <button className={btnDanger + " min-h-9 px-3 text-sm"}>הסרה</button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <ActionForm action={addAddress} resetOnOk className="grid gap-3 md:grid-cols-[2fr_1fr_2fr_auto] md:items-end">
            <input type="hidden" name="customer_id" value={c.id} />
            <Field label="רחוב ומספר"><input name="address" className={inputCls} /></Field>
            <Field label="עיר"><input name="city" className={inputCls} /></Field>
            <Field label="הערות למשלוח"><input name="delivery_notes" className={inputCls} /></Field>
            <button className={btnSecondary}>הוספת כתובת</button>
          </ActionForm>
        )}
      </Card>

      <Card title="הזמנות">
        {(orders ?? []).length === 0 ? (
          <p className="text-muted">עוד אין הזמנות.</p>
        ) : (
          <ul className="divide-y divide-line">
            {orders!.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center gap-3 py-2.5 hover:bg-sunken">
                  <b className="tabular-nums">#{o.id}</b>
                  <span className="text-sm text-muted">{when(new Date(o.delivery_date))}</span>
                  <span className="ms-auto tabular-nums">{money(Number(o.total_amount))}</span>
                  <Pill tone={STATUS[o.status as OrderStatus].tone}>{STATUS[o.status as OrderStatus].label}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
