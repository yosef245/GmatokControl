const TZ = "Asia/Jerusalem";
const num = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });

export const fmt = (n: number) => num.format(Math.round(n * 1000) / 1000);
export const money = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(n);

const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

export function dayLabel(d: Date, now = new Date()): string {
  const k = day(d);
  if (k === day(now)) return "היום";
  if (k === day(new Date(now.getTime() + 864e5))) return "מחר";
  if (k === day(new Date(now.getTime() - 864e5))) return "אתמול";
  return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric" }).format(d);
}

export const when = (d: Date, now = new Date()) => `${dayLabel(d, now)} ${time(d)}`;

export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} שע׳${r ? ` ${r} דק׳` : ""}` : `${r} דק׳`;
}
