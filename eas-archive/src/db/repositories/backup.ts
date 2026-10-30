import type { SQLiteDatabase } from 'expo-sqlite';
import { LATEST_SCHEMA_VERSION, SEED_CATEGORIES_SQL } from '../migrations';
import { BACKUP_FORMAT, BackupPayload, RESTORABLE_SETTINGS, Row, TABLES } from '../../domain/backupSchema';

/** Everything the user created, plus harmless preferences. Never includes the PIN verifier or any secret. */
export async function exportAll(db: SQLiteDatabase, appVersion: string, now = new Date()): Promise<BackupPayload> {
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) tables[t.name] = await db.getAllAsync<Row>(`SELECT ${Object.keys(t.cols).join(', ')} FROM ${t.name}`);
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  const settings: Record<string, unknown> = {};
  for (const r of rows) if (RESTORABLE_SETTINGS.includes(r.key)) { try { settings[r.key] = JSON.parse(r.value); } catch { /* skip corrupt value */ } }
  return { format: BACKUP_FORMAT, schemaVersion: LATEST_SCHEMA_VERSION, createdAt: now.toISOString(), appVersion, tables, settings };
}

/**
 * Replaces all user data with the (already validated) payload inside ONE transaction.
 * Any failure, including a foreign-key problem found afterwards, rolls everything back to how it was.
 */
export async function restoreAll(db: SQLiteDatabase, payload: BackupPayload): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const t of [...TABLES].reverse()) await tx.runAsync(`DELETE FROM ${t.name}`);
    for (const t of TABLES) {
      const cols = Object.keys(t.cols); const sql = `INSERT INTO ${t.name} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
      for (const r of payload.tables[t.name]) await tx.runAsync(sql, cols.map((c) => r[c]));
    }
    for (const [k, v] of Object.entries(payload.settings)) {
      if (RESTORABLE_SETTINGS.includes(k)) await tx.runAsync('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v));
    }
    await tx.runAsync("INSERT INTO app_settings (key,value) VALUES ('onboarded','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    const bad = await tx.getAllAsync<{ table: string }>('PRAGMA foreign_key_check');
    if (bad.length) throw new Error('The backup has broken links between records. Nothing was changed.');
  });
}

/** Deletes every record and setting and restores the built-in categories. */
export async function resetAll(db: SQLiteDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const t of [...TABLES].reverse()) await tx.runAsync(`DELETE FROM ${t.name}`);
    await tx.runAsync('DELETE FROM app_settings');
    await tx.execAsync(SEED_CATEGORIES_SQL);
  });
}
