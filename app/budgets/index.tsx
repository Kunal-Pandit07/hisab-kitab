import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Button, Card, Chips, Field, H1, Label, ProgressBar, Screen } from '../../src/components/ui';
import { BudgetRow, deleteBudget, listBudgets, saveBudget } from '../../src/db/repositories/budgets';
import { Category, listCategories } from '../../src/db/repositories/transactions';
import { budgetProgress } from '../../src/domain/budgets';
import { formatPaise, parseRupeesToPaise } from '../../src/domain/money';
import { monthRange } from '../../src/utils/dates';
import { requestSync } from '../../src/notifications/requestSync';
import { useApp } from '../../src/hooks/useApp';

export default function Budgets() {
  const { db } = useApp();
  const [rows, setRows] = useState<BudgetRow[]>([]); const [cats, setCats] = useState<Category[]>([]);
  const [scope, setScope] = useState<string>('overall'); const [amount, setAmount] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const m = monthRange(); setRows(await listBudgets(db, m.from, m.to)); setCats(await listCategories(db, 'expense')); }, [db]);
  useFocusEffect(useCallback(() => { load().catch((e) => Alert.alert('Could not load', String(e))); }, [load]));

  async function save() {
    if (busy) return;
    const paise = parseRupeesToPaise(amount);
    if (paise === null) return Alert.alert('Check the amount', 'Enter a budget greater than zero.');
    setBusy(true);
    try { await saveBudget(db, { categoryId: scope === 'overall' ? null : scope, limitPaise: paise }); setAmount(''); await load(); requestSync(); }
    catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  function remove(b: BudgetRow) {
    Alert.alert('Delete budget?', `${b.categoryName ?? 'Overall'} budget will be removed. Your transactions are not affected.`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteBudget(db, b.id); await load(); requestSync(); } }]);
  }
  return (
    <Screen>
      <H1>Budgets</H1>
      <Body muted>Monthly limits. Only expenses count; transfers and savings never do. You can always record an expense, even over budget.</Body>
      <View style={{ height: 12 }} />
      {rows.length === 0 ? <Body muted>No budgets yet.</Body> : rows.map((b) => {
        const p = budgetProgress(b.limitPaise, b.spentPaise);
        return (
          <Card key={b.id} style={{ marginBottom: 8 }}>
            <Body>{b.categoryName ?? 'Overall'}</Body>
            <ProgressBar percent={p.percentUsed} over={p.over} />
            <Body muted>{formatPaise(b.spentPaise)} of {formatPaise(b.limitPaise)} · {p.percentUsed}% used</Body>
            <Body muted>{p.over ? `${formatPaise(-p.remainingPaise)} over` : `${formatPaise(p.remainingPaise)} left`}</Body>
            <View style={{ height: 8 }} /><Button variant="ghost" title="Delete" onPress={() => remove(b)} />
          </Card>);
      })}
      <Label>Set a budget</Label>
      <Chips value={scope} onChange={setScope} options={[{ value: 'overall', label: 'Overall' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
      <Label>Monthly limit (₹)</Label>
      <Field keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="5000" />
      <Body muted style={{ marginTop: 4 }}>Saving again for the same scope updates it.</Body>
      <View style={{ height: 10 }} /><Button title="Save budget" loading={busy} onPress={save} />
    </Screen>
  );
}
