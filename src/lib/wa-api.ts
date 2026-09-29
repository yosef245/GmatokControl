/**
 * WhatsApp Business (Cloud) API client. Configuration comes only from server environment variables:
 *   WHATSAPP_TOKEN            permanent access token of the Meta system user
 *   WHATSAPP_PHONE_NUMBER_ID  the sending number's id (WhatsApp Manager → API Setup)
 *   WHATSAPP_VERIFY_TOKEN     the webhook token shown in Settings → WhatsApp
 *   WHATSAPP_APP_SECRET       optional: the Meta app secret, to check webhook signatures
 *   WHATSAPP_API_BASE         optional: API address (tests point it at a local stand-in)
 */
const VERSION = "v21.0";

export function waConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export type SendResult = { id: string } | { error: string };

export async function sendTemplate(to: string, template: string, lang: string, params: string[]): Promise<SendResult> {
  if (!waConfigured()) return { error: "WhatsApp Business לא מחובר" };
  const base = process.env.WHATSAPP_API_BASE || "https://graph.facebook.com";
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}),
    },
  };
  try {
    const res = await fetch(`${base}/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    const id = json.messages?.[0]?.id;
    if (res.ok && id) return { id };
    return { error: json.error?.message ? `${json.error.message}${json.error.code ? ` (${json.error.code})` : ""}` : `HTTP ${res.status}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאת רשת" };
  }
}
