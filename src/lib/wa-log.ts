import { createClient } from "./supabase/server";

export interface WaMessage {
  id: string;
  kind: string;
  template: string;
  toPhone: string;
  status: "sent" | "delivered" | "read" | "failed";
  error: string | null;
  automatic: boolean;
  at: Date;
  by: string | null;
  orderId: number | null;
  supplier: string | null;
}

export const WA_KIND_LABEL: Record<string, string> = {
  confirm: "אישור הזמנה",
  transit: "ההזמנה בדרך",
  delivered: "ההזמנה נמסרה",
  supplier: "הזמנה מספק",
  test: "בדיקה",
};
export const WA_STATUS = {
  sent: { label: "נשלחה", tone: "neutral" },
  delivered: { label: "הגיעה", tone: "blue" },
  read: { label: "נקראה", tone: "green" },
  failed: { label: "נכשלה", tone: "red" },
} as const;

export async function loadWaMessages(filter: { orderId?: number; limit?: number }): Promise<WaMessage[]> {
  const supabase = await createClient();
  let q = supabase
    .from("whatsapp_messages")
    .select("id, kind, template, to_phone, status, error, automatic, created_at, order_id, raw_material_supplier, users(full_name)")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 50);
  if (filter.orderId) q = q.eq("order_id", filter.orderId);
  const { data } = await q;
  return (data ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    template: m.template,
    toPhone: m.to_phone,
    status: m.status,
    error: m.error,
    automatic: m.automatic,
    at: new Date(m.created_at),
    by: (m.users as unknown as { full_name: string } | null)?.full_name ?? null,
    orderId: m.order_id,
    supplier: m.raw_material_supplier,
  }));
}
