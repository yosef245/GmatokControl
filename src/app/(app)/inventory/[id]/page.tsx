import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { Card, PageTitle, Pill, type Tone } from "@/components/ui";
import { fmt, when } from "@/lib/format";
import { StockForm } from "../stock-form";

const TYPE: Record<string, [string, Tone]> = {
  opening: ["מלאי פתיחה", "neutral"],
  receive: ["קבלת סחורה", "green"],
  count: ["ספירה", "blue"],
  waste: ["פחת", "orange"],
  production: ["ייצור", "neutral"],
  production_undo: ["ביטול ייצור", "neutral"],
};

export default async function MaterialHistoryPage({ params }: PageProps<"/inventory/[id]">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageStock")) redirect("/");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: m }, { data: moves }] = await Promise.all([
    supabase.from("raw_materials").select("id, name, unit_of_measure, stock_quantity").eq("id", id).maybeSingle(),
    supabase
      .from("stock_movements")
      .select("id, quantity, movement_type, reason, created_at, users(full_name), production_logs(products(name))")
      .eq("raw_material_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (!m) notFound();
  return (
    <>
      <div>
        <Link href="/inventory" className="text-sm text-accent underline">חזרה למלאי</Link>
        <PageTitle sub={`במלאי עכשיו: ${fmt(Number(m.stock_quantity))} ${m.unit_of_measure}`}>{m.name}</PageTitle>
      </div>
      <Card title="פעולה במלאי">
        <StockForm materialId={m.id} unit={m.unit_of_measure} />
      </Card>
      <Card title="תנועות אחרונות" className="p-0 [&>h2]:px-4 [&>h2]:pt-4">
        {(moves ?? []).length === 0 && <p className="px-4 pb-4 text-muted">עוד אין תנועות.</p>}
        <ul className="divide-y divide-line">
          {(moves ?? []).map((mv) => {
            const [label, tone] = TYPE[mv.movement_type] ?? [mv.movement_type, "neutral"];
            const q = Number(mv.quantity);
            const product = (mv.production_logs as unknown as { products: { name: string } } | null)?.products?.name;
            return (
              <li key={mv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <Pill tone={tone}>{label}</Pill>
                <span dir="ltr" className={`font-bold tabular-nums ${q < 0 ? "text-bad" : "text-ok"}`}>{q > 0 ? "+" : ""}{fmt(q)}</span>
                <span className="text-sm">{product ?? mv.reason}</span>
                <span className="ms-auto text-sm text-muted">{when(new Date(mv.created_at))} · {(mv.users as unknown as { full_name: string } | null)?.full_name}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
