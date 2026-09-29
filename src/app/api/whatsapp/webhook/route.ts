import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

/** Meta calls this once with GET to confirm the webhook, using the token shown in Settings → WhatsApp. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

function signatureOk(body: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // optional: without the app secret the database token still guards status updates
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface StatusEvent {
  id?: string;
  status?: string;
  errors?: { title?: string; message?: string; code?: number }[];
}

/** Delivery and read receipts for the messages we sent. Anything else in the payload is ignored. */
export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!signatureOk(body, request.headers.get("x-hub-signature-256"))) return new Response("bad signature", { status: 401 });
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  let payload: { entry?: { changes?: { value?: { statuses?: StatusEvent[] } }[] }[] };
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const statuses = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []));
  if (token && statuses.length) {
    const { url, key } = supabaseEnv();
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    for (const s of statuses) {
      if (!s.id || !s.status) continue;
      const err = s.errors?.[0];
      await supabase.rpc("whatsapp_status", {
        p_token: token,
        p_wa_id: s.id,
        p_status: s.status,
        p_error: err ? [err.title, err.message, err.code].filter(Boolean).join(" · ") : null,
      });
    }
  }
  return new Response("ok", { status: 200 });
}
