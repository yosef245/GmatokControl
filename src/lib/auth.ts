import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Role } from "./domain/types";

export interface Staff {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
}

/** The signed-in staff member, or null when the login is not in the staff list. Redirects to /login when signed out. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) redirect("/login");
  const { data } = await supabase
    .from("users")
    .select("id, full_name, email, phone, roles")
    .eq("auth_user_id", uid)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, fullName: data.full_name, email: data.email, phone: data.phone, roles: data.roles as Role[] };
});
