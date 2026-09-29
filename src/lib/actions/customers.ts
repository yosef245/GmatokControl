"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { dbError, optional, requireStaff, text, type ActionResult } from "./result";

const TYPES = ["private", "business"];

export async function saveCustomer(_: ActionResult, d: FormData): Promise<ActionResult> {
  const me = await requireStaff("manageCustomers");
  const id = optional(d, "id");
  const isAdmin = me.roles.includes("admin");
  const row = {
    name: text(d, "name"),
    contact_name: optional(d, "contact_name"),
    phone: text(d, "phone"),
    type: TYPES.includes(text(d, "type")) ? text(d, "type") : "private",
    notes: optional(d, "notes"),
    ...(isAdmin ? { assigned_marketer_id: optional(d, "assigned_marketer_id") } : id ? {} : { assigned_marketer_id: me.id }),
  };
  if (!row.name) return { error: "חסר שם לקוח." };
  if (!row.phone) return { error: "חסר טלפון." };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("customers").update(row).eq("id", id);
    if (error) return { error: dbError(error) };
    revalidatePath(`/customers/${id}`);
    revalidatePath("/customers");
    return { ok: "נשמר." };
  }
  const { data, error } = await supabase.from("customers").insert(row).select("id").single();
  if (error) return { error: dbError(error) };
  const address = text(d, "address"), city = text(d, "city");
  if (address && city) {
    await supabase.from("customer_addresses").insert({ customer_id: data.id, address, city, delivery_notes: optional(d, "delivery_notes"), is_default: true });
  }
  revalidatePath("/customers");
  const next = text(d, "next");
  redirect(next === "order" ? `/orders/new?customer=${data.id}` : `/customers/${data.id}`);
}

export async function addAddress(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageCustomers");
  const customerId = text(d, "customer_id");
  const address = text(d, "address"), city = text(d, "city");
  if (!address || !city) return { error: "חסרים כתובת ועיר." };
  const supabase = await createClient();
  const { count } = await supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("customer_id", customerId);
  const { error } = await supabase
    .from("customer_addresses")
    .insert({ customer_id: customerId, address, city, delivery_notes: optional(d, "delivery_notes"), is_default: !count });
  if (error) return { error: dbError(error) };
  revalidatePath(`/customers/${customerId}`);
  return { ok: "הכתובת נוספה." };
}

export async function setDefaultAddress(d: FormData) {
  await requireStaff("manageCustomers");
  const customerId = text(d, "customer_id");
  const supabase = await createClient();
  await supabase.from("customer_addresses").update({ is_default: false }).eq("customer_id", customerId);
  await supabase.from("customer_addresses").update({ is_default: true }).eq("id", text(d, "id"));
  revalidatePath(`/customers/${customerId}`);
}

export async function removeAddress(d: FormData) {
  await requireStaff("manageCustomers");
  const customerId = text(d, "customer_id");
  const supabase = await createClient();
  // addresses used by orders stay (the orders keep pointing at them)
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("address_id", text(d, "id"));
  if (!count) await supabase.from("customer_addresses").delete().eq("id", text(d, "id"));
  revalidatePath(`/customers/${customerId}`);
}
