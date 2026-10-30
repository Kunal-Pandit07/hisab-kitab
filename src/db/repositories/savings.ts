import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import type { TargetEntry } from '../../domain/savings';

export async function getTargetHistory(db: SQLiteDatabase): Promise<TargetEntry[]> {
  return db.getAllAsync<TargetEntry>('SELECT effective_from AS effectiveFrom, amount_paise AS amountPaise FROM savings_targets ORDER BY effective_from');
}

/** New target applies from `effectiveFrom` onward; earlier days keep their old target. */
export async function setDailyTarget(db: SQLiteDatabase, amountPaise: number, effectiveFrom: string) {
  await db.runAsync(
    `INSERT INTO savings_targets (id, effective_from, amount_paise, created_at) VALUES (?,?,?,?)
     ON CONFLICT(effective_from) DO UPDATE SET amount_paise = excluded.amount_paise`,
    randomUUID(), effectiveFrom, amountPaise, new Date().toISOString());
}

/**
 * Money saved per local day, derived from the ledger (no separate counter to drift):
 * transfers from a non-savings account INTO a savings account count as saved;
 * transfers OUT of a savings account to a non-savings account count negatively.
 * Savings↔savings moves and ordinary income/expenses are ignored.
 */
export async function savedByDay(db: SQLiteDatabase, fromISO: string, toISO: string): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ d: string; saved: number }>(
    `SELECT date(t.occurred_at, 'localtime') AS d,
       SUM(CASE WHEN ta.type='savings' AND fa.type<>'savings' THEN  t.amount_paise
                WHEN fa.type='savings' AND ta.type<>'savings' THEN -t.amount_paise ELSE 0 END) AS saved
     FROM transactions t
     JOIN accounts fa ON fa.id = t.account_id
     JOIN accounts ta ON ta.id = t.to_account_id
     WHERE t.type='transfer' AND t.occurred_at >= ? AND t.occurred_at < ?
     GROUP BY d`, fromISO, toISO);
  return Object.fromEntries(rows.map((r) => [r.d, r.saved]));
}

export async function listNoSpendDays(db: SQLiteDatabase, fromKey: string, toKeyExclusive: string): Promise<string[]> {
  return (await db.getAllAsync<{ date: string }>('SELECT date FROM no_spend_days WHERE date >= ? AND date < ? ORDER BY date', fromKey, toKeyExclusive)).map((r) => r.date);
}

/** Only ever called from an explicit user action. */
export async function setNoSpendDay(db: SQLiteDatabase, date: string, on: boolean) {
  if (on) await db.runAsync('INSERT OR IGNORE INTO no_spend_days (date, created_at) VALUES (?,?)', date, new Date().toISOString());
  else await db.runAsync('DELETE FROM no_spend_days WHERE date = ?', date);
}
