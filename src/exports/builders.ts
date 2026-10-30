import type { SQLiteDatabase } from 'expo-sqlite';
import { CsvColumn, paiseToDecimal, toCsv } from '../domain/csv';
import { formatPaise } from '../domain/money';
import type { DateRange } from '../domain/reports';
import { categoryShares } from '../domain/reports';
import type { ReportDoc } from '../domain/reportHtml';
import { eachDay, progress, targetForDate } from '../domain/savings';
import { outstandingPaise } from '../domain/udhaar';
import { listTransactions, periodTotals } from '../db/repositories/transactions';
import { expenseByCategory } from '../db/repositories/reports';
import { getTargetHistory, listNoSpendDays, savedByDay } from '../db/repositories/savings';
import { listRecords } from '../db/repositories/udhaar';

export type DatasetKind = 'transactions' | 'summary' | 'savings' | 'udhaar';
export interface Dataset { fileBase: string; columns: CsvColumn[]; rows: (string | number | null)[][]; doc: ReportDoc }

const iso = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };
const dayKey = (isoStr: string) => { const d = new Date(isoStr); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const lastDay = (r: DateRange) => { const d = eachDay(r.from, r.toExclusive); return d[d.length - 1] ?? r.from; };
export const rangeLabel = (r: DateRange) => `${r.from} to ${lastDay(r)}`;
const typeLabel = (t: string) => (t === 'income' ? 'Income' : t === 'expense' ? 'Expense' : 'Transfer');

export async function buildDataset(db: SQLiteDatabase, kind: DatasetKind, range: DateRange): Promise<Dataset> {
  const from = iso(range.from), to = iso(range.toExclusive); const label = rangeLabel(range);
  const base = `hisabkitab-${kind}-${range.from}_${lastDay(range)}`;

  if (kind === 'transactions') {
    const txns = await listTransactions(db, { fromISO: from, toISO: to, limit: 1_000_000 });
    const tot = await periodTotals(db, from, to);
    const columns: CsvColumn[] = [{ name: 'Date' }, { name: 'Type' }, { name: 'Amount (INR)' }, { name: 'Category', userText: true }, { name: 'Account', userText: true }, { name: 'To account', userText: true }, { name: 'Description', userText: true }, { name: 'Notes', userText: true }];
    const rows = txns.map((t) => [dayKey(t.occurredAt), typeLabel(t.type), paiseToDecimal(t.amountPaise), t.categoryName, t.accountName, t.toAccountName, t.description, t.notes]);
    return { fileBase: base, columns, rows, doc: { title: 'Transaction history', subtitle: label,
      summary: [{ label: 'Income', value: formatPaise(tot.incomePaise) }, { label: 'Expenses', value: formatPaise(tot.expensePaise) }, { label: 'Net cash flow', value: formatPaise(tot.netPaise) }],
      sections: [{ heading: 'Transactions', columns: ['Date', 'Type', 'Category / accounts', 'Description', 'Amount'],
        rows: txns.map((t) => [dayKey(t.occurredAt), typeLabel(t.type), t.type === 'transfer' ? `${t.accountName} → ${t.toAccountName}` : `${t.categoryName ?? '-'} · ${t.accountName}`, t.description, formatPaise(t.amountPaise)]), rightAlign: [4] }],
      note: 'Transfers are listed but are not counted as income or expenses.' } };
  }

  if (kind === 'summary') {
    const tot = await periodTotals(db, from, to);
    const { items, totalPaise } = categoryShares((await expenseByCategory(db, from, to)).map((r) => ({ key: r.key, name: r.name, total: r.total })), 1000);
    const columns: CsvColumn[] = [{ name: 'Section' }, { name: 'Item', userText: true }, { name: 'Amount (INR)' }, { name: 'Share of expenses (%)' }];
    const rows: (string | number | null)[][] = [['Summary', 'Income', paiseToDecimal(tot.incomePaise), null], ['Summary', 'Expenses', paiseToDecimal(tot.expensePaise), null], ['Summary', 'Net cash flow', paiseToDecimal(tot.netPaise), null],
      ...items.map((i) => ['Expense category', i.name, paiseToDecimal(i.total), i.percent])];
    return { fileBase: base, columns, rows, doc: { title: 'Income and expense summary', subtitle: label,
      summary: [{ label: 'Income', value: formatPaise(tot.incomePaise) }, { label: 'Expenses', value: formatPaise(tot.expensePaise) }, { label: 'Net cash flow', value: formatPaise(tot.netPaise) }],
      sections: [{ heading: 'Expenses by category', columns: ['Category', 'Amount', 'Share'], rows: items.map((i) => [i.name, formatPaise(i.total), `${i.percent}%`]), rightAlign: [1, 2] }],
      note: `Total categorised expenses: ${formatPaise(totalPaise)}.` } };
  }

  if (kind === 'savings') {
    const [hist, saved, noSpend] = await Promise.all([getTargetHistory(db), savedByDay(db, from, to), listNoSpendDays(db, range.from, range.toExclusive)]);
    const days = eachDay(range.from, range.toExclusive);
    const lines = days.map((d) => { const target = targetForDate(hist, d); const s = saved[d] ?? 0; return { d, s, target, met: target > 0 && progress(s, target).met, ns: noSpend.includes(d) }; });
    const total = lines.reduce((a, l) => a + l.s, 0);
    const columns: CsvColumn[] = [{ name: 'Date' }, { name: 'Saved (INR)' }, { name: 'Daily target (INR)' }, { name: 'Target met' }, { name: 'No-spend day (confirmed)' }];
    const rows = lines.map((l) => [l.d, paiseToDecimal(l.s), paiseToDecimal(l.target), l.target > 0 ? (l.met ? 'Yes' : 'No') : '', l.ns ? 'Yes' : '']);
    return { fileBase: base, columns, rows, doc: { title: 'Savings report', subtitle: label,
      summary: [{ label: 'Saved in period', value: formatPaise(total) }, { label: 'Days target met', value: String(lines.filter((l) => l.met).length) }, { label: 'No-spend days', value: String(lines.filter((l) => l.ns).length) }],
      sections: [{ heading: 'Daily savings', columns: ['Date', 'Saved', 'Target', 'Met', 'No-spend'], rows: rows.map((r) => [String(r[0]), formatPaise(Math.round(Number(r[1]) * 100)), formatPaise(Math.round(Number(r[2]) * 100)), String(r[3]), String(r[4])]), rightAlign: [1, 2] }],
      note: 'Savings are transfers into Savings accounts. A day is a no-spend day only if you confirmed it.' } };
  }

  const recs = (await listRecords(db)).filter((r) => r.occurredOn >= range.from && r.occurredOn < range.toExclusive);
  const columns: CsvColumn[] = [{ name: 'Person', userText: true }, { name: 'Type' }, { name: 'Principal (INR)' }, { name: 'Repaid (INR)' }, { name: 'Outstanding (INR)' }, { name: 'Date' }, { name: 'Due date' }, { name: 'Status' }, { name: 'Description', userText: true }];
  const rows = recs.map((r) => { const o = outstandingPaise(r.principalPaise, r.repaidPaise); return [r.personName, r.kind === 'lent' ? 'Lent' : 'Borrowed', paiseToDecimal(r.principalPaise), paiseToDecimal(r.repaidPaise), paiseToDecimal(o), r.occurredOn, r.dueOn, o === 0 ? 'Settled' : 'Open', r.description]; });
  const sum = (k: string, f: (r: typeof recs[number]) => number) => recs.filter((r) => r.kind === k).reduce((a, r) => a + f(r), 0);
  return { fileBase: base, columns, rows, doc: { title: 'Udhaar records', subtitle: label,
    summary: [{ label: 'To receive', value: formatPaise(sum('lent', (r) => outstandingPaise(r.principalPaise, r.repaidPaise))) }, { label: 'To repay', value: formatPaise(sum('borrowed', (r) => outstandingPaise(r.principalPaise, r.repaidPaise))) }],
    sections: [{ heading: 'Records', columns: ['Person', 'Type', 'Principal', 'Outstanding', 'Due', 'Status'], rows: recs.map((r) => [r.personName, r.kind === 'lent' ? 'Lent' : 'Borrowed', formatPaise(r.principalPaise), formatPaise(outstandingPaise(r.principalPaise, r.repaidPaise)), r.dueOn ?? '', outstandingPaise(r.principalPaise, r.repaidPaise) === 0 ? 'Settled' : 'Open']), rightAlign: [2, 3] }],
    note: 'Udhaar principal is not income or expense.' } };
}
export const datasetCsv = (d: Dataset) => toCsv(d.columns, d.rows);
