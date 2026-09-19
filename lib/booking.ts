import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSlots } from './slots';
import { dayOfWeek, minutesToTime, timeToMinutes } from './tz';
import type { Master, WorkingHours } from './types';

/** Working hours for a master on a weekday; falls back to the salon-wide row. */
async function hoursFor(
  supabase: SupabaseClient,
  masterId: string | null,
  dow: number
): Promise<WorkingHours | null> {
  if (masterId) {
    const { data } = await supabase
      .from('working_hours')
      .select('*')
      .eq('master_id', masterId)
      .eq('day_of_week', dow)
      .maybeSingle();
    if (data) return data as WorkingHours;
  }
  const { data } = await supabase
    .from('working_hours')
    .select('*')
    .is('master_id', null)
    .eq('day_of_week', dow)
    .maybeSingle();
  return (data as WorkingHours) ?? null;
}

async function busyFor(supabase: SupabaseClient, masterId: string | null, date: string) {
  let q = supabase
    .from('bookings')
    .select('start_time, end_time')
    .eq('booking_date', date)
    .eq('status', 'confirmed');
  q = masterId ? q.eq('master_id', masterId) : q.is('master_id', null);
  const { data } = await q;
  return data ?? [];
}

export async function activeMasters(supabase: SupabaseClient): Promise<Master[]> {
  const { data } = await supabase
    .from('masters')
    .select('*')
    .eq('is_active', true)
    .order('created_at');
  return (data as Master[]) ?? [];
}

/** Total duration of the given service ids (active services only). */
export async function servicesDuration(
  supabase: SupabaseClient,
  serviceIds: string[]
): Promise<number> {
  if (!serviceIds.length) return 0;
  const { data } = await supabase
    .from('services')
    .select('duration_minutes')
    .in('id', serviceIds)
    .eq('is_active', true);
  return (data ?? []).reduce((a, s) => a + (s.duration_minutes ?? 0), 0);
}

/** Slots for one concrete master on a date. */
export async function slotsForMaster(
  supabase: SupabaseClient,
  masterId: string,
  date: string,
  durationMinutes: number
): Promise<string[]> {
  const hours = await hoursFor(supabase, masterId, dayOfWeek(date));
  if (!hours || hours.is_day_off || !hours.open_time || !hours.close_time) return [];
  const existing = await busyFor(supabase, masterId, date);
  return computeSlots({
    date,
    openTime: hours.open_time,
    closeTime: hours.close_time,
    durationMinutes,
    existing,
  });
}

/**
 * Available slots for a date. masterId 'any'/null → union across all active
 * masters (a slot is free if at least one master can take it).
 */
export async function availableSlots(params: {
  supabase: SupabaseClient;
  date: string;
  masterId: string | null;
  durationMinutes: number;
}): Promise<string[]> {
  const { supabase, date, masterId, durationMinutes } = params;
  if (masterId) return slotsForMaster(supabase, masterId, date, durationMinutes);

  const masters = await activeMasters(supabase);
  const all = new Set<string>();
  for (const m of masters) {
    for (const s of await slotsForMaster(supabase, m.id, date, durationMinutes)) all.add(s);
  }
  // salon might have bookings with master_id null — check default hours too
  const hours = await hoursFor(supabase, null, dayOfWeek(date));
  if (masters.length === 0 && hours && !hours.is_day_off && hours.open_time && hours.close_time) {
    const existing = await busyFor(supabase, null, date);
    for (const s of computeSlots({
      date,
      openTime: hours.open_time,
      closeTime: hours.close_time,
      durationMinutes,
      existing,
    }))
      all.add(s);
  }
  return [...all].sort();
}

/**
 * Resolve which master can take [date, start, +duration). If preferredId is
 * given, only that master is considered. Returns master id or null.
 */
export async function pickMasterForSlot(params: {
  supabase: SupabaseClient;
  date: string;
  start: string; // HH:MM
  durationMinutes: number;
  preferredId: string | null;
}): Promise<string | null> {
  const { supabase, date, start, durationMinutes, preferredId } = params;
  const candidates = preferredId
    ? ([{ id: preferredId }] as { id: string }[])
    : await activeMasters(supabase);

  const startMin = timeToMinutes(start);
  const endMin = startMin + durationMinutes;

  for (const m of candidates) {
    const hours = await hoursFor(supabase, m.id, dayOfWeek(date));
    if (!hours || hours.is_day_off || !hours.open_time || !hours.close_time) continue;
    if (startMin < timeToMinutes(hours.open_time) || endMin > timeToMinutes(hours.close_time))
      continue;
    const busy = await busyFor(supabase, m.id, date);
    const overlaps = busy.some(
      (b) => startMin < timeToMinutes(b.end_time) && timeToMinutes(b.start_time) < endMin
    );
    if (!overlaps) return m.id;
  }
  return null;
}

export function endTime(start: string, durationMinutes: number): string {
  return minutesToTime(timeToMinutes(start) + durationMinutes);
}
