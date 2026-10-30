/** Exact decimal string from integer paise (no floats): 12550 -> "125.50". */
export function paiseToDecimal(p: number): string {
  const a = Math.abs(p);
  return `${p < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** Spreadsheet formula-injection guard for user-controlled text: a leading = + - @ tab or CR gets a leading apostrophe. */
export const neutralizeFormula = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function csvCell(value: string | number | null | undefined, userText = false): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (userText) s = neutralizeFormula(s);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvColumn { name: string; userText?: boolean }
/** UTF-8 BOM (so Excel reads ₹ and Hindi names correctly), CRLF line endings, RFC 4180 quoting. */
export function toCsv(columns: readonly CsvColumn[], rows: readonly (string | number | null)[][]): string {
  const head = columns.map((c) => csvCell(c.name)).join(',');
  const body = rows.map((r) => columns.map((c, i) => csvCell(r[i], c.userText)).join(','));
  return '\uFEFF' + [head, ...body].join('\r\n') + '\r\n';
}
