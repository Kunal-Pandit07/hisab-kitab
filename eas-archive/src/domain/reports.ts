import { addDaysKey, eachDay } from './savings';

export interface DateRange { from: string; toExclusive: string } // local YYYY-MM-DD keys
export type Preset = 'thisMonth' | 'lastMonth' | 'last30' | 'thisYear';

const p2 = (n: number) => String(n).padStart(2, '0');
const mk = (y: number, m: number, d = 1) => { const t = new Date(Date.UTC(y, m - 1, d)); return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`; };

export function presetRange(kind: Preset, today: string): DateRange {
  const [y, m] = today.split('-').map(Number);
  switch (kind) {
    case 'thisMonth': return { from: mk(y, m), toExclusive: mk(y, m + 1) };
    case 'lastMonth': return { from: mk(y, m - 1), toExclusive: mk(y, m) };
    case 'last30': return { from: addDaysKey(today, -29), toExclusive: addDaysKey(today, 1) };
    case 'thisYear': return { from: mk(y, 1), toExclusive: mk(y + 1, 1) };
  }
}
export const rangeDays = (r: DateRange) => eachDay(r.from, r.toExclusive).length;

/** One entry per day in the range; days with no data are 0. */
export function zeroFillDays(r: DateRange, rows: readonly { day: string; total: number }[]) {
  const m = new Map(rows.map((x) => [x.day, x.total]));
  return eachDay(r.from, r.toExclusive).map((day) => ({ day, total: m.get(day) ?? 0 }));
}
export function monthsInRange(r: DateRange): string[] {
  const out: string[] = [];
  let [y, m] = r.from.split('-').map(Number);
  for (;;) { const k = `${y}-${p2(m)}`; if (`${k}-01` >= r.toExclusive) break; out.push(k); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
export function zeroFillMonths(r: DateRange, rows: readonly { month: string; incomePaise: number; expensePaise: number }[]) {
  const m = new Map(rows.map((x) => [x.month, x]));
  return monthsInRange(r).map((month) => m.get(month) ?? { month, incomePaise: 0, expensePaise: 0 });
}

/** Whole-number percentage (floored) with integer maths. */
export const percentOf = (part: number, whole: number) => (whole > 0 ? Math.floor((part * 100) / whole) : 0);

/** Top N categories by total plus an "Others" row; shares sum to ~100. */
export function categoryShares(rows: readonly { key: string; name: string; total: number }[], topN = 6) {
  const sorted = [...rows].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const whole = sorted.reduce((s, r) => s + r.total, 0);
  const top = sorted.slice(0, topN); const rest = sorted.slice(topN).reduce((s, r) => s + r.total, 0);
  const out = top.map((r) => ({ ...r, percent: percentOf(r.total, whole) }));
  if (rest > 0) out.push({ key: 'others', name: 'Others', total: rest, percent: percentOf(rest, whole) });
  return { items: out, totalPaise: whole };
}
/** Bar heights as 0–100 relative to the largest value (0 when everything is 0). */
export function barScale(values: readonly number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.max(v > 0 ? 3 : 0, Math.floor((v * 100) / max)) : 0));
}
