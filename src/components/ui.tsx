import type { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(42_27_20/0.06)] ${className}`}>
      {title && <h2 className="mb-3 font-display text-lg text-accent">{title}</h2>}
      {children}
    </section>
  );
}

const TONES = {
  red: "bg-bad-bg text-bad",
  orange: "bg-warn-bg text-warn",
  green: "bg-ok-bg text-ok",
  blue: "bg-info-bg text-info",
  neutral: "bg-sunken text-muted",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-2xl text-accent md:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function ComingSoon({ title, sprint, children }: { title: string; sprint: number; children: ReactNode }) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <Card>
        <p className="mb-2">
          <Pill tone="blue">בפיתוח · ספרינט {sprint}</Pill>
        </p>
        <p className="text-muted">{children}</p>
      </Card>
    </>
  );
}

export const inputCls =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 focus:border-accent focus:outline-none disabled:opacity-60";
export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-bold text-on-accent disabled:opacity-50";
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 font-bold hover:bg-sunken disabled:opacity-50";
export const btnDanger =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-bad/40 bg-surface px-4 font-bold text-bad hover:bg-bad-bg disabled:opacity-50";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Tabs({ items, current }: { items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <a
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 font-bold ${t.key === current ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"}`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
