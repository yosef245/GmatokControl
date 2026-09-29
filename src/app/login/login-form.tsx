"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toE164 } from "@/lib/phone";

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!e164) return setError("מספר נייד לא תקין. לדוגמה: 050-1234567");
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return setError("שליחת הקוד נכשלה. נסו שוב בעוד דקה.");
    setSentTo(e164);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ phone: sentTo, token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) return setError("הקוד שגוי או שפג תוקפו.");
    router.replace("/");
    router.refresh();
  }

  const input = "min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-lg tabular focus:border-accent focus:outline-none";
  const button = "min-h-12 rounded-lg bg-accent px-5 font-bold text-on-accent disabled:opacity-50";

  return sentTo ? (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <label htmlFor="code" className="font-bold">הקוד שקיבלת ב־SMS</label>
      <input id="code" className={input} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
      {error && <p className="text-bad">{error}</p>}
      <button className={button} disabled={busy || code.trim().length < 4}>כניסה</button>
      <button type="button" className="text-sm text-muted underline" onClick={() => { setSentTo(null); setCode(""); }}>
        החלפת מספר
      </button>
    </form>
  ) : (
    <form onSubmit={sendCode} className="flex flex-col gap-3">
      <label htmlFor="phone" className="font-bold">מספר נייד</label>
      <input id="phone" className={input} inputMode="tel" autoComplete="tel" dir="ltr" placeholder="050-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
      {error && <p className="text-bad">{error}</p>}
      <button className={button} disabled={busy}>שליחת קוד</button>
    </form>
  );
}
