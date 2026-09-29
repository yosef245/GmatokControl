import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { loadMaterials } from "@/lib/data";
import { waLink } from "@/lib/whatsapp";
import { fmt } from "@/lib/format";
import { btnSecondary, Card, PageTitle, Pill } from "@/components/ui";
import { StockForm } from "./stock-form";

const COLOR = { red: ["חוסר", "red"], orange: ["מתחת למינימום", "orange"], green: ["תקין", "green"] } as const;

export default async function InventoryPage() {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageStock")) redirect("/");
  const supabase = await createClient();
  const [rows, { data: settings }] = await Promise.all([loadMaterials(), supabase.from("settings").select("business_name").single()]);
  const rank = { red: 0, orange: 1, green: 2 };
  rows.sort((a, b) => rank[a.color] - rank[b.color] || a.name.localeCompare(b.name, "he"));
  const toOrder = rows.filter((m) => m.toOrder > 0);

  return (
    <>
      <PageTitle sub="זמין = במלאי פחות מה ששמור להזמנות פתוחות. כשמסמנים ייצור, המלאי יורד לפי המתכון.">מלאי חומרי גלם</PageTitle>

      {toOrder.length > 0 && (
        <Card title={`להזמין מספקים (${fmt(toOrder.length)})`}>
          <ul className="divide-y divide-line">
            {toOrder.map((m) => {
              const wa = m.supplierPhone
                ? waLink(m.supplierPhone, `שלום${m.supplierName ? ` ${m.supplierName}` : ""}, נבקש להזמין ${fmt(Math.ceil(m.toOrder))} ${m.unit} ${m.name}. תודה, ${settings?.business_name ?? ""}`)
                : null;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Pill tone={COLOR[m.color][1]}>{COLOR[m.color][0]}</Pill>
                  <b>{m.name}</b>
                  <span className="tabular-nums">להזמין {fmt(Math.ceil(m.toOrder))} {m.unit}</span>
                  <span className="text-sm text-muted">{m.supplierName}</span>
                  {wa && <a href={wa} target="_blank" rel="noopener" className={btnSecondary + " ms-auto min-h-9 px-3 text-sm"}>הזמנה בוואטסאפ</a>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-0">
        {rows.length === 0 && <p className="p-4 text-muted">עוד אין חומרי גלם. מוסיפים אותם בהגדרות.</p>}
        <ul className="divide-y divide-line">
          {rows.map((m) => (
            <li key={m.id}>
              <details className="group">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-sunken">
                  <b className="min-w-32 flex-1">{m.name}</b>
                  <Figure label="במלאי" v={m.inStock} u={m.unit} />
                  <Figure label="שמור" v={m.reserved} u={m.unit} />
                  <Figure label="זמין" v={m.available} u={m.unit} strong />
                  <Pill tone={COLOR[m.color][1]}>{COLOR[m.color][0]}</Pill>
                </summary>
                <div className="flex flex-col gap-3 border-t border-line bg-bg px-4 py-4">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                    <span>מינימום: {fmt(m.minimum)} {m.unit}</span>
                    {m.toOrder > 0 && <span className="font-bold text-fg">להזמין: {fmt(m.toOrder)} {m.unit}</span>}
                    {m.supplierName && <span>ספק: {m.supplierName} {m.supplierPhone && <a href={`tel:${m.supplierPhone}`} className="underline" dir="ltr">{m.supplierPhone}</a>}</span>}
                    <Link href={`/inventory/${m.id}`} className="font-bold text-accent underline">היסטוריית תנועות</Link>
                  </div>
                  <StockForm materialId={m.id} unit={m.unit} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Figure({ label, v, u, strong }: { label: string; v: number; u: string; strong?: boolean }) {
  return (
    <span className="text-sm whitespace-nowrap">
      <span className="text-muted">{label} </span>
      <span dir="ltr" className={`tabular-nums ${strong ? "font-bold" : ""} ${v < 0 ? "text-bad" : ""}`}>{fmt(v)}</span> <span className="text-muted">{u}</span>
    </span>
  );
}
