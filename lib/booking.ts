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

export async function activeMasters(
  supabase: SupabaseClient,
  serviceIds?: string[]
): Promise<Master[]> {
  const { data } = await supabase
    .from('masters')
    .select('*')
    .eq('is_active', true)
    .order('created_at');

  const list = ((data as Master[]) ?? []).filter((m) => !m.is_deleted);

  if (serviceIds && serviceIds.length > 0) {
    const { data: svcs } = await supabase
      .from('services')
      .select('category_id')
      .in('id', serviceIds);
    const requiredCategoryIds = [...new Set((svcs ?? []).map((s) => s.category_id).filter(Boolean))];

    if (requiredCategoryIds.length > 0) {
      const { data: mc, error } = await supabase
        .from('master_categories')
        .select('master_id, category_id')
        .in('category_id', requiredCategoryIds);

      if (!error && mc && mc.length > 0) {
        const masterCatMap = new Map<string, Set<string>>();
        for (const row of mc) {
          if (!masterCatMap.has(row.master_id)) masterCatMap.set(row.master_id, new Set());
          masterCatMap.get(row.master_id)!.add(row.category_id);
        }

        const qualified = list.filter((m) => {
          const cats = masterCatMap.get(m.id);
          if (!cats) return false;
          return requiredCategoryIds.every((cid) => cats.has(cid));
        });

        if (qualified.length > 0) {
          return qualified;
        }
      }
    }
  }

  return list;
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
  const [hours, existing] = await Promise.all([
    hoursFor(supabase, masterId, dayOfWeek(date)),
    busyFor(supabase, masterId, date),
  ]);
  if (!hours || hours.is_day_off || !hours.open_time || !hours.close_time) return [];
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
 * masters qualified for the given services.
 */
export async function availableSlots(params: {
  supabase: SupabaseClient;
  date: string;
  masterId: string | null;
  durationMinutes: number;
  serviceIds?: string[];
}): Promise<string[]> {
  const { supabase, date, masterId, durationMinutes, serviceIds } = params;
  if (masterId) return slotsForMaster(supabase, masterId, date, durationMinutes);

  const masters = await activeMasters(supabase, serviceIds);
  if (masters.length === 0) {
    const hours = await hoursFor(supabase, null, dayOfWeek(date));
    if (hours && !hours.is_day_off && hours.open_time && hours.close_time) {
      const existing = await busyFor(supabase, null, date);
      return computeSlots({
        date,
        openTime: hours.open_time,
        closeTime: hours.close_time,
        durationMinutes,
        existing,
      });
    }
    return [];
  }

  const slotResults = await Promise.all(
    masters.map((m) => slotsForMaster(supabase, m.id, date, durationMinutes))
  );
  const all = new Set<string>();
  for (const list of slotResults) {
    for (const s of list) all.add(s);
  }
  return [...all].sort();
}

/**
 * High-performance batched summary of available slots across multiple dates.
 * Instead of 100+ sequential round trips, loads working hours and confirmed bookings
 * in 2 parallel queries and computes slots in-memory in ~1ms.
 */
export async function availableSlotsSummary(params: {
  supabase: SupabaseClient;
  dates: string[];
  masterId: string | null;
  durationMinutes: number;
  serviceIds?: string[];
}): Promise<Record<string, number>> {
  const { supabase, dates, masterId, durationMinutes, serviceIds } = params;
  if (!dates.length || durationMinutes <= 0) return {};

  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  let bookingsQuery = supabase
    .from('bookings')
    .select('master_id, booking_date, start_time, end_time')
    .gte('booking_date', minDate)
    .lte('booking_date', maxDate)
    .eq('status', 'confirmed');

  if (masterId) {
    bookingsQuery = bookingsQuery.eq('master_id', masterId);
  }

  const [masters, hoursRes, bookingsRes] = await Promise.all([
    masterId ? Promise.resolve([{ id: masterId }] as Master[]) : activeMasters(supabase, serviceIds),
    supabase.from('working_hours').select('*'),
    bookingsQuery,
  ]);

  const allHours = (hoursRes.data as WorkingHours[]) ?? [];
  const allBookings = (bookingsRes.data as {
    master_id: string | null;
    booking_date: string;
    start_time: string;
    end_time: string;
  }[]) ?? [];

  const bookingsMap = new Map<string, { start_time: string; end_time: string }[]>();
  for (const b of allBookings) {
    const key = `${b.booking_date}:${b.master_id ?? 'null'}`;
    const list = bookingsMap.get(key);
    if (list) {
      list.push({ start_time: b.start_time, end_time: b.end_time });
    } else {
      bookingsMap.set(key, [{ start_time: b.start_time, end_time: b.end_time }]);
    }
  }

  const hoursMap = new Map<string, WorkingHours>();
  for (const h of allHours) {
    hoursMap.set(`${h.master_id ?? 'null'}:${h.day_of_week}`, h);
  }

  const getHours = (mId: string | null, dow: number): WorkingHours | null => {
    if (mId) {
      const specific = hoursMap.get(`${mId}:${dow}`);
      if (specific) return specific;
    }
    return hoursMap.get(`null:${dow}`) ?? null;
  };

  const days: Record<string, number> = {};

  for (const date of dates) {
    const dow = dayOfWeek(date);
    const daySlots = new Set<string>();

    if (masters.length > 0) {
      for (const m of masters) {
        const h = getHours(m.id, dow);
        if (!h || h.is_day_off || !h.open_time || !h.close_time) continue;
        const busy = bookingsMap.get(`${date}:${m.id}`) ?? [];
        const slots = computeSlots({
          date,
          openTime: h.open_time,
          closeTime: h.close_time,
          durationMinutes,
          existing: busy,
        });
        for (const s of slots) daySlots.add(s);
      }
    } else {
      const h = getHours(null, dow);
      if (h && !h.is_day_off && h.open_time && h.close_time) {
        const busy = bookingsMap.get(`${date}:null`) ?? [];
        const slots = computeSlots({
          date,
          openTime: h.open_time,
          closeTime: h.close_time,
          durationMinutes,
          existing: busy,
        });
        for (const s of slots) daySlots.add(s);
      }
    }

    days[date] = daySlots.size;
  }

  return days;
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
  serviceIds?: string[];
  allowDayOff?: boolean;
}): Promise<string | null> {
  const { supabase, date, start, durationMinutes, preferredId, serviceIds, allowDayOff } = params;
  const candidates = preferredId
    ? ([{ id: preferredId }] as { id: string }[])
    : await activeMasters(supabase, serviceIds);

  const startMin = timeToMinutes(start);
  const endMin = startMin + durationMinutes;

  for (const m of candidates) {
    const hours = await hoursFor(supabase, m.id, dayOfWeek(date));
    if (!allowDayOff) {
      if (!hours || hours.is_day_off || !hours.open_time || !hours.close_time) continue;
      if (startMin < timeToMinutes(hours.open_time) || endMin > timeToMinutes(hours.close_time))
        continue;
    }
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
