import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Field, H1, Label, Screen } from '../src/components/ui';
import { resetEverything } from '../src/data/resetEverything';
import { verifyPin } from '../src/security/pinService';
import { requestSync } from '../src/notifications/requestSync';
import { useApp } from '../src/hooks/useApp';

export default function Reset() {
  const { db, pinEnabled, setPinEnabled, reloadSettings } = useApp(); const router = useRouter();
  const [word, setWord] = useState(''); const [pin, setPin] = useState(''); const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return; setBusy(true);
    try {
      if (pinEnabled) { const r = await verifyPin(pin); if (!r.ok) { Alert.alert(r.lockedForSec > 0 ? 'Too many attempts' : 'Wrong PIN', r.lockedForSec > 0 ? `Try again in ${r.lockedForSec} seconds.` : 'Enter your current PIN.'); return; } }
      await resetEverything(db); setPinEnabled(false); await reloadSettings(); requestSync();
      Alert.alert('All data erased', 'The app has been reset.', [{ text: 'OK', onPress: () => router.replace('/') }]);
    } catch (e) { Alert.alert('Could not reset', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  return (
    <Screen>
      <H1>Reset application data</H1>
      <Card><Body>This permanently deletes every account, transaction, budget, goal and Udhaar record, your settings and your PIN. It cannot be undone. Create a backup first if you might want your data back.</Body></Card>
      {pinEnabled && (<><Label>Enter your PIN</Label><Field value={pin} onChangeText={(x) => setPin(x.replace(/\D/g, '').slice(0, 6))} secureTextEntry keyboardType="number-pad" placeholder="PIN" accessibilityLabel="Current PIN" /></>)}
      <Label>Type RESET to confirm</Label>
      <Field value={word} onChangeText={setWord} autoCapitalize="characters" placeholder="RESET" accessibilityLabel="Type RESET to confirm" />
      <Button title="Erase everything" variant="danger" loading={busy} disabled={word.trim() !== 'RESET' || (pinEnabled && pin.length < 4)} onPress={go} />
      <Button title="Create a backup first" variant="ghost" onPress={() => router.push('/backup')} />
    </Screen>
  );
}
