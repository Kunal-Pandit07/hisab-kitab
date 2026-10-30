// Typed stand-in mirroring the subset of expo-sqlite's async API that the repositories use.
type Bind = string | number | null;
export interface SQLiteDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (Bind | Bind[])[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T>(sql: string, ...params: (Bind | Bind[])[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: (Bind | Bind[])[]): Promise<T | null>;
  withExclusiveTransactionAsync(task: (tx: SQLiteDatabase) => Promise<void>): Promise<void>;
}
export const openDatabaseAsync = async (_name: string): Promise<SQLiteDatabase> => { throw new Error('use openTestDb'); };
