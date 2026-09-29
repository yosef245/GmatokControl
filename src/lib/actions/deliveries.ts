"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { dbError, optional, requireStaff, text, type ActionResult } from "./result";

const DONE: Record<string, string> = {
  assign: "השליח שובץ.",
  depart: "סומן: יצא לאספקה.",
  deliver: "ההזמנה נמסרה.",
  return: "ההזמנה חזרה למוכנות למשלוח.",
};

/** One delivery step on an order: assign a courier, depart, deliver or return. */
export async function deliveryStep(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageDeliveries");
  const step = text(d, "step");
  if (!(step in DONE)) return { error: "פעולה לא מוכרת." };
  const courier = optional(d, "courier");
  const staffCourier = courier?.startsWith("user:") ? courier.slice(5) : null;
  const courierName = staffCourier ? null : optional(d, "courier_name");
  if (step === "assign" && !staffCourier && !courierName) return { error: "בחרו שליח או כתבו שם." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delivery_step", {
    p_order_id: Number(text(d, "order_id")),
    p_step: step,
    p_courier_user_id: staffCourier,
    p_courier_name: courierName,
    p_receiver_name: optional(d, "receiver"),
    p_notes: optional(d, "notes"),
  });
  if (error) {
    if (error.code === "22023") return { error: "ההזמנה כבר לא במצב הזה. רעננו את הדף." };
    return { error: dbError(error, "הפעולה נכשלה. נסו שוב.") };
  }
  revalidatePath("/deliveries");
  revalidatePath("/orders", "layout");
  revalidatePath("/");
  return { ok: DONE[step] };
}
