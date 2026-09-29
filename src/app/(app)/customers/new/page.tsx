import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { saveCustomer } from "@/lib/actions/customers";
import { ActionForm } from "@/components/action-form";
import { CustomerFields } from "@/components/customer-fields";
import { btnPrimary, Card, Field, inputCls, PageTitle } from "@/components/ui";

export default async function NewCustomerPage({ searchParams }: PageProps<"/customers/new">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageCustomers")) redirect("/");
  const { next } = await searchParams;
  const isAdmin = staff.roles.includes("admin");
  const supabase = await createClient();
  const [{ data: marketers }, { data: priceLists }] = isAdmin
    ? await Promise.all([
        supabase.from("users").select("id, full_name").contains("roles", ["marketer"]).eq("is_active", true).order("full_name"),
        supabase.from("price_lists").select("id, name").eq("is_active", true).order("name"),
      ])
    : [{ data: undefined }, { data: undefined }];
  return (
    <>
      <div>
        <Link href="/customers" className="text-sm text-accent underline">חזרה ללקוחות</Link>
        <PageTitle>לקוח חדש</PageTitle>
      </div>
      <Card>
        <ActionForm action={saveCustomer} className="grid gap-4 md:grid-cols-2">
          {next === "order" && <input type="hidden" name="next" value="order" />}
          <CustomerFields marketers={marketers ?? undefined} priceLists={priceLists ?? undefined} c={{ assigned_marketer_id: isAdmin ? null : staff.id }} />
          <h3 className="font-display text-lg text-accent md:col-span-2">כתובת למשלוח</h3>
          <Field label="רחוב ומספר"><input name="address" className={inputCls} /></Field>
          <Field label="עיר"><input name="city" className={inputCls} /></Field>
          <Field label="הערות למשלוח" className="md:col-span-2"><input name="delivery_notes" className={inputCls} placeholder="קומה, קוד כניסה, שעות קבלה" /></Field>
          <div className="md:col-span-2">
            <button className={btnPrimary}>{next === "order" ? "שמירה והמשך להזמנה" : "שמירה"}</button>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
