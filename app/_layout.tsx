import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../src/db/database';
import { AppSettings, loadSettings, saveSetting } from '../src/db/repositories/settings';
import { AppProvider } from '../src/hooks/useApp';
import { SplashView } from '../src/components/SplashView';
import { LockScreen } from '../src/components/LockScreen';
import { configureFeedback, sounds } from '../src/feedback';
import { initAudioMode } from '../src/audio/expoBackend';
import { initNotifications } from '../src/notifications/expoScheduler';
import { configureSync, requestSync } from '../src/notifications/requestSync';
import { notifFingerprint } from '../src/domain/notifications';
import { hasPin } from '../src/security/pinService';

/** Shortest time the animated loading screen stays up (ms). Set to 0 to show it only while the database loads. */
const MIN_SPLASH_MS: number = 700;

export default function RootLayout() {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pinEnabled, setPinEnabledState] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>('active');
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef<AppSettings | null>(null); settingsRef.current = settings;
  const pinRef = useRef(false); pinRef.current = !!pinEnabled;
  const bgAt = useRef<number | null>(null);

  useEffect(() => {
    configureFeedback(() => settingsRef.current ?? { soundMaster: false, soundTransactions: false, soundButtons: false, soundSuccess: false, soundStartup: false, vibration: false });
    initAudioMode(); initNotifications().catch(() => {});
    return () => sounds.dispose();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDb(); const s = await loadSettings(d); const pin = await hasPin();
        setSettings(s); setPinEnabledState(pin); setLocked(pin); setDb(d);
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the database.'); }
    })();
  }, []);

  const [minDone, setMinDone] = useState(MIN_SPLASH_MS === 0);
  useEffect(() => { if (MIN_SPLASH_MS > 0) { const id = setTimeout(() => setMinDone(true), MIN_SPLASH_MS); return () => clearTimeout(id); } }, []);
  const started = useRef(false);
  useEffect(() => { if (settings && db && minDone && !started.current) { started.current = true; sounds.play('startup'); } }, [settings, db, minDone]);

  useEffect(() => { if (db) configureSync(db, () => settingsRef.current); }, [db]);
  const nfp = settings ? notifFingerprint(settings) : '';
  useEffect(() => { if (db && nfp) requestSync(); }, [db, nfp]);

  // Foreground/background: re-sync reminders, and lock after the chosen time away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      setAppState(st);
      if (st === 'background') bgAt.current = Date.now();
      if (st === 'active') {
        requestSync();
        const away = bgAt.current === null ? null : (Date.now() - bgAt.current) / 1000;
        if (pinRef.current && away !== null && away >= (settingsRef.current?.autoLockSeconds ?? 0)) setLocked(true);
        bgAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  const updateSetting = useCallback(async <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    if (!db) return;
    await saveSetting(db, k, v);
    setSettings((s) => (s ? { ...s, [k]: v } : s));
  }, [db]);
  const reloadSettings = useCallback(async () => { if (db) setSettings(await loadSettings(db)); }, [db]);
  const setPinEnabled = useCallback((v: boolean) => { setPinEnabledState(v); if (!v) setLocked(false); }, []);
  const lockNow = useCallback(() => { if (pinRef.current) setLocked(true); }, []);

  if (error) return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Text>Hisab Kitab could not start: {error}</Text></View>;
  if (!db || !settings || pinEnabled === null || !minDone) return <SplashView />;

  const cover = pinEnabled && settings.hideInSwitcher && appState !== 'active';
  return (
    <SafeAreaProvider>
      <AppProvider value={{ db, settings, updateSetting, reloadSettings, pinEnabled, setPinEnabled, lockNow }}>
        <StatusBar style="auto" />
        <View style={{ flex: 1 }} accessibilityElementsHidden={locked} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="transactions/add" options={{ presentation: 'modal' }} />
          </Stack>
        </View>
        {locked && <LockScreen onUnlock={() => setLocked(false)} />}
        {cover && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#176B4D', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>Hisab Kitab</Text>
          </View>)}
      </AppProvider>
    </SafeAreaProvider>
  );
}
