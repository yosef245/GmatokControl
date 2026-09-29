"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { markProduced } from "@/lib/actions/production";
import { btnPrimary, inputCls, Pill } from "@/components/ui";
import { duration, fmt } from "@/lib/format";

export interface BatchView {
  key: string;
  productId: string;
  productName: string;
  day: string;
  remaining: number;
  workMinutes: number;
  latestStart: string;
  latestStartLabel: string;
  startLate: boolean;
  urgent: boolean;
  shortMaterials: string[];
  entries: { orderId: number; customer: string; remaining: number; deliveryLabel: string; urgent: boolean }[];
}

/** Same split as mark_produced in the database: entries arrive already in allocation order. */
function preview(entries: BatchView["entries"], qty: number) {
  let left = Math.min(Math.max(0, Math.floor(qty) || 0), entries.reduce((s, e) => s + e.remaining, 0));
  const out = new Map<number, number>();
  for (const e of entries) {
    if (left <= 0) break;
    const take = Math.min(left, e.remaining);
    out.set(e.orderId, (out.get(e.orderId) ?? 0) + take);
    left -= take;
  }
  return out;
}

export function BatchCard({ b, canMark, reorder }: { b: BatchView; canMark: boolean; reorder?: ReactNode }) {
  const [state, run, pending] = useActionState(markProduced, null);
  const [qty, setQty] = useState(String(b.remaining));
  const split = preview(b.entries, Number(qty));

  return (
    <article className={`rounded-xl border bg-surface p-4 ${b.shortMaterials.length ? "border-bad/50" : b.urgent ? "border-warn/60" : "border-line"}`}>
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold">{b.productName}</h3>
          <div className="text-sm text-muted">
            {fmt(b.remaining)} יח׳ · {duration(b.workMinutes)} עבודה ·{" "}
            <span className={b.startLate ? "font-bold text-bad" : ""}>להתחיל עד {b.latestStartLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {b.urgent && <Pill tone="orange">דחוף</Pill>}
          {b.shortMaterials.length > 0 && <Pill tone="red">חסר: {b.shortMaterials.join(", ")}</Pill>}
        </div>
        {reorder}
      </header>

      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {b.entries.map((e) => (
          <li key={`${e.orderId}-${e.remaining}`} className="flex flex-wrap items-center gap-2">
            <Link href={`/orders/${e.orderId}`} className="font-bold tabular-nums text-accent underline">#{e.orderId}</Link>
            <span className="min-w-0 flex-1">{e.customer}</span>
            <span className="text-muted">{e.deliveryLabel}</span>
            {e.urgent && <Pill tone="orange">דחוף</Pill>}
            <span className="tabular-nums">{fmt(e.remaining)}</span>
            {canMark && split.get(e.orderId) ? <span className="tabular-nums font-bold text-ok">+{fmt(split.get(e.orderId)!)}</span> : null}
          </li>
        ))}
      </ul>

      {canMark && (
        <form action={run} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input type="hidden" name="product_id" value={b.productId} />
          <input type="hidden" name="batch_day" value={b.day} />
          <label className="flex items-center gap-2">
            <span className="text-sm font-bold">יוצרו</span>
            <input
              name="quantity"
              type="number"
              min="1"
              max={b.remaining}
              step="1"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputCls + " w-24"}
            />
          </label>
          <button className={btnPrimary} disabled={pending || !(Number(qty) > 0)}>{pending ? "שומר…" : "סימון ייצור"}</button>
          {state && "error" in state && <span className="basis-full text-sm font-bold text-bad" role="alert">{state.error}</span>}
          {state && "ok" in state && <span className="basis-full text-sm font-bold text-ok" role="status">{state.ok}</span>}
        </form>
      )}
    </article>
  );
}
