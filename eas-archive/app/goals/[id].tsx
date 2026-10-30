import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Card, Field, H1, Label, ProgressBar, Screen } from '../../src/components/ui';
import { addContribution, archiveGoal, Contribution, deleteGoal, getGoal, Goal, listContributions } from '../../src/db/repositories/goals';
import { formatPaise, parseRupeesToPaise } from '../../src/domain/money';
import { progress } from '../../src/domain/savings';
import { dayLabel } from '../../src/utils/dates';
import { runWithFeedback } from '../../src/feedback';
import { requestSync } from '../../src/notifications/requestSync';
import { useApp } from '../../src/hooks/useApp';
import { useTheme } from '../../src/theme';

export default function GoalDetail() {
  const { db } = useApp(); const router = useRouter(); const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [items, setItems] = useState<Contribution[]>([]);
  const [amount, setAmount] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setGoal(await getGoal(db, id)); setItems(await listContributions(db, id)); }, [db, id]);
  useFocusEffect(useCallback(() => { load().catch(() => setGoal(null)); }, [load]));

  async function change(sign: 1 | -1) {
    if (busy) return;
    const paise = parseRupeesToPaise(amount);
    if (paise === null) return Alert.alert('Check the amount', 'Enter an amount greater than zero.');
    setBusy(true);
    try {
      const r = await runWithFeedback(() => addContribution(db, id, sign * paise), (res) => (sign === 1 ? (res.justCompleted ? 'goal' : 'savings') : null));
      setAmount(''); await load(); requestSync();
      if (r.justCompleted) Alert.alert('Goal reached', 'You have set aside the full amount. Well done.');
    } catch (e) { Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  function remove() {
    Alert.alert('Delete this goal?', 'Its history is deleted too. Your account balances are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteGoal(db, id); requestSync(); router.back(); } catch (e) { Alert.alert('Could not delete', String(e)); } } }]);
  }
  if (goal === undefined) return <Screen><Body muted>Loading…</Body></Screen>;
  if (goal === null) return <Screen><H1>Goal not found</H1><Button title="Go back" onPress={() => router.back()} /></Screen>;
  const p = progress(goal.allocatedPaise, goal.targetPaise);
  return (
    <Screen>
      <H1>{goal.name}</H1>
      <Card>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '700' }}>{formatPaise(goal.allocatedPaise)}</Text>
        <ProgressBar percent={p.percent} />
        <Body muted>{p.percent}% of {formatPaise(goal.targetPaise)}{goal.targetDate ? ` · by ${dayLabel(new Date(goal.targetDate).toISOString())}` : ''}</Body>
        {goal.status === 'completed' ? <Body style={{ marginTop: 6 }}>Completed</Body> : null}
        {goal.notes ? <Body muted style={{ marginTop: 6 }}>{goal.notes}</Body> : null}
      </Card>
      <Label>Amount (₹)</Label>
      <Field keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="500" />
      <View style={{ height: 10 }} /><Button title="Add to goal" loading={busy} onPress={() => change(1)} />
      <View style={{ height: 8 }} /><Button variant="ghost" title="Remove from goal" disabled={busy} onPress={() => change(-1)} />
      <Text style={{ color: t.text, fontWeight: '600', fontSize: 17, marginTop: 24, marginBottom: 8 }}>History</Text>
      {items.length === 0 ? <Body muted>No contributions yet.</Body> : items.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.divider }}>
          <Body muted>{dayLabel(c.occurredAt)}</Body><Body>{formatPaise(c.amountPaise, { showSign: true })}</Body>
        </View>))}
      <View style={{ height: 20 }} />
      <Button variant="ghost" title="Archive goal" onPress={async () => { await archiveGoal(db, id); requestSync(); router.back(); }} />
      <View style={{ height: 8 }} /><Button variant="danger" title="Delete goal" onPress={remove} />
    </Screen>
  );
}
