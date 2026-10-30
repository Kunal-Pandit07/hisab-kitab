import React, { useCallback, useState } from 'react';
import { Alert, Linking, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Button, Card, Chips, Field, H1, Label, Screen } from '../../src/components/ui';
import { formatHHMM, parseHHMM, permissionAction, PermissionStatus, NotificationSettings } from '../../src/domain/notifications';
import { expoScheduler, getPermissionState, requestPermission } from '../../src/notifications/expoScheduler';
import { requestSync } from '../../src/notifications/requestSync';
import { useApp } from '../../src/hooks/useApp';
import { useTheme } from '../../src/theme';

const PRESETS = [{ value: '08:00', label: '8:00 AM' }, { value: '09:00', label: '9:00 AM' }, { value: '20:00', label: '8:00 PM' }, { value: '21:00', label: '9:00 PM' }];

export default function NotificationSettingsScreen() {
  const { settings, updateSetting } = useApp(); const t = useTheme();
  const [perm, setPerm] = useState<PermissionStatus>('undetermined');
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [timeText, setTimeText] = useState(settings.notifTime);
  const [qs, setQs] = useState(settings.quietStart); const [qe, setQe] = useState(settings.quietEnd);

  const refresh = useCallback(async () => {
    try { setPerm((await getPermissionState()).status); setScheduled((await expoScheduler.getScheduled()).length); } catch { /* ignore */ }
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function enable() {
    const act = permissionAction(perm);
    if (act === 'none') return updateSetting('notifEnabled', true);
    if (act === 'request') {
      Alert.alert('Allow reminders?', 'Hisab Kitab can remind you to record expenses and savings, and tell you about budgets and due dates. Reminders are scheduled on your phone; nothing is sent to a server.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Continue', onPress: async () => {
          const r = await requestPermission(); setPerm(r.status);
          if (r.status === 'granted') await updateSetting('notifEnabled', true);
          else Alert.alert('Notifications are off', 'Every feature still works without them. You can allow notifications later in your phone settings.');
        } }]);
      return;
    }
    Alert.alert('Notifications are blocked', 'Allow notifications for Hisab Kitab in your phone settings to get reminders. The app works fully without them.', [
      { text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() }]);
  }
  const row = (key: keyof NotificationSettings, label: string, disabled = false) => (
    <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: t.text, fontSize: 15 }}>{label}</Text>
      <Switch accessibilityLabel={label} disabled={disabled} value={settings[key] as boolean} onValueChange={(v) => updateSetting(key, v as never)} />
    </View>);
  async function saveTime() {
    const m = parseHHMM(timeText); if (m === null) return Alert.alert('Check the time', 'Use 24-hour format, like 20:00.');
    await updateSetting('notifTime', formatHHMM(m)); setTimeText(formatHHMM(m));
  }
  async function saveQuiet() {
    const a = parseHHMM(qs), b = parseHHMM(qe);
    if (a === null || b === null || a === b) return Alert.alert('Check quiet hours', 'Use two different times in 24-hour format, like 22:00 and 07:00.');
    await updateSetting('quietStart', formatHHMM(a)); await updateSetting('quietEnd', formatHHMM(b));
  }
  async function test() {
    try {
      if (!(await expoScheduler.isAllowed())) return Alert.alert('Not allowed yet', 'Turn on notifications first and allow them when asked.');
      await expoScheduler.schedule({ id: 'hk:test', title: 'Hisab Kitab', body: 'This is a test notification.', channel: 'alerts', sig: 'test' + Date.now(), trigger: { kind: 'date', at: new Date(Date.now() + 5000) } });
      Alert.alert('Test scheduled', 'It should appear in about 5 seconds. Scheduling means your phone accepted the request; it does not guarantee delivery. If nothing appears, check system notification and battery settings.');
      refresh();
    } catch (e) { Alert.alert('Could not schedule', e instanceof Error ? e.message : 'Try again.'); }
  }
  const off = !settings.notifEnabled;
  return (
    <Screen>
      <H1>Notifications</H1>
      <Body muted>Reminders run on your phone. No account or internet needed. All of them are optional.</Body>
      {perm === 'denied' && <Card style={{ marginTop: 12 }}><Body>Notifications are blocked in your phone's settings. Everything else in the app still works.</Body></Card>}
      <Label>General</Label>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}>
          <Text style={{ color: t.text, fontSize: 15 }}>Enable notifications</Text>
          <Switch accessibilityLabel="Enable notifications" value={settings.notifEnabled} onValueChange={(v) => (v ? enable() : updateSetting('notifEnabled', false))} />
        </View>
      </Card>
      <Label>Daily reminders</Label>
      <Card>
        {row('notifDaily', 'Daily reminders', off)}
        {row('notifExpense', 'Remind me to record expenses', off || !settings.notifDaily)}
        {row('notifSavings', 'Remind me about savings', off || !settings.notifDaily)}
        {row('notifSummary', 'Daily summary', off)}
      </Card>
      <Label>Reminder time</Label>
      <Chips value={settings.notifTime} onChange={(v) => { setTimeText(v); updateSetting('notifTime', v); }} options={PRESETS} />
      <View style={{ height: 8 }} />
      <Field value={timeText} onChangeText={setTimeText} placeholder="HH:MM, e.g. 20:00" autoCapitalize="none" accessibilityLabel="Custom reminder time" />
      <View style={{ height: 8 }} /><Button variant="ghost" title="Set custom time" onPress={saveTime} />
      <Body muted style={{ marginTop: 6 }}>Savings reminder follows 10 minutes later and the summary 30 minutes later.</Body>
      <Label>Alerts</Label>
      <Card>
        {row('notifBudget', 'Budget warnings', off)}
        {row('notifUdhaar', 'Udhaar due and overdue', off)}
      </Card>
      <Label>Quiet hours</Label>
      <Card>{row('quietEnabled', 'Quiet hours', off)}</Card>
      <View style={{ height: 8 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field value={qs} onChangeText={setQs} placeholder="22:00" autoCapitalize="none" accessibilityLabel="Quiet hours start" /></View>
        <View style={{ flex: 1 }}><Field value={qe} onChangeText={setQe} placeholder="07:00" autoCapitalize="none" accessibilityLabel="Quiet hours end" /></View>
      </View>
      <View style={{ height: 8 }} /><Button variant="ghost" title="Save quiet hours" onPress={saveQuiet} />
      <Body muted style={{ marginTop: 6 }}>Nothing is shown during quiet hours; it moves to when they end.</Body>
      <View style={{ height: 20 }} />
      <Button title="Send test notification" variant="ghost" onPress={test} />
      <Body muted style={{ marginTop: 10 }}>{scheduled === null ? '' : `${scheduled} reminder${scheduled === 1 ? '' : 's'} scheduled on this phone.`}</Body>
      <Body muted style={{ marginTop: 6 }}>Some phones delay or skip reminders to save battery. If they don't arrive, allow Hisab Kitab to run in the background. Reminders are re-checked whenever you open the app, which also picks up time-zone changes.</Body>
    </Screen>
  );
}
