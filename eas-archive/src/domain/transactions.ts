import { isValidPaise } from './money';

export type TxnType = 'income' | 'expense' | 'transfer';

export interface Txn {
  id: string;
  type: TxnType;
  amountPaise: number;
  accountId: string;        // source account (or the account for income/expense)
  toAccountId?: string | null; // transfers only
  categoryId?: string | null;
  occurredAt: string;       // ISO-8601 UTC
}

export interface AccountLite {
  id: string;
  openingBalancePaise: number; // may be negative (e.g. credit card)
  archived?: boolean;
}

/** Balance = opening + income - expense - transfers out + transfers in. */
export function accountBalance(account: AccountLite, txns: readonly Txn[]): number {
  let b = account.openingBalancePaise;
  for (const t of txns) {
    if (t.type === 'income' && t.accountId === account.id) b += t.amountPaise;
    else if (t.type === 'expense' && t.accountId === account.id) b -= t.amountPaise;
    else if (t.type === 'transfer') {
      if (t.accountId === account.id) b -= t.amountPaise;
      if (t.toAccountId === account.id) b += t.amountPaise;
    }
  }
  return b;
}

export interface Totals { incomePaise: number; expensePaise: number; netPaise: number }

/** Period totals in [fromISO, toISO). Transfers are excluded by design. */
export function periodTotals(txns: readonly Txn[], fromISO: string, toISO: string): Totals {
  let income = 0, expense = 0;
  for (const t of txns) {
    if (t.occurredAt < fromISO || t.occurredAt >= toISO) continue;
    if (t.type === 'income') income += t.amountPaise;
    else if (t.type === 'expense') expense += t.amountPaise;
  }
  return { incomePaise: income, expensePaise: expense, netPaise: income - expense };
}

export function categoryExpenseTotals(txns: readonly Txn[], fromISO: string, toISO: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (t.type !== 'expense' || t.occurredAt < fromISO || t.occurredAt >= toISO) continue;
    const k = t.categoryId ?? 'uncategorised';
    out[k] = (out[k] ?? 0) + t.amountPaise;
  }
  return out;
}

export interface TxnInput {
  type: TxnType;
  amountPaise: number;
  accountId: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  occurredAt: string;
}

export function validateTransaction(i: TxnInput): string[] {
  const errors: string[] = [];
  if (!isValidPaise(i.amountPaise)) errors.push('Enter an amount greater than zero.');
  if (!i.accountId) errors.push('Choose an account.');
  if (Number.isNaN(Date.parse(i.occurredAt))) errors.push('Choose a valid date.');
  if (i.type === 'transfer') {
    if (!i.toAccountId) errors.push('Choose a destination account.');
    else if (i.toAccountId === i.accountId) errors.push('Source and destination must be different accounts.');
  } else if (i.toAccountId) errors.push('Only transfers have a destination account.');
  return errors;
}

/** Overdraft policy: not allowed by default. */
export function wouldOverdraw(balancePaise: number, outgoingPaise: number, allowOverdraft = false): boolean {
  return !allowOverdraft && balancePaise - outgoingPaise < 0;
}
