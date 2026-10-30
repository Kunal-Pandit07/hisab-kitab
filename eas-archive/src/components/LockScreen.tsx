import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../hooks/useApp';
import { getLockSeconds, getPinLength, verifyPin } from '../security/pinService';
import { authenticateBiometric, biometricsAvailable } from '../security/biometrics';
import { resetEverything } from '../data/resetEverything';
import { requestSync } from '../notifications/requestSync';
import { radius, space, useTheme } from '../theme';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { db, settings, reloadSettings, setPinEnabled } = useApp(); const t = useTheme();
  const [pin, setPin] = useState(''); const [len, setLen] = useState<number | null>(null);
  const [msg, setMsg] = useState(''); const [wait, setWait] = useState(0); const [bio, setBio] = useState(false);
  const busy = useRef(false);

  useEffect(() => { getPinLength().then(setLen); getLockSeconds().then(setWait); }, []);
  useEffect(() => { if (wait <= 0) return; const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000); return () => clearInterval(id); }, [wait > 0]);

  const tryBio = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try { if (await authenticateBiometric('Unlock Hisab Kitab')) onUnlock(); } finally { busy.current = false; }
  }, [onUnlock]);
  useEffect(() => {
    if (!settings.biometricEnabled) return;
    biometricsAvailable().then((ok) => { setBio(ok); if (ok) tryBio(); });
  }, [settings.biometricEnabled, tryBio]);

  async function submit(value: string) {
    if (busy.current || wait > 0) return; busy.current = true;
    try {
      const r = await verifyPin(value);
      if (r.ok) { onUnlock(); return; }
      setPin(''); setWait(r.lockedForSec);
      setMsg(r.lockedForSec > 0 ? 'Too many wrong attempts.' : 'Wrong PIN. Try again.');
    } catch { setPin(''); setMsg('Could not check the PIN. Try again.'); }
    finally { busy.current = false; }
  }
  function press(d: string) {
    if (wait > 0 || busy.current) return;
    const next = (pin + d).slice(0, 6); setPin(next); setMsg('');
    if (len !== null && next.length === len) submit(next);
  }
  function forgot() {
    Alert.alert('Forgot your PIN?', 'There is no way to recover a PIN. You can erase all data in this app and start again. Anything not saved in a backup will be lost permanently.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase everything', style: 'destructive', onPress: () => Alert.alert('Erase all data?', 'This deletes every account, transaction, goal and record, and removes the PIN. This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase', style: 'destructive', onPress: async () => {
          try { await resetEverything(db); setPinEnabled(false); await reloadSettings(); requestSync(); onUnlock(); router.replace('/'); }
          catch (e) { Alert.alert('Could not erase', e instanceof Error ? e.message : 'Try again.'); } } }]) }]);
  }
  const key = (label: string, onPress: () => void, a11y: string, icon?: keyof typeof Ionicons.glyphMap) => (
    <Pressable key={a11y} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress}
      style={{ width: 76, height: 76, borderRadius: 38, margin: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: label || icon ? t.bg2 : 'transparent' }}>
      {icon ? <Ionicons name={icon} size={26} color={t.text} /> : <Text style={{ fontSize: 28, color: t.text }}>{label}</Text>}
    </Pressable>);
  const dots = len ?? 6;
  return (
    <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg, zIndex: 100 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg }}>
        <Ionicons name="lock-closed-outline" size={34} color={t.primary} />
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '700', marginTop: 12 }}>Hisab Kitab</Text>
        <Text style={{ color: t.text2, marginTop: 4 }}>Enter your PIN</Text>
        <View style={{ flexDirection: 'row', marginVertical: 24 }} accessibilityLabel={`${pin.length} digits entered`}>
          {Array.from({ length: dots }, (_, i) => <View key={i} style={{ width: 14, height: 14, borderRadius: 7, marginHorizontal: 7, borderWidth: 1.5, borderColor: t.primary, backgroundColor: i < pin.length ? t.primary : 'transparent' }} />)}
        </View>
        <Text style={{ color: wait > 0 ? t.expense : t.text2, minHeight: 20, textAlign: 'center' }} accessibilityLiveRegion="polite">
          {wait > 0 ? `${msg} Try again in ${wait}s.` : msg}
        </Text>
        <View style={{ width: 276, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d), d))}
          {bio ? key('', tryBio, 'Use biometrics', 'finger-print-outline') : key('', () => {}, 'blank')}
          {key('0', () => press('0'), '0')}
          {len === null ? key('', () => pin && submit(pin), 'Submit', 'checkmark') : key('', () => { setPin((p) => p.slice(0, -1)); }, 'Delete', 'backspace-outline')}
        </View>
        <Pressable onPress={forgot} accessibilityRole="button" style={{ marginTop: 20, padding: 10 }}><Text style={{ color: t.primary }}>Forgot PIN?</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}
