import type { Planned } from '../domain/notifications';

export interface ScheduledInfo { id: string; sig?: string }
export interface Scheduler {
  getScheduled(): Promise<ScheduledInfo[]>;
  schedule(p: Planned): Promise<void>;
  cancel(id: string): Promise<void>;
  isAllowed(): Promise<boolean>;
}
export interface SyncResult { scheduled: string[]; cancelled: string[]; unchanged: string[]; failed: { id: string; error: string }[] }

/**
 * Makes the phone's scheduled notifications match `planned` for the ids under `managedPrefixes`:
 * obsolete ones are cancelled, changed ones replaced, identical ones left alone (so no duplicates).
 * One failing item never stops the rest and never throws: notifications are optional, core features are not.
 */
export async function syncPlan(s: Scheduler, planned: readonly Planned[], managedPrefixes: readonly string[]): Promise<SyncResult> {
  const r: SyncResult = { scheduled: [], cancelled: [], unchanged: [], failed: [] };
  const existing = (await s.getScheduled()).filter((e) => managedPrefixes.some((p) => e.id.startsWith(p)));
  const have = new Map(existing.map((e) => [e.id, e]));
  const wanted = new Set(planned.map((p) => p.id));

  for (const e of existing) if (!wanted.has(e.id)) {
    try { await s.cancel(e.id); r.cancelled.push(e.id); } catch (err) { r.failed.push({ id: e.id, error: String(err) }); }
  }
  for (const p of planned) {
    const cur = have.get(p.id);
    if (cur && cur.sig === p.sig) { r.unchanged.push(p.id); continue; }
    try {
      if (cur) await s.cancel(p.id);
      await s.schedule(p); r.scheduled.push(p.id);
    } catch (err) { r.failed.push({ id: p.id, error: String(err) }); }
  }
  return r;
}
