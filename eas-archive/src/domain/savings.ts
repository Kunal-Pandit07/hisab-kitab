import { isValidPaise } from './money';

export interface TargetEntry { effectiveFrom: string; amountPaise: number } // YYYY-MM-DD

/** The daily target in force on `date`. Earlier days keep the target they had then. */
export function targetForDate(history: readonly TargetEntry[], date: string): number {
  let best: TargetEntry | null = null;
  for (const e of history) if (e.effectiveFrom <= date && (!best || e.effectiveFrom > best.effectiveFrom)) best = e;
  return best?.amountPaise ?? 0;
}

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Dates in [from, toExclusive). Pure key arithmetic, so DST can't skew it. */
export function eachDay(from: string, toExclusive: string): string[] {
  const out: string[] = [];
  for (let t = parse(from); t < parse(toExclusive); t += 86_400_000) out.push(fmt(t));
  return out;
}
export const addDaysKey = (k: string, n: number) => fmt(parse(k) + n * 86_400_000);

export function periodTarget(history: readonly TargetEntry[], from: string, toExclusive: string): number {
  return eachDay(from, toExclusive).reduce((s, d) => s + targetForDate(history, d), 0);
}

export interface Progress { percent: number; remainingPaise: number; met: boolean }
/** Saved can be 0 or negative (money taken out of savings); that is simply 0% – never an error. */
export function progress(savedPaise: number, targetPaise: number): Progress {
  if (targetPaise <= 0) return { percent: 0, remainingPaise: 0, met: false };
  const saved = Math.max(0, savedPaise);
  return { percent: Math.min(100, Math.floor((saved * 100) / targetPaise)), remainingPaise: Math.max(0, targetPaise - saved), met: saved >= targetPaise };
}

/**
 * Consecutive days (ending today, or yesterday if today isn't met yet) on which the target was met.
 * Today not being met yet never breaks a streak.
 */
export function currentStreak(savedByDay: Readonly<Record<string, number>>, history: readonly TargetEntry[], today: string): number {
  const met = (d: string) => { const t = targetForDate(history, d); return t > 0 && (savedByDay[d] ?? 0) >= t; };
  let day = met(today) ? today : addDaysKey(today, -1);
  let n = 0;
  while (n < 3650 && met(day)) { n++; day = addDaysKey(day, -1); }
  return n;
}

export function validateTarget(paise: number): string | null {
  return paise === 0 || isValidPaise(paise) ? null : 'Enter a valid target, or 0 to turn it off.';
}

/** Goal allocation: removing more than was allocated is not allowed; going past the target is. */
export function validateAllocation(allocatedPaise: number, deltaPaise: number): string | null {
  if (!Number.isSafeInteger(deltaPaise) || deltaPaise === 0) return 'Enter an amount greater than zero.';
  if (allocatedPaise + deltaPaise < 0) return 'You can only remove what has been added to this goal.';
  return null;
}
export const goalIsComplete = (allocatedPaise: number, targetPaise: number) => allocatedPaise >= targetPaise;
