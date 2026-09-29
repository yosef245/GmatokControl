import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { waConfigured } from "@/lib/wa-api";
import { loadWaMessages } from "@/lib/wa-log";
import { WA_TEMPLATES, type WaKind } from "@/lib/wa-templates";
import { saveWhatsAppSettings, sendWhatsAppTest } from "@/lib/actions/whatsapp";
import { ActionForm } from "@/components/action-form";
import { WaMessages } from "@/components/wa-messages";
import { btnPrimary, btnSecondary, Card, Field, inputCls, Pill } from "@/components/ui";

const AUTO: { key: string; label: string }[] = [
  { key: "wa_auto_confirm", label: "לשלוח אישור הזמנה כשנוצרת הזמנה" },
  { key: "wa_auto_transit", label: "להודיע ללקוח כשההזמנה יוצאת לאספקה" },
  { key: "wa_auto_delivered", label: "להודות ללקוח כשההזמנה נמסרה" },
];

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <Pill tone={ok ? "green" : "orange"}>{ok ? "מוגדר" : "חסר"}</Pill>
      {children}
    </li>
  );
}

export async function WhatsAppSettings() {
  const supabase = await createClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const [{ data: s }, { data: secret }, messages] = await Promise.all([
    supabase.from("settings").select("*").single(),
    supabase.from("integration_secrets").select("whatsapp_webhook_token").maybeSingle(),
    loadWaMessages({ limit: 20 }),
  ]);
  const connected = waConfigured();
  const env = (k: string) => !!process.env[k];
  const tokenMatches = !!secret && process.env.WHATSAPP_VERIFY_TOKEN === secret.whatsapp_webhook_token;

  return (
    <>
      <Card title="חיבור WhatsApp Business">
        <p className="mb-3">
          {connected ? <Pill tone="green">מחובר</Pill> : <Pill tone="orange">לא מחובר</Pill>}{" "}
          <span className="text-sm text-muted">
            {connected
              ? "ההודעות נשלחות ישירות מהמערכת, בלי לפתוח וואטסאפ בטלפון."
              : "עד שמחברים, כפתורי הוואטסאפ פותחים הודעה מוכנה בוואטסאפ של הטלפון, כמו עד עכשיו."}
          </span>
        </p>
        <ul className="flex flex-col gap-1.5 text-sm">
          <Check ok={env("WHATSAPP_TOKEN")}><code dir="ltr">WHATSAPP_TOKEN</code> טוקן קבוע של משתמש מערכת ב־Meta</Check>
          <Check ok={env("WHATSAPP_PHONE_NUMBER_ID")}><code dir="ltr">WHATSAPP_PHONE_NUMBER_ID</code> מזהה מספר הטלפון השולח</Check>
          <Check ok={tokenMatches}><code dir="ltr">WHATSAPP_VERIFY_TOKEN</code> הטוקן של ה־Webhook (למטה)</Check>
          <Check ok={env("WHATSAPP_APP_SECRET")}><code dir="ltr">WHATSAPP_APP_SECRET</code> לא חובה: בדיקת חתימה של Meta</Check>
        </ul>
        <details className="mt-4">
          <summary className="cursor-pointer font-bold text-accent">איך מחברים (פעם אחת)</summary>
          <ol className="mt-2 flex list-decimal flex-col gap-2 ps-5 text-sm">
            <li>ב־<a className="underline" href="https://business.facebook.com" target="_blank" rel="noopener">Meta Business</a> יוצרים אפליקציה מסוג Business ומוסיפים לה WhatsApp. מחברים מספר טלפון עסקי (מספר שלא פעיל באפליקציית וואטסאפ רגילה).</li>
            <li>ב־WhatsApp Manager ← Message templates יוצרים את ארבע התבניות שלמטה, בקטגוריה Utility ובשפה Hebrew, ומחכים לאישור (בדרך כלל דקות עד שעות).</li>
            <li>ב־Business Settings ← System users יוצרים משתמש מערכת, נותנים לו גישה לאפליקציה ולחשבון הוואטסאפ, ומפיקים טוקן קבוע עם ההרשאות whatsapp_business_messaging ו־whatsapp_business_management.</li>
            <li>ב־Vercel ← Settings ← Environment Variables מוסיפים את המשתנים שלמעלה (אפשר כ־Sensitive), ואז Redeploy.</li>
            <li>ב־Meta, באפליקציה ← WhatsApp ← Configuration ← Webhook: מדביקים את הכתובת והטוקן שלמטה, ומסמנים את השדה messages. כך המערכת יודעת אם ההודעה הגיעה ונקראה.</li>
            <li>שולחים הודעת בדיקה מלמטה.</li>
          </ol>
        </details>
      </Card>

      <Card title="Webhook לסטטוס הודעות">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">כתובת</dt>
          <dd><code dir="ltr" className="break-all">{`${proto}://${host}/api/whatsapp/webhook`}</code></dd>
          <dt className="text-muted">טוקן</dt>
          <dd><code dir="ltr" className="break-all">{secret?.whatsapp_webhook_token}</code></dd>
        </dl>
        <p className="mt-2 text-xs text-muted">אותו טוקן נכנס גם ל־Vercel בתור WHATSAPP_VERIFY_TOKEN.</p>
      </Card>

      <Card title="שליחה אוטומטית ותבניות">
        <ActionForm action={saveWhatsAppSettings} className="grid gap-4 md:grid-cols-2">
          <fieldset className="flex flex-col gap-2 md:col-span-2">
            {AUTO.map((a) => (
              <label key={a.key} className="flex items-center gap-2">
                <input type="checkbox" name={a.key} defaultChecked={!!s?.[a.key]} className="size-4 accent-accent" /> {a.label}
              </label>
            ))}
          </fieldset>
          {(Object.keys(WA_TEMPLATES) as WaKind[]).map((k) => (
            <Field key={k} label={`שם התבנית: ${WA_TEMPLATES[k].label}`}>
              <input name={WA_TEMPLATES[k].setting} defaultValue={s?.[WA_TEMPLATES[k].setting] ?? WA_TEMPLATES[k].name} className={inputCls} dir="ltr" />
            </Field>
          ))}
          <Field label="שפת התבניות" hint="he = עברית"><input name="wa_lang" defaultValue={s?.wa_lang ?? "he"} className={inputCls} dir="ltr" /></Field>
          <div className="md:col-span-2"><button className={btnPrimary}>שמירה</button></div>
        </ActionForm>
      </Card>

      <Card title="נוסח התבניות ליצירה ב־Meta">
        <ul className="flex flex-col gap-3 text-sm">
          {(Object.keys(WA_TEMPLATES) as WaKind[]).map((k) => (
            <li key={k} className="rounded-lg bg-sunken p-3">
              <div className="mb-1 flex flex-wrap gap-2"><b>{WA_TEMPLATES[k].label}</b><code dir="ltr">{WA_TEMPLATES[k].name}</code></div>
              <p className="select-all">{WA_TEMPLATES[k].body}</p>
              <p className="mt-1 text-xs text-muted">{WA_TEMPLATES[k].params.map((p, i) => `{{${i + 1}}} ${p}`).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="הודעת בדיקה">
        <ActionForm action={sendWhatsAppTest} className="flex flex-wrap items-end gap-2">
          <Field label="טלפון" hint="נשלחת התבנית hello_world שקיימת בכל חשבון" className="min-w-48 flex-1">
            <input name="phone" className={inputCls} dir="ltr" inputMode="tel" required />
          </Field>
          <button className={btnSecondary} disabled={!connected}>שליחת בדיקה</button>
        </ActionForm>
      </Card>

      <Card title="הודעות אחרונות">
        <WaMessages messages={messages} showTarget />
      </Card>
    </>
  );
}
