"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import type { Role } from "../domain/types";
import { ROLE_LABELS } from "../roles";
import { dbError, number, optional, requireStaff, text, type ActionResult } from "./result";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export async function saveBusiness(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const vat = number(d, "vat_percent"), workers = number(d, "shift_workers"), hours = number(d, "shift_hours"), transit = number(d, "delivery_minutes");
  if (![vat, workers, hours, transit].every((n) => n >= 0) || workers < 1 || hours <= 0 || hours > 24) return { error: "בדקו את המספרים." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      business_name: text(d, "business_name") || "גוונים של מתוק",
      business_phone: optional(d, "business_phone"),
      business_address: optional(d, "business_address"),
      business_tax_id: optional(d, "business_tax_id"),
      vat_percent: vat,
      shift_workers: Math.round(workers),
      shift_hours: hours,
      delivery_minutes: Math.round(transit),
    })
    .eq("id", true);
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: "נשמר." };
}

export async function saveStaff(_: ActionResult, d: FormData): Promise<ActionResult> {
  const me = await requireStaff("manageSettings");
  const id = optional(d, "id");
  const roles = d.getAll("roles").map(String).filter((r): r is Role => ROLES.includes(r as Role));
  const email = optional(d, "email")?.toLowerCase() ?? null;
  const phone = optional(d, "phone");
  const fullName = text(d, "full_name");
  const active = id ? d.get("is_active") === "on" : true;
  if (!fullName) return { error: "חסר שם." };
  if (!email && !phone) return { error: "צריך אימייל (לכניסה) או טלפון." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "האימייל לא תקין." };
  if (roles.length === 0) return { error: "בחרו לפחות תפקיד אחד." };
  if (id === me.id && (!roles.includes("admin") || !active)) return { error: "אי אפשר להסיר ממך את הרשאת המנהל." };
  const supabase = await createClient();
  const row = { full_name: fullName, email, phone, roles, is_active: active };
  const { error } = id ? await supabase.from("users").update(row).eq("id", id) : await supabase.from("users").insert(row);
  if (error) return { error: dbError(error) };
  revalidatePath("/settings");
  return { ok: id ? "העובד עודכן." : "העובד נוסף. כדי שיוכל להיכנס, צרו לו משתמש ב־Supabase עם אותו אימייל." };
}

export async function saveMaterial(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const id = optional(d, "id");
  const name = text(d, "name"), unit = text(d, "unit_of_measure");
  const minimum = number(d, "minimum_threshold");
  if (!name || !unit) return { error: "חסרים שם ויחידת מידה." };
  if (!(minimum >= 0)) return { error: "המינימום צריך להיות מספר." };
  const supabase = await createClient();
  const row = { name, unit_of_measure: unit, minimum_threshold: minimum, supplier_name: optional(d, "supplier_name"), supplier_phone: optional(d, "supplier_phone") };
  const { error } = id ? await supabase.from("raw_materials").update(row).eq("id", id) : await supabase.from("raw_materials").insert(row);
  if (error) return { error: dbError(error) };
  revalidatePath("/settings");
  revalidatePath("/inventory");
  return { ok: id ? "עודכן." : "החומר נוסף. את המלאי ההתחלתי מזינים במסך המלאי (ספרינט 2)." };
}

function productRow(d: FormData) {
  return {
    name: text(d, "name"),
    category: optional(d, "category"),
    price: number(d, "price"),
    estimated_production_minutes: Math.round(number(d, "estimated_production_minutes")),
    is_active: d.get("is_active") !== null ? d.get("is_active") === "on" : true,
  };
}

export async function createProduct(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const row = productRow(d);
  if (!row.name) return { error: "חסר שם מוצר." };
  if (!(row.price >= 0) || !(row.estimated_production_minutes >= 0)) return { error: "מחיר וזמן ייצור צריכים להיות מספרים." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").insert(row).select("id").single();
  if (error) return { error: dbError(error) };
  redirect(`/settings/products/${data.id}`);
}

export async function updateProduct(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const id = text(d, "id");
  const row = { ...productRow(d), is_active: d.get("is_active") === "on" };
  if (!row.name) return { error: "חסר שם מוצר." };
  if (!(row.price >= 0) || !(row.estimated_production_minutes >= 0)) return { error: "מחיר וזמן ייצור צריכים להיות מספרים." };
  const supabase = await createClient();
  const { error } = await supabase.from("products").update(row).eq("id", id);
  if (error) return { error: dbError(error) };
  revalidatePath("/settings");
  revalidatePath(`/settings/products/${id}`);
  return { ok: "נשמר." };
}

export async function saveRecipeLine(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const productId = text(d, "product_id"), materialId = text(d, "raw_material_id");
  const qty = number(d, "quantity_per_unit");
  if (!materialId) return { error: "בחרו חומר גלם." };
  if (!(qty > 0)) return { error: "הכמות ליחידה צריכה להיות גדולה מאפס." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .upsert({ product_id: productId, raw_material_id: materialId, quantity_per_unit: qty }, { onConflict: "product_id,raw_material_id" });
  if (error) return { error: dbError(error) };
  revalidatePath(`/settings/products/${productId}`);
  return { ok: "המתכון עודכן." };
}

export async function removeRecipeLine(d: FormData) {
  await requireStaff("manageSettings");
  const supabase = await createClient();
  const productId = text(d, "product_id");
  await supabase.from("recipes").delete().eq("id", text(d, "id"));
  revalidatePath(`/settings/products/${productId}`);
}
