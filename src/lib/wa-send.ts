import { createClient } from "./supabase/server";
import { loadOrder } from "./order-detail";
import { waNumber } from "./whatsapp";
import { fullWhen, money } from "./format";
import { sendTemplate, waConfigured } from "./wa-api";
import { templateParam, WA_TEMPLATES, type WaKind } from "./wa-templates";

export interface WaSettings {
  businessName: string;
  vat: number;
  lang: string;
  auto: { confirm: boolean; transit: boolean; delivered: boolean };
  templates: Record<WaKind, string>;
}

export async function loadWaSettings(): Promise<WaSettings> {
  const supabase = await createClient();
  const { data: s } = await supabase.from("settings").select("*").single();
  return {
    businessName: s?.business_name ?? "",
    vat: Number(s?.vat_percent ?? 18),
    lang: s?.wa_lang || "he",
    auto: { confirm: !!s?.wa_auto_confirm, transit: !!s?.wa_auto_transit, delivered: !!s?.wa_auto_delivered },
    templates: {
      confirm: s?.wa_tpl_confirm || WA_TEMPLATES.confirm.name,
      transit: s?.wa_tpl_transit || WA_TEMPLATES.transit.name,
      delivered: s?.wa_tpl_delivered || WA_TEMPLATES.delivered.name,
      supplier: s?.wa_tpl_supplier || WA_TEMPLATES.supplier.name,
    },
  };
}

type Outcome = { ok: true } | { ok: false; error: string };

/** Sends one template message and logs it (sent or failed) in whatsapp_messages. */
async function sendAndLog(
  meId: string,
  log: { order_id?: number; raw_material_supplier?: string; kind: string; automatic?: boolean },
  phone: string,
  template: string,
  lang: string,
  params: string[],
): Promise<Outcome> {
  const to = waNumber(phone);
  if (!to) return { ok: false, error: "מספר הטלפון לא מתאים לוואטסאפ." };
  const res = await sendTemplate(to, template, lang, params.map(templateParam));
  const supabase = await createClient();
  await supabase.from("whatsapp_messages").insert({
    ...log,
    to_phone: to,
    template,
    sent_by: meId,
    ...("id" in res ? { wa_message_id: res.id } : { status: "failed", error: res.error.slice(0, 500) }),
  });
  return "id" in res ? { ok: true } : { ok: false, error: res.error };
}

/** Sends an order message to its customer: confirmation, on the way, or delivered. */
export async function sendOrderMessage(meId: string, orderId: number, kind: Exclude<WaKind, "supplier">, automatic = false): Promise<Outcome> {
  if (!waConfigured()) return { ok: false, error: "WhatsApp Business עוד לא מחובר (הגדרות ← וואטסאפ)." };
  const [o, s] = await Promise.all([loadOrder(orderId), loadWaSettings()]);
  if (!o) return { ok: false, error: "ההזמנה לא נמצאה." };
  const name = o.customer.contactName || o.customer.name;
  const params =
    kind === "confirm"
      ? [
          name,
          s.businessName,
          String(o.id),
          o.items.map((i) => `${i.productName} × ${i.quantity}`).join(", "),
          `${fullWhen(o.deliveryDate)}, ${o.address ? `${o.address.address}, ${o.address.city}` : "איסוף עצמי"}`,
          `${money(o.total * (1 + s.vat / 100))} כולל מע״מ`,
        ]
      : kind === "transit"
        ? [name, String(o.id), o.delivery?.courier ?? "השליח שלנו"]
        : [name, String(o.id), s.businessName];
  return sendAndLog(meId, { order_id: o.id, kind, automatic }, o.customer.phone, s.templates[kind], s.lang, params);
}

/** Sends a supplier the list of materials to order. */
export async function sendSupplierMessage(meId: string, supplier: string, phone: string, items: string): Promise<Outcome> {
  if (!waConfigured()) return { ok: false, error: "WhatsApp Business עוד לא מחובר." };
  const s = await loadWaSettings();
  return sendAndLog(meId, { raw_material_supplier: supplier, kind: "supplier" }, phone, s.templates.supplier, s.lang, [supplier, items, s.businessName]);
}

/** Meta's built-in "hello_world" template, to check the connection. */
export async function sendTestMessage(meId: string, phone: string): Promise<Outcome> {
  if (!waConfigured()) return { ok: false, error: "חסרים משתני הסביבה של WhatsApp ב־Vercel." };
  return sendAndLog(meId, { kind: "test" }, phone, "hello_world", "en_US", []);
}
