process.env.TZ = 'UTC';
import { freshDb, dbAtV1WithData } from './helpers';
import { migrate } from '../src/db/database';
import { createAccount, getAccount, listAccounts } from '../src/db/repositories/accounts';
import { deleteTransaction, listTransactions, periodTotals, saveTransaction, TxnError } from '../src/db/repositories/transactions';
import { getTargetHistory, listNoSpendDays, savedByDay, setDailyTarget, setNoSpendDay } from '../src/db/repositories/savings';
import { addContribution, createGoal, getGoal } from '../src/db/repositories/goals';
import { listBudgets, markAlertsFired, pendingAlerts, saveBudget } from '../src/db/repositories/budgets';

const FROM = '2026-10-01T00:00:00.000Z', TO = '2026-11-01T00:00:00.000Z';
const W = (d: string) => `2026-10-${d}T12:00:00.000Z`;
const base = { description: '' };

async function setup() {
  const db = await freshDb();
  const cash = await createAccount(db, { name: 'Cash', type: 'cash', openingBalancePaise: 100000 });
  const bank = await createAccount(db, { name: 'Bank', type: 'bank', openingBalancePaise: 0 });
  const sav = await createAccount(db, { name: 'Savings', type: 'savings', openingBalancePaise: 0 });
  return { db, cash, bank, sav };
}
const bal = async (db: any, id: string) => (await getAccount(db, id))!.balancePaise;

describe('migrations', () => {
  test('fresh db reaches latest version with seeded categories', async () => {
    const db = await freshDb();
    expect((await db.getFirstAsync('PRAGMA user_version')).user_version).toBe(3);
    expect((await db.getAllAsync('SELECT id FROM categories')).length).toBe(19);
  });
  test('upgrading v1 -> latest keeps existing user data', async () => {
    const db = await dbAtV1WithData();
    await migrate(db);
    expect((await db.getFirstAsync('PRAGMA user_version')).user_version).toBe(3);
    expect(await bal(db, 'a1')).toBe(4000);
    expect((await listTransactions(db)).length).toBe(1);
    await migrate(db); // idempotent
  });
});

describe('transactions + balances', () => {
  test('income/expense, edit and delete update balances and totals', async () => {
    const { db, cash } = await setup();
    const inc = await saveTransaction(db, { ...base, type: 'income', amountPaise: 50000, accountId: cash, categoryId: 'inc_gift', occurredAt: W('10') });
    const exp = await saveTransaction(db, { ...base, type: 'expense', amountPaise: 12550, accountId: cash, categoryId: 'exp_food', occurredAt: W('10') });
    expect(await bal(db, cash)).toBe(100000 + 50000 - 12550);
    await saveTransaction(db, { ...base, type: 'expense', amountPaise: 2550, accountId: cash, categoryId: 'exp_food', occurredAt: W('10') }, exp);
    expect(await bal(db, cash)).toBe(100000 + 50000 - 2550);
    expect(await periodTotals(db, FROM, TO)).toEqual({ incomePaise: 50000, expensePaise: 2550, netPaise: 47450 });
    await deleteTransaction(db, inc);
    expect(await bal(db, cash)).toBe(100000 - 2550);
    expect((await periodTotals(db, FROM, TO)).incomePaise).toBe(0);
  });
  test('transfer moves money, conserves total, is not income/expense', async () => {
    const { db, cash, bank } = await setup();
    await saveTransaction(db, { ...base, type: 'transfer', amountPaise: 30000, accountId: cash, toAccountId: bank, occurredAt: W('11') });
    expect(await bal(db, cash)).toBe(70000); expect(await bal(db, bank)).toBe(30000);
    expect(await periodTotals(db, FROM, TO)).toEqual({ incomePaise: 0, expensePaise: 0, netPaise: 0 });
  });
  test('overdrawing transfer is rejected and leaves nothing behind', async () => {
    const { db, cash, bank } = await setup();
    await expect(saveTransaction(db, { ...base, type: 'transfer', amountPaise: 100001, accountId: cash, toAccountId: bank, occurredAt: W('11') })).rejects.toBeInstanceOf(TxnError);
    expect((await listTransactions(db)).length).toBe(0);
    expect(await bal(db, cash)).toBe(100000);
  });
  test('editing a transfer may reuse its own amount (no false overdraft)', async () => {
    const { db, cash, bank } = await setup();
    const id = await saveTransaction(db, { ...base, type: 'transfer', amountPaise: 100000, accountId: cash, toAccountId: bank, occurredAt: W('11') });
    await saveTransaction(db, { ...base, type: 'transfer', amountPaise: 100000, accountId: cash, toAccountId: bank, occurredAt: W('12') }, id);
    expect(await bal(db, cash)).toBe(0);
  });
  test('database constraints reject malformed rows even if code is bypassed', async () => {
    const { db, cash } = await setup();
    await expect(db.runAsync("INSERT INTO transactions (id,type,amount_paise,account_id,to_account_id,occurred_at,created_at,updated_at) VALUES ('x','transfer',100,?,?,'a','a','a')", cash, cash)).rejects.toThrow();
    await expect(db.runAsync("INSERT INTO transactions (id,type,amount_paise,account_id,occurred_at,created_at,updated_at) VALUES ('y','expense',0,?,'a','a','a')", cash)).rejects.toThrow();
  });
  test('history search treats % and _ literally; archived accounts keep history', async () => {
    const { db, cash } = await setup();
    await saveTransaction(db, { type: 'expense', amountPaise: 100, accountId: cash, occurredAt: W('10'), description: '50% off' });
    await saveTransaction(db, { type: 'expense', amountPaise: 100, accountId: cash, occurredAt: W('10'), description: 'tea' });
    expect((await listTransactions(db, { search: '%' })).length).toBe(1);
    await db.runAsync('UPDATE accounts SET archived=1 WHERE id=?', cash);
    expect((await listAccounts(db)).find((a) => a.id === cash)).toBeUndefined();
    expect((await listTransactions(db)).length).toBe(2);
  });
  test('large history stays correct (2,000 rows)', async () => {
    const { db, cash } = await setup();
    await db.withExclusiveTransactionAsync(async (tx: any) => {
      for (let i = 0; i < 2000; i++) await tx.runAsync("INSERT INTO transactions (id,type,amount_paise,account_id,occurred_at,created_at,updated_at) VALUES (?,?,?,?,?,'x','x')", `b${i}`, 'expense', 29, cash, W('10'));
    });
    expect(await bal(db, cash)).toBe(100000 - 2000 * 29);
    expect((await listTransactions(db, { limit: 50 })).length).toBe(50);
  });
});

describe('savings', () => {
  test('saved-by-day derives from transfers into savings only; no double counting', async () => {
    const { db, cash, bank, sav } = await setup();
    await saveTransaction(db, { ...base, type: 'transfer', amountPaise: 5000, accountId: cash, toAccountId: sav, occurredAt: W('10') });
    await saveTransaction(db, { ...base, type: 'transfer', amountPaise: 2000, accountId: cash, toAccountId: bank, occurredAt: W('10') }); // not savings
    await saveTransaction(db, { ...base, type: 'expense', amountPaise: 700, accountId: cash, occurredAt: W('10') });
    await saveTransaction(db, { ...base, type: 'transfer', amountPaise: 1000, accountId: sav, toAccountId: cash, occurredAt: W('11') }); // withdrawal
    expect(await savedByDay(db, FROM, TO)).toEqual({ '2026-10-10': 5000, '2026-10-11': -1000 });
    expect(await periodTotals(db, FROM, TO)).toEqual({ incomePaise: 0, expensePaise: 700, netPaise: -700 });
    expect(await bal(db, cash) + await bal(db, bank) + await bal(db, sav)).toBe(100000 - 700);
  });
  test('target history and manual no-spend days', async () => {
    const { db } = await setup();
    await setDailyTarget(db, 1000, '2026-10-01'); await setDailyTarget(db, 5000, '2026-10-15'); await setDailyTarget(db, 6000, '2026-10-15');
    expect(await getTargetHistory(db)).toEqual([{ effectiveFrom: '2026-10-01', amountPaise: 1000 }, { effectiveFrom: '2026-10-15', amountPaise: 6000 }]);
    expect(await listNoSpendDays(db, '2026-10-01', '2026-11-01')).toEqual([]); // never assumed
    await setNoSpendDay(db, '2026-10-12', true); await setNoSpendDay(db, '2026-10-12', true);
    expect(await listNoSpendDays(db, '2026-10-01', '2026-11-01')).toEqual(['2026-10-12']);
    await setNoSpendDay(db, '2026-10-12', false);
    expect(await listNoSpendDays(db, '2026-10-01', '2026-11-01')).toEqual([]);
  });
});

describe('goals', () => {
  test('allocation never changes balances or income/expense; completion fires once', async () => {
    const { db, cash } = await setup();
    const g = await createGoal(db, { name: 'Phone', targetPaise: 10000 });
    const before = await bal(db, cash);
    expect((await addContribution(db, g, 4000)).justCompleted).toBe(false);
    expect((await addContribution(db, g, 6000)).justCompleted).toBe(true);
    expect((await addContribution(db, g, 500)).justCompleted).toBe(false);
    expect(await bal(db, cash)).toBe(before);
    expect(await periodTotals(db, FROM, TO)).toEqual({ incomePaise: 0, expensePaise: 0, netPaise: 0 });
    expect(await getGoal(db, g)).toMatchObject({ allocatedPaise: 10500, status: 'completed' });
  });
  test('removing reopens a completed goal; cannot remove more than allocated', async () => {
    const { db } = await setup();
    const g = await createGoal(db, { name: 'Laptop', targetPaise: 1000 });
    await addContribution(db, g, 1000);
    await addContribution(db, g, -400);
    expect(await getGoal(db, g)).toMatchObject({ allocatedPaise: 600, status: 'active' });
    await expect(addContribution(db, g, -601)).rejects.toThrow(/only remove/);
    expect((await getGoal(db, g))!.allocatedPaise).toBe(600);
  });
});

describe('budgets', () => {
  test('spent counts expenses only, follows edits/deletes, category vs overall', async () => {
    const { db, cash, bank } = await setup();
    await saveBudget(db, { categoryId: null, limitPaise: 10000 });
    await saveBudget(db, { categoryId: 'exp_food', limitPaise: 4000 });
    const f = await saveTransaction(db, { ...base, type: 'expense', amountPaise: 3000, accountId: cash, categoryId: 'exp_food', occurredAt: W('10') });
    await saveTransaction(db, { ...base, type: 'expense', amountPaise: 2000, accountId: cash, categoryId: 'exp_travel', occurredAt: W('10') });
    await saveTransaction(db, { ...base, type: 'income', amountPaise: 9999, accountId: cash, categoryId: 'inc_gift', occurredAt: W('10') });
    await saveTransaction(db, { ...base, type: 'transfer', amountPaise: 9000, accountId: cash, toAccountId: bank, occurredAt: W('10') });
    const get = async () => Object.fromEntries((await listBudgets(db, FROM, TO)).map((b) => [b.categoryId ?? 'overall', b.spentPaise]));
    expect(await get()).toEqual({ overall: 5000, exp_food: 3000 });
    await saveTransaction(db, { ...base, type: 'expense', amountPaise: 1000, accountId: cash, categoryId: 'exp_food', occurredAt: W('10') }, f);
    expect(await get()).toEqual({ overall: 3000, exp_food: 1000 });
    await deleteTransaction(db, f);
    expect((await get()).exp_food).toBe(0);
  });
  test('saving the same scope twice updates instead of duplicating; exceeding budget is still recordable', async () => {
    const { db, cash } = await setup();
    await saveBudget(db, { categoryId: null, limitPaise: 100 }); await saveBudget(db, { categoryId: null, limitPaise: 200 });
    expect(await listBudgets(db, FROM, TO)).toHaveLength(1);
    await expect(saveTransaction(db, { ...base, type: 'expense', amountPaise: 5000, accountId: cash, occurredAt: W('10') })).resolves.toBeTruthy();
  });
  test('alerts fire once per threshold per period', async () => {
    const { db, cash } = await setup();
    await saveBudget(db, { categoryId: 'exp_food', limitPaise: 10000 });
    const spend = (n: number) => saveTransaction(db, { ...base, type: 'expense', amountPaise: n, accountId: cash, categoryId: 'exp_food', occurredAt: W('10') });
    await spend(7500);
    let p = await pendingAlerts(db, '2026-10', FROM, TO);
    expect(p).toHaveLength(1); expect(p[0].threshold).toBe(75); expect(p[0].record).toEqual([50, 75]);
    expect(await pendingAlerts(db, '2026-10', FROM, TO)).toHaveLength(1); // not marked until delivered
    await markAlertsFired(db, '2026-10', p); await markAlertsFired(db, '2026-10', p);
    expect(await pendingAlerts(db, '2026-10', FROM, TO)).toHaveLength(0);
    await spend(1500);
    p = await pendingAlerts(db, '2026-10', FROM, TO);
    expect(p.map((x) => x.threshold)).toEqual([90]);
    expect(await pendingAlerts(db, '2026-11', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')).toHaveLength(0);
  });
});
