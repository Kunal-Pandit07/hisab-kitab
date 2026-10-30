import { accountBalance, categoryExpenseTotals, periodTotals, Txn, validateTransaction, wouldOverdraw } from '../src/domain/transactions';

const cash = { id: 'cash', openingBalancePaise: 0 };
const bank = { id: 'bank', openingBalancePaise: 100000 };
const D = (d: string) => `2026-10-${d}T10:00:00.000Z`;
let n = 0;
const tx = (p: Partial<Txn>): Txn => ({ id: `t${++n}`, type: 'expense', amountPaise: 100, accountId: 'cash', occurredAt: D('10'), ...p });
const RANGE: [string, string] = ['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'];

describe('balances', () => {
  test('income then expense', () => {
    const t = [tx({ type: 'income', amountPaise: 50000 }), tx({ type: 'expense', amountPaise: 12550 })];
    expect(accountBalance(cash, t)).toBe(37450);
  });
  test('edit changes balance, delete restores it', () => {
    const a = tx({ type: 'expense', amountPaise: 1000 });
    expect(accountBalance(cash, [a])).toBe(-1000);
    expect(accountBalance(cash, [{ ...a, amountPaise: 400 }])).toBe(-400);
    expect(accountBalance(cash, [])).toBe(0);
  });
  test('transfer moves money between accounts and conserves total', () => {
    const t = [tx({ type: 'transfer', amountPaise: 25000, accountId: 'bank', toAccountId: 'cash' })];
    expect(accountBalance(bank, t)).toBe(75000);
    expect(accountBalance(cash, t)).toBe(25000);
    expect(accountBalance(bank, t) + accountBalance(cash, t)).toBe(100000);
  });
  test('opening balance may be negative; zero-everything works', () => {
    expect(accountBalance({ id: 'x', openingBalancePaise: -500 }, [])).toBe(-500);
    expect(accountBalance(cash, [])).toBe(0);
  });
});

describe('period totals', () => {
  test('transfers never count as income or expense', () => {
    const t = [tx({ type: 'income', amountPaise: 10000 }), tx({ type: 'expense', amountPaise: 3000 }),
      tx({ type: 'transfer', amountPaise: 99999, accountId: 'bank', toAccountId: 'cash' })];
    expect(periodTotals(t, ...RANGE)).toEqual({ incomePaise: 10000, expensePaise: 3000, netPaise: 7000 });
  });
  test('zero income and negative net cash flow', () => {
    expect(periodTotals([], ...RANGE)).toEqual({ incomePaise: 0, expensePaise: 0, netPaise: 0 });
    expect(periodTotals([tx({ amountPaise: 700 })], ...RANGE).netPaise).toBe(-700);
  });
  test('range is half-open [from,to)', () => {
    const t = [tx({ occurredAt: RANGE[0] }), tx({ occurredAt: RANGE[1] })];
    expect(periodTotals(t, ...RANGE).expensePaise).toBe(100);
  });
  test('paise precision: many small amounts sum exactly', () => {
    const t = Array.from({ length: 1000 }, () => tx({ amountPaise: 29 }));
    expect(periodTotals(t, ...RANGE).expensePaise).toBe(29000);
  });
  test('category totals ignore income and transfers', () => {
    const t = [tx({ categoryId: 'exp_food', amountPaise: 500 }), tx({ categoryId: 'exp_food', amountPaise: 250 }),
      tx({ type: 'income', categoryId: 'inc_gift', amountPaise: 9000 }),
      tx({ type: 'transfer', accountId: 'bank', toAccountId: 'cash', amountPaise: 1 })];
    expect(categoryExpenseTotals(t, ...RANGE)).toEqual({ exp_food: 750 });
  });
});

describe('validation', () => {
  const ok = { type: 'expense' as const, amountPaise: 100, accountId: 'cash', occurredAt: D('10') };
  test('accepts valid', () => expect(validateTransaction(ok)).toEqual([]));
  test('rejects bad amounts', () => {
    for (const a of [0, -1, 1.5, NaN]) expect(validateTransaction({ ...ok, amountPaise: a }).length).toBeGreaterThan(0);
  });
  test('transfer rules', () => {
    expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: 'cash' })).toHaveLength(1);
    expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: null })).toHaveLength(1);
    expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: 'bank' })).toEqual([]);
    expect(validateTransaction({ ...ok, toAccountId: 'bank' })).toHaveLength(1);
  });
  test('overdraft policy', () => {
    expect(wouldOverdraw(1000, 1001)).toBe(true);
    expect(wouldOverdraw(1000, 1000)).toBe(false);
    expect(wouldOverdraw(0, 1, true)).toBe(false);
  });
});
