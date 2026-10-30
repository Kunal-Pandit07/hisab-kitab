export interface NotificationSettings {
  notifEnabled: boolean; notifDaily: boolean; notifExpense: boolean; notifSavings: boolean;
  notifBudget: boolean; notifUdhaar: boolean; notifSummary: boolean;
  notifTime: string;          // HH:MM, local time
  quietEnabled: boolean; quietStart: string; quietEnd: string;
}
/** Everything is off until the user opts in. */
export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  notifEnabled: false, notifDaily: true, notifExpense: true, notifSavings: true, notifBudget: true, notifUdhaar: true, notifSummary: false,
  notifTime: '20:00', quietEnabled: false, quietStart: '22:00', quietEnd: '07:00',
};

export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}
export const formatHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface Quiet { start: number; end: number }
export const quietOf = (s: NotificationSettings): Quiet | null => {
  if (!s.quietEnabled) return null;
  const a = parseHHMM(s.quietStart), b = parseHHMM(s.quietEnd);
  return a === null || b === null || a === b ? null : { start: a, end: b };
};
/** Handles overnight windows such as 22:00–07:00. */
export const inQuiet = (minute: number, q: Quiet | null) =>
  !!q && (q.start < q.end ? minute >= q.start && minute < q.end : minute >= q.start || minute < q.end);
export const shiftMinute = (minute: number, q: Quiet | null) => (inQuiet(minute, q) ? q!.end : minute);

/** Moves a one-off time out of quiet hours to the moment quiet hours end. Returns the same Date if already allowed. */
export function shiftDate(d: Date, q: Quiet | null): Date {
  if (!q || !inQuiet(d.getHours() * 60 + d.getMinutes(), q)) return d;
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(q.end / 60), q.end % 60, 0, 0);
  return end > d ? end : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, Math.floor(q.end / 60), q.end % 60, 0, 0);
}

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';
/** Ask once when undetermined; after a denial only point the user to system settings, never re-prompt. */
export function permissionAction(status: PermissionStatus): 'none' | 'request' | 'open-settings' {
  if (status === 'granted') return 'none';
  return status === 'undetermined' ? 'request' : 'open-settings';
}

export type PlannedTrigger = { kind: 'daily'; hour: number; minute: number } | { kind: 'date'; at: Date } | { kind: 'now' };
export interface Planned { id: string; title: string; body: string; trigger: PlannedTrigger; channel: 'reminders' | 'alerts'; sig: string }

export const ID_PREFIX = 'hk:';
/** Prefixes the planner owns and may cancel when they drop out of the plan. Budget alerts are one-offs and are not in this list. */
export const MANAGED_PREFIXES = ['hk:daily-', 'hk:udhaar-', 'hk:goal:'];

const TITLE = 'Hisab Kitab';
export const MSG = {
  expense: 'Hisab Kitab: Aaj ke expenses record karna na bhoolein.',
  savings: 'Hisab Kitab: Aaj ki savings update karein. Chhoti savings bhi important hai.',
  summary: 'Your Hisab Kitab daily summary is ready.',
  udhaarSoon: 'Reminder: A repayment is due soon. Open Hisab Kitab to review the details.',
  udhaarOverdue: 'Reminder: A repayment is overdue. Open Hisab Kitab to review the details.',
  goal: 'A savings goal date is coming up. Open Hisab Kitab to check your progress.',
};
// Messages deliberately omit names and amounts so nothing private shows on a lock screen.

const trigSig = (t: PlannedTrigger) => (t.kind === 'daily' ? `d${t.hour}:${t.minute}` : t.kind === 'date' ? `t${t.at.toISOString()}` : 'now');
const mk = (id: string, body: string, trigger: PlannedTrigger, channel: Planned['channel']): Planned =>
  ({ id, title: TITLE, body, trigger, channel, sig: [TITLE, body, trigSig(trigger), channel].join('|') });

const atLocal = (key: string, offsetDays: number, minuteOfDay: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d + offsetDays, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
};
const NINE = 9 * 60;

export interface UdhaarDue { id: string; dueOn: string | null; outstandingPaise: number }
export interface GoalDue { id: string; targetDate: string | null; status: string }

/** Daily reminders, Udhaar due/overdue reminders and goal reminders. Deterministic for a given input. */
export function planManaged(i: { now: Date; settings: NotificationSettings; udhaar: readonly UdhaarDue[]; goals: readonly GoalDue[] }): Planned[] {
  const s = i.settings; if (!s.notifEnabled) return [];
  const q = quietOf(s); const out: Planned[] = [];
  const t = parseHHMM(s.notifTime) ?? 20 * 60;
  const daily = (id: string, body: string, min: number) => {
    const m = shiftMinute(min % 1440, q);
    out.push(mk(id, body, { kind: 'daily', hour: Math.floor(m / 60), minute: m % 60 }, 'reminders'));
  };
  // staggered so the notifications don't land at the same instant
  if (s.notifDaily && s.notifExpense) daily('hk:daily-expense', MSG.expense, t);
  if (s.notifDaily && s.notifSavings) daily('hk:daily-savings', MSG.savings, t + 10);
  if (s.notifSummary) daily('hk:daily-summary', MSG.summary, t + 30);

  const once = (id: string, body: string, at: Date | undefined) => { if (at) out.push(mk(id, body, { kind: 'date', at: shiftDate(at, q) }, 'reminders')); };
  const firstFuture = (cands: Date[]) => cands.find((d) => d > i.now);

  if (s.notifUdhaar) for (const u of i.udhaar) {
    if (!u.dueOn || u.outstandingPaise <= 0) continue;
    once(`hk:udhaar-due:${u.id}`, MSG.udhaarSoon, firstFuture([atLocal(u.dueOn, -1, NINE), atLocal(u.dueOn, 0, NINE)]));
    once(`hk:udhaar-overdue:${u.id}`, MSG.udhaarOverdue, firstFuture([atLocal(u.dueOn, 1, NINE)]));
  }
  if (s.notifSavings) for (const g of i.goals) {
    if (g.status !== 'active' || !g.targetDate) continue;
    once(`hk:goal:${g.id}`, MSG.goal, firstFuture([atLocal(g.targetDate, -7, NINE), atLocal(g.targetDate, 0, NINE)]));
  }
  return dedupe(out);
}

export interface BudgetAlertIn { budgetId: string; label: string; overall: boolean; threshold: number; period: string }
export function planBudget(alerts: readonly BudgetAlertIn[], settings: NotificationSettings, now: Date): Planned[] {
  if (!settings.notifEnabled || !settings.notifBudget) return [];
  const q = quietOf(settings);
  return dedupe(alerts.map((a) => {
    const body = `You have used ${a.threshold}% of your ${a.overall ? 'monthly' : a.label} budget${a.overall ? '' : ' this month'}.`;
    const at = shiftDate(now, q);
    return mk(`hk:budget:${a.budgetId}:${a.period}:${a.threshold}`, body, at === now ? { kind: 'now' } : { kind: 'date', at }, 'alerts');
  }));
}

function dedupe(p: Planned[]): Planned[] { return [...new Map(p.map((x) => [x.id, x])).values()]; }

export const NOTIF_KEYS = ['notifEnabled', 'notifDaily', 'notifExpense', 'notifSavings', 'notifBudget', 'notifUdhaar', 'notifSummary', 'notifTime', 'quietEnabled', 'quietStart', 'quietEnd'] as const;
/** Changes whenever any notification-related setting changes; used to re-sync schedules. */
export const notifFingerprint = (s: NotificationSettings) => NOTIF_KEYS.map((k) => String(s[k])).join('|');
