import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, Card, H1, ProgressBar, Screen } from '../../src/components/ui';
import { formatPaise } from '../../src/domain/money';
import { listAccounts } from '../../src/db/repositories/accounts';
import { listTransactions, periodTotals, TxnRow } from '../../src/db/repositories/transactions';
import { dayRange, monthRange } from '../../src/utils/dates';
import { useApp } from '../../src/hooks/useApp';
import { radius, space, useTheme } from '../../src/theme';
import { BudgetRow, listBudgets } from '../../src/db/repositories/budgets';
import { budgetProgress } from '../../src/domain/budgets';
import { TxnItem } from '../../src/components/TxnItem';

interface Data { total: number; today: { incomePaise: number; expensePaise: number; netPaise: number };
  month: { incomePaise: number; expensePaise: number; netPaise: number }; recent: TxnRow[]; budgets: BudgetRow[] }

export default function Home() {
  const { db, settings, updateSetting } = useApp();
  const t = useTheme(); const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      try {
        const d1 = dayRange(), m = monthRange();
        const [accs, today, month, recent, budgets] = await Promise.all([
          listAccounts(db), periodTotals(db, d1.from, d1.to), periodTotals(db, m.from, m.to), listTransactions(db, { limit: 5 }), listBudgets(db, m.from, m.to)]);
        if (live) { setD({ total: accs.reduce((s, a) => s + a.balancePaise, 0), today, month, recent, budgets }); setErr(null); }
      } catch (e) { if (live) setErr(e instanceof Error ? e.message : 'Could not load your data.'); }
    })();
    return () => { live = false; };
  }, [db]));

  const hide = settings.hideBalance;
  const money = (p: number) => (hide ? '₹ ••••' : formatPaise(p));
  const act = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: '30%', alignItems: 'center', paddingVertical: 12, backgroundColor: t.mint, borderRadius: radius.md }}>
      <Ionicons name={icon} size={22} color={t.primary} />
      <Text style={{ color: t.text, fontSize: 12, marginTop: 4 }}>{label}</Text>
    </Pressable>);

  return (
    <Screen>
      <H1>Home</H1>
      {err ? <Body>{err}</Body> : null}
      {d && (
        <>
          <Card style={{ backgroundColor: t.primary }}>
            <Text style={{ color: '#fff', opacity: 0.85 }}>Total balance</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>{money(d.total)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={hide ? 'Show balances' : 'Hide balances'}
                onPress={() => updateSetting('hideBalance', !hide)} hitSlop={12}>
                <Ionicons name={hide ? 'eye-off-outline' : 'eye-outline'} size={22} color="#fff" />
              </Pressable>
            </View>
          </Card>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Card style={{ flex: 1 }}><Body muted>Today income</Body><Text style={{ color: t.income, fontWeight: '600' }}>{money(d.today.incomePaise)}</Text></Card>
            <Card style={{ flex: 1 }}><Body muted>Today expenses</Body><Text style={{ color: t.expense, fontWeight: '600' }}>{money(d.today.expensePaise)}</Text></Card>
          </View>
          <Card style={{ marginTop: space.sm }}>
            <Body muted>Today's net cash flow</Body>
            <Text style={{ color: d.today.netPaise < 0 ? t.expense : t.text, fontWeight: '600', fontSize: 18 }}>{hide ? '₹ ••••' : formatPaise(d.today.netPaise, { showSign: true })}</Text>
          </Card>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Card style={{ flex: 1 }}><Body muted>This month in</Body><Text style={{ color: t.income, fontWeight: '600' }}>{money(d.month.incomePaise)}</Text></Card>
            <Card style={{ flex: 1 }}><Body muted>This month out</Body><Text style={{ color: t.expense, fontWeight: '600' }}>{money(d.month.expensePaise)}</Text></Card>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md, justifyContent: 'space-between' }}>
            {act('Add expense', 'remove-circle-outline', () => router.push('/transactions/add?type=expense'))}
            {act('Add income', 'add-circle-outline', () => router.push('/transactions/add?type=income'))}
            {act('Transfer', 'swap-horizontal-outline', () => router.push('/transactions/add?type=transfer'))}
            {act('Add savings', 'leaf-outline', () => router.push('/(tabs)/savings'))}
            {act('Budgets', 'pie-chart-outline', () => router.push('/budgets'))}
            {act('Add Udhaar', 'people-outline', () => router.push('/udhaar/add'))}
            {act('Reports', 'bar-chart-outline', () => router.push('/reports'))}
          </View>

          {d.budgets.length > 0 && (
            <Card style={{ marginTop: space.md }}>
              <Body>Budgets this month</Body>
              {d.budgets.map((b) => { const p = budgetProgress(b.limitPaise, b.spentPaise); return (
                <View key={b.id} style={{ marginTop: 8 }}>
                  <Body muted>{b.categoryName ?? 'Overall'}: {hide ? '••••' : `${formatPaise(b.spentPaise)} of ${formatPaise(b.limitPaise)}`} ({p.percentUsed}%)</Body>
                  <ProgressBar percent={p.percentUsed} over={p.over} />
                </View>); })}
            </Card>)}

          <Text style={{ color: t.text, fontWeight: '600', fontSize: 17, marginTop: space.lg, marginBottom: space.sm }}>Recent activity</Text>
          {d.recent.length === 0 ? (
            <Card>
              <Body>Nothing here yet. Add your first transaction to start your hisaab.</Body>
              <View style={{ height: 12 }} />
              <Button title="Add first transaction" onPress={() => router.push('/transactions/add?type=expense')} />
            </Card>
          ) : d.recent.map((r) => <TxnItem key={r.id} row={r} hide={hide} />)}
        </>
      )}
    </Screen>
  );
}
