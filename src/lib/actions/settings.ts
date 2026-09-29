"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import type { Role } from "../domain/types";
import { ROLE_LABELS } from "../roles";
import { dbError, number, optional, requireStaff, text, type ActionResult } from "./result";
import { IMPORT_KINDS, parseSheet, type ImportKind, type ImportRow } from "../import";

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
  if (id) {
    const { error } = await supabase.from("users").update(row).eq("id", id);
    if (error) return { error: dbError(error) };
    revalidatePath("/settings");
    return { ok: "העובד עודכן." };
  }
  const { data: added, error } = await supabase.from("users").insert(row).select("id").single();
  if (error) return { error: dbError(error) };
  revalidatePath("/settings");
  if (!email) return { ok: "העובד נוסף. בלי אימייל אין לו כניסה למערכת." };
  const { error: loginError } = await supabase.rpc("reset_staff_password", { p_user_id: added.id });
  if (loginError) return { ok: `העובד נוסף, אבל עוד אין לו כניסה: ${passwordError(loginError.message)}` };
  return { ok: "העובד נוסף. הוא נכנס עם האימייל והסיסמה הראשונית, ויתבקש לבחור סיסמה משלו." };
}

function passwordError(message: string) {
  if (message.includes("initial password")) return "קודם שומרים סיסמה ראשונית למעלה.";
  if (message.includes("no email")) return "לעובד אין אימייל.";
  if (message.includes("too short")) return "הסיסמה צריכה לפחות 6 תווים.";
  return "הפעולה נכשלה. נסו שוב.";
}

export async function saveInitialPassword(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const password = String(d.get("initial_password") ?? "");
  if (password.length < 6) return { error: "הסיסמה צריכה לפחות 6 תווים." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_initial_password", { p_password: password });
  if (error) return { error: passwordError(error.message) };
  revalidatePath("/settings");
  return { ok: "הסיסמה הראשונית נשמרה." };
}

export async function resetStaffPassword(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_staff_password", { p_user_id: text(d, "id") });
  if (error) return { error: passwordError(error.message) };
  revalidatePath("/settings");
  return { ok: "הסיסמה אופסה לסיסמה הראשונית. בכניסה הבאה העובד יבחר סיסמה חדשה." };
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

/** Creates a price list, or renames / (de)activates an existing one. */
export async function savePriceList(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const id = optional(d, "id");
  const name = text(d, "name");
  if (!name) return { error: "חסר שם למחירון." };
  const row = { name, notes: optional(d, "notes"), ...(id ? { is_active: d.get("is_active") === "on" } : {}) };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("price_lists").update(row).eq("id", id)
    : await supabase.from("price_lists").insert(row);
  if (error) return { error: error.code === "23505" ? "כבר יש מחירון בשם הזה." : dbError(error) };
  revalidatePath("/settings");
  return { ok: id ? "נשמר." : "המחירון נוסף. עכשיו ממלאים בו מחירים." };
}

/** Saves a price list's prices: a filled field sets the product's price on the list, an empty one removes it. */
export async function savePriceListPrices(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const listId = text(d, "id");
  const set: { price_list_id: string; product_id: string; price: number }[] = [];
  const clear: string[] = [];
  for (const [k, v] of d.entries()) {
    if (!k.startsWith("price_")) continue;
    const productId = k.slice(6);
    const raw = String(v).trim().replace(",", ".");
    if (raw === "") { clear.push(productId); continue; }
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) return { error: "יש מחיר לא תקין." };
    set.push({ price_list_id: listId, product_id: productId, price });
  }
  const supabase = await createClient();
  if (set.length) {
    const { error } = await supabase.from("price_list_items").upsert(set);
    if (error) return { error: dbError(error) };
  }
  if (clear.length) {
    const { error } = await supabase.from("price_list_items").delete().eq("price_list_id", listId).in("product_id", clear);
    if (error) return { error: dbError(error) };
  }
  revalidatePath("/settings");
  return { ok: `נשמרו ${set.length} מחירים.` };
}

/** Imports rows already read and checked in the browser; they are checked again here before the database call. */
export async function importRows(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff("manageSettings");
  const kind = text(d, "kind");
  if (!(kind in IMPORT_KINDS)) return { error: "סוג ייבוא לא מוכר." };
  let rows: ImportRow[];
  try {
    rows = JSON.parse(text(d, "rows"));
  } catch {
    return { error: "הנתונים לא נקראו. טענו את הקובץ שוב." };
  }
  const columns = IMPORT_KINDS[kind as ImportKind].columns;
  const check = parseSheet(kind as ImportKind, [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => r[c.key] ?? ""))]);
  if (check.errors.length || check.missing.length || !check.rows.length) return { error: "יש בקובץ שורות לא תקינות. תקנו וטענו שוב." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_rows", { p_kind: kind, p_rows: check.rows });
  if (error) {
    const name = /"(.+)"/.exec(error.message)?.[1];
    if (error.code === "P0002" && name) return { error: `לא נמצא: ${name}. שום דבר לא יובא.` };
    return { error: dbError(error, "הייבוא נכשל ושום דבר לא נשמר. נסו שוב.") };
  }
  revalidatePath("/", "layout");
  const { added, updated } = data as { added: number; updated: number };
  return { ok: `יובא: ${added} חדשים, ${updated} עודכנו.` };
}
