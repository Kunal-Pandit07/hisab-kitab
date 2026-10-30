import React, { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Chips, Field, H1, Label, Screen } from '../../src/components/ui';
import { Account, listAccounts } from '../../src/db/repositories/accounts';
import { Category, getTransaction, listCategories, saveTransaction, TxnError } from '../../src/db/repositories/transactions';
import { parseRupeesToPaise } from '../../src/domain/money';
import type { TxnType } from '../../src/domain/transactions';
import { isValidDateKey } from '../../src/utils/dates';
import { runWithFeedback } from '../../src/feedback';
import { requestSync } from '../../src/notifications/requestSync';
import { useApp } from '../../src/hooks/useApp';

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function AddTransaction() {
  const { db } = useApp(); const router = useRouter();
  const params = useLocalSearchParams<{ type?: TxnType; id?: string }>();
  const [type, setType] = useState<TxnType>(params.type ?? 'expense');
  const [amount, setAmount] = useState(''); const [desc, setDesc] = useState(''); const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toDateInput(new Date()));
  const [accounts, setAccounts] = useState<Account[]>([]); const [cats, setCats] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null); const [toId, setToId] = useState<string | null>(null);
  const [catId, setCatId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false); // blocks double-taps before state updates

  useEffect(() => {
    (async () => {
      const [a, c] = await Promise.all([listAccounts(db), listCategories(db)]);
      setAccounts(a); setCats(c);
      if (params.id) {
        const t = await getTransaction(db, params.id);
        if (t) { setType(t.type); setAmount(String(t.amountPaise / 100)); setDesc(t.description); setNotes(t.notes ?? '');
          setDate(toDateInput(new Date(t.occurredAt))); setAccountId(t.accountId); setToId(t.toAccountId); setCatId(t.categoryId); }
      } else if (a[0]) setAccountId(a[0].id);
    })().catch((e) => setErrors([e instanceof Error ? e.message : 'Could not load form data.']));
  }, [db, params.id]);

  async function submit() {
    if (lock.current) return;
    const paise = parseRupeesToPaise(amount);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const when = m && isValidDateKey(date) ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), new Date().getHours(), new Date().getMinutes()) : null;
    if (paise === null || !when || Number.isNaN(when.getTime())) {
      setErrors([paise === null ? 'Enter a valid amount, like 250 or 99.50.' : 'Use the date format YYYY-MM-DD.']); return;
    }
    lock.current = true; setSaving(true); setErrors([]);
    try {
      const toAcc = accounts.find((a) => a.id === toId);
      const event = params.id ? null : type === 'income' ? 'income' : type === 'expense' ? 'expense' : toAcc?.type === 'savings' ? 'savings' : 'transfer';
      // Feedback fires only after the write has committed; a failed save throws before any sound.
      await runWithFeedback(() => saveTransaction(db, { type, amountPaise: paise, accountId, toAccountId: type === 'transfer' ? toId : null,
        categoryId: catId, occurredAt: when.toISOString(), description: desc, notes: notes || null }, params.id), event);
      requestSync();
      router.back();
    } catch (e) {
      setErrors(e instanceof TxnError ? e.errors : [e instanceof Error ? e.message : 'Could not save. Your entry is still here.']);
    } finally { lock.current = false; setSaving(false); }
  }

  const kindCats = cats.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));
  return (
    <Screen>
      <H1>{params.id ? 'Edit transaction' : 'New transaction'}</H1>
      <Chips value={type} onChange={(v) => { setType(v); setCatId(null); }}
        options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]} />
      <Label>Amount (₹)</Label>
      <Field keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={setAmount} accessibilityLabel="Amount in rupees" />
      <Label>{type === 'transfer' ? 'From account' : 'Account'}</Label>
      <Chips value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
      {type === 'transfer' && (<><Label>To account</Label>
        <Chips value={toId} onChange={setToId} options={accounts.filter((a) => a.id !== accountId).map((a) => ({ value: a.id, label: a.name }))} /></>)}
      {type !== 'transfer' && (<><Label>Category</Label>
        <Chips value={catId} onChange={setCatId} options={kindCats.map((c) => ({ value: c.id, label: c.name }))} /></>)}
      <Label>Date (YYYY-MM-DD)</Label>
      <Field value={date} onChangeText={setDate} autoCapitalize="none" />
      <Label>Description</Label>
      <Field value={desc} onChangeText={setDesc} placeholder="Optional" />
      <Label>Notes</Label>
      <Field value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
      {errors.map((e) => <Body key={e} style={{ color: '#D95757', marginTop: 8 }}>{e}</Body>)}
      <View style={{ height: 20 }} />
      <Button title={params.id ? 'Save changes' : 'Save'} loading={saving} onPress={submit} />
    </Screen>
  );
}
