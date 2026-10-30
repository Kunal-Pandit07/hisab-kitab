import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Body, Button, Card, Chips, Field, H1, Label, ProgressBar, Screen } from '../../src/components/ui';
import { HBars, VBars } from '../../src/components/charts';
import { formatPaise } from '../../src/domain/money';
import { categoryShares, percentOf, Preset, presetRange, rangeDays, zeroFillDays, zeroFillMonths } from '../../src/domain/reports';
import { addDaysKey, periodTarget, progress } from '../../src/domain/savings';
import { budgetProgress } from '../../src/domain/budgets';
import { outstandingPaise, summarize } from '../../src/domain/udhaar';
import { listAccounts, Account } from '../../src/db/repositories/accounts';
import { listBudgets, BudgetRow } from '../../src/db/repositories/budgets';
import { periodTotals } from '../../src/db/repositories/transactions';
import { expenseByCategory, expenseByDay, incomeExpenseByMonth } from '../../src/db/repositories/reports';
import { getTargetHistory, savedByDay } from '../../src/db/repositories/savings';
import { listRecords } from '../../src/db/repositories/udhaar';
import { dateKey, isValidDateKey, monthRange } from '../../src/utils/dates';
import { useApp } from '../../src/hooks/useApp';
import { space, useTheme } from '../../src/theme';

const iso = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };
interface Data {
  totals: { incomePaise: number; expensePaise: number; netPaise: number }; series: { label: string; total: number }[]; seriesKind: 'day' | 'month';
  cats: ReturnType<typeof categoryShares>; saved: number; savedTarget: number; budgets: BudgetRow[]; accounts: Account[];
  udhaar: ReturnType<typeof summarize>; days: number;
}

export default function Reports() {
  const { db, settings } = useApp(); const t = useTheme(); const router = useRouter(); const today = dateKey(new Date());
  const [preset, setPreset] = useState<Preset | 'custom'>('thisMonth'); const [from, setFrom] = useState(today); const [to, setTo] = useState(today);
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState<string | null>(null);
  const hide = settings.hideBalance; const m = (p: number) => (hide ? '₹ ••••' : formatPaise(p));

  const load = useCallback(async () => {
    if (preset === 'custom' && (!isValidDateKey(from) || !isValidDateKey(to) || from > to)) { setErr('Enter valid dates (YYYY-MM-DD), start on or before end.'); return; }
    setErr(null);
    try {
      const r = preset === 'custom' ? { from, toExclusive: addDaysKey(to, 1) } : presetRange(preset, today);
      const f = iso(r.from), tt = iso(r.toExclusive); const days = rangeDays(r); const mr = monthRange();
      const [totals, byDay, byMonth, cats, saved, hist, budgets, accounts, recs] = await Promise.all([
        periodTotals(db, f, tt), expenseByDay(db, f, tt), incomeExpenseByMonth(db, f, tt), expenseByCategory(db, f, tt), savedByDay(db, f, tt),
        getTargetHistory(db), listBudgets(db, mr.from, mr.to), listAccounts(db), listRecords(db)]);
      const useDays = days <= 62;
      setD({ totals, seriesKind: useDays ? 'day' : 'month', days,
        series: useDays ? zeroFillDays(r, byDay).map((x) => ({ label: x.day, total: x.total })) : zeroFillMonths(r, byMonth).map((x) => ({ label: x.month, total: x.expensePaise })),
        cats: categoryShares(cats), saved: Math.max(0, Object.values(saved).reduce((a, b) => a + b, 0)), savedTarget: periodTarget(hist, r.from, r.toExclusive),
        budgets, accounts, udhaar: summarize(recs) });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load reports.'); }
  }, [db, preset, from, to, today]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const maxDay = d ? d.series.reduce((a, b) => (b.total > a.total ? b : a), { label: '', total: 0 }) : null;
  const sp = d ? progress(d.saved, d.savedTarget) : null;
  const head = (s: string) => <Text style={{ color: t.text, fontWeight: '600', fontSize: 17, marginTop: space.lg, marginBottom: space.sm }}>{s}</Text>;
  const big = Math.max(d?.totals.incomePaise ?? 0, d?.totals.expensePaise ?? 0);

  return (
    <Screen>
      <H1>Reports</H1>
      <Chips value={preset} onChange={setPreset} options={[{ value: 'thisMonth', label: 'This month' }, { value: 'lastMonth', label: 'Last month' }, { value: 'last30', label: 'Last 30 days' }, { value: 'thisYear', label: 'This year' }, { value: 'custom', label: 'Custom' }]} />
      {preset === 'custom' && (<View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}><Field value={from} onChangeText={setFrom} placeholder="From" autoCapitalize="none" accessibilityLabel="From date" /></View>
        <View style={{ flex: 1 }}><Field value={to} onChangeText={setTo} placeholder="To" autoCapitalize="none" accessibilityLabel="To date" /></View></View>)}
      {err ? <Body style={{ color: t.expense, marginTop: 8 }}>{err}</Body> : null}
      {d && (<>
        {head('Income vs expenses')}
        <Card>
          <HBars items={[{ label: 'Income', valueText: m(d.totals.incomePaise), percent: percentOf(d.totals.incomePaise, big), color: t.income }, { label: 'Expenses', valueText: m(d.totals.expensePaise), percent: percentOf(d.totals.expensePaise, big), color: t.expense }]} />
          <Body style={{ marginTop: 4 }}>Net cash flow: {hide ? '₹ ••••' : formatPaise(d.totals.netPaise, { showSign: true })}</Body>
          <Body muted>Transfers, savings goals and Udhaar are not counted.</Body>
        </Card>

        {head(d.seriesKind === 'day' ? 'Daily expenses' : 'Monthly expenses')}
        <Card>
          {d.totals.expensePaise === 0 ? <Body muted>No expenses in this period.</Body> : (<>
            <VBars values={d.series.map((x) => x.total)} firstLabel={d.series[0].label.slice(d.seriesKind === 'day' ? 5 : 0)} lastLabel={d.series[d.series.length - 1].label.slice(d.seriesKind === 'day' ? 5 : 0)} color={t.expense}
              summary={`Expenses of ${m(d.totals.expensePaise)} over ${d.series.length} ${d.seriesKind === 'day' ? 'days' : 'months'}`} />
            <Body style={{ marginTop: 8 }}>Total {m(d.totals.expensePaise)} · average {m(Math.floor(d.totals.expensePaise / Math.max(1, d.seriesKind === 'day' ? d.days : d.series.length)))} per {d.seriesKind}</Body>
            {maxDay && maxDay.total > 0 ? <Body muted>Highest: {m(maxDay.total)} on {maxDay.label}</Body> : null}
          </>)}
        </Card>

        {head('Expenses by category')}
        <Card>{d.cats.items.length === 0 ? <Body muted>No expenses in this period.</Body> : <HBars items={d.cats.items.map((c) => ({ label: c.name, valueText: `${m(c.total)} · ${c.percent}%`, percent: c.percent }))} />}</Card>

        {head('Savings progress')}
        <Card>
          <Body>{m(d.saved)} saved{d.savedTarget > 0 ? ` of ${m(d.savedTarget)} target` : ''}</Body>
          {sp && d.savedTarget > 0 ? <ProgressBar percent={sp.percent} /> : <Body muted>No daily savings target for this period.</Body>}
        </Card>

        {head('Budget performance (this month)')}
        <Card>{d.budgets.length === 0 ? <Body muted>No budgets set.</Body> : <HBars items={d.budgets.map((b) => { const p = budgetProgress(b.limitPaise, b.spentPaise);
          return { label: b.categoryName ?? 'Overall', valueText: `${m(b.spentPaise)} of ${m(b.limitPaise)} · ${p.percentUsed}%`, percent: p.percentUsed, color: p.over ? t.expense : t.primary }; })} />}</Card>

        {head('Account balances')}
        <Card>{d.accounts.length === 0 ? <Body muted>No accounts.</Body> : d.accounts.map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}><Body>{a.name}</Body><Body>{m(a.balancePaise)}</Body></View>))}</Card>

        {head('Udhaar outstanding')}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Body>To receive</Body><Text style={{ color: t.income, fontWeight: '600' }}>{m(d.udhaar.toReceivePaise)}</Text></View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}><Body>To repay</Body><Text style={{ color: t.expense, fontWeight: '600' }}>{m(d.udhaar.toRepayPaise)}</Text></View>
        </Card>
        <View style={{ height: 20 }} /><Button title="Export reports" variant="ghost" onPress={() => router.push('/export')} />
      </>)}
    </Screen>
  );
}
