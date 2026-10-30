import { isValidPaise } from './money';
import { isValidDateKey } from '../utils/dates';

export type UdhaarKind = 'lent' | 'borrowed';
export interface RecordInput { kind: UdhaarKind; personName: string; principalPaise: number; occurredOn: string; dueOn?: string | null }

export const outstandingPaise = (principalPaise: number, repaidPaise: number) => principalPaise - repaidPaise;
export const isSettled = (principalPaise: number, repaidPaise: number) => repaidPaise >= principalPaise;

export function validateRecord(i: RecordInput): string[] {
  const e: string[] = [];
  if (!i.personName.trim()) e.push("Enter the person's name.");
  else if (i.personName.trim().length > 80) e.push('Name is too long.');
  if (i.kind !== 'lent' && i.kind !== 'borrowed') e.push('Choose lent or borrowed.');
  if (!isValidPaise(i.principalPaise)) e.push('Enter an amount greater than zero.');
  if (!isValidDateKey(i.occurredOn)) e.push('Use a valid date (YYYY-MM-DD).');
  if (i.dueOn) {
    if (!isValidDateKey(i.dueOn)) e.push('Use a valid due date (YYYY-MM-DD).');
    else if (isValidDateKey(i.occurredOn) && i.dueOn < i.occurredOn) e.push('Due date cannot be before the date of the record.');
  }
  return e;
}

export function validateRepayment(outstanding: number, amountPaise: number, paidOn: string): string[] {
  const e: string[] = [];
  if (!isValidPaise(amountPaise)) e.push('Enter an amount greater than zero.');
  else if (amountPaise > outstanding) e.push('That is more than the outstanding amount.');
  if (!isValidDateKey(paidOn)) e.push('Use a valid date (YYYY-MM-DD).');
  return e;
}

/** Changing the principal may never drop below what has already been repaid. */
export const validatePrincipalEdit = (newPrincipal: number, repaid: number) =>
  newPrincipal < repaid ? 'Amount cannot be less than what has already been repaid.' : null;

export const isOverdue = (dueOn: string | null | undefined, outstanding: number, today: string) =>
  !!dueOn && outstanding > 0 && dueOn < today;

export function daysUntilDue(dueOn: string, today: string): number {
  const p = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(dueOn) - p(today)) / 86_400_000);
}

export interface Summary { lentPaise: number; toReceivePaise: number; borrowedPaise: number; toRepayPaise: number }
/** lent/borrowed = total principal; toReceive/toRepay = what is still outstanding. None of it is income or expense. */
export function summarize(records: readonly { kind: UdhaarKind; principalPaise: number; repaidPaise: number }[]): Summary {
  const s: Summary = { lentPaise: 0, toReceivePaise: 0, borrowedPaise: 0, toRepayPaise: 0 };
  for (const r of records) {
    const out = outstandingPaise(r.principalPaise, r.repaidPaise);
    if (r.kind === 'lent') { s.lentPaise += r.principalPaise; s.toReceivePaise += out; }
    else { s.borrowedPaise += r.principalPaise; s.toRepayPaise += out; }
  }
  return s;
}
