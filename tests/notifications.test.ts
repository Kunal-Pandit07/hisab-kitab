process.env.TZ = 'UTC';
import { DEFAULT_NOTIFICATIONS as D, inQuiet, MANAGED_PREFIXES, MSG, NotificationSettings, parseHHMM, permissionAction, planBudget, planManaged, Planned, quietOf, shiftDate, shiftMinute } from '../src/domain/notifications';
import { Scheduler, syncPlan } from '../src/notifications/sync';
import { notifyBudgetAlerts, refreshNotifications } from '../src/notifications/service';
import { freshDb } from './helpers';
import { createAccount } from '../src/db/repositories/accounts';
import { saveTransaction } from '../src/db/repositories/transactions';
import { saveBudget } from '../src/db/repositories/budgets';
import { addRepayment, createRecord } from '../src/db/repositories/udhaar';
import { createGoal } from '../src/db/repositories/goals';

const S = (o: Partial<NotificationSettings> = {}): NotificationSettings => ({ ...D, notifEnabled: true, ...o });
const NOW = new Date(2026, 9, 29, 12, 0, 0); // 29 Oct 2026, 12:00 local

class FakeScheduler implements Scheduler {
  store = new Map<string, Planned>(); calls: string[] = []; allowed = true; failIds = new Set<string>();
  async getScheduled() { return [...this.store.values()].map((p) => ({ id: p.id, sig: p.sig })); }
  async schedule(p: Planned) { this.calls.push('schedule:' + p.id); if (this.failIds.has(p.id)) throw new Error('os refused'); this.store.set(p.id, p); }
  async cancel(id: string) { this.calls.push('cancel:' + id); this.store.delete(id); }
  async isAllowed() { return this.allowed; }
}

describe('time helpers', () => {
  test('parseHHMM', () => { expect(parseHHMM('20:00')).toBe(1200); expect(parseHHMM('7:05')).toBe(425); for (const x of ['24:00', '12:60', 'abc', '']) expect(parseHHMM(x)).toBeNull(); });
  test('overnight quiet hours', () => {
    const q = quietOf(S({ quietEnabled: true, quietStart: '22:00', quietEnd: '07:00' }));
    expect(inQuiet(23 * 60, q)).toBe(true); expect(inQuiet(3 * 60, q)).toBe(true); expect(inQuiet(7 * 60, q)).toBe(false); expect(inQuiet(12 * 60, q)).toBe(false);
    expect(quietOf(S({ quietEnabled: false }))).toBeNull(); expect(quietOf(S({ quietEnabled: true, quietStart: '08:00', quietEnd: '08:00' }))).toBeNull();
  });
  test('shiftDate moves late-night times to the morning, same-day or next-day', () => {
    const q = quietOf(S({ quietEnabled: true }));
    const late = new Date(2026, 9, 29, 23, 30); const early = new Date(2026, 9, 30, 3, 0); const fine = new Date(2026, 9, 29, 15, 0);
    expect(shiftDate(late, q)).toEqual(new Date(2026, 9, 30, 7, 0));
    expect(shiftDate(early, q)).toEqual(new Date(2026, 9, 30, 7, 0));
    expect(shiftDate(fine, q)).toBe(fine);
    expect(shiftMinute(23 * 60, q)).toBe(7 * 60);
  });
  test('permission flow never re-prompts after a denial', () => {
    expect(permissionAction('granted')).toBe('none'); expect(permissionAction('undetermined')).toBe('request'); expect(permissionAction('denied')).toBe('open-settings');
  });
});

describe('planner', () => {
  const base = { now: NOW, udhaar: [], goals: [] };
  test('nothing is planned until the user opts in', () => expect(planManaged({ ...base, settings: { ...D } })).toEqual([]));
  test('daily reminders use the chosen time, staggered, with the specified messages', () => {
    const p = planManaged({ ...base, settings: S({ notifTime: '20:00', notifSummary: true }) });
    expect(p.map((x) => [x.id, x.trigger])).toEqual([
      ['hk:daily-expense', { kind: 'daily', hour: 20, minute: 0 }],
      ['hk:daily-savings', { kind: 'daily', hour: 20, minute: 10 }],
      ['hk:daily-summary', { kind: 'daily', hour: 20, minute: 30 }]]);
    expect(p[0].body).toBe(MSG.expense); expect(p[1].body).toBe(MSG.savings); expect(p[2].body).toBe(MSG.summary);
  });
  test('toggles remove their own reminders', () => {
    expect(planManaged({ ...base, settings: S({ notifExpense: false }) }).map((x) => x.id)).toEqual(['hk:daily-savings']);
    expect(planManaged({ ...base, settings: S({ notifDaily: false }) })).toEqual([]);
  });
  test('daily time inside quiet hours moves to when quiet hours end', () => {
    const p = planManaged({ ...base, settings: S({ notifTime: '23:00', quietEnabled: true }) });
    expect(p[0].trigger).toEqual({ kind: 'daily', hour: 7, minute: 0 });
  });
  test('Udhaar: due-soon the day before at 9am, overdue the day after, none for settled or past', () => {
    const p = planManaged({ ...base, settings: S({ notifDaily: false }), udhaar: [
      { id: 'a', dueOn: '2026-11-10', outstandingPaise: 100 }, { id: 'b', dueOn: '2026-11-10', outstandingPaise: 0 },
      { id: 'c', dueOn: '2026-10-01', outstandingPaise: 100 }, { id: 'd', dueOn: null, outstandingPaise: 100 }] });
    expect(p.map((x) => x.id)).toEqual(['hk:udhaar-due:a', 'hk:udhaar-overdue:a']);
    expect(p[0].trigger).toEqual({ kind: 'date', at: new Date(2026, 10, 9, 9, 0) });
    expect(p[1].trigger).toEqual({ kind: 'date', at: new Date(2026, 10, 11, 9, 0) });
    expect(p[0].body).toBe(MSG.udhaarSoon);
    expect(p.every((x) => !/\d{3}|₹/.test(x.body))).toBe(true); // no amounts leak
  });
  test('Udhaar due tomorrow after 9am today falls back to the due-day morning', () => {
    const p = planManaged({ ...base, settings: S({ notifDaily: false }), udhaar: [{ id: 'a', dueOn: '2026-10-30', outstandingPaise: 5 }] });
    expect(p.find((x) => x.id === 'hk:udhaar-due:a')!.trigger).toEqual({ kind: 'date', at: new Date(2026, 9, 30, 9, 0) });
  });
  test('goal reminder a week before the date, only for active goals', () => {
    const p = planManaged({ ...base, settings: S({ notifDaily: false }), goals: [
      { id: 'g1', targetDate: '2026-12-01', status: 'active' }, { id: 'g2', targetDate: '2026-12-01', status: 'completed' }] });
    expect(p.map((x) => x.id)).toEqual(['hk:goal:g1']); expect(p[0].trigger).toEqual({ kind: 'date', at: new Date(2026, 10, 24, 9, 0) });
  });
  test('budget alert text, and quiet-hours deferral', () => {
    const a = [{ budgetId: 'b1', label: 'Food', overall: false, threshold: 75, period: '2026-10' }, { budgetId: 'b2', label: 'overall', overall: true, threshold: 90, period: '2026-10' }];
    const p = planBudget(a, S(), NOW);
    expect(p[0].body).toBe('You have used 75% of your Food budget this month.'); expect(p[1].body).toBe('You have used 90% of your monthly budget.');
    expect(p[0].trigger).toEqual({ kind: 'now' });
    const night = new Date(2026, 9, 29, 23, 0);
    expect(planBudget(a, S({ quietEnabled: true }), night)[0].trigger).toEqual({ kind: 'date', at: new Date(2026, 9, 30, 7, 0) });
    expect(planBudget(a, S({ notifBudget: false }), NOW)).toEqual([]);
  });
});

describe('syncPlan', () => {
  const plan = (o: Partial<NotificationSettings> = {}) => planManaged({ now: NOW, settings: S(o), udhaar: [], goals: [] });
  test('first sync schedules; repeating it changes nothing (no duplicates)', async () => {
    const s = new FakeScheduler();
    expect((await syncPlan(s, plan(), MANAGED_PREFIXES)).scheduled).toHaveLength(2);
    const again = await syncPlan(s, plan(), MANAGED_PREFIXES);
    expect(again.scheduled).toEqual([]); expect(again.unchanged).toHaveLength(2); expect(s.store.size).toBe(2);
  });
  test('changing the time replaces the old schedule rather than adding to it', async () => {
    const s = new FakeScheduler(); await syncPlan(s, plan({ notifTime: '20:00' }), MANAGED_PREFIXES);
    await syncPlan(s, plan({ notifTime: '21:30' }), MANAGED_PREFIXES);
    expect(s.store.size).toBe(2); expect(s.store.get('hk:daily-expense')!.trigger).toEqual({ kind: 'daily', hour: 21, minute: 30 });
  });
  test('turning a toggle off cancels just that reminder; budget alerts are left alone', async () => {
    const s = new FakeScheduler(); await syncPlan(s, plan(), MANAGED_PREFIXES);
    await s.schedule(planBudget([{ budgetId: 'b', label: 'Food', overall: false, threshold: 50, period: '2026-10' }], S(), NOW)[0]);
    await syncPlan(s, plan({ notifSavings: false }), MANAGED_PREFIXES);
    expect([...s.store.keys()].sort()).toEqual(['hk:budget:b:2026-10:50', 'hk:daily-expense']);
  });
  test('one failing item does not stop the others or throw', async () => {
    const s = new FakeScheduler(); s.failIds.add('hk:daily-expense');
    const r = await syncPlan(s, plan(), MANAGED_PREFIXES);
    expect(r.failed.map((f) => f.id)).toEqual(['hk:daily-expense']); expect(r.scheduled).toEqual(['hk:daily-savings']);
  });
});

describe('service (real SQLite, fake scheduler)', () => {
  async function setup() { const db = await freshDb(); const cash = await createAccount(db, { name: 'Cash', type: 'cash', openingBalancePaise: 1_000_000 }); return { db, cash, s: new FakeScheduler() }; }
  test('permission denied: nothing scheduled, nothing thrown', async () => {
    const { db, s } = await setup(); s.allowed = false;
    expect(await refreshNotifications(db, S(), s, NOW)).toEqual({ skipped: 'permission' }); expect(s.store.size).toBe(0);
  });
  test('disabling removes every notification of ours, including budget alerts', async () => {
    const { db, s } = await setup(); await refreshNotifications(db, S(), s, NOW);
    await s.schedule(planBudget([{ budgetId: 'b', label: 'x', overall: true, threshold: 50, period: '2026-10' }], S(), NOW)[0]);
    await refreshNotifications(db, S({ notifEnabled: false }), s, NOW);
    expect(s.store.size).toBe(0);
  });
  test('settling an Udhaar cancels its reminders on the next refresh; goals are scheduled', async () => {
    const { db, s } = await setup();
    const id = await createRecord(db, { kind: 'lent', personName: 'R', principalPaise: 1000, occurredOn: '2026-10-20', dueOn: '2026-11-10', description: '' });
    await createGoal(db, { name: 'Phone', targetPaise: 5000, targetDate: '2026-12-01' });
    await refreshNotifications(db, S({ notifDaily: false }), s, NOW);
    const kinds = () => [...s.store.keys()].map((k) => k.split(':').slice(0, 2).join(':')).sort();
    expect(kinds()).toEqual(['hk:goal', 'hk:udhaar-due', 'hk:udhaar-overdue']);
    expect(s.store.has(`hk:udhaar-due:${id}`)).toBe(true);
    await addRepayment(db, id, 1000, '2026-10-29');
    await refreshNotifications(db, S({ notifDaily: false }), s, NOW);
    expect(kinds()).toEqual(['hk:goal']);
  });
  test('budget alert is scheduled once per threshold, never repeated', async () => {
    const { db, cash, s } = await setup();
    await saveBudget(db, { categoryId: 'exp_food', limitPaise: 10000 });
    const spend = (n: number) => saveTransaction(db, { type: 'expense', amountPaise: n, accountId: cash, categoryId: 'exp_food', occurredAt: NOW.toISOString(), description: '' });
    await spend(7500);
    expect(await notifyBudgetAlerts(db, S(), s, NOW)).toEqual({ scheduled: 1 });
    expect(await notifyBudgetAlerts(db, S(), s, NOW)).toEqual({ scheduled: 0 });
    expect([...s.store.values()][0].body).toBe('You have used 75% of your Food budget this month.');
    await spend(1500);
    expect(await notifyBudgetAlerts(db, S(), s, NOW)).toEqual({ scheduled: 1 });
    expect(s.store.size).toBe(2);
  });
  test('a failed schedule is not marked as fired and is retried', async () => {
    const { db, cash, s } = await setup();
    await saveBudget(db, { categoryId: null, limitPaise: 1000 });
    await saveTransaction(db, { type: 'expense', amountPaise: 600, accountId: cash, occurredAt: NOW.toISOString(), description: '' });
    const id = (await db.getFirstAsync('SELECT id FROM budgets')).id; s.failIds.add(`hk:budget:${id}:2026-10:50`);
    expect(await notifyBudgetAlerts(db, S(), s, NOW)).toEqual({ scheduled: 0 });
    s.failIds.clear();
    expect(await notifyBudgetAlerts(db, S(), s, NOW)).toEqual({ scheduled: 1 });
  });
  test('denied permission or budget toggle off: no budget alerts and not marked fired', async () => {
    const { db, cash, s } = await setup(); await saveBudget(db, { categoryId: null, limitPaise: 1000 });
    await saveTransaction(db, { type: 'expense', amountPaise: 600, accountId: cash, occurredAt: NOW.toISOString(), description: '' });
    s.allowed = false; expect(await notifyBudgetAlerts(db, S(), s, NOW)).toEqual({ scheduled: 0 });
    s.allowed = true; expect(await notifyBudgetAlerts(db, S({ notifBudget: false }), s, NOW)).toEqual({ scheduled: 0 });
    expect(await notifyBudgetAlerts(db, S(), s, NOW)).toEqual({ scheduled: 1 });
  });
});
