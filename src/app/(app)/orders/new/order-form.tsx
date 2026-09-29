"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createOrder } from "@/lib/actions/orders";
import { btnPrimary, btnSecondary, Card, Field, inputCls } from "@/components/ui";
import { money } from "@/lib/format";

export interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  priceListId: string | null;
  addresses: { id: string; label: string; isDefault: boolean }[];
}
export interface ProductOption {
  id: string;
  name: string;
  category: string | null;
  price: number;
}
interface Line {
  key: number;
  productId: string;
  quantity: string;
  unitPrice: string;
  notes: string;
}

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: "", quantity: "1", unitPrice: "", notes: "" });

export function OrderForm({
  customers,
  products,
  initialCustomer,
  defaultDate,
  vatPercent,
  priceLists,
}: {
  customers: CustomerOption[];
  products: ProductOption[];
  initialCustomer?: string;
  defaultDate: string;
  vatPercent: number;
  priceLists: Record<string, { name: string; prices: Record<string, number> }>;
}) {
  const [state, run, pending] = useActionState(createOrder, null);
  const [customerId, setCustomerId] = useState(initialCustomer ?? "");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const customer = customers.find((c) => c.id === customerId);
  const shown = search
    ? customers.filter((c) => c.name.includes(search) || c.phone.replace(/\D/g, "").includes(search.replace(/\D/g, "") || "~"))
    : customers;
  const list = customer?.priceListId ? priceLists[customer.priceListId] : undefined;
  /** The customer's price for a product: their price list first, then the regular price. */
  const basePrice = (productId: string) => list?.prices[productId] ?? byId.get(productId)?.price ?? 0;
  const categories = [...new Set(products.map((p) => p.category ?? "אחר"))];

  const priced = lines.map((l) => {
    const price = l.unitPrice === "" ? basePrice(l.productId) : Number(l.unitPrice);
    return { ...l, price, total: (Number(l.quantity) || 0) * price };
  });
  const subtotal = priced.reduce((s, l) => s + l.total, 0);
  const vat = (subtotal * vatPercent) / 100;
  const payload = JSON.stringify(
    priced
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({
        product_id: l.productId,
        quantity: Number(l.quantity),
        ...(l.unitPrice !== "" ? { unit_price: Number(l.unitPrice) } : {}),
        ...(l.notes.trim() ? { notes: l.notes.trim() } : {}),
      })),
  );
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form action={run} className="flex flex-col gap-5">
      <fieldset disabled={pending} className="contents">
        <Card title="לקוח">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="חיפוש">
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="שם או טלפון" className={inputCls} />
            </Field>
            <Field label="לקוח">
              <select name="customer_id" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls} required>
                <option value="">בחרו לקוח…</option>
                {customer && !shown.includes(customer) && <option value={customer.id}>{customer.name}</option>}
                {shown.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
              </select>
            </Field>
            {customer && (
              <Field label="כתובת למשלוח" className="md:col-span-2">
                <select key={customer.id} name="address_id" defaultValue={customer.addresses.find((a) => a.isDefault)?.id ?? customer.addresses[0]?.id ?? ""} className={inputCls}>
                  <option value="">איסוף עצמי / ללא כתובת</option>
                  {customer.addresses.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
            )}
          </div>
          <p className="mt-3 text-sm">
            לקוח שלא ברשימה? <Link href="/customers/new?next=order" className="font-bold text-accent underline">לקוח חדש</Link>
          </p>
        </Card>

        <Card title={list ? `מוצרים · מחירון ${list.name}` : "מוצרים"}>
          <div className="flex flex-col gap-3">
            {priced.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[1fr_5rem] gap-2 border-b border-line pb-3 md:grid-cols-[2fr_6rem_7rem_2fr_auto] md:items-end">
                <Field label={`מוצר ${i + 1}`} className="col-span-2 md:col-span-1">
                  <select value={l.productId} onChange={(e) => update(l.key, { productId: e.target.value, unitPrice: "" })} className={inputCls}>
                    <option value="">בחרו מוצר…</option>
                    {categories.map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {products.filter((p) => (p.category ?? "אחר") === cat).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field label="כמות">
                  <input type="number" min="1" step="1" inputMode="numeric" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} className={inputCls} />
                </Field>
                <Field label="מחיר ליח׳">
                  <input type="number" min="0" step="0.01" value={l.unitPrice} placeholder={l.productId ? basePrice(l.productId).toString() : ""} onChange={(e) => update(l.key, { unitPrice: e.target.value })} className={inputCls} />
                </Field>
                <Field label="הערה לשורה" className="col-span-2 md:col-span-1">
                  <input value={l.notes} onChange={(e) => update(l.key, { notes: e.target.value })} placeholder="מיתוג, הקדשה, צבע סרט" className={inputCls} />
                </Field>
                <div className="col-span-2 flex items-center gap-3 md:col-span-1">
                  <span className="tabular-nums text-muted md:hidden">{money(l.total)}</span>
                  <button type="button" className={btnSecondary + " ms-auto min-h-11 px-3"} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="הסרת שורה">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className={btnSecondary + " self-start"} onClick={() => setLines((ls) => [...ls, emptyLine()])}>הוספת מוצר</button>
          </div>
          <dl className="mt-4 grid max-w-xs grid-cols-2 gap-1 ms-auto text-sm">
            <dt className="text-muted">לפני מע״מ</dt><dd className="text-end tabular-nums">{money(subtotal)}</dd>
            <dt className="text-muted">מע״מ {vatPercent}%</dt><dd className="text-end tabular-nums">{money(vat)}</dd>
            <dt className="font-bold">סה״כ</dt><dd className="text-end font-bold tabular-nums">{money(subtotal + vat)}</dd>
          </dl>
        </Card>

        <Card title="אספקה">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="תאריך"><input type="date" name="delivery_date" defaultValue={defaultDate} className={inputCls} required /></Field>
            <Field label="שעה"><input type="time" name="delivery_time" defaultValue="12:00" step="900" className={inputCls} required /></Field>
            <label className="flex items-center gap-2 self-end pb-3 font-bold">
              <input type="checkbox" name="is_urgent" className="size-5 accent-accent" /> דחוף
            </label>
            <Field label="הערות להזמנה" className="md:col-span-3"><textarea name="notes" rows={2} className={inputCls + " py-2"} /></Field>
          </div>
        </Card>
        <input type="hidden" name="items" value={payload} />
      </fieldset>
      {state && "error" in state && <p className="font-bold text-bad" role="alert">{state.error}</p>}
      <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-lg md:bottom-4">
        <span className="font-bold tabular-nums">{money(subtotal + vat)}</span>
        <button className={btnPrimary + " ms-auto"} disabled={pending}>{pending ? "שומר…" : "יצירת הזמנה"}</button>
      </div>
    </form>
  );
}
