process.env.TZ = 'UTC';
import { randomBytes as nodeRandom } from 'crypto';
import { b64decode, b64encode } from '../src/utils/base64';
import { csvCell, neutralizeFormula, paiseToDecimal, toCsv } from '../src/domain/csv';
import { barScale, categoryShares, monthsInRange, percentOf, presetRange, zeroFillDays, zeroFillMonths } from '../src/domain/reports';
import { buildReportHtml, escapeHtml } from '../src/domain/reportHtml';
import { afterFailure, afterSuccess, checkPin, createVerifier, FRESH_LOCK, lockoutSecondsFor, remainingLockSeconds, validatePin } from '../src/domain/pin';
import { scryptKdf } from '../src/security/kdf';
import { BackupError, DEFAULT_BACKUP_KDF, decryptBackup, encryptBackup } from '../src/domain/backup';
import { validatePayload } from '../src/domain/backupSchema';
import { LATEST_SCHEMA_VERSION } from '../src/db/migrations';
import { freshDb } from './helpers';
import { createAccount, listAccounts } from '../src/db/repositories/accounts';
import { listTransactions, saveTransaction } from '../src/db/repositories/transactions';
import { exportAll, resetAll, restoreAll } from '../src/db/repositories/backup';
import { createCategory } from '../src/db/repositories/categories';
import { expenseByCategory, expenseByDay, incomeExpenseByMonth } from '../src/db/repositories/reports';
import { saveBudget } from '../src/db/repositories/budgets';
import { addContribution, createGoal } from '../src/db/repositories/goals';
import { addRepayment, createRecord } from '../src/db/repositories/udhaar';
import { setDailyTarget, setNoSpendDay } from '../src/db/repositories/savings';
import { buildDataset, datasetCsv } from '../src/exports/builders';

const rb = (n: number) => new Uint8Array(nodeRandom(n));
const FAST = { N: 2 ** 10, r: 8, p: 1 };

describe('base64', () => {
  test('round trips every length', () => { for (let n = 0; n < 40; n++) { const u = rb(n); expect([...b64decode(b64encode(u))]).toEqual([...u]); } });
  test('matches Buffer and rejects junk', () => { const u = rb(33); expect(b64encode(u)).toBe(Buffer.from(u).toString('base64')); expect(() => b64decode('abc')).toThrow(); expect(() => b64decode('ab!d')).toThrow(); });
});

describe('csv', () => {
  test('exact decimals', () => { expect(paiseToDecimal(12550)).toBe('125.50'); expect(paiseToDecimal(5)).toBe('0.05'); expect(paiseToDecimal(-1999)).toBe('-19.99'); });
  test('quoting of commas, quotes, newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('say "hi"')).toBe('"say ""hi"""'); expect(csvCell('l1\nl2')).toBe('"l1\nl2"'); expect(csvCell(null)).toBe('');
  });
  test('formula injection is neutralised for user text only', () => {
    for (const v of ['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx']) expect(neutralizeFormula(v)).toBe("'" + v);
    expect(neutralizeFormula('Food')).toBe('Food');
    expect(csvCell('=HYPERLINK("http://evil")', true)).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('-50.00', false)).toBe('-50.00');
  });
  test('BOM, header and CRLF', () => {
    const out = toCsv([{ name: 'A' }, { name: 'B', userText: true }], [['1', '=x']]);
    expect(out).toBe('\uFEFFA,B\r\n1,\'=x\r\n');
  });
});

describe('report maths', () => {
  test('presets', () => {
    expect(presetRange('thisMonth', '2026-10-29')).toEqual({ from: '2026-10-01', toExclusive: '2026-11-01' });
    expect(presetRange('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', toExclusive: '2026-01-01' });
    expect(presetRange('last30', '2026-10-29')).toEqual({ from: '2026-09-30', toExclusive: '2026-10-30' });
    expect(presetRange('thisYear', '2026-10-29')).toEqual({ from: '2026-01-01', toExclusive: '2027-01-01' });
  });
  test('zero filling', () => {
    const z = zeroFillDays({ from: '2026-10-01', toExclusive: '2026-10-04' }, [{ day: '2026-10-02', total: 500 }]);
    expect(z).toEqual([{ day: '2026-10-01', total: 0 }, { day: '2026-10-02', total: 500 }, { day: '2026-10-03', total: 0 }]);
    expect(monthsInRange({ from: '2026-01-01', toExclusive: '2027-01-01' })).toHaveLength(12);
    expect(monthsInRange({ from: '2026-10-20', toExclusive: '2026-12-02' })).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(zeroFillMonths({ from: '2026-10-01', toExclusive: '2026-12-01' }, [{ month: '2026-11', incomePaise: 1, expensePaise: 2 }])[0]).toEqual({ month: '2026-10', incomePaise: 0, expensePaise: 0 });
  });
  test('shares and bars', () => {
    const r = categoryShares([{ key: 'a', name: 'A', total: 600 }, { key: 'b', name: 'B', total: 300 }, { key: 'c', name: 'C', total: 100 }, { key: 'z', name: 'Z', total: 0 }], 2);
    expect(r.items.map((i) => [i.name, i.percent])).toEqual([['A', 60], ['B', 30], ['Others', 10]]); expect(r.totalPaise).toBe(1000);
    expect(percentOf(1, 0)).toBe(0); expect(barScale([0, 50, 100])).toEqual([0, 50, 100]); expect(barScale([0, 0])).toEqual([0, 0]); expect(barScale([1, 1000])[0]).toBe(3);
  });
  test('html escapes user text', () => {
    expect(escapeHtml(`<script>alert("x")</script>&'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;');
    const h = buildReportHtml({ title: 'T', subtitle: 'S', summary: [], sections: [{ heading: 'H', columns: ['A'], rows: [['<img src=x onerror=1>']] }] }, 'now');
    expect(h).not.toContain('<img'); expect(h).toContain('&lt;img'); expect(h).toContain('Powered by KP Groups'); expect(h).toContain('No records'.slice(0, 0));
  });
});

describe('PIN', () => {
  test('format and weak pins', () => {
    for (const ok of ['2580', '135790', '4821']) expect(validatePin(ok)).toBeNull();
    for (const bad of ['123', '1234567', 'abcd', '1111', '1234', '9876', '12 34']) expect(validatePin(bad)).not.toBeNull();
  });
  test('verifier is not plaintext, verifies right pin only, salts differ', async () => {
    const small = { N: 2 ** 8, r: 8, p: 1 };
    const v = await createVerifier('2580', { randomBytes: rb, kdf: scryptKdf }, small);
    expect(JSON.stringify(v)).not.toContain('2580'); expect(v.len).toBe(4);
    expect(await checkPin('2580', v, scryptKdf)).toBe(true); expect(await checkPin('2581', v, scryptKdf)).toBe(false);
    expect((await createVerifier('2580', { randomBytes: rb, kdf: scryptKdf }, small)).hash).not.toBe(v.hash);
  });
  test('lockout escalates and resets', () => {
    expect([1, 4, 5, 6, 7, 8, 20].map(lockoutSecondsFor)).toEqual([0, 0, 30, 60, 300, 900, 900]);
    let s = FRESH_LOCK; for (let i = 0; i < 5; i++) s = afterFailure(s, 1000);
    expect(remainingLockSeconds(s, 1000)).toBe(30); expect(remainingLockSeconds(s, 31_000)).toBe(0);
    expect(afterSuccess()).toEqual(FRESH_LOCK);
  });
});

describe('encrypted backup format', () => {
  const payload = { hello: 'wörld ₹', n: [1, 2, 3] };
  test('round trip with default (production) parameters', async () => {
    const f = await encryptBackup(payload, 'correct horse', { randomBytes: rb });
    expect(f).not.toContain('wörld'); expect(JSON.parse(f).kdf.N).toBe(DEFAULT_BACKUP_KDF.N);
    expect(await decryptBackup(f, 'correct horse')).toEqual(payload);
  });
  test('wrong password is rejected', async () => {
    const f = await encryptBackup(payload, 'correct horse', { randomBytes: rb }, FAST);
    await expect(decryptBackup(f, 'wrong horse')).rejects.toMatchObject({ code: 'auth' });
  });
  test('each backup uses a fresh salt and nonce', async () => {
    const a = JSON.parse(await encryptBackup(payload, 'pw12345678', { randomBytes: rb }, FAST)), b = JSON.parse(await encryptBackup(payload, 'pw12345678', { randomBytes: rb }, FAST));
    expect(a.kdf.salt).not.toBe(b.kdf.salt); expect(a.nonce).not.toBe(b.nonce); expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  test('any bit flip in the ciphertext, or a changed header, is detected', async () => {
    const f = JSON.parse(await encryptBackup(payload, 'pw12345678', { randomBytes: rb }, FAST));
    const ct = b64decode(f.ciphertext); ct[3] ^= 1;
    await expect(decryptBackup(JSON.stringify({ ...f, ciphertext: b64encode(ct) }), 'pw12345678')).rejects.toMatchObject({ code: 'auth' });
    await expect(decryptBackup(JSON.stringify({ ...f, kdf: { ...f.kdf, r: 9 } }), 'pw12345678')).rejects.toBeInstanceOf(BackupError);
    const n = b64decode(f.nonce); n[0] ^= 1;
    await expect(decryptBackup(JSON.stringify({ ...f, nonce: b64encode(n) }), 'pw12345678')).rejects.toMatchObject({ code: 'auth' });
  });
  test('rejects non-backups, other versions, hostile parameters, truncation', async () => {
    const f = JSON.parse(await encryptBackup(payload, 'pw12345678', { randomBytes: rb }, FAST));
    await expect(decryptBackup('not json', 'x')).rejects.toMatchObject({ code: 'format' });
    await expect(decryptBackup('{"magic":"NOPE"}', 'x')).rejects.toMatchObject({ code: 'format' });
    await expect(decryptBackup(JSON.stringify({ ...f, version: 99 }), 'x')).rejects.toMatchObject({ code: 'version' });
    await expect(decryptBackup(JSON.stringify({ ...f, kdf: { ...f.kdf, N: 2 ** 30 } }), 'x')).rejects.toMatchObject({ code: 'params' });
    await expect(decryptBackup(JSON.stringify({ ...f, kdf: { ...f.kdf, N: 1000 } }), 'x')).rejects.toMatchObject({ code: 'params' });
    await expect(decryptBackup(JSON.stringify({ ...f, ciphertext: f.ciphertext.slice(0, 8) }), 'pw12345678')).rejects.toMatchObject({ code: 'format' });
    await expect(decryptBackup(JSON.stringify({ ...f, ciphertext: '***' }), 'x')).rejects.toMatchObject({ code: 'format' });
  });
});

async function populated() {
  const db = await freshDb();
  const cash = await createAccount(db, { name: 'Cash', type: 'cash', openingBalancePaise: 500000 });
  const sav = await createAccount(db, { name: 'Savings', type: 'savings', openingBalancePaise: 0 });
  const t = (o: object) => saveTransaction(db, { description: '', occurredAt: '2026-10-10T10:00:00.000Z', accountId: cash, ...o } as any);
  await t({ type: 'income', amountPaise: 100000, categoryId: 'inc_salary', description: 'Pay' });
  await t({ type: 'expense', amountPaise: 12550, categoryId: 'exp_food', description: '=HYPERLINK("http://x")' });
  await t({ type: 'expense', amountPaise: 4000, categoryId: 'exp_travel', occurredAt: '2026-09-20T10:00:00.000Z' });
  await t({ type: 'transfer', amountPaise: 30000, toAccountId: sav });
  await saveBudget(db, { categoryId: 'exp_food', limitPaise: 20000 });
  const g = await createGoal(db, { name: 'Phone', targetPaise: 9000 }); await addContribution(db, g, 3000);
  const u = await createRecord(db, { kind: 'lent', personName: 'Rohan', principalPaise: 20000, occurredOn: '2026-10-05', description: 'books', accountId: cash }); await addRepayment(db, u, 5000, '2026-10-12', null, cash);
  await setDailyTarget(db, 1000, '2026-10-01'); await setNoSpendDay(db, '2026-10-11', true);
  await db.runAsync("INSERT INTO app_settings (key,value) VALUES ('theme','\"dark\"'),('biometricEnabled','true'),('autoLockSeconds','60')");
  return { db, cash, sav };
}
const balances = async (db: any) => Object.fromEntries((await listAccounts(db, true)).map((a) => [a.name, a.balancePaise]));
const dump = async (db: any) => JSON.stringify((await exportAll(db, 't', new Date(0))).tables);

describe('backup, restore, reset (real SQLite)', () => {
  test('export excludes secrets and device-specific settings', async () => {
    const { db } = await populated(); const p = await exportAll(db, '1.0.0');
    expect(p.settings).toEqual({ theme: 'dark' }); expect(JSON.stringify(p)).not.toMatch(/biometric|autoLock|verifier|"pin/i);
  });
  test('encrypt -> decrypt -> validate -> restore into a fresh database reproduces everything', async () => {
    const { db } = await populated(); const before = await balances(db); const dataBefore = await dump(db);
    const file = await encryptBackup(await exportAll(db, '1.0.0'), 'my backup pw', { randomBytes: rb }, FAST);
    const v = validatePayload(await decryptBackup(file, 'my backup pw'), LATEST_SCHEMA_VERSION);
    expect(v.ok).toBe(true); if (!v.ok) return;
    expect(v.summary.counts.transactions).toBe(4); expect(v.summary.counts.udhaar_repayments).toBe(1);
    const fresh = await freshDb(); await createAccount(fresh, { name: 'Junk', type: 'cash', openingBalancePaise: 1 });
    await restoreAll(fresh, v.payload);
    expect(await balances(fresh)).toEqual(before); expect(await dump(fresh)).toBe(dataBefore);
    expect((await fresh.getFirstAsync("SELECT value FROM app_settings WHERE key='theme'")).value).toBe('"dark"');
    expect((await fresh.getFirstAsync("SELECT value FROM app_settings WHERE key='onboarded'")).value).toBe('true');
  });
  test('wrong password or corrupted file never touches existing data', async () => {
    const { db } = await populated(); const before = await dump(db);
    const file = await encryptBackup(await exportAll(db, '1'), 'right password', { randomBytes: rb }, FAST);
    await expect(decryptBackup(file, 'wrong password')).rejects.toMatchObject({ code: 'auth' });
    const f = JSON.parse(file); const ct = b64decode(f.ciphertext); ct[10] ^= 255; f.ciphertext = b64encode(ct);
    await expect(decryptBackup(JSON.stringify(f), 'right password')).rejects.toBeInstanceOf(BackupError);
    expect(await dump(db)).toBe(before);
  });
  test('validation catches broken links, bad fields and other schema versions', async () => {
    const { db } = await populated(); const good = await exportAll(db, '1');
    const clone = () => JSON.parse(JSON.stringify(good));
    const a = clone(); a.tables.transactions[0].account_id = 'ghost'; expect(validatePayload(a, LATEST_SCHEMA_VERSION).ok).toBe(false);
    const b = clone(); b.tables.accounts[0].extra = 1; expect(validatePayload(b, LATEST_SCHEMA_VERSION).ok).toBe(false);
    const c = clone(); c.tables.transactions[0].amount_paise = 1.5; expect(validatePayload(c, LATEST_SCHEMA_VERSION).ok).toBe(false);
    const d = clone(); d.tables.udhaar_repayments[0].amount_paise = 999999; expect(validatePayload(d, LATEST_SCHEMA_VERSION).ok).toBe(false);
    const e = clone(); e.schemaVersion = 1; expect(validatePayload(e, LATEST_SCHEMA_VERSION)).toMatchObject({ ok: false });
    const f = clone(); delete f.tables.goals; expect(validatePayload(f, LATEST_SCHEMA_VERSION).ok).toBe(false);
    const g = clone(); g.tables.accounts.push({ ...g.tables.accounts[0] }); expect(validatePayload(g, LATEST_SCHEMA_VERSION).ok).toBe(false);
    expect(validatePayload(null, 3).ok).toBe(false); expect(validatePayload({ format: 'x' }, 3).ok).toBe(false);
  });
  test('a failure part-way through restore rolls everything back', async () => {
    const { db } = await populated(); const before = await dump(db); const bal = await balances(db);
    const bad = JSON.parse(JSON.stringify(await exportAll(db, '1')));
    bad.tables.transactions[1].type = 'bogus'; // passes shape checks but violates a database CHECK constraint
    await expect(restoreAll(db, bad)).rejects.toThrow();
    expect(await dump(db)).toBe(before); expect(await balances(db)).toEqual(bal);
    const fk = JSON.parse(JSON.stringify(await exportAll(db, '1'))); fk.tables.transactions[0].category_id = 'nope';
    await expect(restoreAll(db, fk)).rejects.toThrow(); expect(await dump(db)).toBe(before);
  });
  test('reset removes all data and settings but restores built-in categories', async () => {
    const { db } = await populated(); await resetAll(db);
    for (const t of ['accounts', 'transactions', 'budgets', 'goals', 'udhaar_records', 'app_settings']) expect((await db.getFirstAsync(`SELECT COUNT(*) c FROM ${t}`)).c).toBe(0);
    expect((await db.getFirstAsync('SELECT COUNT(*) c FROM categories')).c).toBe(19);
  });
});

describe('categories', () => {
  test('custom category rules', async () => {
    const db = await freshDb();
    const id = await createCategory(db, '  Pets  ', 'expense'); expect(id).toMatch(/^cat_/);
    await expect(createCategory(db, 'pets', 'expense')).rejects.toThrow(/already/);
    await createCategory(db, 'Pets', 'income'); await expect(createCategory(db, ' ', 'expense')).rejects.toThrow(); await expect(createCategory(db, 'x'.repeat(31), 'expense')).rejects.toThrow();
  });
});

describe('report queries and exports (real SQLite)', () => {
  const R = { from: '2026-10-01', toExclusive: '2026-11-01' };
  test('aggregates ignore transfers, goals and Udhaar', async () => {
    const { db } = await populated();
    const F = '2026-09-01T00:00:00.000Z', T = '2026-11-01T00:00:00.000Z';
    expect(await expenseByDay(db, '2026-10-01T00:00:00.000Z', T)).toEqual([{ day: '2026-10-10', total: 12550 }]);
    expect(await incomeExpenseByMonth(db, F, T)).toEqual([{ month: '2026-09', incomePaise: 0, expensePaise: 4000 }, { month: '2026-10', incomePaise: 100000, expensePaise: 12550 }]);
    expect((await expenseByCategory(db, F, T)).map((r) => [r.name, r.total])).toEqual([['Food', 12550], ['Travel', 4000]]);
  });
  test('transactions CSV: values, neutralised formula, no transfer in totals', async () => {
    const { db } = await populated(); const d = await buildDataset(db, 'transactions', R); const csv = datasetCsv(d);
    expect(d.rows).toHaveLength(3); expect(csv).toContain('125.50'); expect(csv).toContain('"\'=HYPERLINK(""http://x"")"'); expect(csv.split('\r\n')[0]).toBe('\uFEFFDate,Type,Amount (INR),Category,Account,To account,Description,Notes');
    expect(d.doc.summary[0].value).toBe('₹1,000.00'); expect(d.doc.summary[1].value).toBe('₹125.50');
  });
  test('summary, savings and udhaar datasets', async () => {
    const { db } = await populated();
    const s = await buildDataset(db, 'summary', R); expect(s.rows.slice(0, 3).map((r) => r[2])).toEqual(['1000.00', '125.50', '874.50']); expect(s.rows[3]).toEqual(['Expense category', 'Food', '125.50', 100]);
    const sv = await buildDataset(db, 'savings', R); expect(sv.rows).toHaveLength(31); expect(sv.rows[9]).toEqual(['2026-10-10', '300.00', '10.00', 'Yes', '']); expect(sv.rows[10][4]).toBe('Yes'); expect(sv.rows[0][4]).toBe('');
    const u = await buildDataset(db, 'udhaar', R); expect(u.rows[0]).toEqual(['Rohan', 'Lent', '200.00', '50.00', '150.00', '2026-10-05', null, 'Open', 'books']);
    expect((await buildDataset(db, 'udhaar', { from: '2026-01-01', toExclusive: '2026-02-01' })).rows).toEqual([]);
  });
});
