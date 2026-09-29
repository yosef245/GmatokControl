import { toE164 } from "./phone";

/** Digits-only international number for wa.me, or null when the phone can't be read. */
export function waNumber(phone: string): string | null {
  const mobile = toE164(phone);
  if (mobile) return mobile.slice(1);
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = "972" + d.slice(1);
  return d.length >= 11 ? d : null;
}

export interface ConfirmationText {
  businessName: string;
  orderId: number;
  customerName: string;
  deliveryText: string;
  addressText: string | null;
  lines: { name: string; quantity: number; notes?: string | null }[];
  totalText?: string;
}

/** The order confirmation as a WhatsApp message (SRD: wa.me link with the text prefilled). */
export function confirmationMessage(c: ConfirmationText): string {
  return [
    `שלום ${c.customerName},`,
    `תודה על ההזמנה מ${c.businessName}! הזמנה מס׳ ${c.orderId} התקבלה.`,
    "",
    ...c.lines.map((l) => `• ${l.name} × ${l.quantity}${l.notes ? ` (${l.notes})` : ""}`),
    "",
    `מועד אספקה: ${c.deliveryText}`,
    ...(c.addressText ? [`כתובת: ${c.addressText}`] : ["איסוף עצמי"]),
    ...(c.totalText ? [`סה״כ לתשלום: ${c.totalText}`] : []),
    "",
    "לשאלות ושינויים אפשר להשיב להודעה הזאת.",
  ].join("\n");
}

export function waLink(phone: string, message: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}
