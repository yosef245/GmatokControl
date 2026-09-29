"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { dbError, number, requireStaff, text, type ActionResult } from "./result";

function refresh() {
  revalidatePath("/board");
  revalidatePath("/orders", "layout");
  revalidatePath("/inventory");
  revalidatePath("/");
}

export async function markProduced(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("markProduced");
  const qty = number(d, "quantity");
  if (!Number.isInteger(qty) || qty <= 0) return { error: "כמות צריכה להיות מספר שלם חיובי." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_produced", {
    p_product_id: text(d, "product_id"),
    p_batch_day: text(d, "batch_day"),
    p_quantity: qty,
  });
  if (error) return { error: error.code === "P0002" ? "הבאץ׳ הזה כבר יוצר במלואו." : dbError(error, "הסימון נכשל. נסו שוב.") };
  refresh();
  return { ok: `סומנו ${qty} יחידות.` };
}

export async function undoProduction(d: FormData) {
  await requireStaff("markProduced");
  const supabase = await createClient();
  await supabase.rpc("undo_production", { p_log_id: text(d, "log_id") });
  refresh();
}

/** Moves a batch one place up or down within its day, saving the whole day's order as manual ranks. */
export async function moveBatch(d: FormData) {
  const me = await requireStaff("reorderBoard");
  const keys = text(d, "order").split(",").filter(Boolean);
  const key = text(d, "key");
  const dir = text(d, "dir") === "up" ? -1 : 1;
  const i = keys.indexOf(key), j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return;
  [keys[i], keys[j]] = [keys[j], keys[i]];
  const supabase = await createClient();
  await supabase.from("batch_ranks").upsert(
    keys.map((k, rank) => {
      const [product_id, batch_day] = k.split("|");
      return { product_id, batch_day, rank, updated_by: me.id, updated_at: new Date().toISOString() };
    }),
  );
  revalidatePath("/board");
}

/** Clears the manual order for a day so the board goes back to the automatic order. */
export async function resetDayOrder(d: FormData) {
  await requireStaff("reorderBoard");
  const supabase = await createClient();
  await supabase.from("batch_ranks").delete().eq("batch_day", text(d, "day"));
  revalidatePath("/board");
}

export async function recordStock(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageStock");
  const type = text(d, "type");
  if (!["receive", "waste", "count", "opening"].includes(type)) return { error: "פעולה לא מוכרת." };
  const qty = number(d, "quantity");
  if (!(qty >= 0) || (type !== "count" && type !== "opening" && qty === 0)) return { error: "כמות לא תקינה." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_stock", {
    p_material_id: text(d, "material_id"),
    p_type: type,
    p_quantity: qty,
    p_reason: text(d, "reason"),
  });
  if (error) return { error: dbError(error) };
  refresh();
  const delta = Number(data);
  if (delta === 0) return { ok: "אין שינוי במלאי." };
  return { ok: delta > 0 ? `נוספו ${delta}.` : `ירדו ${-delta}.` };
}
