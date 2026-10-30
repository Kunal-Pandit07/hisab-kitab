import type { SQLiteDatabase } from 'expo-sqlite';

// All aggregates come straight from stored expenses/income; transfers, goal allocations and Udhaar are not in `transactions`
// or are filtered out, so nothing is double counted.
export const expenseByDay = (db: SQLiteDatabase, fromISO: string, toISO: string) =>
  db.getAllAsync<{ day: string; total: number }>(
    `SELECT date(occurred_at,'localtime') AS day, SUM(amount_paise) AS total FROM transactions
     WHERE type='expense' AND occurred_at >= ? AND occurred_at < ? GROUP BY day ORDER BY day`, fromISO, toISO);

export const incomeExpenseByMonth = (db: SQLiteDatabase, fromISO: string, toISO: string) =>
  db.getAllAsync<{ month: string; incomePaise: number; expensePaise: number }>(
    `SELECT strftime('%Y-%m', occurred_at,'localtime') AS month,
       COALESCE(SUM(CASE WHEN type='income' THEN amount_paise END),0) AS incomePaise,
       COALESCE(SUM(CASE WHEN type='expense' THEN amount_paise END),0) AS expensePaise
     FROM transactions WHERE type IN ('income','expense') AND occurred_at >= ? AND occurred_at < ? GROUP BY month ORDER BY month`, fromISO, toISO);

export const expenseByCategory = (db: SQLiteDatabase, fromISO: string, toISO: string) =>
  db.getAllAsync<{ key: string; name: string; total: number }>(
    `SELECT COALESCE(t.category_id,'uncategorised') AS key, COALESCE(c.name,'Uncategorised') AS name, SUM(t.amount_paise) AS total
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.type='expense' AND t.occurred_at >= ? AND t.occurred_at < ? GROUP BY key ORDER BY total DESC`, fromISO, toISO);
