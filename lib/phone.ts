import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Normalize to E.164 (+995555123456). Returns null if invalid. Defaults to Georgia. */
export function normalizePhone(raw: string): string | null {
  const phone = parsePhoneNumberFromString(raw, 'GE');
  if (!phone || !phone.isValid()) return null;
  return phone.number; // E.164
}
