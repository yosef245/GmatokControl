"use server";

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { requireStaff, type ActionResult } from "./result";

/** The signed-in worker replaces the initial password with their own. */
export async function changePassword(_: ActionResult, d: FormData): Promise<ActionResult> {
  await requireStaff();
  const password = String(d.get("password") ?? "");
  if (password.length < 6) return { error: "הסיסמה צריכה לפחות 6 תווים." };
  if (password !== String(d.get("confirm") ?? "")) return { error: "שתי הסיסמאות לא זהות." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "בחרו סיסמה שונה מהסיסמה הראשונית." };
    if (error.code === "weak_password") return { error: "הסיסמה חלשה מדי. נסו סיסמה ארוכה יותר." };
    return { error: "שינוי הסיסמה נכשל. נסו שוב." };
  }
  await supabase.rpc("password_changed");
  redirect("/");
}
