import { isValidPaise } from './money';

export const ALLOWED_THRESHOLDS = [50, 75, 90, 100] as const;
export const DEFAULT_THRESHOLDS: number[] = [...ALLOWED_THRESHOLDS];

export interface BudgetProgress { percentUsed: number; remainingPaise: number; over: boolean }
/** Integer-only percent (floored): 74.99% is still 74, so a 75% alert never fires early. */
export function budgetProgress(limitPaise: number, spentPaise: number): BudgetProgress {
  const percentUsed = limitPaise > 0 ? Math.floor((spentPaise * 100) / limitPaise) : 0;
  return { percentUsed, remainingPaise: limitPaise - spentPaise, over: spentPaise > limitPaise };
}

export const thresholdsReached = (percentUsed: number, thresholds: readonly number[]) =>
  [...thresholds].sort((a, b) => a - b).filter((t) => percentUsed >= t);

/**
 * Given what is currently reached and what has already fired this period:
 * record every new threshold, but notify only for the highest one (no burst of alerts).
 */
export function newAlerts(reached: readonly number[], alreadyFired: readonly number[]) {
  const fresh = reached.filter((t) => !alreadyFired.includes(t));
  return { toRecord: fresh, toNotify: fresh.length ? Math.max(...fresh) : null };
}

export function validateBudget(limitPaise: number, thresholds: readonly number[]): string | null {
  if (!isValidPaise(limitPaise)) return 'Enter a budget amount greater than zero.';
  if (thresholds.some((t) => !(ALLOWED_THRESHOLDS as readonly number[]).includes(t))) return 'Alert levels must be 50, 75, 90 or 100.';
  return null;
}
