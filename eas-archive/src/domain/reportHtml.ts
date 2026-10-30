export interface ReportSection { heading: string; columns: string[]; rows: string[][]; rightAlign?: number[] }
export interface ReportDoc { title: string; subtitle: string; summary: { label: string; value: string }[]; sections: ReportSection[]; note?: string }

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Printable report. All text, including user-entered descriptions, is HTML-escaped. */
export function buildReportHtml(d: ReportDoc, generatedAt: string): string {
  const sec = (s: ReportSection) => {
    const right = new Set(s.rightAlign ?? []);
    const th = s.columns.map((c, i) => `<th${right.has(i) ? ' class="r"' : ''}>${escapeHtml(c)}</th>`).join('');
    const rows = s.rows.length
      ? s.rows.map((r) => `<tr>${r.map((c, i) => `<td${right.has(i) ? ' class="r"' : ''}>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${s.columns.length}">No records in this period.</td></tr>`;
    return `<h2>${escapeHtml(s.heading)}</h2><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
  };
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { margin: 18mm 14mm; }
body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #202522; font-size: 11px; }
h1 { color: #176B4D; font-size: 20px; margin: 0 0 2px; } .sub { color: #737B75; margin-bottom: 14px; }
h2 { font-size: 14px; margin: 18px 0 6px; color: #104B38; }
.sum { display: flex; flex-wrap: wrap; gap: 8px; } .sum div { border: 1px solid #E7ECE8; border-radius: 8px; padding: 6px 10px; min-width: 110px; }
.sum b { display: block; font-size: 13px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border-bottom: 1px solid #E7ECE8; padding: 4px 5px; text-align: left; word-wrap: break-word; overflow-wrap: anywhere; vertical-align: top; }
th { background: #EAF5EF; } .r { text-align: right; }
thead { display: table-header-group; } tr { page-break-inside: avoid; }
.foot { margin-top: 18px; color: #737B75; font-size: 10px; }
</style></head><body>
<h1>${escapeHtml(d.title)}</h1><div class="sub">Hisab Kitab · ${escapeHtml(d.subtitle)}</div>
<div class="sum">${d.summary.map((x) => `<div>${escapeHtml(x.label)}<b>${escapeHtml(x.value)}</b></div>`).join('')}</div>
${d.sections.map(sec).join('')}
<div class="foot">${d.note ? escapeHtml(d.note) + '<br>' : ''}Generated ${escapeHtml(generatedAt)} on your device. Powered by KP Groups.</div>
</body></html>`;
}
