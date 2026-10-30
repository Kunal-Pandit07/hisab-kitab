import Database from 'better-sqlite3';
import { migrations } from '../src/db/migrations';
import { migrate } from '../src/db/database';

/** Native addon errors can come from another JS realm under Jest; re-throw as a plain Error so matchers work reliably. */
const wrap = <T>(fn: () => T): T => { try { return fn(); } catch (e) { throw new Error((e as Error)?.message ?? String(e)); } };
const flat = (a: unknown[]) => (a.length === 1 && Array.isArray(a[0]) ? (a[0] as unknown[]) : a);

/** Minimal async adapter with the same surface the repositories use from expo-sqlite. */
export function openTestDb(raw = new Database(':memory:')) {
  raw.pragma('foreign_keys = ON');
  const db: any = {
    raw,
    execAsync: async (sql: string) => { wrap(() => raw.exec(sql)); },
    runAsync: async (sql: string, ...a: unknown[]) => { const r = wrap(() => raw.prepare(sql).run(...(flat(a) as any[]))); return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) }; },
    getAllAsync: async (sql: string, ...a: unknown[]) => wrap(() => raw.prepare(sql).all(...(flat(a) as any[]))),
    getFirstAsync: async (sql: string, ...a: unknown[]) => wrap(() => raw.prepare(sql).get(...(flat(a) as any[]))) ?? null,
    withExclusiveTransactionAsync: async (fn: (tx: any) => Promise<void>) => {
      wrap(() => raw.exec('BEGIN'));
      try { await fn(db); wrap(() => raw.exec('COMMIT')); } catch (e) { try { raw.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
    },
  };
  return db;
}
export async function freshDb() { const db = openTestDb(); await migrate(db); return db; }

/** A database that is only at schema v1 and holds user data, to test upgrades. */
export async function dbAtV1WithData() {
  const raw = new Database(':memory:'); raw.pragma('foreign_keys = ON');
  raw.exec(migrations[0].sql); raw.pragma('user_version = 1');
  raw.prepare("INSERT INTO accounts VALUES ('a1','Cash','cash',5000,0,'x','x')").run();
  raw.prepare("INSERT INTO transactions (id,type,amount_paise,account_id,category_id,description,occurred_at,created_at,updated_at) VALUES ('t1','expense',1000,'a1','exp_food','tea','2026-10-10T10:00:00.000Z','x','x')").run();
  return openTestDb(raw);
}
