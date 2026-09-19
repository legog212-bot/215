import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, supabaseConfigured } from '@/lib/supabase/server';
import { availableSlots, availableSlotsSummary, servicesDuration } from '@/lib/booking';
import { bookingDates } from '@/lib/slots';
import { todayTbilisi } from '@/lib/tz';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  const p = req.nextUrl.searchParams;
  const mode = p.get('mode') ?? 'day';
  const masterId = p.get('master');
  const serviceIds = (p.get('services') ?? '').split(',').filter(Boolean);

  const supabase = createServiceClient();
  const duration = await servicesDuration(supabase, serviceIds);
  if (duration <= 0) return NextResponse.json({ error: 'services' }, { status: 400 });

  const master = masterId && masterId !== 'any' ? masterId : null;

  if (mode === 'summary') {
    const days = await availableSlotsSummary({
      supabase,
      dates: bookingDates(),
      masterId: master,
      durationMinutes: duration,
    });
    const res = NextResponse.json({ days });
    res.headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    return res;
  }

  const date = p.get('date') ?? '';
  if (!DATE_RE.test(date) || date < todayTbilisi()) {
    return NextResponse.json({ error: 'date' }, { status: 400 });
  }
  const slots = await availableSlots({ supabase, date, masterId: master, durationMinutes: duration });
  const res = NextResponse.json({ slots });
  res.headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
  return res;
}
