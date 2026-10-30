import React, { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Chips, Field, H1, Label, Screen } from '../../src/components/ui';
import { Account, listAccounts } from '../../src/db/repositories/accounts';
import { createRecord, getRecord, UdhaarError, updateRecord } from '../../src/db/repositories/udhaar';
import { parseRupeesToPaise } from '../../src/domain/money';
import type { UdhaarKind } from '../../src/domain/udhaar';
import { dateKey } from '../../src/utils/dates';
import { requestSync } from '../../src/notifications/requestSync';
import { useApp } from '../../src/hooks/useApp';

export default function AddUdhaar() {
  const { db } = useApp(); const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [kind, setKind] = useState<UdhaarKind>('lent');
  const [name, setName] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(dateKey(new Date()));
  const [due, setDue] = useState(''); const [desc, setDesc] = useState(''); const [contact, setContact] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]); const [accountId, setAccountId] = useState<string>('none');
  const [errors, setErrors] = useState<string[]>([]); const [saving, setSaving] = useState(false); const lock = useRef(false);

  useEffect(() => {
    (async () => {
      setAccounts(await listAccounts(db));
      if (id) { const r = await getRecord(db, id); if (r) { setKind(r.kind); setName(r.personName); setAmount(String(r.principalPaise / 100)); setDate(r.occurredOn);
        setDue(r.dueOn ?? ''); setDesc(r.description); setContact(r.contact ?? ''); setAccountId(r.accountId ?? 'none'); } }
    })().catch((e) => setErrors([String(e)]));
  }, [db, id]);

  async function submit() {
    if (lock.current) return;
    const paise = parseRupeesToPaise(amount);
    if (paise === null) { setErrors(['Enter a valid amount, like 500 or 250.50.']); return; }
    lock.current = true; setSaving(true); setErrors([]);
    try {
      const base = { personName: name, principalPaise: paise, occurredOn: date, dueOn: due.trim() || null, description: desc, contact: contact || null };
      if (id) await updateRecord(db, id, base);
      else await createRecord(db, { ...base, kind, accountId: accountId === 'none' ? null : accountId });
      requestSync();
      router.back();
    } catch (e) { setErrors(e instanceof UdhaarError ? e.errors : [e instanceof Error ? e.message : 'Could not save. Your entry is still here.']); }
    finally { lock.current = false; setSaving(false); }
  }
  return (
    <Screen>
      <H1>{id ? 'Edit Udhaar' : 'Add Udhaar'}</H1>
      {!id && <Chips value={kind} onChange={setKind} options={[{ value: 'lent', label: 'I lent' }, { value: 'borrowed', label: 'I borrowed' }]} />}
      <Label>Person's name</Label><Field value={name} onChangeText={setName} placeholder="Name" />
      <Label>Amount (₹)</Label><Field keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
      <Label>Date (YYYY-MM-DD)</Label><Field value={date} onChangeText={setDate} autoCapitalize="none" />
      <Label>Due date (optional, YYYY-MM-DD)</Label><Field value={due} onChangeText={setDue} autoCapitalize="none" />
      <Label>Description (optional)</Label><Field value={desc} onChangeText={setDesc} />
      <Label>Contact (optional, typed by you)</Label><Field value={contact} onChangeText={setContact} />
      {!id && (<><Label>Account the money moved through (optional)</Label>
        <Chips value={accountId} onChange={setAccountId} options={[{ value: 'none', label: 'Not linked' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
        <Body muted style={{ marginTop: 6 }}>If linked, that account's balance goes down when you lend and up when you borrow. Choose Not linked to leave balances alone.</Body></>)}
      {errors.map((e) => <Body key={e} style={{ color: '#D95757', marginTop: 8 }}>{e}</Body>)}
      <View style={{ height: 20 }} /><Button title={id ? 'Save changes' : 'Save'} loading={saving} onPress={submit} />
    </Screen>
  );
}
