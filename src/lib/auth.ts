import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Role } from "./domain/types";

export interface Staff {
  id: string;
  fullName: string;
  phone: string;
  roles: Role[];
}

/** The signed-in staff member, or null when the phone number is not in the staff list. Redirects to /login when signed out. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) redirect("/login");
  const { data } = await supabase
    .from("users")
    .select("id, full_name, phone, roles")
    .eq("auth_user_id", uid)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, fullName: data.full_name, phone: data.phone, roles: data.roles as Role[] };
});
