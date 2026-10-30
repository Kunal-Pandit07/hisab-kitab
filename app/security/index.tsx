import React, { useCallback, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Button, Card, Chips, Field, H1, Label, Screen } from '../../src/components/ui';
import { validatePin } from '../../src/domain/pin';
import { getLockSeconds, removePinData, setPin, verifyPin } from '../../src/security/pinService';
import { authenticateBiometric, biometricsAvailable } from '../../src/security/biometrics';
import { useApp } from '../../src/hooks/useApp';
import { useTheme } from '../../src/theme';

type Mode = 'idle' | 'set' | 'change' | 'remove';
const AUTO = [{ value: '0', label: 'Immediately' }, { value: '30', label: '30 sec' }, { value: '60', label: '1 min' }, { value: '300', label: '5 min' }];

export default function Security() {
  const { settings, updateSetting, pinEnabled, setPinEnabled } = useApp(); const t = useTheme();
  const [mode, setMode] = useState<Mode>('idle');
  const [cur, setCur] = useState(''); const [a, setA] = useState(''); const [b, setB] = useState('');
  const [busy, setBusy] = useState(false); const [bioOk, setBioOk] = useState(false);
  useFocusEffect(useCallback(() => { biometricsAvailable().then(setBioOk); }, []));
  const reset = () => { setMode('idle'); setCur(''); setA(''); setB(''); };

  async function checkCurrent(): Promise<boolean> {
    const r = await verifyPin(cur);
    if (r.ok) return true;
    Alert.alert(r.lockedForSec > 0 ? 'Too many attempts' : 'Wrong PIN', r.lockedForSec > 0 ? `Try again in ${r.lockedForSec} seconds.` : 'The current PIN is not correct.');
    return false;
  }
  async function save() {
    if (busy) return;
    const err = mode === 'remove' ? null : validatePin(a);
    if (err) return Alert.alert('Choose another PIN', err);
    if (mode !== 'remove' && a !== b) return Alert.alert('PINs do not match', 'Enter the same PIN twice.');
    setBusy(true);
    try {
      if (mode !== 'set' && !(await checkCurrent())) return;
      if (mode === 'remove') { await removePinData(); setPinEnabled(false); await updateSetting('biometricEnabled', false); }
      else { await setPin(a); setPinEnabled(true); }
      reset(); Alert.alert(mode === 'remove' ? 'PIN removed' : 'PIN saved', mode === 'remove' ? 'The app no longer locks.' : 'The app will lock when you leave it. Remember: a forgotten PIN cannot be recovered.');
    } catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  async function toggleBio(v: boolean) {
    if (!v) return updateSetting('biometricEnabled', false);
    if (!bioOk) return Alert.alert('Not available', 'Set up fingerprint or face unlock in your phone settings first.');
    if (await authenticateBiometric('Confirm to enable biometric unlock')) await updateSetting('biometricEnabled', true);
  }
  const pinField = (v: string, set: (s: string) => void, label: string) => (
    <View style={{ marginTop: 8 }}><Field value={v} onChangeText={(x) => set(x.replace(/\D/g, '').slice(0, 6))} placeholder={label} secureTextEntry keyboardType="number-pad" maxLength={6} accessibilityLabel={label} /></View>);

  return (
    <Screen>
      <H1>Security</H1>
      <Body muted>A PIN locks the app when you leave it. It protects against casual access; your records are stored on this phone and are not encrypted by the app itself, so also keep your phone's own screen lock on.</Body>
      {mode === 'idle' ? (
        <>
          <Label>App lock</Label>
          {!pinEnabled ? (
            <Button title="Set a PIN" onPress={() => setMode('set')} />
          ) : (<>
            <Button title="Change PIN" variant="ghost" onPress={() => setMode('change')} />
            <View style={{ height: 8 }} /><Button title="Remove PIN" variant="danger" onPress={() => setMode('remove')} />
            <Label>Unlock</Label>
            <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: t.text, fontSize: 15 }}>Use fingerprint or face</Text>
              <Switch accessibilityLabel="Use fingerprint or face" value={settings.biometricEnabled} onValueChange={toggleBio} />
            </Card>
            <Label>Lock after leaving the app</Label>
            <Chips value={String(settings.autoLockSeconds)} onChange={(v) => updateSetting('autoLockSeconds', Number(v))} options={AUTO} />
            <Label>Privacy</Label>
            <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: t.text, fontSize: 15, flexShrink: 1 }}>Hide content in the app switcher</Text>
              <Switch accessibilityLabel="Hide content in the app switcher" value={settings.hideInSwitcher} onValueChange={(v) => updateSetting('hideInSwitcher', v)} />
            </Card>
            <Body muted style={{ marginTop: 6 }}>Best effort: some Android versions may still show a snapshot.</Body>
          </>)}
          <Card style={{ marginTop: 16 }}><Body>There is no PIN recovery and no back door. If you forget it, the only way in is to erase the app's data and restore from a backup. Create a backup first.</Body></Card>
        </>
      ) : (
        <>
          <Label>{mode === 'set' ? 'Choose a PIN (4–6 digits)' : mode === 'change' ? 'Change PIN' : 'Remove PIN'}</Label>
          {mode !== 'set' && pinField(cur, setCur, 'Current PIN')}
          {mode !== 'remove' && (<>{pinField(a, setA, 'New PIN')}{pinField(b, setB, 'Confirm new PIN')}</>)}
          <View style={{ height: 16 }} />
          <Button title={mode === 'remove' ? 'Remove PIN' : 'Save PIN'} loading={busy} onPress={save} />
          <View style={{ height: 8 }} /><Button title="Cancel" variant="ghost" disabled={busy} onPress={reset} />
        </>
      )}
    </Screen>
  );
}
