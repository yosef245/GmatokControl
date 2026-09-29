const TZ = "Asia/Jerusalem";

/** Offset of Israel time from UTC, in minutes, at the given instant (+120 in winter, +180 in summer). */
function israelOffset(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "2026-10-01" + "14:30" read as Israel wall-clock time → the instant. Null when the input is not a valid date/time. */
export function fromIsraelLocal(date: string, time: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  if (Number.isNaN(naive) || +t[1] > 23 || +t[2] > 59) return null;
  // two passes so the offset is taken at the target instant, which matters on DST change days
  let at = new Date(naive - israelOffset(new Date(naive)) * 60_000);
  at = new Date(naive - israelOffset(at) * 60_000);
  return at;
}

/** The instant as Israel wall-clock date and time, for date/time inputs. */
export function toIsraelLocal(at: Date): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return { date, time };
}

/** Israel calendar date (YYYY-MM-DD) `days` from now. */
export function israelDateFromNow(days = 0): string {
  return toIsraelLocal(new Date(Date.now() + days * 864e5)).date;
}
