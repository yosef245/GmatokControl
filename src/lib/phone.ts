/** Israeli mobile number in E.164, e.g. 050-1234567 → +972501234567 */
export function toE164(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^5\d{8}$/.test(d) ? `+972${d}` : null;
}
