import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { RecordInput, UdhaarKind, validatePrincipalEdit, validateRecord, validateRepayment } from '../../domain/udhaar';
import { wouldOverdraw } from '../../domain/transactions';
import { getAccount } from './accounts';

export class UdhaarError extends Error { constructor(public errors: string[]) { super(errors.join(' ')); } }

export interface UdhaarRow {
  id: string; personName: string; kind: UdhaarKind; principalPaise: number; occurredOn: string; dueOn: string | null;
  description: string; contact: string | null; accountId: string | null; repaidPaise: number;
}
export interface Repayment { id: string; amountPaise: number; paidOn: string; note: string | null; accountId: string | null }
export interface RecordWrite extends RecordInput { description: string; contact?: string | null; accountId?: string | null }

const SQL = `SELECT r.id, r.person_name AS personName, r.kind, r.principal_paise AS principalPaise, r.occurred_on AS occurredOn,
  r.due_on AS dueOn, r.description, r.contact, r.account_id AS accountId,
  COALESCE((SELECT SUM(p.amount_paise) FROM udhaar_repayments p WHERE p.record_id = r.id), 0) AS repaidPaise FROM udhaar_records r`;

/** Open records first (soonest due first), settled ones last. */
export const listRecords = (db: SQLiteDatabase) =>
  db.getAllAsync<UdhaarRow>(`${SQL} ORDER BY (repaidPaise >= principalPaise), (r.due_on IS NULL), r.due_on, r.occurred_on DESC`);
export const getRecord = (db: SQLiteDatabase, id: string) => db.getFirstAsync<UdhaarRow>(`${SQL} WHERE r.id = ?`, id);
export const listRepayments = (db: SQLiteDatabase, recordId: string) =>
  db.getAllAsync<Repayment>('SELECT id, amount_paise AS amountPaise, paid_on AS paidOn, note, account_id AS accountId FROM udhaar_repayments WHERE record_id = ? ORDER BY paid_on DESC, created_at DESC', recordId);

async function checkAccount(tx: SQLiteDatabase, accountId: string | null | undefined, outgoing: number | null) {
  if (!accountId) return;
  const acc = await getAccount(tx, accountId);
  if (!acc || acc.archived) throw new UdhaarError(['That account is not available.']);
  if (outgoing !== null && wouldOverdraw(acc.balancePaise, outgoing)) throw new UdhaarError(['Not enough balance in that account.']);
}

/** Lending from an account moves money out of it; borrowing moves money in. Never touches income/expense. */
export async function createRecord(db: SQLiteDatabase, i: RecordWrite): Promise<string> {
  const errs = validateRecord(i); if (errs.length) throw new UdhaarError(errs);
  const id = randomUUID(); const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await checkAccount(tx as unknown as SQLiteDatabase, i.accountId, i.kind === 'lent' ? i.principalPaise : null);
    await tx.runAsync(
      `INSERT INTO udhaar_records (id,person_name,kind,principal_paise,occurred_on,due_on,description,contact,account_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, i.personName.trim(), i.kind, i.principalPaise, i.occurredOn, i.dueOn || null, i.description.trim(), i.contact?.trim() || null, i.accountId ?? null, now, now);
  });
  return id;
}

/** Kind and account are fixed after creation (delete and re-add to change them). */
export async function updateRecord(db: SQLiteDatabase, id: string, i: Omit<RecordWrite, 'kind' | 'accountId'>) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const cur = await tx.getFirstAsync<{ kind: UdhaarKind; repaid: number }>(
      `SELECT kind, COALESCE((SELECT SUM(amount_paise) FROM udhaar_repayments WHERE record_id = r.id),0) AS repaid FROM udhaar_records r WHERE id = ?`, id);
    if (!cur) throw new UdhaarError(['Record not found.']);
    const errs = validateRecord({ ...i, kind: cur.kind }); if (errs.length) throw new UdhaarError(errs);
    const pe = validatePrincipalEdit(i.principalPaise, cur.repaid); if (pe) throw new UdhaarError([pe]);
    await tx.runAsync(`UPDATE udhaar_records SET person_name=?, principal_paise=?, occurred_on=?, due_on=?, description=?, contact=?, updated_at=? WHERE id=?`,
      i.personName.trim(), i.principalPaise, i.occurredOn, i.dueOn || null, i.description.trim(), i.contact?.trim() || null, new Date().toISOString(), id);
  });
}

export const deleteRecord = (db: SQLiteDatabase, id: string) => db.runAsync('DELETE FROM udhaar_records WHERE id = ?', id);

/** Reduces outstanding principal. Resolves only after commit; returns whether the record is now fully settled. */
export async function addRepayment(db: SQLiteDatabase, recordId: string, amountPaise: number, paidOn: string, note?: string | null, accountId?: string | null) {
  let settled = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const r = await tx.getFirstAsync<{ kind: UdhaarKind; principal: number; repaid: number }>(
      `SELECT kind, principal_paise AS principal, COALESCE((SELECT SUM(amount_paise) FROM udhaar_repayments WHERE record_id = r.id),0) AS repaid FROM udhaar_records r WHERE id = ?`, recordId);
    if (!r) throw new UdhaarError(['Record not found.']);
    const errs = validateRepayment(r.principal - r.repaid, amountPaise, paidOn); if (errs.length) throw new UdhaarError(errs);
    // repaying a borrowed amount sends money out of the account; being repaid brings it in
    await checkAccount(tx as unknown as SQLiteDatabase, accountId, r.kind === 'borrowed' ? amountPaise : null);
    await tx.runAsync('INSERT INTO udhaar_repayments (id,record_id,amount_paise,paid_on,note,account_id,created_at) VALUES (?,?,?,?,?,?,?)',
      randomUUID(), recordId, amountPaise, paidOn, note?.trim() || null, accountId ?? null, new Date().toISOString());
    settled = r.repaid + amountPaise >= r.principal;
  });
  return { settled };
}
export const deleteRepayment = (db: SQLiteDatabase, id: string) => db.runAsync('DELETE FROM udhaar_repayments WHERE id = ?', id);
