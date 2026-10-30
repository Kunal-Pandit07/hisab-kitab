process.env.TZ = 'UTC';
import { freshDb } from './helpers';
import { createAccount, getAccount } from '../src/db/repositories/accounts';
import { periodTotals, saveTransaction } from '../src/db/repositories/transactions';
import { listBudgets, saveBudget } from '../src/db/repositories/budgets';
import { addRepayment, createRecord, deleteRecord, deleteRepayment, getRecord, listRecords, UdhaarError, updateRecord } from '../src/db/repositories/udhaar';
import { daysUntilDue, isOverdue, summarize, validateRecord, validateRepayment } from '../src/domain/udhaar';
import { isValidDateKey } from '../src/utils/dates';

const FROM = '2026-10-01T00:00:00.000Z', TO = '2026-11-01T00:00:00.000Z';
const rec = { kind: 'lent' as const, personName: 'Rohan', principalPaise: 50000, occurredOn: '2026-10-05', description: 'books' };
async function setup() {
  const db = await freshDb();
  const cash = await createAccount(db, { name: 'Cash', type: 'cash', openingBalancePaise: 100000 });
  return { db, cash };
}
const bal = async (db: any, id: string) => (await getAccount(db, id))!.balancePaise;

describe('udhaar domain', () => {
  test('date validation rejects impossible dates', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false); expect(isValidDateKey('2026-02-28')).toBe(true); expect(isValidDateKey('2026-2-8')).toBe(false);
  });
  test('record + repayment validation', () => {
    expect(validateRecord(rec)).toEqual([]);
    expect(validateRecord({ ...rec, personName: ' ' }).length).toBe(1);
    expect(validateRecord({ ...rec, dueOn: '2026-10-01' }).length).toBe(1);
    expect(validateRepayment(1000, 1001, '2026-10-10').length).toBe(1);
    expect(validateRepayment(1000, 1000, '2026-10-10')).toEqual([]);
  });
  test('overdue only when open and past due', () => {
    expect(isOverdue('2026-10-01', 100, '2026-10-02')).toBe(true);
    expect(isOverdue('2026-10-02', 100, '2026-10-02')).toBe(false);
    expect(isOverdue('2026-10-01', 0, '2026-10-02')).toBe(false);
    expect(isOverdue(null, 100, '2026-10-02')).toBe(false);
    expect(daysUntilDue('2026-11-01', '2026-10-29')).toBe(3);
  });
  test('summary separates principal from outstanding', () => {
    expect(summarize([{ kind: 'lent', principalPaise: 1000, repaidPaise: 400 }, { kind: 'borrowed', principalPaise: 500, repaidPaise: 0 }]))
      .toEqual({ lentPaise: 1000, toReceivePaise: 600, borrowedPaise: 500, toRepayPaise: 500 });
  });
});

describe('udhaar repositories', () => {
  test('principal is excluded from income, expense and budgets, even when linked to an account', async () => {
    const { db, cash } = await setup();
    await saveBudget(db, { categoryId: null, limitPaise: 10000 });
    const id = await createRecord(db, { ...rec, accountId: cash });
    await addRepayment(db, id, 20000, '2026-10-10', null, cash);
    expect(await periodTotals(db, FROM, TO)).toEqual({ incomePaise: 0, expensePaise: 0, netPaise: 0 });
    expect((await listBudgets(db, FROM, TO))[0].spentPaise).toBe(0);
  });
  test('lent: cash leaves, repayments return it; borrowed is the mirror image', async () => {
    const { db, cash } = await setup();
    const l = await createRecord(db, { ...rec, accountId: cash });
    expect(await bal(db, cash)).toBe(50000);
    await addRepayment(db, l, 20000, '2026-10-10', null, cash);
    expect(await bal(db, cash)).toBe(70000);
    const b = await createRecord(db, { ...rec, kind: 'borrowed', personName: 'Mira', principalPaise: 30000, accountId: cash });
    expect(await bal(db, cash)).toBe(100000);
    await addRepayment(db, b, 10000, '2026-10-12', null, cash);
    expect(await bal(db, cash)).toBe(90000);
  });
  test('records without an account never change balances', async () => {
    const { db, cash } = await setup();
    const id = await createRecord(db, rec);
    await addRepayment(db, id, 100, '2026-10-10');
    expect(await bal(db, cash)).toBe(100000);
  });
  test('partial and full repayment: outstanding and status', async () => {
    const { db } = await setup();
    const id = await createRecord(db, rec);
    expect((await addRepayment(db, id, 20000, '2026-10-10')).settled).toBe(false);
    let r = (await getRecord(db, id))!; expect(r.principalPaise - r.repaidPaise).toBe(30000);
    expect((await addRepayment(db, id, 30000, '2026-10-11')).settled).toBe(true);
    r = (await getRecord(db, id))!; expect(r.principalPaise - r.repaidPaise).toBe(0);
    expect((await listRecords(db))[0].id).toBe(id);
  });
  test('over-repayment rejected by code and by the database itself', async () => {
    const { db } = await setup();
    const id = await createRecord(db, rec);
    await addRepayment(db, id, 40000, '2026-10-10');
    await expect(addRepayment(db, id, 10001, '2026-10-11')).rejects.toBeInstanceOf(UdhaarError);
    await expect(db.runAsync("INSERT INTO udhaar_repayments (id,record_id,amount_paise,paid_on,created_at) VALUES ('z',?,10001,'2026-10-11','x')", id)).rejects.toThrow(/outstanding/);
    expect((await getRecord(db, id))!.repaidPaise).toBe(40000);
  });
  test('edit: principal cannot drop below repaid; deleting a repayment restores outstanding', async () => {
    const { db } = await setup();
    const id = await createRecord(db, rec);
    await addRepayment(db, id, 30000, '2026-10-10');
    const edit = { personName: 'Rohan K', occurredOn: '2026-10-05', description: 'books', dueOn: '2026-11-05' };
    await expect(updateRecord(db, id, { ...edit, principalPaise: 29999 })).rejects.toBeInstanceOf(UdhaarError);
    await expect(db.runAsync('UPDATE udhaar_records SET principal_paise = 100 WHERE id = ?', id)).rejects.toThrow(/repaid/);
    await updateRecord(db, id, { ...edit, principalPaise: 40000 });
    expect(await getRecord(db, id)).toMatchObject({ personName: 'Rohan K', principalPaise: 40000, dueOn: '2026-11-05', repaidPaise: 30000 });
    const rp = (await db.getAllAsync('SELECT id FROM udhaar_repayments'))[0].id;
    await deleteRepayment(db, rp);
    expect((await getRecord(db, id))!.repaidPaise).toBe(0);
  });
  test('deleting a record removes its repayments and restores the account balance', async () => {
    const { db, cash } = await setup();
    const id = await createRecord(db, { ...rec, accountId: cash });
    await addRepayment(db, id, 10000, '2026-10-10', null, cash);
    await deleteRecord(db, id);
    expect(await bal(db, cash)).toBe(100000);
    expect(await db.getAllAsync('SELECT id FROM udhaar_repayments')).toEqual([]);
  });
  test('lending or repaying more than the account holds is rejected atomically', async () => {
    const { db, cash } = await setup();
    await expect(createRecord(db, { ...rec, principalPaise: 100001, accountId: cash })).rejects.toBeInstanceOf(UdhaarError);
    expect(await listRecords(db)).toEqual([]);
    const b = await createRecord(db, { ...rec, kind: 'borrowed', principalPaise: 500000 });
    await saveTransaction(db, { type: 'expense', amountPaise: 100000, accountId: cash, occurredAt: '2026-10-06T10:00:00.000Z', description: '' });
    await expect(addRepayment(db, b, 1, '2026-10-10', null, cash)).rejects.toBeInstanceOf(UdhaarError);
    expect((await getRecord(db, b))!.repaidPaise).toBe(0);
  });
  test('db rejects a due date before the record date', async () => {
    const { db } = await setup();
    await expect(db.runAsync("INSERT INTO udhaar_records (id,person_name,kind,principal_paise,occurred_on,due_on,created_at,updated_at) VALUES ('q','A','lent',1,'2026-10-05','2026-10-01','x','x')")).rejects.toThrow();
  });
});
