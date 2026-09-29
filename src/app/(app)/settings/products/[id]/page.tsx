import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { removeRecipeLine, saveRecipeLine, updateProduct } from "@/lib/actions/settings";
import { ActionForm } from "@/components/action-form";
import { btnDanger, btnPrimary, Card, Field, inputCls, PageTitle } from "@/components/ui";
import { fmt } from "@/lib/format";

export default async function ProductPage({ params }: PageProps<"/settings/products/[id]">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageSettings")) redirect("/");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: p }, { data: materials }] = await Promise.all([
    supabase
      .from("products")
      .select("*, recipes(id, raw_material_id, quantity_per_unit, raw_materials(name, unit_of_measure))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("raw_materials").select("id, name, unit_of_measure").order("name"),
  ]);
  if (!p) notFound();
  const recipe = p.recipes as unknown as { id: string; raw_material_id: string; quantity_per_unit: number; raw_materials: { name: string; unit_of_measure: string } }[];

  return (
    <>
      <div>
        <Link href="/settings?tab=products" className="text-sm text-accent underline">חזרה למוצרים</Link>
        <PageTitle>{p.name}</PageTitle>
      </div>
      <Card title="פרטי המוצר">
        <ActionForm action={updateProduct} className="grid gap-4 md:grid-cols-4">
          <input type="hidden" name="id" value={p.id} />
          <Field label="שם"><input name="name" defaultValue={p.name} className={inputCls} required /></Field>
          <Field label="קטגוריה"><input name="category" defaultValue={p.category ?? ""} className={inputCls} /></Field>
          <Field label="מחיר לפני מע״מ"><input name="price" type="number" step="0.01" min="0" defaultValue={p.price} className={inputCls} /></Field>
          <Field label="דקות עבודה ליחידה"><input name="estimated_production_minutes" type="number" min="0" defaultValue={p.estimated_production_minutes} className={inputCls} /></Field>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="is_active" defaultChecked={p.is_active} className="size-4 accent-accent" /> פעיל (מופיע בהזמנה חדשה)
          </label>
          <div className="md:col-span-4"><button className={btnPrimary}>שמירה</button></div>
        </ActionForm>
      </Card>
      <Card title="מתכון ליחידה אחת">
        {recipe.length === 0 ? (
          <p className="mb-3 text-muted">עוד אין מתכון. בלי מתכון המלאי לא יורד כשמסמנים ייצור.</p>
        ) : (
          <ul className="mb-4 divide-y divide-line">
            {recipe.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 font-bold">{r.raw_materials.name}</span>
                <span className="tabular-nums">{fmt(Number(r.quantity_per_unit))} {r.raw_materials.unit_of_measure}</span>
                <form action={removeRecipeLine}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="product_id" value={p.id} />
                  <button className={btnDanger + " min-h-9 px-3"}>הסרה</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={saveRecipeLine} resetOnOk className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="product_id" value={p.id} />
          <Field label="חומר גלם" className="min-w-48 flex-1">
            <select name="raw_material_id" className={inputCls} defaultValue="">
              <option value="" disabled>בחרו…</option>
              {(materials ?? []).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit_of_measure})</option>)}
            </select>
          </Field>
          <Field label="כמות ליחידה" className="w-36">
            <input name="quantity_per_unit" type="number" step="0.001" min="0.001" className={inputCls} />
          </Field>
          <button className={btnPrimary}>הוספה / עדכון</button>
        </ActionForm>
        {(materials ?? []).length === 0 && (
          <p className="mt-2 text-sm text-muted">
            אין עדיין חומרי גלם. <Link href="/settings?tab=materials" className="text-accent underline">הוסיפו חומרים</Link>.
          </p>
        )}
      </Card>
    </>
  );
}
