import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Body, Button, Card, Chips, H1, ProgressBar, Screen } from '../../src/components/ui';
import { listRecords, UdhaarRow } from '../../src/db/repositories/udhaar';
import { formatPaise } from '../../src/domain/money';
import { daysUntilDue, isOverdue, outstandingPaise, summarize } from '../../src/domain/udhaar';
import { dateKey } from '../../src/utils/dates';
import { useApp } from '../../src/hooks/useApp';
import { space, useTheme } from '../../src/theme';

type Filter = 'open' | 'lent' | 'borrowed' | 'overdue' | 'all';

export default function Udhaar() {
  const { db, settings } = useApp(); const t = useTheme(); const router = useRouter();
  const [rows, setRows] = useState<UdhaarRow[]>([]); const [filter, setFilter] = useState<Filter>('open');
  const today = dateKey(new Date());
  useFocusEffect(useCallback(() => { listRecords(db).then(setRows).catch((e) => Alert.alert('Could not load', String(e))); }, [db]));

  const m = (p: number) => (settings.hideBalance ? '₹ ••••' : formatPaise(p));
  const s = summarize(rows);
  const out = (r: UdhaarRow) => outstandingPaise(r.principalPaise, r.repaidPaise);
  const shown = rows.filter((r) => filter === 'all' || (filter === 'open' && out(r) > 0) || (filter === 'overdue' && isOverdue(r.dueOn, out(r), today)) || r.kind === filter);

  const tile = (label: string, v: number, color?: string) => (
    <Card style={{ flex: 1 }}><Body muted>{label}</Body><Text style={{ color: color ?? t.text, fontWeight: '600', fontSize: 16 }}>{m(v)}</Text></Card>);
  return (
    <Screen>
      <H1>Udhaar</H1>
      <View style={{ flexDirection: 'row', gap: space.sm }}>{tile('To receive', s.toReceivePaise, t.income)}{tile('To repay', s.toRepayPaise, t.expense)}</View>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>{tile('Total lent', s.lentPaise)}{tile('Total borrowed', s.borrowedPaise)}</View>
      <Body muted style={{ marginTop: 8 }}>Udhaar is tracked separately. It is never counted as your income or expenses.</Body>
      <View style={{ height: 12 }} /><Button title="Add Udhaar" onPress={() => router.push('/udhaar/add')} />
      <View style={{ height: 12 }} />
      <Chips value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'lent', label: 'Lent' }, { value: 'borrowed', label: 'Borrowed' }, { value: 'all', label: 'All' }]} />
      <View style={{ height: 12 }} />
      {shown.length === 0 ? <Body muted>{rows.length === 0 ? 'No Udhaar yet. Add money you lent or borrowed to keep track.' : 'Nothing matches this filter.'}</Body> : shown.map((r) => {
        const o = out(r); const od = isOverdue(r.dueOn, o, today);
        const due = r.dueOn && o > 0 ? (od ? `Overdue by ${-daysUntilDue(r.dueOn, today)} day(s)` : `Due in ${daysUntilDue(r.dueOn, today)} day(s)`) : null;
        return (
          <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${r.personName}, ${r.kind}, ${formatPaise(o)} outstanding`} onPress={() => router.push(`/udhaar/${r.id}`)}>
            <Card style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body>{r.personName}</Body>
                <Text style={{ color: r.kind === 'lent' ? t.income : t.expense, fontWeight: '600' }}>{o === 0 ? 'Settled' : m(o)}</Text>
              </View>
              <Body muted>{r.kind === 'lent' ? 'You lent' : 'You borrowed'} {m(r.principalPaise)}{r.description ? ` · ${r.description}` : ''}</Body>
              <ProgressBar percent={Math.floor((r.repaidPaise * 100) / r.principalPaise)} />
              {due ? <Text style={{ color: od ? t.expense : t.text2, fontSize: 13 }}>{due}</Text> : null}
            </Card>
          </Pressable>);
      })}
    </Screen>
  );
}
