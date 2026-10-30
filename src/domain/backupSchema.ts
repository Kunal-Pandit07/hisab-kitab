export type Cell = string | number | null;
export type Row = Record<string, Cell>;
type Kind = 't' | 'i' | 'tn' | 'in';

/** Insert order (parents first). Deleting uses the reverse order. */
export const TABLES: { name: string; cols: Record<string, Kind> }[] = [
  { name: 'accounts', cols: { id: 't', name: 't', type: 't', opening_balance_paise: 'i', archived: 'i', created_at: 't', updated_at: 't' } },
  { name: 'categories', cols: { id: 't', name: 't', kind: 't', icon: 't', is_default: 'i', created_at: 't' } },
  { name: 'budgets', cols: { id: 't', category_id: 'tn', limit_paise: 'i', thresholds: 't', created_at: 't', updated_at: 't' } },
  { name: 'budget_alerts', cols: { budget_id: 't', period: 't', threshold: 'i', fired_at: 't' } },
  { name: 'transactions', cols: { id: 't', type: 't', amount_paise: 'i', account_id: 't', to_account_id: 'tn', category_id: 'tn', description: 't', notes: 'tn', occurred_at: 't', created_at: 't', updated_at: 't' } },
  { name: 'savings_targets', cols: { id: 't', effective_from: 't', amount_paise: 'i', created_at: 't' } },
  { name: 'no_spend_days', cols: { date: 't', created_at: 't' } },
  { name: 'goals', cols: { id: 't', name: 't', target_paise: 'i', target_date: 'tn', notes: 'tn', status: 't', completed_at: 'tn', created_at: 't', updated_at: 't' } },
  { name: 'goal_contributions', cols: { id: 't', goal_id: 't', amount_paise: 'i', note: 'tn', occurred_at: 't', created_at: 't' } },
  { name: 'udhaar_records', cols: { id: 't', person_name: 't', kind: 't', principal_paise: 'i', occurred_on: 't', due_on: 'tn', description: 't', contact: 'tn', account_id: 'tn', created_at: 't', updated_at: 't' } },
  { name: 'udhaar_repayments', cols: { id: 't', record_id: 't', amount_paise: 'i', paid_on: 't', note: 'tn', account_id: 'tn', created_at: 't' } },
];

/** Only harmless preferences travel in a backup. PIN, biometrics and lock timing are device-specific and never exported. */
export const RESTORABLE_SETTINGS = ['theme', 'hideBalance', 'currency', 'soundMaster', 'soundTransactions', 'soundButtons', 'soundSuccess', 'soundStartup', 'vibration',
  'notifEnabled', 'notifDaily', 'notifExpense', 'notifSavings', 'notifBudget', 'notifUdhaar', 'notifSummary', 'notifTime', 'quietEnabled', 'quietStart', 'quietEnd'];

export const BACKUP_FORMAT = 'hisabkitab-backup';
export interface BackupPayload {
  format: typeof BACKUP_FORMAT; schemaVersion: number; createdAt: string; appVersion: string;
  tables: Record<string, Row[]>; settings: Record<string, unknown>;
}
export interface BackupSummary { createdAt: string; counts: Record<string, number>; firstTransaction: string | null; lastTransaction: string | null }
export type Validation = { ok: true; payload: BackupPayload; summary: BackupSummary } | { ok: false; errors: string[] };

const okCell = (v: unknown, k: Kind) =>
  k === 't' ? typeof v === 'string' : k === 'tn' ? v === null || typeof v === 'string' : k === 'i' ? typeof v === 'number' && Number.isSafeInteger(v) : v === null || (typeof v === 'number' && Number.isSafeInteger(v));

export function validatePayload(raw: unknown, currentSchemaVersion: number): Validation {
  const errors: string[] = []; const add = (m: string) => { if (errors.length < 12) errors.push(m); };
  const p = raw as Partial<BackupPayload> | null;
  if (!p || typeof p !== 'object' || p.format !== BACKUP_FORMAT) return { ok: false, errors: ['This file is not a Hisab Kitab backup.'] };
  if (typeof p.schemaVersion !== 'number' || p.schemaVersion !== currentSchemaVersion)
    return { ok: false, errors: [`This backup was made with a different data version (${String(p.schemaVersion)}; this app uses ${currentSchemaVersion}). Update the app and try again.`] };
  if (!p.tables || typeof p.tables !== 'object' || typeof p.createdAt !== 'string') return { ok: false, errors: ['The backup is incomplete.'] };

  const t = p.tables as Record<string, Row[]>;
  for (const spec of TABLES) {
    const rows = t[spec.name];
    if (!Array.isArray(rows)) { add(`Missing data: ${spec.name}.`); continue; }
    const want = Object.keys(spec.cols).sort().join(',');
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object' || Object.keys(r).sort().join(',') !== want) return add(`${spec.name} row ${i + 1} has unexpected fields.`);
      for (const [c, k] of Object.entries(spec.cols)) if (!okCell(r[c], k)) return add(`${spec.name} row ${i + 1}: invalid ${c}.`);
    });
  }
  if (errors.length) return { ok: false, errors };

  const ids = (name: string, col = 'id') => new Set(t[name].map((r) => r[col] as string));
  for (const name of ['accounts', 'categories', 'budgets', 'transactions', 'goals', 'goal_contributions', 'udhaar_records', 'udhaar_repayments', 'savings_targets']) {
    if (ids(name).size !== t[name].length) add(`Duplicate ids in ${name}.`);
  }
  const acc = ids('accounts'), cat = ids('categories'), bud = ids('budgets'), goal = ids('goals'), rec = ids('udhaar_records');
  const ref = (rows: Row[], col: string, set: Set<string>, label: string, nullable = true) =>
    rows.forEach((r, i) => { const v = r[col] as string | null; if ((v === null && !nullable) || (v !== null && !set.has(v))) add(`${label} row ${i + 1} points to something that is not in the backup.`); });
  ref(t.transactions, 'account_id', acc, 'transactions', false); ref(t.transactions, 'to_account_id', acc, 'transactions'); ref(t.transactions, 'category_id', cat, 'transactions');
  ref(t.budgets, 'category_id', cat, 'budgets'); ref(t.budget_alerts, 'budget_id', bud, 'budget_alerts', false);
  ref(t.goal_contributions, 'goal_id', goal, 'goal_contributions', false);
  ref(t.udhaar_records, 'account_id', acc, 'udhaar_records'); ref(t.udhaar_repayments, 'record_id', rec, 'udhaar_repayments', false); ref(t.udhaar_repayments, 'account_id', acc, 'udhaar_repayments');
  t.transactions.forEach((r, i) => { if ((r.amount_paise as number) <= 0) add(`transactions row ${i + 1}: amount must be positive.`); });
  const repaid = new Map<string, number>();
  t.udhaar_repayments.forEach((r) => repaid.set(r.record_id as string, (repaid.get(r.record_id as string) ?? 0) + (r.amount_paise as number)));
  t.udhaar_records.forEach((r, i) => { if ((repaid.get(r.id as string) ?? 0) > (r.principal_paise as number)) add(`udhaar_records row ${i + 1}: repayments exceed the amount.`); });
  if (errors.length) return { ok: false, errors };

  const settings: Record<string, unknown> = {};
  if (p.settings && typeof p.settings === 'object') for (const k of RESTORABLE_SETTINGS) if (k in p.settings) settings[k] = (p.settings as Record<string, unknown>)[k];
  const times = t.transactions.map((r) => r.occurred_at as string).sort();
  return {
    ok: true,
    payload: { ...(p as BackupPayload), settings },
    summary: { createdAt: p.createdAt, counts: Object.fromEntries(TABLES.map((s) => [s.name, t[s.name].length])), firstTransaction: times[0] ?? null, lastTransaction: times[times.length - 1] ?? null },
  };
}
