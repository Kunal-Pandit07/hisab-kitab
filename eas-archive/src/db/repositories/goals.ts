import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { goalIsComplete, validateAllocation } from '../../domain/savings';

export interface Goal {
  id: string; name: string; targetPaise: number; targetDate: string | null; notes: string | null;
  status: 'active' | 'completed' | 'archived'; allocatedPaise: number;
}
export interface Contribution { id: string; amountPaise: number; note: string | null; occurredAt: string }

const GOAL_SQL = `SELECT g.id, g.name, g.target_paise AS targetPaise, g.target_date AS targetDate, g.notes, g.status,
  COALESCE((SELECT SUM(c.amount_paise) FROM goal_contributions c WHERE c.goal_id = g.id), 0) AS allocatedPaise FROM goals g`;

export const listGoals = (db: SQLiteDatabase) =>
  db.getAllAsync<Goal>(`${GOAL_SQL} WHERE g.status <> 'archived' ORDER BY (g.status='completed'), g.created_at`);
export const getGoal = (db: SQLiteDatabase, id: string) => db.getFirstAsync<Goal>(`${GOAL_SQL} WHERE g.id = ?`, id);
export const listContributions = (db: SQLiteDatabase, goalId: string) =>
  db.getAllAsync<Contribution>('SELECT id, amount_paise AS amountPaise, note, occurred_at AS occurredAt FROM goal_contributions WHERE goal_id = ? ORDER BY occurred_at DESC, created_at DESC', goalId);

export async function createGoal(db: SQLiteDatabase, g: { name: string; targetPaise: number; targetDate?: string | null; notes?: string | null }) {
  const id = randomUUID(); const now = new Date().toISOString();
  await db.runAsync('INSERT INTO goals (id,name,target_paise,target_date,notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    id, g.name.trim(), g.targetPaise, g.targetDate ?? null, g.notes ?? null, 'active', now, now);
  return id;
}

/**
 * Adds (positive) or removes (negative) an allocation. Never touches account balances or ordinary
 * income/expense. Returns justCompleted=true only when this call moved the goal to completed,
 * so the UI can celebrate once.
 */
export async function addContribution(db: SQLiteDatabase, goalId: string, deltaPaise: number, note?: string | null) {
  let justCompleted = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const g = await tx.getFirstAsync<{ target: number; status: string; allocated: number }>(
      `SELECT g.target_paise AS target, g.status AS status,
        COALESCE((SELECT SUM(amount_paise) FROM goal_contributions WHERE goal_id = g.id), 0) AS allocated FROM goals g WHERE g.id = ?`, goalId);
    if (!g) throw new Error('Goal not found.');
    const err = validateAllocation(g.allocated, deltaPaise);
    if (err) throw new Error(err);
    const now = new Date().toISOString();
    await tx.runAsync('INSERT INTO goal_contributions (id,goal_id,amount_paise,note,occurred_at,created_at) VALUES (?,?,?,?,?,?)',
      randomUUID(), goalId, deltaPaise, note ?? null, now, now);
    const complete = goalIsComplete(g.allocated + deltaPaise, g.target);
    if (complete && g.status === 'active') { await tx.runAsync("UPDATE goals SET status='completed', completed_at=?, updated_at=? WHERE id=?", now, now, goalId); justCompleted = true; }
    else if (!complete && g.status === 'completed') await tx.runAsync("UPDATE goals SET status='active', completed_at=NULL, updated_at=? WHERE id=?", now, goalId);
  });
  return { justCompleted };
}

export const archiveGoal = (db: SQLiteDatabase, id: string) =>
  db.runAsync("UPDATE goals SET status='archived', updated_at=? WHERE id=?", new Date().toISOString(), id);
export const deleteGoal = (db: SQLiteDatabase, id: string) => db.runAsync('DELETE FROM goals WHERE id = ?', id);
