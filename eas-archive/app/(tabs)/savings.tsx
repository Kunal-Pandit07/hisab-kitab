import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Body, Button, Card, Field, H1, Label, ProgressBar, Screen } from '../../src/components/ui';
import { formatPaise, parseRupeesAllowZero } from '../../src/domain/money';
import { currentStreak, periodTarget, progress, targetForDate, TargetEntry, validateTarget, addDaysKey } from '../../src/domain/savings';
import { getTargetHistory, listNoSpendDays, savedByDay, setDailyTarget, setNoSpendDay } from '../../src/db/repositories/savings';
import { Goal, listGoals } from '../../src/db/repositories/goals';
import { dateKey, startOfMonth, addMonths } from '../../src/utils/dates';
import { useApp } from '../../src/hooks/useApp';
import { useTheme } from '../../src/theme';

const keyToISO = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };

export default function Savings() {
  const { db } = useApp(); const t = useTheme(); const router = useRouter();
  const today = dateKey(new Date());
  const [hist, setHist] = useState<TargetEntry[]>([]);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [noSpend, setNoSpend] = useState<string[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const now = new Date();
    const monthStart = dateKey(startOfMonth(now)), nextMonth = dateKey(addMonths(now, 1));
    const from = addDaysKey(monthStart < addDaysKey(today, -6) ? monthStart : addDaysKey(today, -6), 0);
    const [h, s, n, g] = await Promise.all([getTargetHistory(db), savedByDay(db, keyToISO(addDaysKey(from, -1)), keyToISO(addDaysKey(nextMonth, 1))),
      listNoSpendDays(db, monthStart, nextMonth), listGoals(db)]);
    setHist(h); setSaved(s); setNoSpend(n); setGoals(g);
  }, [db, today]);
  useFocusEffect(useCallback(() => { load().catch((e) => Alert.alert('Could not load', String(e))); }, [load]));

  const now = new Date();
  const monthStart = dateKey(startOfMonth(now)), nextMonth = dateKey(addMonths(now, 1));
  const weekStart = addDaysKey(today, -6);
  const sum = (from: string, to: string) => Object.entries(saved).filter(([d]) => d >= from && d < to).reduce((s, [, v]) => s + v, 0);
  const dayTarget = targetForDate(hist, today);
  const day = progress(saved[today] ?? 0, dayTarget);
  const week = progress(sum(weekStart, addDaysKey(today, 1)), periodTarget(hist, weekStart, addDaysKey(today, 1)));
  const monthSaved = sum(monthStart, nextMonth);
  const month = progress(monthSaved, periodTarget(hist, monthStart, nextMonth));
  const streak = currentStreak(saved, hist, today);
  const isNoSpend = noSpend.includes(today);

  async function saveTarget() {
    if (busy) return;
    const paise = parseRupeesAllowZero(target);
    const err = paise === null ? 'Enter a valid amount.' : validateTarget(paise);
    if (err || paise === null) return Alert.alert('Check the target', err ?? '');
    setBusy(true);
    try { await setDailyTarget(db, paise, today); setTarget(''); await load(); }
    catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  async function toggleNoSpend() {
    try { await setNoSpendDay(db, today, !isNoSpend); await load(); } catch (e) { Alert.alert('Could not save', String(e)); }
  }

  return (
    <Screen>
      <H1>Save</H1>
      <Card>
        <Body muted>Today</Body>
        <Text style={{ color: t.text, fontSize: 24, fontWeight: '700' }}>{formatPaise(Math.max(0, saved[today] ?? 0))}</Text>
        {dayTarget > 0 ? (<><ProgressBar percent={day.percent} /><Body muted>{day.met ? 'Target reached. Nice work.' : `${formatPaise(day.remainingPaise)} to go for today's ${formatPaise(dayTarget)} target`}</Body></>)
          : <Body muted>No daily target yet. Set one below, or skip it. Saving is optional.</Body>}
        <View style={{ height: 12 }} />
        <Button title="Add savings" onPress={() => router.push('/transactions/add?type=transfer')} />
      </Card>
      <Body muted style={{ marginTop: 6 }}>Savings are transfers into a Savings account, so your balances stay accurate and nothing is counted twice.</Body>

      {dayTarget > 0 && (
        <Card style={{ marginTop: 12 }}>
          <Body>Last 7 days</Body><ProgressBar percent={week.percent} /><Body muted>{formatPaise(Math.max(0, sum(weekStart, addDaysKey(today, 1))))} saved</Body>
          <View style={{ height: 10 }} />
          <Body>This month</Body><ProgressBar percent={month.percent} /><Body muted>{formatPaise(Math.max(0, monthSaved))} saved</Body>
          {streak > 0 ? <Body style={{ marginTop: 8 }}>{streak}-day streak</Body> : null}
        </Card>
      )}

      <Card style={{ marginTop: 12 }}>
        <Body>{isNoSpend ? 'You marked today as a no-spend day.' : 'Spent nothing today?'}</Body>
        <View style={{ height: 8 }} />
        <Button variant="ghost" title={isNoSpend ? 'Undo no-spend day' : 'Mark today as no-spend'} onPress={toggleNoSpend} />
        <Body muted style={{ marginTop: 6 }}>{noSpend.length} no-spend {noSpend.length === 1 ? 'day' : 'days'} this month. Only days you confirm are counted.</Body>
      </Card>

      <Label>Daily savings target (₹, 0 to turn off)</Label>
      <Field keyboardType="decimal-pad" placeholder={dayTarget ? String(dayTarget / 100) : '50'} value={target} onChangeText={setTarget} />
      <Body muted style={{ marginTop: 4 }}>Changes apply from today. Past days keep the target they had.</Body>
      <View style={{ height: 10 }} />
      <Button title="Save target" loading={busy} onPress={saveTarget} />

      <Text style={{ color: t.text, fontWeight: '600', fontSize: 17, marginTop: 24, marginBottom: 8 }}>Goals</Text>
      {goals.length === 0 ? <Body muted>No goals yet. Add one for a phone, laptop or emergency fund.</Body> : goals.map((g) => {
        const p = progress(g.allocatedPaise, g.targetPaise);
        return (
          <Card key={g.id} style={{ marginBottom: 8 }}>
            <Body>{g.name}{g.status === 'completed' ? ' · completed' : ''}</Body>
            <ProgressBar percent={p.percent} />
            <Body muted>{formatPaise(g.allocatedPaise)} of {formatPaise(g.targetPaise)}</Body>
            <View style={{ height: 8 }} /><Button variant="ghost" title="Open" onPress={() => router.push(`/goals/${g.id}`)} />
          </Card>);
      })}
      <View style={{ height: 8 }} />
      <Button variant="ghost" title="New goal" onPress={() => router.push('/goals')} />
    </Screen>
  );
}
