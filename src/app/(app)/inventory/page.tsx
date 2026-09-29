import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { loadMaterials } from "@/lib/data";
import { fmt } from "@/lib/format";
import { Card, PageTitle, Pill } from "@/components/ui";

const COLOR = { red: ["חוסר", "red"], orange: ["מתחת למינימום", "orange"], green: ["תקין", "green"] } as const;

export default async function InventoryPage() {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageStock")) redirect("/");
  const rows = await loadMaterials();
  const rank = { red: 0, orange: 1, green: 2 };
  rows.sort((a, b) => rank[a.color] - rank[b.color] || a.name.localeCompare(b.name, "he"));

  return (
    <>
      <PageTitle sub="במלאי פחות שמור להזמנות פתוחות = זמין. קבלת סחורה, ספירה ופחת יתווספו בספרינט 2.">מלאי חומרי גלם</PageTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-sunken text-muted">
            <tr className="text-start">
              {["חומר", "במלאי", "שמור", "זמין", "מינימום", "להזמין", "מצב", "ספק"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-start font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2.5 font-bold">{m.name}</td>
                <Num v={m.inStock} u={m.unit} />
                <Num v={m.reserved} u={m.unit} />
                <Num v={m.available} u={m.unit} strong={m.color !== "green"} />
                <Num v={m.minimum} u={m.unit} />
                <Num v={m.toOrder} u={m.unit} />
                <td className="px-3 py-2.5">
                  <Pill tone={COLOR[m.color][1]}>{COLOR[m.color][0]}</Pill>
                </td>
                <td className="px-3 py-2.5 text-muted">
                  {m.supplierName}
                  {m.supplierPhone && (
                    <a className="ms-1 text-accent underline" href={`tel:${m.supplierPhone}`}>
                      {m.supplierPhone}
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted">
                  עוד אין חומרי גלם.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Num({ v, u, strong }: { v: number; u: string; strong?: boolean }) {
  return (
    <td className={`px-3 py-2.5 tabular-nums whitespace-nowrap ${strong ? "font-bold" : ""} ${v < 0 ? "text-bad" : ""}`}>
      <span dir="ltr">{fmt(v)}</span> <span className="text-muted">{u}</span>
    </td>
  );
}
