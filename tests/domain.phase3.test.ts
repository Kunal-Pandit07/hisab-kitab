import { currentStreak, eachDay, periodTarget, progress, targetForDate, validateAllocation, validateTarget } from '../src/domain/savings';
import { budgetProgress, newAlerts, thresholdsReached, validateBudget } from '../src/domain/budgets';

describe('savings domain', () => {
  const hist = [{ effectiveFrom: '2026-10-01', amountPaise: 1000 }, { effectiveFrom: '2026-10-15', amountPaise: 5000 }];
  test('changing the target does not rewrite history', () => {
    expect(targetForDate(hist, '2026-09-30')).toBe(0);
    expect(targetForDate(hist, '2026-10-14')).toBe(1000);
    expect(targetForDate(hist, '2026-10-15')).toBe(5000);
  });
  test('period targets add each day at its own target', () => {
    expect(periodTarget(hist, '2026-10-13', '2026-10-17')).toBe(1000 + 1000 + 5000 + 5000);
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
  test('progress handles zero target, zero saved, overshoot and negative saved', () => {
    expect(progress(0, 0)).toEqual({ percent: 0, remainingPaise: 0, met: false });
    expect(progress(0, 1000)).toEqual({ percent: 0, remainingPaise: 1000, met: false });
    expect(progress(250, 1000).percent).toBe(25);
    expect(progress(5000, 1000)).toEqual({ percent: 100, remainingPaise: 0, met: true });
    expect(progress(-300, 1000).percent).toBe(0);
  });
  test('streak: today not yet met does not break it; a miss ends it', () => {
    const h = [{ effectiveFrom: '2026-01-01', amountPaise: 1000 }];
    expect(currentStreak({ '2026-10-28': 1000, '2026-10-27': 1500 }, h, '2026-10-29')).toBe(2);
    expect(currentStreak({ '2026-10-29': 1000, '2026-10-28': 1000 }, h, '2026-10-29')).toBe(2);
    expect(currentStreak({ '2026-10-28': 999 }, h, '2026-10-29')).toBe(0);
    expect(currentStreak({}, [], '2026-10-29')).toBe(0);
  });
  test('validation', () => {
    expect(validateTarget(0)).toBeNull(); expect(validateTarget(1000)).toBeNull(); expect(validateTarget(-1)).not.toBeNull(); expect(validateTarget(1.5)).not.toBeNull();
    expect(validateAllocation(1000, -1001)).not.toBeNull(); expect(validateAllocation(1000, -1000)).toBeNull(); expect(validateAllocation(0, 0)).not.toBeNull();
  });
});

describe('budget domain', () => {
  test('percent is floored so 74.99% never triggers 75', () => {
    expect(budgetProgress(10000, 7499).percentUsed).toBe(74);
    expect(budgetProgress(10000, 7500).percentUsed).toBe(75);
    expect(budgetProgress(10000, 12000)).toEqual({ percentUsed: 120, remainingPaise: -2000, over: true });
  });
  test('thresholds reached', () => {
    expect(thresholdsReached(74, [50, 75, 90, 100])).toEqual([50]);
    expect(thresholdsReached(100, [100, 50])).toEqual([50, 100]);
  });
  test('alerts are not duplicated and bursts notify once', () => {
    expect(newAlerts([50, 75], [])).toEqual({ toRecord: [50, 75], toNotify: 75 });
    expect(newAlerts([50, 75], [50, 75])).toEqual({ toRecord: [], toNotify: null });
    expect(newAlerts([50, 75, 90], [50, 75])).toEqual({ toRecord: [90], toNotify: 90 });
  });
  test('budget validation', () => {
    expect(validateBudget(1000, [50, 100])).toBeNull(); expect(validateBudget(0, [50])).not.toBeNull(); expect(validateBudget(1000, [42])).not.toBeNull();
  });
});
