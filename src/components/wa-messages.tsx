import { WA_KIND_LABEL, WA_STATUS, type WaMessage } from "@/lib/wa-log";
import { when } from "@/lib/format";
import { Pill } from "./ui";

export function WaMessages({ messages, showTarget = false }: { messages: WaMessage[]; showTarget?: boolean }) {
  if (!messages.length) return <p className="text-sm text-muted">עוד לא נשלחו הודעות.</p>;
  return (
    <ul className="divide-y divide-line">
      {messages.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
          <b>{WA_KIND_LABEL[m.kind] ?? m.kind}</b>
          {showTarget && <span>{m.orderId ? `הזמנה #${m.orderId}` : m.supplier}</span>}
          <span className="text-muted" dir="ltr">+{m.toPhone}</span>
          <span className="text-muted">{when(m.at)}{m.automatic ? " · אוטומטית" : m.by ? ` · ${m.by}` : ""}</span>
          <span className="ms-auto"><Pill tone={WA_STATUS[m.status].tone}>{WA_STATUS[m.status].label}</Pill></span>
          {m.error && <div className="basis-full text-xs text-bad">{m.error}</div>}
        </li>
      ))}
    </ul>
  );
}
