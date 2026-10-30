/** All money is integer paise. Never use float rupees as a source of truth. */
export const MAX_PAISE = 1_000_000_000_000; // ₹10,000,000,000 – far below 2^53

export function isValidPaise(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= MAX_PAISE;
}

/** Strict parse of user text ("₹1,250.5") into paise. Returns null if invalid. No float math. */
export function parseRupeesToPaise(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, '');
  const m = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return paise > 0 && paise <= MAX_PAISE ? paise : null;
}

/** Same as parse but allows zero (opening balances). */
export function parseRupeesAllowZero(input: string): number | null {
  if (input.trim() === '') return 0;
  const s = input.replace(/[₹,\s]/g, '');
  if (/^0+(\.0{1,2})?$/.test(s)) return 0;
  return parseRupeesToPaise(input);
}

/** Indian digit grouping: 1234567.5 -> ₹12,34,567.50 ; keeps sign. */
export function formatPaise(paise: number, opts: { showSign?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  let r = String(rupees);
  if (r.length > 3) {
    const last3 = r.slice(-3);
    const rest = r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    r = `${rest},${last3}`;
  }
  const sign = neg ? '-' : opts.showSign && abs > 0 ? '+' : '';
  return `${sign}₹${r}.${String(p).padStart(2, '0')}`;
}
