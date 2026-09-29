/**
 * WhatsApp message templates. Business-initiated WhatsApp Business API messages must use a template that
 * Meta approved in advance; these are the texts to register (category Utility, language Hebrew), and the
 * code that fills their {{n}} placeholders.
 */

export type WaKind = "confirm" | "transit" | "delivered" | "supplier";

export const WA_TEMPLATES: Record<WaKind, { label: string; setting: string; name: string; body: string; params: string[] }> = {
  confirm: {
    label: "אישור הזמנה",
    setting: "wa_tpl_confirm",
    name: "order_confirmation",
    body: "שלום {{1}}, תודה על ההזמנה מ{{2}}! הזמנה מס׳ {{3}} התקבלה: {{4}}. מועד אספקה: {{5}}. סה״כ לתשלום: {{6}}. לשאלות ושינויים אפשר להשיב להודעה הזאת.",
    params: ["שם הלקוח", "שם העסק", "מספר הזמנה", "המוצרים", "מועד וכתובת", "סכום"],
  },
  transit: {
    label: "ההזמנה בדרך",
    setting: "wa_tpl_transit",
    name: "order_on_the_way",
    body: "שלום {{1}}, הזמנה מס׳ {{2}} יצאה אליך עכשיו עם {{3}}.",
    params: ["שם הלקוח", "מספר הזמנה", "השליח"],
  },
  delivered: {
    label: "ההזמנה נמסרה",
    setting: "wa_tpl_delivered",
    name: "order_delivered",
    body: "שלום {{1}}, הזמנה מס׳ {{2}} נמסרה. תודה שבחרת ב{{3}}!",
    params: ["שם הלקוח", "מספר הזמנה", "שם העסק"],
  },
  supplier: {
    label: "הזמנה מספק",
    setting: "wa_tpl_supplier",
    name: "supplier_order",
    body: "שלום {{1}}, נבקש להזמין: {{2}}. תודה, {{3}}",
    params: ["שם הספק", "הפריטים", "שם העסק"],
  },
};

/** A template parameter as Meta accepts it: no line breaks or tabs, no runs of more than 4 spaces, not empty. */
export function templateParam(value: string): string {
  const v = value.replace(/[\r\n\t]+/g, " · ").replace(/ {2,}/g, " ").trim();
  return v === "" ? "-" : v.slice(0, 1000);
}

/** Fills a template body for showing what was sent. */
export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}
