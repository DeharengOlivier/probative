/**
 * Clock indirection. Every timestamp in a pack comes from here so that a test,
 * or a caller wanting byte-identical output, can pin it. SOURCE_DATE_EPOCH is
 * the reproducible-builds convention and is honoured for the same reason.
 */
export function resolveNow({ nowOverride } = {}) {
  if (nowOverride) {
    const parsed = new Date(nowOverride);
    if (Number.isNaN(parsed.getTime())) throw new Error(`invalid --now value: ${nowOverride}`);
    return parsed;
  }
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000);
  return new Date();
}

export function toIso(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Whole months between two dates, floored. Used for support-period arithmetic. */
export function monthsBetween(from, to) {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

/**
 * Accept the granularity the Regulation itself requires: Article 13(19) asks
 * for at least the month and the year, so 'YYYY-MM' is a valid end date.
 */
export function parseSupportDate(value) {
  if (typeof value !== 'string') return null;
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (monthOnly) {
    const year = Number(monthOnly[1]);
    const month = Number(monthOnly[2]) - 1;
    const date = new Date(Date.UTC(year, month, 1));
    if (Number.isNaN(date.getTime())) return null;
    // '2031-01' denotes the whole of January 2031. Day 0 of the next month is
    // the last day of this one, and handles both leap years and December.
    const latest = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    return { date, latest, granularity: 'month' };
  }
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (full) {
    const date = new Date(`${value.trim()}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    const latest = new Date(date.getTime() + 86399999);
    return { date, latest, granularity: 'day' };
  }
  return null;
}
