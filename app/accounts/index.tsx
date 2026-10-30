import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Button, Card, Chips, Field, H1, Label, Screen } from '../../src/components/ui';
import { Account, AccountType, createAccount, listAccounts, setArchived } from '../../src/db/repositories/accounts';
import { formatPaise, parseRupeesAllowZero } from '../../src/domain/money';
import { useApp } from '../../src/hooks/useApp';

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }, { value: 'upi', label: 'UPI' }, { value: 'savings', label: 'Savings' }, { value: 'custom', label: 'Other' }];

export default function Accounts() {
  const { db } = useApp();
  const [accs, setAccs] = useState<Account[]>([]);
  const [name, setName] = useState(''); const [type, setType] = useState<AccountType>('bank'); const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setAccs(await listAccounts(db, true)), [db]);
  useFocusEffect(useCallback(() => { load().catch((e) => Alert.alert('Error', String(e))); }, [load]));

  async function add() {
    if (busy) return;
    const paise = parseRupeesAllowZero(open);
    if (!name.trim()) return Alert.alert('Name needed', 'Give the account a name.');
    if (paise === null) return Alert.alert('Check the amount', 'Enter a valid opening balance or leave it empty.');
    setBusy(true);
    try { await createAccount(db, { name, type, openingBalancePaise: paise }); setName(''); setOpen(''); await load(); }
    catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  function toggle(a: Account) {
    Alert.alert(a.archived ? 'Restore account?' : 'Archive account?',
      a.archived ? `${a.name} will appear in account pickers again.` : `${a.name} stays in your history but is hidden from new entries.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: a.archived ? 'Restore' : 'Archive', onPress: async () => { await setArchived(db, a.id, !a.archived); await load(); } }]);
  }
  return (
    <Screen>
      <H1>Accounts</H1>
      {accs.map((a) => (
        <Card key={a.id} style={{ marginBottom: 8 }}>
          <Body>{a.name}{a.archived ? ' (archived)' : ''}</Body>
          <Body muted>{formatPaise(a.balancePaise)}</Body>
          <View style={{ height: 8 }} />
          <Button variant="ghost" title={a.archived ? 'Restore' : 'Archive'} onPress={() => toggle(a)} />
        </Card>))}
      <Label>New account</Label>
      <Field placeholder="Name (e.g. HDFC, Wallet)" value={name} onChangeText={setName} />
      <View style={{ height: 8 }} />
      <Chips options={TYPES} value={type} onChange={setType} />
      <Label>Opening balance (₹, optional)</Label>
      <Field keyboardType="decimal-pad" placeholder="0" value={open} onChangeText={setOpen} />
      <View style={{ height: 16 }} />
      <Button title="Add account" loading={busy} onPress={add} />
    </Screen>
  );
}
