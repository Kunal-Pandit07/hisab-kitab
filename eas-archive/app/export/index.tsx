import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Body, Button, Chips, Field, H1, Label, Screen } from '../../src/components/ui';
import { buildDataset, DatasetKind, datasetCsv } from '../../src/exports/builders';
import { buildReportHtml } from '../../src/domain/reportHtml';
import { addDaysKey } from '../../src/domain/savings';
import { presetRange, Preset } from '../../src/domain/reports';
import { sharePdf, shareTextFile } from '../../src/exports/files';
import { dateKey } from '../../src/utils/dates';
import { isValidDateKey } from '../../src/utils/dates';
import { useApp } from '../../src/hooks/useApp';

export default function Export() {
  const { db } = useApp(); const today = dateKey(new Date());
  const [kind, setKind] = useState<DatasetKind>('transactions'); const [fmt, setFmt] = useState<'csv' | 'pdf'>('csv');
  const [preset, setPreset] = useState<Preset | 'custom'>('thisMonth');
  const [from, setFrom] = useState(presetRange('thisMonth', today).from); const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    let range = preset === 'custom' ? { from, toExclusive: isValidDateKey(to) ? addDaysKey(to, 1) : '' } : presetRange(preset, today);
    if (preset === 'custom' && (!isValidDateKey(from) || !isValidDateKey(to) || from > to)) return Alert.alert('Check the dates', 'Use YYYY-MM-DD, with the start on or before the end.');
    setBusy(true);
    try {
      const d = await buildDataset(db, kind, range);
      if (fmt === 'csv') await shareTextFile(`${d.fileBase}.csv`, datasetCsv(d), 'text/csv', 'Export CSV');
      else await sharePdf(buildReportHtml(d.doc, new Date().toLocaleString('en-IN')), 'Export PDF');
    } catch (e) { Alert.alert('Could not export', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  return (
    <Screen>
      <H1>Export</H1>
      <Label>What to export</Label>
      <Chips value={kind} onChange={setKind} options={[{ value: 'transactions', label: 'Transactions' }, { value: 'summary', label: 'Income & expense summary' }, { value: 'savings', label: 'Savings' }, { value: 'udhaar', label: 'Udhaar' }]} />
      <Label>Period</Label>
      <Chips value={preset} onChange={setPreset} options={[{ value: 'thisMonth', label: 'This month' }, { value: 'lastMonth', label: 'Last month' }, { value: 'last30', label: 'Last 30 days' }, { value: 'thisYear', label: 'This year' }, { value: 'custom', label: 'Custom' }]} />
      {preset === 'custom' && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Field value={from} onChangeText={setFrom} placeholder="From YYYY-MM-DD" autoCapitalize="none" accessibilityLabel="From date" /></View>
          <View style={{ flex: 1 }}><Field value={to} onChangeText={setTo} placeholder="To YYYY-MM-DD" autoCapitalize="none" accessibilityLabel="To date" /></View>
        </View>)}
      <Label>Format</Label>
      <Chips value={fmt} onChange={setFmt} options={[{ value: 'csv', label: 'CSV (spreadsheet)' }, { value: 'pdf', label: 'PDF' }]} />
      <View style={{ height: 20 }} /><Button title="Export" loading={busy} onPress={run} />
      <Body muted style={{ marginTop: 10 }}>The file is created on your phone and the share sheet lets you choose where it goes. Once shared, it leaves this app.</Body>
    </Screen>
  );
}
