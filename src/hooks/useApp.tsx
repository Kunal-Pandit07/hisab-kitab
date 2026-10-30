import React, { createContext, useContext } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { AppSettings } from '../db/repositories/settings';

export interface AppCtx {
  db: SQLiteDatabase;
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => Promise<void>;
  reloadSettings: () => Promise<void>;
  pinEnabled: boolean;
  setPinEnabled: (v: boolean) => void;
  lockNow: () => void;
}
const Ctx = createContext<AppCtx | null>(null);
export const AppProvider = Ctx.Provider;
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}
