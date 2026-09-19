import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, supabaseConfigured } from '@/lib/supabase/server';
import { endTime, pickMasterForSlot } from '@/lib/booking';
import { sendWhatsAppTemplate, whatsappConfigured } from '@/lib/whatsapp';
import { bookingDates } from '@/lib/slots';
import { serviceName, type BookingDetails } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  const { token } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase.rpc('get_booking_by_token', { p_token: token });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: booking } = await supabase.rpc('get_booking_by_token', { p_token: token });
  if (!booking) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const b = booking as BookingDetails;
  if (b.status !== 'confirmed') {
    return NextResponse.json({ error: 'not_editable' }, { status: 400 });
  }

  let body: { action?: string; date?: string; start?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  if (body.action === 'cancel') {
    const { data } = await supabase.rpc('cancel_booking_by_token', { p_token: token });
    return NextResponse.json(data);
  }

  if (body.action === 'reschedule') {
    const date = String(body.date ?? '');
    const start = String(body.start ?? '');
    if (!DATE_RE.test(date) || !bookingDates().includes(date))
      return NextResponse.json({ error: 'date' }, { status: 400 });
    if (!TIME_RE.test(start)) return NextResponse.json({ error: 'time' }, { status: 400 });

    const duration = b.services.reduce((a, s) => a + s.duration_minutes, 0);
    const masterId = await pickMasterForSlot({
      supabase,
      date,
      start,
      durationMinutes: duration,
      preferredId: b.master_id,
    });
    if (!masterId) return NextResponse.json({ error: 'slot_taken' }, { status: 409 });

    const { data, error } = await supabase.rpc('reschedule_booking_by_token', {
      p_token: token,
      p_date: date,
      p_start: start,
      p_end: endTime(start, duration),
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
      return NextResponse.json({ error: 'server' }, { status: 500 });
    }

    // fresh confirmation with the new time (best-effort)
    if (whatsappConfigured()) {
      try {
        const locale = ['ka', 'ru', 'en'].includes(String(req.nextUrl.searchParams.get('locale')))
          ? String(req.nextUrl.searchParams.get('locale'))
          : 'ka';
        const names = b.services.map((s) => serviceName(s, locale)).join(', ');
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
        await sendWhatsAppTemplate({
          to: b.client_phone,
          template: process.env.WHATSAPP_TEMPLATE_NAME ?? 'booking_confirmation',
          locale,
          bodyParams: [
            b.client_name,
            b.order_number,
            names,
            date,
            start,
            `${siteUrl}/${locale}/manage/${token}`,
          ],
        });
      } catch {
        // best-effort
      }
    }

    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'bad request' }, { status: 400 });
}
