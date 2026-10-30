import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';

export async function createCategory(db: SQLiteDatabase, name: string, kind: 'income' | 'expense'): Promise<string> {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) throw new Error('Enter a category name.');
  if (n.length > 30) throw new Error('Keep the name under 30 characters.');
  const dup = await db.getFirstAsync<{ id: string }>('SELECT id FROM categories WHERE kind = ? AND lower(name) = lower(?)', kind, n);
  if (dup) throw new Error('You already have a category with that name.');
  const id = `cat_${randomUUID()}`;
  await db.runAsync('INSERT INTO categories (id,name,kind,icon,is_default,created_at) VALUES (?,?,?,?,0,?)', id, n, kind, 'ellipse-outline', new Date().toISOString());
  return id;
}
