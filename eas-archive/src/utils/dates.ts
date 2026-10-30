export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const iso = (d: Date) => d.toISOString();
export function dayRange(d = new Date()) { const s = startOfDay(d); return { from: iso(s), to: iso(addDays(s, 1)) }; }
export function monthRange(d = new Date()) { const s = startOfMonth(d); return { from: iso(s), to: iso(addMonths(s, 1)) }; }
export function dayLabel(isoStr: string) {
  return new Date(isoStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
const p2 = (n: number) => String(n).padStart(2, '0');
/** Local calendar date key, YYYY-MM-DD. */
export const dateKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const monthKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
/** True only for real calendar dates in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDateKey(k: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
