process.env.TZ = 'UTC';
import { freshDb } from './helpers';
import { createAccount, listAccounts } from '../src/db/repositories/accounts';
import { listTransactions, periodTotals } from '../src/db/repositories/transactions';
import { expenseByCategory, expenseByDay } from '../src/db/repositories/reports';

describe('large histories (20,000 transactions)', () => {
  test('stay correct, indexed and fast', async () => {
    const db = await freshDb(); const cash = await createAccount(db, { name: 'Cash', type: 'cash', openingBalancePaise: 0 });
    await db.withExclusiveTransactionAsync(async (tx: any) => {
      for (let i = 0; i < 20000; i++) {
        const day = 1 + (i % 28); const income = i % 10 === 0;
        await tx.runAsync("INSERT INTO transactions (id,type,amount_paise,account_id,category_id,description,occurred_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'x','x')",
          `p${i}`, income ? 'income' : 'expense', 100 + (i % 7), cash, income ? 'inc_salary' : 'exp_food', '', `2026-10-${String(day).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00.000Z`);
      }
    });
    const F = '2026-10-01T00:00:00.000Z', T = '2026-11-01T00:00:00.000Z';
    const t0 = Date.now();
    const page = await listTransactions(db, { limit: 50 });
    const tot = await periodTotals(db, F, T); const days = await expenseByDay(db, F, T); const cats = await expenseByCategory(db, F, T); const accs = await listAccounts(db);
    const ms = Date.now() - t0;
    expect(page).toHaveLength(50); expect(days).toHaveLength(28); expect(cats[0].name).toBe('Food');
    expect(accs[0].balancePaise).toBe(tot.incomePaise - tot.expensePaise); // ledger, totals and balance agree to the paisa
    expect(ms).toBeLessThan(3000);
    const plan = (await db.getAllAsync("EXPLAIN QUERY PLAN SELECT id FROM transactions ORDER BY occurred_at DESC LIMIT 50")).map((r: any) => r.detail).join(' ');
    expect(plan).toMatch(/idx_txn_occurred/);
  });
});
