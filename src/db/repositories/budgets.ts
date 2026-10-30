import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { budgetProgress, DEFAULT_THRESHOLDS, newAlerts, thresholdsReached, validateBudget } from '../../domain/budgets';

export interface BudgetRow {
  id: string; categoryId: string | null; categoryName: string | null; limitPaise: number;
  thresholds: number[]; spentPaise: number;
}

/** Spent is recomputed from ledger expenses every time, so edits/deletes are reflected immediately. Transfers excluded. */
export async function listBudgets(db: SQLiteDatabase, fromISO: string, toISO: string): Promise<BudgetRow[]> {
  const rows = await db.getAllAsync<Omit<BudgetRow, 'thresholds'> & { thresholds: string }>(
    `SELECT b.id, b.category_id AS categoryId, c.name AS categoryName, b.limit_paise AS limitPaise, b.thresholds,
       COALESCE((SELECT SUM(t.amount_paise) FROM transactions t
         WHERE t.type='expense' AND t.occurred_at >= ? AND t.occurred_at < ?
           AND (b.category_id IS NULL OR t.category_id = b.category_id)), 0) AS spentPaise
     FROM budgets b LEFT JOIN categories c ON c.id = b.category_id
     ORDER BY (b.category_id IS NOT NULL), c.name`, fromISO, toISO);
  return rows.map((r) => ({ ...r, thresholds: JSON.parse(r.thresholds) as number[] }));
}

export async function saveBudget(db: SQLiteDatabase, b: { categoryId: string | null; limitPaise: number; thresholds?: number[] }) {
  const th = b.thresholds ?? DEFAULT_THRESHOLDS;
  const err = validateBudget(b.limitPaise, th);
  if (err) throw new Error(err);
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const ex = await tx.getFirstAsync<{ id: string }>('SELECT id FROM budgets WHERE COALESCE(category_id, \'__overall__\') = COALESCE(?, \'__overall__\')', b.categoryId);
    if (ex) await tx.runAsync('UPDATE budgets SET limit_paise=?, thresholds=?, updated_at=? WHERE id=?', b.limitPaise, JSON.stringify(th), now, ex.id);
    else await tx.runAsync('INSERT INTO budgets (id,category_id,limit_paise,thresholds,created_at,updated_at) VALUES (?,?,?,?,?,?)', randomUUID(), b.categoryId, b.limitPaise, JSON.stringify(th), now, now);
  });
}
export const deleteBudget = (db: SQLiteDatabase, id: string) => db.runAsync('DELETE FROM budgets WHERE id = ?', id);

export interface PendingAlert { budgetId: string; label: string; overall: boolean; threshold: number; record: number[] }

/**
 * Alerts that have not fired yet this period. Does NOT mark them fired: Phase 6 calls
 * markAlertsFired only after a notification was actually scheduled/shown, so nothing is silently lost.
 */
export async function pendingAlerts(db: SQLiteDatabase, period: string, fromISO: string, toISO: string): Promise<PendingAlert[]> {
  const out: PendingAlert[] = [];
  for (const b of await listBudgets(db, fromISO, toISO)) {
    const fired = (await db.getAllAsync<{ threshold: number }>('SELECT threshold FROM budget_alerts WHERE budget_id=? AND period=?', b.id, period)).map((r) => r.threshold);
    const { toRecord, toNotify } = newAlerts(thresholdsReached(budgetProgress(b.limitPaise, b.spentPaise).percentUsed, b.thresholds), fired);
    if (toNotify !== null) out.push({ budgetId: b.id, label: b.categoryName ?? 'overall', overall: b.categoryId === null, threshold: toNotify, record: toRecord });
  }
  return out;
}
export async function markAlertsFired(db: SQLiteDatabase, period: string, alerts: PendingAlert[]) {
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const a of alerts) for (const t of a.record)
      await tx.runAsync('INSERT OR IGNORE INTO budget_alerts (budget_id,period,threshold,fired_at) VALUES (?,?,?,?)', a.budgetId, period, t, now);
  });
}
