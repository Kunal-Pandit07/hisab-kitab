import type { SQLiteDatabase } from 'expo-sqlite';
import { resetAll } from '../db/repositories/backup';
import { removePinData } from '../security/pinService';

/** Erases all records, settings and the PIN. This is also the only way past a forgotten PIN, so it is never silent. */
export async function resetEverything(db: SQLiteDatabase) {
  await resetAll(db);
  await removePinData();
}
