import React from 'react';
import { Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Body, Button, Card, Chips, H1, Label, Screen } from '../../src/components/ui';
import { useApp } from '../../src/hooks/useApp';
import { fireFeedback, sounds } from '../../src/feedback';
import type { FeedbackSettings } from '../../src/domain/feedback';
import { useTheme } from '../../src/theme';

export default function Settings() {
  const { settings, updateSetting, pinEnabled } = useApp(); const router = useRouter(); const t = useTheme();
  const toggle = (key: keyof FeedbackSettings, label: string) => (
    <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}>
      <Text style={{ color: t.text, fontSize: 15 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={settings[key]} onValueChange={(v) => updateSetting(key, v)} />
    </View>);
  const link = (title: string, path: string) => (<View key={path} style={{ marginBottom: 8 }}><Button title={title} variant="ghost" onPress={() => router.push(path as never)} /></View>);
  return (
    <Screen>
      <H1>Settings</H1>

      <Label>Appearance</Label>
      <Chips value={settings.theme} onChange={(v) => updateSetting('theme', v)} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      <Label>Balances</Label>
      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Body>Hide balances</Body>
        <Switch accessibilityLabel="Hide balances" value={settings.hideBalance} onValueChange={(v) => updateSetting('hideBalance', v)} />
      </Card>

      <Label>Sounds and feedback</Label>
      <Card>
        {toggle('soundMaster', 'Sounds')}{toggle('soundTransactions', 'Transaction sounds')}{toggle('soundSuccess', 'Success sounds')}
        {toggle('soundButtons', 'Button sounds')}{toggle('soundStartup', 'Startup sound')}{toggle('vibration', 'Vibration')}
      </Card>
      <View style={{ height: 8 }} />
      <Button title="Preview sound" variant="ghost" onPress={() => { sounds.play('income', { force: true }); if (settings.vibration) fireFeedback('goal'); }} />
      <Body muted style={{ marginTop: 6 }}>Sounds follow your phone's silent switch.</Body>

      <Label>Notifications</Label>
      {link('Reminders and alerts', '/notifications/settings')}

      <Label>Security</Label>
      {link(pinEnabled ? 'App lock: on' : 'App lock: off', '/security')}

      <Label>Money</Label>
      {link('Accounts', '/accounts')}{link('Budgets', '/budgets')}{link('Categories', '/categories')}{link('Reports', '/reports')}

      <Label>Data</Label>
      {link('Create or restore a backup', '/backup')}{link('Export CSV or PDF', '/export')}
      <Button title="Reset application data" variant="danger" onPress={() => router.push('/reset')} />

      <Label>About</Label>
      <Body>Hisab Kitab {Constants.expoConfig?.version ?? ''}</Body>
      <Body muted>Aapke har rupaye ka hisaab. Your records stay on this device.</Body>
      <View style={{ height: 8 }} />{link('Privacy information', '/privacy')}
      <Text style={{ color: t.text2, fontSize: 13, textAlign: 'center', marginTop: 24 }}>Powered by KP Groups</Text>
    </Screen>
  );
}
