import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Field, H1, Label, Screen } from '../../src/components/ui';
import { parseRupeesAllowZero } from '../../src/domain/money';
import { createAccount, listAccounts } from '../../src/db/repositories/accounts';
import { useApp } from '../../src/hooks/useApp';
import { useTheme } from '../../src/theme';

const SLIDES = [
  ['Track your income and expenses', 'Record every rupee in seconds. No salary or bank account needed.'],
  ['Build a savings habit', 'Small, steady savings count. Zero days are fine.'],
  ['Manage budgets and Udhaar', 'Stay on top of limits and money lent or borrowed.'],
  ['Your records stay on your device', 'No account, no cloud. Everything works offline.'],
];

export default function Onboarding() {
  const { db, updateSetting } = useApp();
  const t = useTheme(); const router = useRouter();
  const [step, setStep] = useState(0);
  const [opening, setOpening] = useState('');
  const [saving, setSaving] = useState(false);
  const setup = step >= SLIDES.length;

  async function finish(skip: boolean) {
    if (saving) return; setSaving(true);
    try {
      const paise = skip ? 0 : parseRupeesAllowZero(opening);
      if (paise === null) { Alert.alert('Check the amount', 'Enter a valid amount like 500 or 1250.50, or leave it empty.'); return; }
      if ((await listAccounts(db, true)).length === 0) await createAccount(db, { name: 'Cash', type: 'cash', openingBalancePaise: paise });
      await updateSetting('onboarded', true);
      router.replace('/(tabs)');
    } catch (e) { Alert.alert('Could not finish setup', e instanceof Error ? e.message : 'Try again.'); }
    finally { setSaving(false); }
  }

  return (
    <Screen>
      <View style={{ height: 48 }} />
      {!setup ? (
        <>
          <Text style={{ fontSize: 14, color: t.text2 }}>Hisab Kitab · Aapke har rupaye ka hisaab.</Text>
          <View style={{ height: 24 }} />
          <H1>{SLIDES[step][0]}</H1>
          <Body muted>{SLIDES[step][1]}</Body>
          <View style={{ height: 32 }} />
          <Button title="Continue" onPress={() => setStep(step + 1)} />
          <View style={{ height: 8 }} />
          <Button title="Skip" variant="ghost" onPress={() => setStep(SLIDES.length)} />
        </>
      ) : (
        <>
          <H1>Quick setup</H1>
          <Body muted>Everything here is optional. You can change it later in Settings.</Body>
          <Label>Cash in hand right now (₹)</Label>
          <Field keyboardType="decimal-pad" placeholder="0" value={opening} onChangeText={setOpening} accessibilityLabel="Opening cash balance" />
          <View style={{ height: 24 }} />
          <Button title="Start using Hisab Kitab" loading={saving} onPress={() => finish(false)} />
          <View style={{ height: 8 }} />
          <Button title="Skip setup" variant="ghost" disabled={saving} onPress={() => finish(true)} />
        </>
      )}
    </Screen>
  );
}
