import React, { useCallback, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Body, Button, Chips, Field, H1, Screen } from '../../src/components/ui';
import { listTransactions, TxnRow } from '../../src/db/repositories/transactions';
import { TxnItem } from '../../src/components/TxnItem';
import { useApp } from '../../src/hooks/useApp';
import type { TxnType } from '../../src/domain/transactions';

const PAGE = 40;
export default function History() {
  const { db, settings } = useApp(); const router = useRouter();
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TxnType | 'all'>('all');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loading = useRef(false);

  const load = useCallback(async (reset: boolean, offset = 0) => {
    if (loading.current) return; loading.current = true;
    try {
      const page = await listTransactions(db, { search, type: type === 'all' ? undefined : type, limit: PAGE, offset });
      setRows((r) => (reset ? page : [...r, ...page])); setDone(page.length < PAGE); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load history.'); }
    finally { loading.current = false; }
  }, [db, search, type]);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  return (
    <Screen scroll={false}>
      <H1>History</H1>
      <Button title="Reports" variant="ghost" onPress={() => router.push('/reports')} />
      <View style={{ height: 8 }} />
      <Field placeholder="Search description or notes" value={search} onChangeText={setSearch} returnKeyType="search" accessibilityLabel="Search transactions" />
      <View style={{ height: 8 }} />
      <Chips value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }, { value: 'transfer', label: 'Transfers' }]} />
      {err ? <Body>{err}</Body> : null}
      <FlatList data={rows} keyExtractor={(r) => r.id} style={{ marginTop: 8 }}
        renderItem={({ item }) => <TxnItem row={item} hide={settings.hideBalance} />}
        onEndReached={() => { if (!done) load(false, rows.length); }} onEndReachedThreshold={0.4}
        ListEmptyComponent={<Body muted>{search || type !== 'all' ? 'No transactions match these filters.' : 'No transactions yet.'}</Body>} />
    </Screen>
  );
}
