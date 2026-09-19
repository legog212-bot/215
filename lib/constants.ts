export const TIMEZONE = 'Asia/Tbilisi';
export const SLOT_STEP_MINUTES = 60;
export const MAX_BOOKING_DAYS_AHEAD = 21;
// don't offer slots that start sooner than this from now (today only)
export const MIN_LEAD_MINUTES = 30;
// anti-spam: max bookings per IP per window
export const RATE_LIMIT_MAX = 3;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
