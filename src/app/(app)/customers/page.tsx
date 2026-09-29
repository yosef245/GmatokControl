import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, Card, inputCls, PageTitle, Pill } from "@/components/ui";

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "manageCustomers")) redirect("/");
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, name, contact_name, phone, type, users!customers_assigned_marketer_id_fkey(full_name), customer_addresses(city, is_default)")
    .order("name")
    .limit(200);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,contact_name.ilike.%${safe}%`);
  }
  const { data: customers } = await query;

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle>לקוחות</PageTitle>
        <Link href="/customers/new" className={btnPrimary + " ms-auto"}>לקוח חדש</Link>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="חיפוש לפי שם או טלפון" className={inputCls} type="search" />
      </form>
      <Card className="p-0">
        {(customers ?? []).length === 0 ? (
          <p className="p-4 text-muted">{q ? "לא נמצאו לקוחות." : "עוד אין לקוחות."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {customers!.map((c) => {
              const marketer = c.users as unknown as { full_name: string } | null;
              const addr = (c.customer_addresses as { city: string; is_default: boolean }[]).find((a) => a.is_default) ?? c.customer_addresses[0];
              return (
                <li key={c.id}>
                  <Link href={`/customers/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-sunken">
                    <b>{c.name}</b>
                    {c.contact_name && <span className="text-sm text-muted">{c.contact_name}</span>}
                    <span className="text-sm text-muted" dir="ltr">{c.phone}</span>
                    {addr && <span className="text-sm text-muted">{addr.city}</span>}
                    <span className="ms-auto flex gap-1.5">
                      {c.type === "business" && <Pill tone="blue">עסקי</Pill>}
                      {marketer && <Pill tone="neutral">{marketer.full_name}</Pill>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
