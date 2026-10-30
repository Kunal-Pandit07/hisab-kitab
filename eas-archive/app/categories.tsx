import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Button, Card, Chips, Field, H1, Label, Screen } from '../src/components/ui';
import { createCategory } from '../src/db/repositories/categories';
import { Category, listCategories } from '../src/db/repositories/transactions';
import { useApp } from '../src/hooks/useApp';

export default function Categories() {
  const { db } = useApp();
  const [cats, setCats] = useState<Category[]>([]); const [name, setName] = useState(''); const [kind, setKind] = useState<'income' | 'expense'>('expense'); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setCats(await listCategories(db)), [db]);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));
  async function add() {
    if (busy) return; setBusy(true);
    try { await createCategory(db, name, kind); setName(''); await load(); }
    catch (e) { Alert.alert('Could not add', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  return (
    <Screen>
      <H1>Categories</H1>
      <Label>New category</Label>
      <Chips value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
      <Field style={{ marginTop: 8 }} value={name} onChangeText={setName} placeholder="e.g. Pets" accessibilityLabel="Category name" />
      <Button title="Add category" loading={busy} onPress={add} />
      {(['expense', 'income'] as const).map((k) => (
        <Card key={k} style={{ marginTop: 16 }}>
          <Body>{k === 'expense' ? 'Expense categories' : 'Income categories'}</Body>
          <Body muted>{cats.filter((c) => c.kind === k).map((c) => c.name).join(' · ')}</Body>
        </Card>))}
    </Screen>
  );
}
