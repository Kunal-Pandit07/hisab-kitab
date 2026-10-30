import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { TxnInput, TxnType, validateTransaction, wouldOverdraw } from '../../domain/transactions';
import { getAccount } from './accounts';

export interface TxnRow {
  id: string; type: TxnType; amountPaise: number; accountId: string; accountName: string;
  toAccountId: string | null; toAccountName: string | null;
  categoryId: string | null; categoryName: string | null; categoryIcon: string | null;
  description: string; notes: string | null; occurredAt: string;
}
export interface Category { id: string; name: string; kind: 'income' | 'expense'; icon: string }
export interface TxnWrite extends TxnInput { description: string; notes?: string | null }

export class TxnError extends Error {
  constructor(public errors: string[]) { super(errors.join(' ')); }
}

const LIST_SQL = `
SELECT t.id, t.type, t.amount_paise AS amountPaise, t.account_id AS accountId, a.name AS accountName,
 t.to_account_id AS toAccountId, a2.name AS toAccountName,
 t.category_id AS categoryId, c.name AS categoryName, c.icon AS categoryIcon,
 t.description, t.notes, t.occurred_at AS occurredAt
FROM transactions t
JOIN accounts a ON a.id = t.account_id
LEFT JOIN accounts a2 ON a2.id = t.to_account_id
LEFT JOIN categories c ON c.id = t.category_id`;

export interface TxnFilter {
  search?: string; type?: TxnType; accountId?: string; categoryId?: string;
  fromISO?: string; toISO?: string; limit?: number; offset?: number;
}

export async function listTransactions(db: SQLiteDatabase, f: TxnFilter = {}): Promise<TxnRow[]> {
  const where: string[] = []; const args: (string | number)[] = [];
  if (f.search?.trim()) {
    where.push("(t.description LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\')");
    const s = `%${f.search.trim().replace(/[\\%_]/g, '\\$&')}%`; args.push(s, s);
  }
  if (f.type) { where.push('t.type = ?'); args.push(f.type); }
  if (f.accountId) { where.push('(t.account_id = ? OR t.to_account_id = ?)'); args.push(f.accountId, f.accountId); }
  if (f.categoryId) { where.push('t.category_id = ?'); args.push(f.categoryId); }
  if (f.fromISO) { where.push('t.occurred_at >= ?'); args.push(f.fromISO); }
  if (f.toISO) { where.push('t.occurred_at < ?'); args.push(f.toISO); }
  const sql = `${LIST_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.occurred_at DESC, t.created_at DESC LIMIT ? OFFSET ?`;
  return db.getAllAsync<TxnRow>(sql, ...args, f.limit ?? 50, f.offset ?? 0);
}

export async function getTransaction(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<TxnRow>(`${LIST_SQL} WHERE t.id = ?`, id);
}

export async function listCategories(db: SQLiteDatabase, kind?: 'income' | 'expense'): Promise<Category[]> {
  return db.getAllAsync<Category>(
    `SELECT id,name,kind,icon FROM categories ${kind ? 'WHERE kind = ?' : ''} ORDER BY is_default DESC, name`,
    ...(kind ? [kind] : []));
}

/** Income/expense totals in [from,to). Transfers are never included. */
export async function periodTotals(db: SQLiteDatabase, fromISO: string, toISO: string) {
  const rows = await db.getAllAsync<{ type: string; total: number }>(
    `SELECT type, COALESCE(SUM(amount_paise),0) AS total FROM transactions
     WHERE type IN ('income','expense') AND occurred_at >= ? AND occurred_at < ? GROUP BY type`, fromISO, toISO);
  const income = rows.find((r) => r.type === 'income')?.total ?? 0;
  const expense = rows.find((r) => r.type === 'expense')?.total ?? 0;
  return { incomePaise: income, expensePaise: expense, netPaise: income - expense };
}

/**
 * Create / update run in one exclusive transaction: validation of balances and the write
 * happen atomically. Resolves only after COMMIT, so callers may safely show success feedback.
 */
export async function saveTransaction(db: SQLiteDatabase, input: TxnWrite, existingId?: string): Promise<string> {
  const errors = validateTransaction(input);
  if (errors.length) throw new TxnError(errors);
  const id = existingId ?? randomUUID(); const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (tx) => {
    // Overdraft policy: outgoing money may not take a non-credit account below zero.
    if (input.type !== 'income') {
      const acc = await getAccount(tx as unknown as SQLiteDatabase, input.accountId!);
      if (!acc || acc.archived) throw new TxnError(['That account is not available.']);
      let balance = acc.balancePaise;
      if (existingId) { // add back the effect of the row being replaced
        const old = await tx.getFirstAsync<{ type: string; amount_paise: number; account_id: string }>(
          'SELECT type, amount_paise, account_id FROM transactions WHERE id = ?', existingId);
        if (old && old.account_id === acc.id && old.type !== 'income') balance += old.amount_paise;
      }
      if (input.type === 'transfer' && wouldOverdraw(balance, input.amountPaise)) {
        throw new TxnError(['Not enough balance in the source account.']);
      }
    }
    if (existingId) {
      const r = await tx.runAsync(
        `UPDATE transactions SET type=?, amount_paise=?, account_id=?, to_account_id=?, category_id=?,
         description=?, notes=?, occurred_at=?, updated_at=? WHERE id=?`,
        input.type, input.amountPaise, input.accountId!, input.toAccountId ?? null,
        input.type === 'transfer' ? null : input.categoryId ?? null,
        input.description.trim(), input.notes ?? null, input.occurredAt, now, existingId);
      if (r.changes !== 1) throw new TxnError(['Transaction not found.']);
    } else {
      await tx.runAsync(
        `INSERT INTO transactions (id,type,amount_paise,account_id,to_account_id,category_id,description,notes,occurred_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        id, input.type, input.amountPaise, input.accountId!, input.toAccountId ?? null,
        input.type === 'transfer' ? null : input.categoryId ?? null,
        input.description.trim(), input.notes ?? null, input.occurredAt, now, now);
    }
  });
  return id;
}

export async function deleteTransaction(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}
