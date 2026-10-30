import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_FEEDBACK, FeedbackSettings } from '../../domain/feedback';
import { DEFAULT_NOTIFICATIONS, NotificationSettings } from '../../domain/notifications';

export interface SecuritySettings { biometricEnabled: boolean; autoLockSeconds: number; hideInSwitcher: boolean }
export const DEFAULT_SECURITY: SecuritySettings = { biometricEnabled: false, autoLockSeconds: 0, hideInSwitcher: true };

export interface AppSettings extends FeedbackSettings, NotificationSettings, SecuritySettings {
  onboarded: boolean;
  theme: 'light' | 'dark' | 'system';
  hideBalance: boolean;
  currency: 'INR';
}
export const DEFAULT_SETTINGS: AppSettings = { ...DEFAULT_FEEDBACK, ...DEFAULT_NOTIFICATIONS, ...DEFAULT_SECURITY, onboarded: false, theme: 'system', hideBalance: false, currency: 'INR' };

export async function loadSettings(db: SQLiteDatabase): Promise<AppSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) { try { s[r.key] = JSON.parse(r.value); } catch { /* ignore corrupt value */ } }
  return s as unknown as AppSettings;
}

export async function saveSetting<K extends keyof AppSettings>(db: SQLiteDatabase, key: K, value: AppSettings[K]) {
  await db.runAsync('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key, JSON.stringify(value));
}
