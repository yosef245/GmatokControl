"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { can } from "../roles";
import { loadMaterials } from "../data";
import { fmt } from "../format";
import { sendOrderMessage, sendSupplierMessage, sendTestMessage } from "../wa-send";
import { dbError, requireStaff, text, type ActionResult } from "./result";

const ORDER_KINDS = ["confirm", "transit", "delivered"] as const;

export async function sendOrderWhatsApp(_: ActionResult, d: FormData): Promise<ActionResult> {
  const me = await requireStaff();
  const kind = text(d, "kind") as (typeof ORDER_KINDS)[number];
  if (!ORDER_KINDS.includes(kind)) return { error: "סוג הודעה לא מוכר." };
  const allowed = kind === "confirm" ? can(me.roles, "createOrder") : can(me.roles, "manageDeliveries");
  if (!allowed) return { error: "אין הרשאה לשלוח את ההודעה הזאת." };
  const id = Number(text(d, "order_id"));
  const r = await sendOrderMessage(me.id, id, kind);
  revalidatePath(`/orders/${id}`);
  return r.ok ? { ok: "ההודעה נשלחה ללקוח." } : { error: `השליחה נכשלה: ${r.error}` };
}

/** Sends one supplier everything that is below minimum from them. The list is rebuilt here from current stock. */
export async function sendSupplierWhatsApp(_: ActionResult, d: FormData): Promise<ActionResult> {
  const me = await requireStaff("manageStock");
  const supplier = text(d, "supplier");
  const rows = (await loadMaterials()).filter((m) => m.toOrder > 0 && (m.supplierName ?? "") === supplier);
  const phone = rows.find((m) => m.supplierPhone)?.supplierPhone;
  if (!rows.length || !phone) return { error: "אין מה להזמין מהספק הזה, או שחסר לו טלפון." };
  const items = rows.map((m) => `${m.name} ${fmt(Math.ceil(m.toOrder))} ${m.unit}`).join(", ");
  const r = await sendSupplierMessage(me.id, supplier, phone, items);
  revalidatePath("/inventory");
  return r.ok ? { ok: "ההזמנה נשלחה לספק." } : { error: `השליחה נכשלה: ${r.error}` };
}

export async function sendWhatsAppTest(_: ActionResult, d: FormData): Promise<ActionResult> {
  const me = await requireStaff("manageSettings");
  const r = await sendTestMessage(me.id, text(d, "phone"));
  revalidatePath("/settings");
  return r.ok ? { ok: "נשלחה הודעת בדיקה (hello_world). בדקו בטלפון." } : { error: `השליחה נכשלה: ${r.error}` };
}

const NAME = /^[a-z0-9_]{1,512}$/;

export async function saveWhatsAppSettings(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const tpl = (k: string) => text(d, k).toLowerCase();
  const row = {
    wa_auto_confirm: d.get("wa_auto_confirm") === "on",
    wa_auto_transit: d.get("wa_auto_transit") === "on",
    wa_auto_delivered: d.get("wa_auto_delivered") === "on",
    wa_lang: text(d, "wa_lang") || "he",
    wa_tpl_confirm: tpl("wa_tpl_confirm"),
    wa_tpl_transit: tpl("wa_tpl_transit"),
    wa_tpl_delivered: tpl("wa_tpl_delivered"),
    wa_tpl_supplier: tpl("wa_tpl_supplier"),
  };
  if (![row.wa_tpl_confirm, row.wa_tpl_transit, row.wa_tpl_delivered, row.wa_tpl_supplier].every((n) => NAME.test(n))) {
    return { error: "שם תבנית: אותיות באנגלית קטנות, ספרות וקו תחתון בלבד." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(row).eq("id", true);
  if (error) return { error: dbError(error) };
  revalidatePath("/settings");
  return { ok: "נשמר." };
}
