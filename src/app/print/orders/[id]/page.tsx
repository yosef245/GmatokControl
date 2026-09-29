import { notFound } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { loadOrder } from "@/lib/order-detail";
import { fmt, fullWhen, money } from "@/lib/format";
import { PrintButton } from "./print-button";


export async function generateMetadata({ searchParams }: PageProps<"/print/orders/[id]">) {
  const { doc } = await searchParams;
  return { title: doc === "delivery" ? "תעודת משלוח" : "אישור הזמנה" };
}

export default async function PrintOrderPage({ params, searchParams }: PageProps<"/print/orders/[id]">) {
  const staff = await getStaff();
  if (!staff) notFound();
  const { id } = await params;
  const { doc } = await searchParams;
  const deliveryNote = doc === "delivery";
  const o = await loadOrder(Number(id));
  if (!o) notFound();
  const supabase = await createClient();
  const { data: s } = await supabase.from("settings").select("*").single();
  const vat = Number(s?.vat_percent ?? 18);
  const prices = !deliveryNote && can(staff.roles, "seePrices");
  const printed = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short" }).format(o.createdAt);

  return (
    <main className="mx-auto max-w-[800px] bg-white p-8 text-[#2a1b14] print:max-w-none print:p-0">
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <PrintButton />
        <span className="text-sm text-[#7a665a]">בחלון ההדפסה בוחרים ״שמירה כ־PDF״ כדי לקבל קובץ.</span>
      </div>
      <header className="flex items-start justify-between border-b-2 border-[#b8893a] pb-4">
        <div>
          <h1 className="font-display text-3xl text-[#6b3a24]">{s?.business_name}</h1>
          <div className="text-sm">
            {[s?.business_address, s?.business_phone].filter(Boolean).join(" · ")}
            {s?.business_tax_id && <div>ח.פ. {s.business_tax_id}</div>}
          </div>
        </div>
        <div className="text-end">
          <div className="text-xl font-bold">{deliveryNote ? "תעודת משלוח" : "אישור הזמנה"}</div>
          <div>מס׳ {o.id}</div>
          <div className="text-sm">תאריך הזמנה: {printed}</div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 py-4 text-sm">
        <div>
          <div className="font-bold">לכבוד</div>
          <div>{o.customer.name}</div>
          {o.customer.contactName && <div>{o.customer.contactName}</div>}
          <div dir="ltr" className="text-end">{o.customer.phone}</div>
        </div>
        <div>
          <div className="font-bold">אספקה</div>
          <div>{fullWhen(o.deliveryDate)}</div>
          <div>{o.address ? `${o.address.address}, ${o.address.city}` : "איסוף עצמי"}</div>
          {o.address?.deliveryNotes && <div>{o.address.deliveryNotes}</div>}
          {deliveryNote && o.delivery?.courier && <div>שליח: {o.delivery.courier}</div>}
        </div>
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-[#e4d8cd] bg-[#f1eae3]">
            <th className="p-2 text-start">פריט</th>
            <th className="p-2 text-start">כמות</th>
            {prices && <th className="p-2 text-start">מחיר ליח׳</th>}
            {prices && <th className="p-2 text-start">סה״כ</th>}
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id} className="border-b border-[#e4d8cd]">
              <td className="p-2">{i.productName}{i.notes && <div className="text-xs text-[#7a665a]">{i.notes}</div>}</td>
              <td className="p-2 tabular-nums">{fmt(i.quantity)}</td>
              {prices && <td className="p-2 tabular-nums">{money(i.unitPrice)}</td>}
              {prices && <td className="p-2 tabular-nums">{money(i.unitPrice * i.quantity)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {prices && (
        <dl className="ms-auto mt-4 grid w-64 grid-cols-2 gap-1 text-sm">
          <dt>לפני מע״מ</dt><dd className="text-end tabular-nums">{money(o.total)}</dd>
          <dt>מע״מ {vat}%</dt><dd className="text-end tabular-nums">{money((o.total * vat) / 100)}</dd>
          <dt className="border-t border-[#2a1b14] pt-1 font-bold">סה״כ לתשלום</dt>
          <dd className="border-t border-[#2a1b14] pt-1 text-end font-bold tabular-nums">{money(o.total * (1 + vat / 100))}</dd>
        </dl>
      )}
      {o.notes && <p className="mt-6 text-sm"><b>הערות: </b>{o.notes}</p>}
      {deliveryNote && (
        <div className="mt-16 grid grid-cols-3 gap-6 text-sm">
          {["שם המקבל", "חתימה", "תאריך ושעה"].map((l) => (
            <div key={l} className="border-t border-[#2a1b14] pt-1">{l}</div>
          ))}
        </div>
      )}
      <p className="mt-10 text-center text-xs text-[#7a665a]">תודה שבחרתם ב{s?.business_name}</p>
    </main>
  );
}
