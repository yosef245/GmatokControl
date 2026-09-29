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
