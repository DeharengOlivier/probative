/** Small deterministic Markdown helpers. No template engine, no dependency. */

export function heading(level, text) {
  return `${'#'.repeat(level)} ${text}\n`;
}

export function paragraph(text) {
  return `${text}\n`;
}

/** Escape the pipe so a cell never breaks the table it sits in. */
export function cell(value) {
  if (value === null || value === undefined) return '-';
  return String(value).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim() || '-';
}

export function table(headers, rows) {
  if (rows.length === 0) return '';
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(cell).join(' | ')} |`).join('\n');
  return `${head}\n${rule}\n${body}\n`;
}

export function bullets(items) {
  if (items.length === 0) return '';
  return `${items.map((item) => `- ${item}`).join('\n')}\n`;
}

export function quote(text) {
  return `${text.split('\n').map((line) => `> ${line}`).join('\n')}\n`;
}

export function section(...parts) {
  return parts.filter((part) => part && part.length > 0).join('\n');
}

export const STATUS_LABEL = Object.freeze({
  verified: 'Verified',
  declared: 'Declared',
  partial: 'Partial',
  missing: 'Missing',
  stale: 'Stale',
  not_applicable: 'Not applicable',
  error: 'Error',
  needs_expert_review: 'Needs expert review',
});
