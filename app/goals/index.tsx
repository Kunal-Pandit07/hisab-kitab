import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Field, H1, Label, Screen } from '../../src/components/ui';
import { createGoal } from '../../src/db/repositories/goals';
import { parseRupeesToPaise } from '../../src/domain/money';
import { requestSync } from '../../src/notifications/requestSync';
import { useApp } from '../../src/hooks/useApp';

export default function NewGoal() {
  const { db } = useApp(); const router = useRouter();
  const [name, setName] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(''); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    const paise = parseRupeesToPaise(amount);
    if (!name.trim()) return Alert.alert('Name needed', 'Give your goal a name.');
    if (paise === null) return Alert.alert('Check the amount', 'Enter a target greater than zero.');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Alert.alert('Check the date', 'Use YYYY-MM-DD or leave it empty.');
    setBusy(true);
    try { const id = await createGoal(db, { name, targetPaise: paise, targetDate: date || null, notes: notes || null }); requestSync(); router.replace(`/goals/${id}`); }
    catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.'); setBusy(false); }
  }
  return (
    <Screen>
      <H1>New goal</H1>
      <Label>Name</Label><Field value={name} onChangeText={setName} placeholder="New phone" />
      <Label>Target amount (₹)</Label><Field keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="15000" />
      <Label>Target date (optional, YYYY-MM-DD)</Label><Field value={date} onChangeText={setDate} autoCapitalize="none" />
      <Label>Notes (optional)</Label><Field value={notes} onChangeText={setNotes} multiline />
      <Body muted style={{ marginTop: 8 }}>Adding money to a goal only labels money you already have. It doesn't change your account balances.</Body>
      <Button title="Create goal" loading={busy} onPress={save} />
    </Screen>
  );
}
