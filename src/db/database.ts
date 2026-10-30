import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens the DB once, enables FKs/WAL and applies pending migrations (each atomically). */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('hisabkitab.db');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await migrate(db);
      return db;
    })().catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}

export async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (const m of migrations.filter((x) => x.version > current).sort((a, b) => a.version - b.version)) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(m.sql);
      await tx.execAsync(`PRAGMA user_version = ${m.version}`);
    });
  }
}
