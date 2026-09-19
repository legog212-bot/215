import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, supabaseConfigured } from '@/lib/supabase/server';
import { createSessionClient } from '@/lib/supabase/session';
import { endTime, pickMasterForSlot, servicesDuration } from '@/lib/booking';
import { normalizePhone } from '@/lib/phone';
import { rateLimitOk } from '@/lib/rate-limit';
import { sendWhatsAppTemplate, whatsappConfigured } from '@/lib/whatsapp';
import { bookingDates } from '@/lib/slots';
import { serviceName } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  // honeypot — silently accept so bots think they succeeded
  if (typeof body.website === 'string' && body.website) {
    return NextResponse.json({ ok: true, orderNumber: 'BK-0000-0000', cancelToken: 'x' });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  if (!rateLimitOk(`booking:${ip}`)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const name = String(body.name ?? '').trim();
  const surname = String(body.surname ?? '').trim();
  const comment = String(body.comment ?? '').trim();
  const locale = ['ka', 'ru', 'en'].includes(String(body.locale)) ? String(body.locale) : 'ka';
  const serviceIds = Array.isArray(body.serviceIds)
    ? body.serviceIds.filter((s): s is string => typeof s === 'string')
    : [];
  const date = String(body.date ?? '');
  const start = String(body.start ?? '');
  const requestedMaster = typeof body.masterId === 'string' ? body.masterId : null;

  if (!name || !surname) return NextResponse.json({ error: 'fields' }, { status: 400 });
  if (!serviceIds.length) return NextResponse.json({ error: 'services' }, { status: 400 });
  if (!DATE_RE.test(date) || !bookingDates().includes(date))
    return NextResponse.json({ error: 'date' }, { status: 400 });
  if (!TIME_RE.test(start)) return NextResponse.json({ error: 'time' }, { status: 400 });

  const phone = normalizePhone(String(body.phone ?? ''));
  if (!phone) return NextResponse.json({ error: 'phone' }, { status: 400 });

  // force = admin override (skip conflict check) — requires a logged-in session
  let force = false;
  if (body.force === true) {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    force = Boolean(user);
  }

  const supabase = createServiceClient();
  const duration = await servicesDuration(supabase, serviceIds);
  if (duration <= 0) return NextResponse.json({ error: 'services' }, { status: 400 });

  let masterId: string | null;
  if (force) {
    masterId = requestedMaster;
  } else {
    masterId = await pickMasterForSlot({
      supabase,
      date,
      start,
      durationMinutes: duration,
      preferredId: requestedMaster,
    });
    if (!masterId) return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
  }

  const cancelToken = crypto.randomUUID();
  const source: 'admin' | 'client' = force ? 'admin' : (await isAdmin()) ? 'admin' : 'client';

  const { data, error } = await supabase.rpc('create_booking', {
    p_master_id: masterId,
    p_date: date,
    p_start: start,
    p_end: endTime(start, duration),
    p_name: name,
    p_surname: surname,
    p_phone: phone,
    p_comment: comment,
    p_service_ids: serviceIds,
    p_source: source,
    p_cancel_token: cancelToken,
  });

  if (error) {
    // unique_active_booking violation — the slot was grabbed between our check and insert
    if (error.code === '23505') {
      return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }

  const orderNumber = (data as { order_number: string }).order_number;
  const whatsappSent = await notifyClient(req, {
    phone,
    name,
    orderNumber,
    serviceIds,
    date,
    start,
    cancelToken,
    locale,
  });
  if (whatsappSent) {
    await supabase.from('bookings').update({ whatsapp_sent: true }).eq('id', data.id);
  }
  await notifyManager(req, { phone, name, surname, orderNumber, date, start });

  return NextResponse.json({ ok: true, orderNumber, cancelToken, whatsappSent });
}

async function isAdmin(): Promise<boolean> {
  try {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

function siteUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
}

async function notifyClient(
  req: NextRequest,
  p: {
    phone: string;
    name: string;
    orderNumber: string;
    serviceIds: string[];
    date: string;
    start: string;
    cancelToken: string;
    locale: string;
  }
): Promise<boolean> {
  if (!whatsappConfigured()) return false;
  try {
    const supabase = createServiceClient();
    const { data: services } = await supabase
      .from('services')
      .select('name_ka, name_ru')
      .in('id', p.serviceIds);
    const names = (services ?? []).map((s) => serviceName(s, p.locale)).join(', ');
    const manageUrl = `${siteUrl(req)}/${p.locale}/manage/${p.cancelToken}`;

    return await sendWhatsAppTemplate({
      to: p.phone,
      template: process.env.WHATSAPP_TEMPLATE_NAME ?? 'booking_confirmation',
      locale: p.locale,
      bodyParams: [p.name, p.orderNumber, names, p.date, p.start, manageUrl],
    });
  } catch {
    return false;
  }
}

async function notifyManager(
  req: NextRequest,
  p: { phone: string; name: string; surname: string; orderNumber: string; date: string; start: string }
): Promise<void> {
  const managerPhone = process.env.MANAGER_WHATSAPP_NUMBER;
  if (!whatsappConfigured() || !managerPhone) return;
  try {
    await sendWhatsAppTemplate({
      to: managerPhone,
      template: process.env.WHATSAPP_MANAGER_TEMPLATE_NAME ?? 'booking_confirmation',
      locale: 'ka',
      bodyParams: [
        `${p.name} ${p.surname}`,
        p.orderNumber,
        p.phone,
        p.date,
        p.start,
        siteUrl(req),
      ],
    });
  } catch {
    // notification to manager is best-effort
  }
}
