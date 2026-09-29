import type { PostgrestError } from "@supabase/supabase-js";
import { getStaff, type Staff } from "../auth";
import { can, type Permission } from "../roles";

export type ActionResult = { error: string } | { ok: string } | null;

/** The signed-in staff member if they hold the permission; server actions call this first. */
export async function requireStaff(permission?: Permission): Promise<Staff> {
  const staff = await getStaff();
  if (!staff || (permission && !can(staff.roles, permission))) throw new Error("אין הרשאה לפעולה הזאת");
  return staff;
}

/** A readable Hebrew message for a database error. */
export function dbError(e: PostgrestError | null, fallback = "השמירה נכשלה. נסו שוב."): string {
  if (!e) return fallback;
  if (e.code === "23505") return "כבר קיים רישום עם הפרטים האלה.";
  if (e.code === "23503") return "אי אפשר למחוק: יש רישומים אחרים שתלויים בזה.";
  if (e.code === "42501" || e.message.includes("row-level security")) return "אין הרשאה לפעולה הזאת.";
  return fallback;
}

export const text = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
export const optional = (d: FormData, k: string) => text(d, k) || null;
export const number = (d: FormData, k: string) => {
  const v = Number(text(d, k).replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};
