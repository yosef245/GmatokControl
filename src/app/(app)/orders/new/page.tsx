import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { israelDateFromNow } from "@/lib/dates";
import { PageTitle } from "@/components/ui";
import { OrderForm, type CustomerOption } from "./order-form";

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  const staff = (await getStaff())!;
  if (!can(staff.roles, "createOrder")) redirect("/");
  const { customer } = await searchParams;
  const supabase = await createClient();
  const [{ data: customers }, { data: products }, { data: settings }, { data: lists }] = await Promise.all([
    supabase.from("customers").select("id, name, phone, price_list_id, customer_addresses(id, address, city, is_default)").order("name"),
    supabase.from("products").select("id, name, category, price").eq("is_active", true).order("category").order("name"),
    supabase.from("settings").select("vat_percent").single(),
    supabase.from("price_lists").select("id, name, price_list_items(product_id, price)").eq("is_active", true),
  ]);
  const priceLists = Object.fromEntries(
    (lists ?? []).map((l) => [
      l.id,
      {
        name: l.name as string,
        prices: Object.fromEntries((l.price_list_items as { product_id: string; price: number }[]).map((i) => [i.product_id, Number(i.price)])),
      },
    ]),
  );
  const options: CustomerOption[] = (customers ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    priceListId: c.price_list_id && priceLists[c.price_list_id] ? c.price_list_id : null,
    addresses: (c.customer_addresses as { id: string; address: string; city: string; is_default: boolean }[]).map((a) => ({
      id: a.id,
      label: `${a.address}, ${a.city}`,
      isDefault: a.is_default,
    })),
  }));
  return (
    <>
      <PageTitle>הזמנה חדשה</PageTitle>
      <OrderForm
        customers={options}
        products={(products ?? []).map((p) => ({ ...p, price: Number(p.price) }))}
        initialCustomer={typeof customer === "string" ? customer : undefined}
        defaultDate={israelDateFromNow(1)}
        vatPercent={Number(settings?.vat_percent ?? 18)}
        priceLists={priceLists}
      />
    </>
  );
}
