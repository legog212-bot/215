import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, supabaseConfigured } from '@/lib/supabase/server';
import { createSessionClient } from '@/lib/supabase/session';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { endTime, pickMasterForSlot, servicesDuration } from '@/lib/booking';
import { normalizePhone } from '@/lib/phone';
import { rateLimitOk } from '@/lib/rate-limit';
import { sendWhatsAppTemplate, whatsappConfigured } from '@/lib/whatsapp';
import { bookingDates } from '@/lib/slots';
import { timeToMinutes } from '@/lib/tz';
import { serviceName } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const MAX_LEGS = 10;

interface RawLeg {
  serviceIds?: unknown;
  masterId?: unknown;
  date?: unknown;
  start?: unknown;
}

interface Leg {
  serviceIds: string[];
  masterId: string | null;
  date: string;
  start: string;
}

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

  // legs = one item per separately-scheduled service; the legacy flat shape
  // (serviceIds+date+start) is treated as a single leg so older callers work.
  const rawLegs: RawLeg[] = Array.isArray(body.legs)
    ? (body.legs as RawLeg[])
    : [{ serviceIds: body.serviceIds, masterId: body.masterId, date: body.date, start: body.start }];

  if (!name || !surname) return NextResponse.json({ error: 'fields' }, { status: 400 });
  if (!rawLegs.length || rawLegs.length > MAX_LEGS) {
    return NextResponse.json({ error: 'services' }, { status: 400 });
  }

  const validDates = bookingDates();
  const legs: Leg[] = [];
  for (const raw of rawLegs) {
    const serviceIds = Array.isArray(raw.serviceIds)
      ? raw.serviceIds.filter((s): s is string => typeof s === 'string')
      : [];
    const date = String(raw.date ?? '');
    const start = String(raw.start ?? '');
    if (!serviceIds.length) return NextResponse.json({ error: 'services' }, { status: 400 });
    if (!DATE_RE.test(date) || !validDates.includes(date)) {
      return NextResponse.json({ error: 'date' }, { status: 400 });
    }
    if (!TIME_RE.test(start)) return NextResponse.json({ error: 'time' }, { status: 400 });
    legs.push({
      serviceIds,
      masterId: typeof raw.masterId === 'string' && raw.masterId ? raw.masterId : null,
      date,
      start,
    });
  }

  const phone = normalizePhone(String(body.phone ?? ''));
  if (!phone) return NextResponse.json({ error: 'phone' }, { status: 400 });

  const isManager = await isAdmin(req);
  const force = body.force === true && isManager;

  const supabase = createServiceClient();

  // durations per leg (a leg may still bundle several services sequentially)
  const durations: number[] = [];
  for (const leg of legs) {
    const d = await servicesDuration(supabase, leg.serviceIds);
    if (d <= 0) return NextResponse.json({ error: 'services' }, { status: 400 });
    durations.push(d);
  }

  // the visitor can't be in two places at once — legs must not overlap,
  // no matter which masters they end up with
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      if (legs[i].date !== legs[j].date) continue;
      const a0 = timeToMinutes(legs[i].start);
      const a1 = a0 + durations[i];
      const b0 = timeToMinutes(legs[j].start);
      const b1 = b0 + durations[j];
      if (a0 < b1 && b0 < a1) {
        return NextResponse.json({ error: 'legs_overlap' }, { status: 409 });
      }
    }
  }

  // resolve a master for every leg against real salon occupancy
  for (let i = 0; i < legs.length; i++) {
    if (force) continue;
    const masterId = await pickMasterForSlot({
      supabase,
      date: legs[i].date,
      start: legs[i].start,
      durationMinutes: durations[i],
      preferredId: legs[i].masterId,
      serviceIds: legs[i].serviceIds,
      allowDayOff: isManager,
    });
    if (!masterId) {
      return NextResponse.json({ error: 'slot_taken', leg: i }, { status: 409 });
    }
    legs[i].masterId = masterId;
  }

  const { data, error } = await supabase.rpc('create_booking_group', {
    p_name: name,
    p_surname: surname,
    p_phone: phone,
    p_comment: comment,
    p_source: isManager ? 'admin' : 'client',
    p_legs: legs.map((l, i) => ({
      master_id: l.masterId,
      date: l.date,
      start: l.start,
      end: endTime(l.start, durations[i]),
      service_ids: l.serviceIds,
    })),
  });

  if (error) {
    // unique_active_booking violation — a slot was grabbed between check and insert
    if (error.code === '23505') {
      return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }

  const { order_number: orderNumber, group_id: groupId } = data as {
    order_number: string;
    group_id: string;
  };

  const whatsappSent = await notifyClient(req, {
    phone,
    name,
    orderNumber,
    legs,
    groupId,
    locale,
  });
  if (whatsappSent) {
    await supabase.from('bookings').update({ whatsapp_sent: true }).eq('group_id', groupId);
  }
  await notifyManager(req, {
    phone,
    name,
    surname,
    orderNumber,
    date: legs[0].date,
    start: legs[0].start,
  });

  return NextResponse.json({ ok: true, orderNumber, cancelToken: groupId, whatsappSent });
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  if (await verifyAdminSession(req.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return true;
  }
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
    legs: Leg[];
    groupId: string;
    locale: string;
  }
): Promise<boolean> {
  if (!whatsappConfigured()) return false;
  try {
    const supabase = createServiceClient();
    const allIds = [...new Set(p.legs.flatMap((l) => l.serviceIds))];
    const { data: services } = await supabase
      .from('services')
      .select('id, name_ka, name_ru, name_en')
      .in('id', allIds);
    const byId = new Map((services ?? []).map((s) => [s.id, s]));
    // one line per leg: "Стрижка · 12.05 11:00"
    const schedule = p.legs
      .map((l) => {
        const names = l.serviceIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((s) => serviceName(s!, p.locale))
          .join(' + ');
        return `${names} · ${l.date} ${l.start}`;
      })
      .join(', ');
    const manageUrl = `${siteUrl(req)}/${p.locale}/manage/${p.groupId}`;

    return await sendWhatsAppTemplate({
      to: p.phone,
      template: process.env.WHATSAPP_TEMPLATE_NAME ?? 'booking_confirmation',
      locale: p.locale,
      bodyParams: [p.name, p.orderNumber, schedule, p.legs[0].date, p.legs[0].start, manageUrl],
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
