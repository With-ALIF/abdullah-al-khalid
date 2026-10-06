// Date helpers. Everything is date-only (YYYY-MM-DD) so no timezone can shift
// a day. We never call `new Date('2024-01-05')` because that is parsed as UTC
// midnight and then rendered in local time, which can move the day backwards.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a YYYY-MM-DD string into {y, m, d}, validating the real calendar day.
 * Returns null when the input is not a valid date-only string.
 */
export function parseISODate(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return { y, m, d };
}

export function isValidISODate(value) {
  return parseISODate(value) !== null;
}

/** Compare two date-only strings. Returns -1, 0 or 1. */
export function compareISODate(a, b) {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  if (!pa || !pb) return null;
  if (pa.y !== pb.y) return pa.y < pb.y ? -1 : 1;
  if (pa.m !== pb.m) return pa.m < pb.m ? -1 : 1;
  if (pa.d !== pb.d) return pa.d < pb.d ? -1 : 1;
  return 0;
}

/** True when `value` is strictly before `other`. Same-day is not before. */
export function isBefore(value, other) {
  const cmp = compareISODate(value, other);
  return cmp !== null && cmp < 0;
}

/** Today's date in the user's local calendar, as YYYY-MM-DD. */
export function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format a date-only string for display. Keeps the digits, adds clarity. */
export function formatISODateForDisplay(value, locale) {
  const parsed = parseISODate(value);
  if (!parsed) return value || '';
  if (locale === 'bn') return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${parsed.d} ${months[parsed.m - 1]} ${parsed.y}`;
}