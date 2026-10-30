import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Card, Chips, Field, H1, Label, ProgressBar, Screen } from '../../src/components/ui';
import { Account, listAccounts } from '../../src/db/repositories/accounts';
import { addRepayment, deleteRecord, deleteRepayment, getRecord, listRepayments, Repayment, UdhaarError, UdhaarRow } from '../../src/db/repositories/udhaar';
import { formatPaise, parseRupeesToPaise } from '../../src/domain/money';
import { isOverdue, outstandingPaise } from '../../src/domain/udhaar';
import { dateKey } from '../../src/utils/dates';
import { requestSync } from '../../src/notifications/requestSync';
import { useApp } from '../../src/hooks/useApp';
import { useTheme } from '../../src/theme';

export default function UdhaarDetail() {
  const { db } = useApp(); const router = useRouter(); const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [r, setR] = useState<UdhaarRow | null | undefined>(undefined); const [reps, setReps] = useState<Repayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]); const [accountId, setAccountId] = useState('none');
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(dateKey(new Date())); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rec = await getRecord(db, id); setR(rec); setReps(await listRepayments(db, id)); setAccounts(await listAccounts(db));
    if (rec?.accountId) setAccountId((cur) => (cur === 'none' ? rec.accountId! : cur));
  }, [db, id]);
  useFocusEffect(useCallback(() => { load().catch(() => setR(null)); }, [load]));

  async function repay(paise: number | null, when = date) {
    if (busy) return;
    if (paise === null) return Alert.alert('Check the amount', 'Enter an amount greater than zero.');
    setBusy(true);
    try { const res = await addRepayment(db, id, paise, when, note, accountId === 'none' ? null : accountId); setAmount(''); setNote(''); await load(); requestSync();
      if (res.settled) Alert.alert('Settled', 'This Udhaar is fully settled.'); }
    catch (e) { Alert.alert('Could not record', e instanceof UdhaarError ? e.errors.join(' ') : e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  const confirm = (title: string, msg: string, ok: string, fn: () => Promise<void>) =>
    Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: ok, style: 'destructive', onPress: () => fn().catch((e) => Alert.alert('Failed', String(e))) }]);

  if (r === undefined) return <Screen><Body muted>Loading…</Body></Screen>;
  if (r === null) return <Screen><H1>Not found</H1><Button title="Go back" onPress={() => router.back()} /></Screen>;
  const out = outstandingPaise(r.principalPaise, r.repaidPaise); const od = isOverdue(r.dueOn, out, dateKey(new Date()));
  return (
    <Screen>
      <H1>{r.personName}</H1>
      <Card>
        <Body muted>{r.kind === 'lent' ? 'You lent' : 'You borrowed'} {formatPaise(r.principalPaise)} on {r.occurredOn}</Body>
        <Text style={{ color: t.text, fontSize: 24, fontWeight: '700', marginTop: 4 }}>{out === 0 ? 'Settled' : `${formatPaise(out)} outstanding`}</Text>
        <ProgressBar percent={Math.floor((r.repaidPaise * 100) / r.principalPaise)} />
        <Body muted>{formatPaise(r.repaidPaise)} repaid</Body>
        {r.dueOn ? <Text style={{ color: od ? t.expense : t.text2, marginTop: 4 }}>{od ? 'Overdue · ' : ''}Due {r.dueOn}</Text> : null}
        {r.description ? <Body muted style={{ marginTop: 4 }}>{r.description}</Body> : null}
        {r.contact ? <Body muted>{r.contact}</Body> : null}
      </Card>
      {out > 0 && (<>
        <Label>{r.kind === 'lent' ? 'Repayment received (₹)' : 'Repayment made (₹)'}</Label>
        <Field keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
        <Label>Date (YYYY-MM-DD)</Label><Field value={date} onChangeText={setDate} autoCapitalize="none" />
        <Label>Note (optional)</Label><Field value={note} onChangeText={setNote} />
        <Label>Account (optional)</Label>
        <Chips value={accountId} onChange={setAccountId} options={[{ value: 'none', label: 'Not linked' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
        <View style={{ height: 12 }} />
        <Button title="Record repayment" loading={busy} onPress={() => repay(parseRupeesToPaise(amount))} />
        <View style={{ height: 8 }} />
        <Button variant="ghost" title="Settle in full" disabled={busy} onPress={() => confirm('Settle in full?', `Record ${formatPaise(out)} as repaid today.`, 'Settle', () => repay(out, dateKey(new Date())))} />
      </>)}
      <Text style={{ color: t.text, fontWeight: '600', fontSize: 17, marginTop: 24, marginBottom: 8 }}>Repayments</Text>
      {reps.length === 0 ? <Body muted>No repayments yet.</Body> : reps.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.divider }}>
          <View style={{ flex: 1 }}><Body>{formatPaise(p.amountPaise)}</Body><Body muted>{p.paidOn}{p.note ? ` · ${p.note}` : ''}</Body></View>
          <Button variant="ghost" title="Remove" onPress={() => confirm('Remove this repayment?', 'The outstanding amount goes back up.', 'Remove', async () => { await deleteRepayment(db, p.id); await load(); requestSync(); })} />
        </View>))}
      <View style={{ height: 20 }} />
      <Button variant="ghost" title="Edit" onPress={() => router.push(`/udhaar/add?id=${r.id}`)} />
      <View style={{ height: 8 }} />
      <Button variant="danger" title="Delete record" onPress={() => confirm('Delete this record?', 'Its repayments are deleted too. Linked account balances are restored. This cannot be undone.', 'Delete', async () => { await deleteRecord(db, r.id); requestSync(); router.back(); })} />
    </Screen>
  );
}
