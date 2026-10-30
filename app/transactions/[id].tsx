import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Card, H1, Screen } from '../../src/components/ui';
import { deleteTransaction, getTransaction, TxnRow } from '../../src/db/repositories/transactions';
import { formatPaise } from '../../src/domain/money';
import { dayLabel } from '../../src/utils/dates';
import { requestSync } from '../../src/notifications/requestSync';
import { useApp } from '../../src/hooks/useApp';

export default function TxnDetail() {
  const { db } = useApp(); const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<TxnRow | null | undefined>(undefined);
  useEffect(() => { getTransaction(db, id).then(setRow).catch(() => setRow(null)); }, [db, id]);

  function remove() {
    Alert.alert('Delete this transaction?', 'Balances and totals will update. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteTransaction(db, id); requestSync(); router.back(); }
        catch (e) { Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.'); } } }]);
  }
  if (row === undefined) return <Screen><Body muted>Loading…</Body></Screen>;
  if (row === null) return <Screen><H1>Not found</H1><Button title="Go back" onPress={() => router.back()} /></Screen>;
  return (
    <Screen>
      <H1>{row.description || row.categoryName || 'Transaction'}</H1>
      <Card>
        <Body>{row.type === 'transfer' ? 'Transfer' : row.type === 'income' ? 'Income' : 'Expense'}: {formatPaise(row.amountPaise)}</Body>
        <Body muted>{row.type === 'transfer' ? `${row.accountName} → ${row.toAccountName}` : row.accountName}</Body>
        {row.categoryName ? <Body muted>{row.categoryName}</Body> : null}
        <Body muted>{dayLabel(row.occurredAt)}</Body>
        {row.notes ? <Body muted>{row.notes}</Body> : null}
      </Card>
      <View style={{ height: 16 }} />
      <Button title="Edit" onPress={() => router.push(`/transactions/add?id=${row.id}`)} />
      <View style={{ height: 8 }} />
      <Button title="Delete" variant="danger" onPress={remove} />
    </Screen>
  );
}
