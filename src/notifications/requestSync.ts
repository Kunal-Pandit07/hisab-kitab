import type { SQLiteDatabase } from 'expo-sqlite';
import type { AppSettings } from '../db/repositories/settings';
import { expoScheduler } from './expoScheduler';
import { notifyBudgetAlerts, refreshNotifications } from './service';

let cfg: { db: SQLiteDatabase; get: () => AppSettings | null } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export const configureSync = (db: SQLiteDatabase, get: () => AppSettings | null) => { cfg = { db, get }; };

/**
 * Debounced re-sync of reminders and budget alerts. Call after any change that can affect them
 * (settings, transactions, budgets, Udhaar, goals) and when the app returns to the foreground
 * (which also picks up time-zone changes). Never throws.
 */
export function requestSync(delayMs = 600) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    try {
      const s = cfg?.get(); if (!cfg || !s) return;
      await refreshNotifications(cfg.db, s, expoScheduler);
      await notifyBudgetAlerts(cfg.db, s, expoScheduler);
    } catch { /* notifications are optional; never disturb the app */ }
  }, delayMs);
}
