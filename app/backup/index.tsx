import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { Body, Button, Card, Field, H1, Label, Screen } from '../../src/components/ui';
import { BackupError, decryptBackup, encryptBackup, MIN_BACKUP_PASSWORD } from '../../src/domain/backup';
import { BackupPayload, BackupSummary, validatePayload } from '../../src/domain/backupSchema';
import { LATEST_SCHEMA_VERSION } from '../../src/db/migrations';
import { exportAll, restoreAll } from '../../src/db/repositories/backup';
import { readTextFile, shareTextFile } from '../../src/exports/files';
import { fireFeedback } from '../../src/feedback';
import { requestSync } from '../../src/notifications/requestSync';
import { dayLabel } from '../../src/utils/dates';
import { useApp } from '../../src/hooks/useApp';

const stamp = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const LABELS: Record<string, string> = { accounts: 'Accounts', transactions: 'Transactions', categories: 'Categories', budgets: 'Budgets', goals: 'Goals', goal_contributions: 'Goal contributions', udhaar_records: 'Udhaar records', udhaar_repayments: 'Udhaar repayments' };

export default function Backup() {
  const { db, reloadSettings } = useApp(); const router = useRouter();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [rpw, setRpw] = useState(''); const [problems, setProblems] = useState<string[]>([]);
  const [ready, setReady] = useState<{ payload: BackupPayload; summary: BackupSummary } | null>(null);

  async function create() {
    if (busy) return;
    if (pw.length < MIN_BACKUP_PASSWORD) return Alert.alert('Password too short', `Use at least ${MIN_BACKUP_PASSWORD} characters.`);
    if (pw !== pw2) return Alert.alert('Passwords do not match', 'Enter the same password twice.');
    setBusy('Encrypting your backup…');
    try {
      const payload = await exportAll(db, Constants.expoConfig?.version ?? '1.0.0');
      const text = await encryptBackup(payload, pw, { randomBytes: getRandomBytes });
      await shareTextFile(`HisabKitab-backup-${stamp()}.hkbackup`, text, 'application/octet-stream', 'Save your Hisab Kitab backup');
      fireFeedback('backup'); setPw(''); setPw2('');
      Alert.alert('Backup file created', 'The share sheet was opened so you can save the file. Make sure you actually saved it somewhere safe, such as Drive or your computer. Without the password it cannot be opened.');
    } catch (e) { Alert.alert('Could not create the backup', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(null); }
  }
  async function pick() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0]; setFile({ name: a.name, text: await readTextFile(a.uri) }); setReady(null); setProblems([]); setRpw('');
    } catch (e) { Alert.alert('Could not open the file', e instanceof Error ? e.message : 'Try again.'); }
  }
  async function check() {
    if (!file || busy) return; setBusy('Checking the backup…'); setProblems([]); setReady(null);
    try {
      const v = validatePayload(await decryptBackup(file.text, rpw), LATEST_SCHEMA_VERSION);
      if (v.ok) setReady({ payload: v.payload, summary: v.summary }); else setProblems(v.errors);
    } catch (e) { setProblems([e instanceof BackupError ? e.message : 'The backup could not be read.']); }
    finally { setBusy(null); }
  }
  function confirmRestore() {
    if (!ready || busy) return;
    Alert.alert('Replace everything?', 'This replaces all data currently in the app with the backup. This cannot be undone. Your PIN is not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: async () => {
        setBusy('Restoring…');
        try { await restoreAll(db, ready.payload); await reloadSettings(); requestSync(); fireFeedback('restore'); setReady(null); setFile(null); setRpw('');
          Alert.alert('Restore complete', 'Your data has been restored.', [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]); }
        catch (e) { Alert.alert('Restore failed', `${e instanceof Error ? e.message : 'Something went wrong.'} Your existing data was not changed.`); }
        finally { setBusy(null); } } }]);
  }

  return (
    <Screen>
      <H1>Backup and restore</H1>
      <Body muted>Backups are encrypted on this phone with your password and are never uploaded anywhere.</Body>
      <Label>Create a backup</Label>
      <Field value={pw} onChangeText={setPw} placeholder={`Backup password (${MIN_BACKUP_PASSWORD}+ characters)`} secureTextEntry autoCapitalize="none" accessibilityLabel="Backup password" />
      <View style={{ height: 8 }} />
      <Field value={pw2} onChangeText={setPw2} placeholder="Confirm password" secureTextEntry autoCapitalize="none" accessibilityLabel="Confirm backup password" />
      <Card style={{ marginTop: 10 }}><Body>If you lose this password, the backup cannot be recovered by anyone, including us. Your PIN is not included in backups.</Body></Card>
      <View style={{ height: 12 }} /><Button title="Create encrypted backup" loading={busy !== null && busy.startsWith('Encrypting')} disabled={busy !== null} onPress={create} />

      <Label>Restore from a backup</Label>
      <Button variant="ghost" title={file ? `Selected: ${file.name}` : 'Choose backup file'} disabled={busy !== null} onPress={pick} />
      {file && (<>
        <View style={{ height: 8 }} />
        <Field value={rpw} onChangeText={setRpw} placeholder="Backup password" secureTextEntry autoCapitalize="none" accessibilityLabel="Password for this backup" />
        <View style={{ height: 8 }} /><Button title="Check backup" disabled={busy !== null || !rpw} onPress={check} />
      </>)}
      {problems.map((p) => <Body key={p} style={{ color: '#D95757', marginTop: 8 }}>{p}</Body>)}
      {ready && (
        <Card style={{ marginTop: 12 }}>
          <Body>Backup is valid. Made on {dayLabel(ready.summary.createdAt)}.</Body>
          {Object.entries(LABELS).map(([k, l]) => <Body key={k} muted>{l}: {ready.summary.counts[k] ?? 0}</Body>)}
          <View style={{ height: 12 }} /><Button title="Restore this backup" variant="danger" onPress={confirmRestore} />
        </Card>)}
      {busy ? <Body muted style={{ marginTop: 12 }}>{busy}</Body> : null}
    </Screen>
  );
}
