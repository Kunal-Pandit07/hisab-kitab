import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';

export type AccountType = 'cash' | 'bank' | 'upi' | 'savings' | 'custom';
export interface Account {
  id: string; name: string; type: AccountType;
  openingBalancePaise: number; archived: boolean; balancePaise: number;
}

// Balance is always derived from opening balance + ledger, never a cached counter.
const SELECT_WITH_BALANCE = `
SELECT a.id, a.name, a.type, a.opening_balance_paise AS openingBalancePaise, a.archived,
 a.opening_balance_paise + COALESCE((
  SELECT SUM(CASE
    WHEN t.type='income'   AND t.account_id=a.id    THEN  t.amount_paise
    WHEN t.type='expense'  AND t.account_id=a.id    THEN -t.amount_paise
    WHEN t.type='transfer' AND t.account_id=a.id    THEN -t.amount_paise
    WHEN t.type='transfer' AND t.to_account_id=a.id THEN  t.amount_paise
    ELSE 0 END)
  FROM transactions t WHERE t.account_id=a.id OR t.to_account_id=a.id), 0)
 -- Udhaar cash movements for records/repayments linked to this account (lending out = money leaves)
 + COALESCE((SELECT SUM(CASE WHEN r.kind='lent' THEN -r.principal_paise ELSE r.principal_paise END)
             FROM udhaar_records r WHERE r.account_id=a.id), 0)
 + COALESCE((SELECT SUM(CASE WHEN r.kind='lent' THEN p.amount_paise ELSE -p.amount_paise END)
             FROM udhaar_repayments p JOIN udhaar_records r ON r.id=p.record_id WHERE p.account_id=a.id), 0) AS balancePaise
FROM accounts a`;

type Row = Omit<Account, 'archived'> & { archived: number };
const map = (r: Row): Account => ({ ...r, archived: r.archived === 1 });

export async function listAccounts(db: SQLiteDatabase, includeArchived = false): Promise<Account[]> {
  const rows = await db.getAllAsync<Row>(
    `${SELECT_WITH_BALANCE} ${includeArchived ? '' : 'WHERE a.archived = 0'} ORDER BY a.created_at`);
  return rows.map(map);
}

export async function getAccount(db: SQLiteDatabase, id: string): Promise<Account | null> {
  const r = await db.getFirstAsync<Row>(`${SELECT_WITH_BALANCE} WHERE a.id = ?`, id);
  return r ? map(r) : null;
}

export async function createAccount(db: SQLiteDatabase, a: { name: string; type: AccountType; openingBalancePaise: number }) {
  const id = randomUUID(); const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO accounts (id,name,type,opening_balance_paise,archived,created_at,updated_at) VALUES (?,?,?,?,0,?,?)',
    id, a.name.trim(), a.type, a.openingBalancePaise, now, now);
  return id;
}

export async function updateAccount(db: SQLiteDatabase, id: string, a: { name: string; type: AccountType; openingBalancePaise: number }) {
  await db.runAsync('UPDATE accounts SET name=?, type=?, opening_balance_paise=?, updated_at=? WHERE id=?',
    a.name.trim(), a.type, a.openingBalancePaise, new Date().toISOString(), id);
}

export async function setArchived(db: SQLiteDatabase, id: string, archived: boolean) {
  await db.runAsync('UPDATE accounts SET archived=?, updated_at=? WHERE id=?', archived ? 1 : 0, new Date().toISOString(), id);
}
