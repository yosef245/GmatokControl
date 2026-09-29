import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { createProduct, saveBusiness, saveMaterial, saveStaff } from "@/lib/actions/settings";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, btnSecondary, Card, Field, inputCls, PageTitle, Pill, Tabs } from "@/components/ui";
import { duration, fmt, money } from "@/lib/format";
import type { Role } from "@/lib/domain/types";

const TABS = [
  { key: "business", label: "העסק והמשמרת" },
  { key: "staff", label: "עובדים" },
  { key: "products", label: "מוצרים ומתכונים" },
  { key: "materials", label: "חומרי גלם" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageSettings")) redirect("/");
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : "business";
  return (
    <>
      <PageTitle>הגדרות</PageTitle>
      <Tabs current={tab} items={TABS.map((t) => ({ ...t, href: `/settings?tab=${t.key}` }))} />
      {tab === "business" && <Business />}
      {tab === "staff" && <Staff myId={staff.id} />}
      {tab === "products" && <Products />}
      {tab === "materials" && <Materials />}
    </>
  );
}

async function Business() {
  const supabase = await createClient();
  const { data: s } = await supabase.from("settings").select("*").single();
  if (!s) return null;
  return (
    <Card title="פרטי העסק ונתוני משמרת">
      <ActionForm action={saveBusiness} className="grid gap-4 md:grid-cols-2">
        <Field label="שם העסק"><input name="business_name" defaultValue={s.business_name} className={inputCls} /></Field>
        <Field label="טלפון"><input name="business_phone" defaultValue={s.business_phone ?? ""} className={inputCls} dir="ltr" /></Field>
        <Field label="כתובת"><input name="business_address" defaultValue={s.business_address ?? ""} className={inputCls} /></Field>
        <Field label="ח.פ. / עוסק מורשה"><input name="business_tax_id" defaultValue={s.business_tax_id ?? ""} className={inputCls} dir="ltr" /></Field>
        <Field label="מע״מ (%)"><input name="vat_percent" type="number" step="0.01" min="0" defaultValue={s.vat_percent} className={inputCls} /></Field>
        <Field label="עובדי ייצור במשמרת"><input name="shift_workers" type="number" min="1" defaultValue={s.shift_workers} className={inputCls} /></Field>
        <Field label="שעות משמרת"><input name="shift_hours" type="number" step="0.5" min="1" max="24" defaultValue={s.shift_hours} className={inputCls} /></Field>
        <Field label="זמן משלוח (דקות)" hint="כמה זמן לפני מועד האספקה ההזמנה צריכה לצאת">
          <input name="delivery_minutes" type="number" min="0" defaultValue={s.delivery_minutes} className={inputCls} />
        </Field>
        <div className="md:col-span-2"><button className={btnPrimary}>שמירה</button></div>
      </ActionForm>
    </Card>
  );
}

function RoleBoxes({ selected = [] }: { selected?: Role[] }) {
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
      <legend className="mb-1 text-sm font-bold">תפקידים</legend>
      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
        <label key={r} className="flex items-center gap-1.5">
          <input type="checkbox" name="roles" value={r} defaultChecked={selected.includes(r)} className="size-4 accent-accent" />
          {ROLE_LABELS[r]}
        </label>
      ))}
    </fieldset>
  );
}

async function Staff({ myId }: { myId: string }) {
  const supabase = await createClient();
  const { data: users } = await supabase.from("users").select("*").order("is_active", { ascending: false }).order("full_name");
  return (
    <>
      <Card title="עובד חדש">
        <ActionForm action={saveStaff} resetOnOk className="grid gap-4 md:grid-cols-3">
          <Field label="שם מלא"><input name="full_name" className={inputCls} required /></Field>
          <Field label="אימייל" hint="איתו העובד נכנס"><input name="email" type="email" className={inputCls} dir="ltr" /></Field>
          <Field label="טלפון"><input name="phone" className={inputCls} dir="ltr" /></Field>
          <div className="md:col-span-3"><RoleBoxes /></div>
          <div className="md:col-span-3"><button className={btnPrimary}>הוספה</button></div>
        </ActionForm>
        <p className="mt-3 text-sm text-muted">
          אחרי ההוספה יוצרים לעובד משתמש ב־Supabase: Authentication ← Users ← Add user, עם אותו אימייל, סיסמה ו־Auto Confirm User.
        </p>
      </Card>
      <Card title="עובדים" className="p-0">
        <ul className="divide-y divide-line">
          {(users ?? []).map((u) => (
            <li key={u.id}>
              <details className="group px-4 py-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <b className={u.is_active ? "" : "text-muted line-through"}>{u.full_name}</b>
                  <span className="text-sm text-muted" dir="ltr">{u.email ?? u.phone}</span>
                  {(u.roles as Role[]).map((r) => <Pill key={r} tone="neutral">{ROLE_LABELS[r]}</Pill>)}
                  {!u.auth_user_id && <Pill tone="orange">עוד לא נכנס</Pill>}
                  <span className="ms-auto text-sm text-accent group-open:hidden">עריכה</span>
                </summary>
                <ActionForm action={saveStaff} className="mt-3 grid gap-4 md:grid-cols-3">
                  <input type="hidden" name="id" value={u.id} />
                  <Field label="שם מלא"><input name="full_name" defaultValue={u.full_name} className={inputCls} required /></Field>
                  <Field label="אימייל"><input name="email" type="email" defaultValue={u.email ?? ""} className={inputCls} dir="ltr" /></Field>
                  <Field label="טלפון"><input name="phone" defaultValue={u.phone ?? ""} className={inputCls} dir="ltr" /></Field>
                  <div className="md:col-span-3"><RoleBoxes selected={u.roles as Role[]} /></div>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="is_active" defaultChecked={u.is_active} disabled={u.id === myId} className="size-4 accent-accent" />
                    פעיל
                    {u.id === myId && <input type="hidden" name="is_active" value="on" />}
                  </label>
                  <div className="md:col-span-3"><button className={btnPrimary}>שמירה</button></div>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

async function Products() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, price, estimated_production_minutes, is_active, recipes(id)")
    .order("is_active", { ascending: false })
    .order("category")
    .order("name");
  return (
    <>
      <Card title="מוצר חדש">
        <ActionForm action={createProduct} className="grid gap-4 md:grid-cols-4">
          <Field label="שם"><input name="name" className={inputCls} required /></Field>
          <Field label="קטגוריה" hint="למשל: פרלינים, מארזים, עוגיות"><input name="category" className={inputCls} /></Field>
          <Field label="מחיר לפני מע״מ"><input name="price" type="number" step="0.01" min="0" className={inputCls} required /></Field>
          <Field label="דקות עבודה ליחידה"><input name="estimated_production_minutes" type="number" min="0" defaultValue={0} className={inputCls} /></Field>
          <div className="md:col-span-4"><button className={btnPrimary}>הוספה והמשך למתכון</button></div>
        </ActionForm>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-sunken text-muted">
            <tr>{["מוצר", "קטגוריה", "מחיר", "זמן ליחידה", "מתכון", ""].map((h) => <th key={h} className="px-3 py-2.5 text-start">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(products ?? []).map((p) => (
              <tr key={p.id} className={p.is_active ? "" : "text-muted"}>
                <td className="px-3 py-2.5 font-bold">{p.name}{!p.is_active && " (לא פעיל)"}</td>
                <td className="px-3 py-2.5">{p.category}</td>
                <td className="px-3 py-2.5 tabular-nums">{money(Number(p.price))}</td>
                <td className="px-3 py-2.5">{duration(p.estimated_production_minutes)}</td>
                <td className="px-3 py-2.5">{p.recipes.length ? `${fmt(p.recipes.length)} חומרים` : <Pill tone="orange">חסר מתכון</Pill>}</td>
                <td className="px-3 py-2.5"><Link href={`/settings/products/${p.id}`} className={btnSecondary + " min-h-9"}>עריכה</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

async function Materials() {
  const supabase = await createClient();
  const { data: materials } = await supabase.from("raw_materials").select("*").order("name");
  const fields = (m?: NonNullable<typeof materials>[number]) => (
    <>
      <Field label="שם"><input name="name" defaultValue={m?.name} className={inputCls} required /></Field>
      <Field label="יחידת מידה" hint="ק״ג, יח׳, ליטר"><input name="unit_of_measure" defaultValue={m?.unit_of_measure} className={inputCls} required /></Field>
      <Field label="מלאי מינימום"><input name="minimum_threshold" type="number" step="0.001" min="0" defaultValue={m?.minimum_threshold ?? 0} className={inputCls} /></Field>
      <Field label="ספק"><input name="supplier_name" defaultValue={m?.supplier_name ?? ""} className={inputCls} /></Field>
      <Field label="טלפון ספק"><input name="supplier_phone" defaultValue={m?.supplier_phone ?? ""} className={inputCls} dir="ltr" /></Field>
    </>
  );
  return (
    <>
      <Card title="חומר גלם חדש">
        <ActionForm action={saveMaterial} resetOnOk className="grid gap-4 md:grid-cols-5">
          {fields()}
          <div className="md:col-span-5"><button className={btnPrimary}>הוספה</button></div>
        </ActionForm>
      </Card>
      <Card title="חומרי גלם" className="p-0 [&>h2]:px-4 [&>h2]:pt-4">
        <ul className="divide-y divide-line">
          {(materials ?? []).map((m) => (
            <li key={m.id}>
              <details className="group px-4 py-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <b>{m.name}</b>
                  <span className="text-sm text-muted">מינימום {fmt(Number(m.minimum_threshold))} {m.unit_of_measure}</span>
                  {m.supplier_name && <span className="text-sm text-muted">· {m.supplier_name}</span>}
                  <span className="ms-auto text-sm text-accent group-open:hidden">עריכה</span>
                </summary>
                <ActionForm action={saveMaterial} className="mt-3 grid gap-4 md:grid-cols-5">
                  <input type="hidden" name="id" value={m.id} />
                  {fields(m)}
                  <div className="md:col-span-5"><button className={btnPrimary}>שמירה</button></div>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
