import type { SQLiteDatabase } from 'expo-sqlite';
import { ID_PREFIX, MANAGED_PREFIXES, NotificationSettings, planBudget, planManaged } from '../domain/notifications';
import { listRecords } from '../db/repositories/udhaar';
import { listGoals } from '../db/repositories/goals';
import { markAlertsFired, pendingAlerts } from '../db/repositories/budgets';
import { outstandingPaise } from '../domain/udhaar';
import { monthKey, monthRange } from '../utils/dates';
import { Scheduler, syncPlan, SyncResult } from './sync';

export type RefreshResult = SyncResult | { skipped: 'permission' };

/** Rebuilds daily/Udhaar/goal reminders from current data and settings. Safe to call as often as needed. */
export async function refreshNotifications(db: SQLiteDatabase, settings: NotificationSettings, scheduler: Scheduler, now = new Date()): Promise<RefreshResult> {
  if (!settings.notifEnabled) return syncPlan(scheduler, [], [ID_PREFIX]); // opt-out: remove everything of ours
  if (!(await scheduler.isAllowed())) return { skipped: 'permission' };    // denied: app keeps working, nothing scheduled
  const [records, goals] = await Promise.all([listRecords(db), listGoals(db)]);
  const plan = planManaged({
    now, settings,
    udhaar: records.map((r) => ({ id: r.id, dueOn: r.dueOn, outstandingPaise: outstandingPaise(r.principalPaise, r.repaidPaise) })),
    goals: goals.map((g) => ({ id: g.id, targetDate: g.targetDate, status: g.status })),
  });
  return syncPlan(scheduler, plan, MANAGED_PREFIXES);
}

/**
 * Schedules alerts for budget thresholds crossed this month. A threshold is marked as fired only after
 * its notification was actually scheduled, so a failure is retried next time and nothing repeats after success.
 */
export async function notifyBudgetAlerts(db: SQLiteDatabase, settings: NotificationSettings, scheduler: Scheduler, now = new Date()) {
  if (!settings.notifEnabled || !settings.notifBudget || !(await scheduler.isAllowed())) return { scheduled: 0 };
  const { from, to } = monthRange(now); const period = monthKey(now);
  const pending = await pendingAlerts(db, period, from, to);
  const plan = planBudget(pending.map((p) => ({ budgetId: p.budgetId, label: p.label, overall: p.overall, threshold: p.threshold, period })), settings, now);
  const done = []; 
  for (const n of plan) {
    try { await scheduler.schedule(n); done.push(pending.find((p) => n.id === `hk:budget:${p.budgetId}:${period}:${p.threshold}`)!); } catch { /* retried next run */ }
  }
  if (done.length) await markAlertsFired(db, period, done);
  return { scheduled: done.length };
}
