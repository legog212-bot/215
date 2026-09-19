import { TIMEZONE } from './constants';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const weekdayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  weekday: 'short',
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Current date in Tbilisi, "YYYY-MM-DD" */
export function todayTbilisi(now = new Date()): string {
  return dateFmt.format(now);
}

/** Current time in Tbilisi, "HH:MM" */
export function timeNowTbilisi(now = new Date()): string {
  return timeFmt.format(now);
}

/** Day of week (0=Sun..6=Sat) for a "YYYY-MM-DD" date, in Tbilisi. */
export function dayOfWeek(dateStr: string): number {
  // noon UTC is safely inside the same calendar day in UTC+4
  const d = new Date(`${dateStr}T12:00:00Z`);
  return WEEKDAY_INDEX[weekdayFmt.format(d)];
}

/** Add n days to "YYYY-MM-DD", returns "YYYY-MM-DD". */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM" -> minutes since midnight. Accepts "HH:MM:SS" too. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** minutes since midnight -> "HH:MM" */
export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
