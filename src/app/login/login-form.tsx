"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError("האימייל או הסיסמה שגויים.");
    router.replace("/");
    router.refresh();
  }

  const input = "min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-accent focus:outline-none";

  return (
    <form onSubmit={signIn} className="flex flex-col gap-3">
      <label htmlFor="email" className="font-bold">אימייל</label>
      <input id="email" type="email" className={input} autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
      <label htmlFor="password" className="font-bold">סיסמה</label>
      <input id="password" type="password" className={input} autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-bad">{error}</p>}
      <button className="min-h-12 rounded-lg bg-accent px-5 font-bold text-on-accent disabled:opacity-50" disabled={busy}>
        כניסה
      </button>
    </form>
  );
}
