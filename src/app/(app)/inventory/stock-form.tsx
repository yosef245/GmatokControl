"use client";

import { useActionState, useState } from "react";
import { recordStock } from "@/lib/actions/production";
import { btnPrimary, Field, inputCls } from "@/components/ui";

const TYPES = {
  receive: { label: "קבלת סחורה", qty: "כמה התקבל", reason: "ספק / תעודת משלוח" },
  count: { label: "ספירת מלאי", qty: "כמה יש בפועל", reason: "הערה" },
  waste: { label: "פחת", qty: "כמה נזרק", reason: "סיבה" },
} as const;
type T = keyof typeof TYPES;

export function StockForm({ materialId, unit }: { materialId: string; unit: string }) {
  const [state, run, pending] = useActionState(recordStock, null);
  const [type, setType] = useState<T>("receive");
  const t = TYPES[type];
  return (
    <form action={run} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="material_id" value={materialId} />
      <fieldset className="flex basis-full flex-wrap gap-1" aria-label="סוג פעולה">
        {(Object.keys(TYPES) as T[]).map((k) => (
          <label key={k} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-bold ${type === k ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}>
            <input type="radio" name="type" value={k} checked={type === k} onChange={() => setType(k)} className="sr-only" />
            {TYPES[k].label}
          </label>
        ))}
      </fieldset>
      <Field label={`${t.qty} (${unit})`} className="w-40">
        <input key={type} name="quantity" type="number" step="0.001" min={type === "count" ? 0 : 0.001} required className={inputCls} />
      </Field>
      <Field label={t.reason} className="min-w-48 flex-1">
        <input key={type + "r"} name="reason" className={inputCls} required={type === "waste"} />
      </Field>
      <button className={btnPrimary} disabled={pending}>{pending ? "שומר…" : "שמירה"}</button>
      {state && "error" in state && <p className="basis-full text-sm font-bold text-bad" role="alert">{state.error}</p>}
      {state && "ok" in state && <p className="basis-full text-sm font-bold text-ok" role="status">{state.ok}</p>}
    </form>
  );
}
