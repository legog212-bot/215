import {
  MAX_BOOKING_DAYS_AHEAD,
  MIN_LEAD_MINUTES,
  SLOT_STEP_MINUTES,
} from './constants';
import { addDays, timeNowTbilisi, timeToMinutes, minutesToTime, todayTbilisi } from './tz';

export interface ExistingBooking {
  start_time: string;
  end_time: string;
}

/**
 * Available start times ("HH:MM") for a single open day.
 * A slot is free when [slot, slot+duration) doesn't intersect any existing
 * booking and fits inside [openTime, closeTime).
 */
export function computeSlots(params: {
  date: string; // YYYY-MM-DD
  openTime: string; // HH:MM
  closeTime: string;
  durationMinutes: number;
  existing: ExistingBooking[];
  now?: Date;
}): string[] {
  const { date, openTime, closeTime, durationMinutes, existing } = params;
  const open = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  const busy = existing.map((b) => ({
    start: timeToMinutes(b.start_time),
    end: timeToMinutes(b.end_time),
  }));

  // today: cut slots that already passed (+ lead time so nobody books "right now")
  let minStart = open;
  if (date === todayTbilisi(params.now)) {
    minStart = Math.max(minStart, timeToMinutes(timeNowTbilisi(params.now)) + MIN_LEAD_MINUTES);
  }

  const slots: string[] = [];
  for (let t = open; t + durationMinutes <= close; t += SLOT_STEP_MINUTES) {
    if (t < minStart) continue;
    const end = t + durationMinutes;
    const overlaps = busy.some((b) => t < b.end && b.start < end);
    if (!overlaps) slots.push(minutesToTime(t));
  }
  return slots;
}

/** The next `days` calendar dates starting from today (Tbilisi). */
export function bookingDates(days = MAX_BOOKING_DAYS_AHEAD, now = new Date()): string[] {
  const today = todayTbilisi(now);
  return Array.from({ length: days + 1 }, (_, i) => addDays(today, i));
}
