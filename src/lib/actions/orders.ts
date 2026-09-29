"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { fromIsraelLocal } from "../dates";
import { dbError, optional, requireStaff, text, type ActionResult } from "./result";

interface ItemInput {
  product_id: string;
  quantity: number;
  unit_price?: number;
  notes?: string;
}

export async function createOrder(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("createOrder");
  const customerId = text(d, "customer_id");
  const delivery = fromIsraelLocal(text(d, "delivery_date"), text(d, "delivery_time") || "12:00");
  let items: ItemInput[];
  try {
    items = JSON.parse(text(d, "items") || "[]");
  } catch {
    return { error: "רשימת המוצרים לא תקינה." };
  }
  items = items.filter((i) => i.product_id && i.quantity > 0);
  if (!customerId) return { error: "בחרו לקוח." };
  if (!delivery) return { error: "בחרו תאריך ושעת אספקה." };
  if (items.length === 0) return { error: "הוסיפו לפחות מוצר אחד." };
  if (items.some((i) => !Number.isInteger(i.quantity) || (i.unit_price !== undefined && !(i.unit_price >= 0)))) {
    return { error: "כמויות צריכות להיות מספרים שלמים, ומחירים לא שליליים." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_customer_id: customerId,
    p_address_id: optional(d, "address_id"),
    p_delivery_date: delivery.toISOString(),
    p_is_urgent: d.get("is_urgent") === "on",
    p_notes: optional(d, "notes"),
    p_items: items,
  });
  if (error) return { error: dbError(error, "יצירת ההזמנה נכשלה. נסו שוב.") };
  revalidatePath("/orders");
  revalidatePath("/");
  redirect(`/orders/${data}?created=1`);
}

export async function updateOrder(_: ActionResult, d: FormData): Promise<ActionResult> {
  const me = await requireStaff("editOrder");
  const id = Number(text(d, "id"));
  const delivery = fromIsraelLocal(text(d, "delivery_date"), text(d, "delivery_time"));
  if (!delivery) return { error: "תאריך או שעה לא תקינים." };
  const supabase = await createClient();
  const { data: before } = await supabase.from("orders").select("delivery_date, is_urgent, notes, address_id").eq("id", id).single();
  const after = {
    delivery_date: delivery.toISOString(),
    is_urgent: d.get("is_urgent") === "on",
    notes: optional(d, "notes"),
    address_id: optional(d, "address_id"),
  };
  const { error } = await supabase.from("orders").update(after).eq("id", id);
  if (error) return { error: dbError(error) };
  const changed = Object.fromEntries(
    Object.entries(after).filter(([k, v]) =>
      k === "delivery_date" ? new Date(before?.delivery_date).getTime() !== delivery.getTime() : before?.[k as keyof typeof before] !== v,
    ),
  );
  if (Object.keys(changed).length) {
    await supabase.from("audit_logs").insert({ order_id: id, action_type: "updated", performed_by: me.id, details: changed });
  }
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  return { ok: "ההזמנה עודכנה." };
}

export async function cancelOrder(_: ActionResult, d: FormData): Promise<ActionResult> {
  const me = await requireStaff("editOrder");
  const id = Number(text(d, "id"));
  const reason = text(d, "reason");
  if (!reason) return { error: "כתבו סיבת ביטול." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["draft", "pending_approval", "in_production", "ready_for_delivery"])
    .select("id");
  if (error) return { error: dbError(error) };
  if (!data?.length) return { error: "אי אפשר לבטל הזמנה שכבר יצאה או נמסרה." };
  await supabase.from("audit_logs").insert({ order_id: id, action_type: "cancelled", performed_by: me.id, details: { reason } });
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/");
  return { ok: "ההזמנה בוטלה." };
}
