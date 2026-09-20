import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, supabaseConfigured } from '@/lib/supabase/server';
import { createSessionClient } from '@/lib/supabase/session';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { sendWhatsAppTemplate, whatsappConfigured } from '@/lib/whatsapp';
import { serviceName } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Manual / retry endpoint: re-send the WhatsApp confirmation for a booking.
 * POST { bookingId } — admin only (session-checked).
 */
export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (!whatsappConfigured()) {
    return NextResponse.json({ sent: false, reason: 'whatsapp not configured' });
  }

  // admin-only: signed admin cookie or an authenticated Supabase session
  let isAdmin = await verifyAdminSession(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!isAdmin) {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    isAdmin = Boolean(user);
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { bookingId, locale = 'ka' } = await req.json();
  if (!bookingId) return NextResponse.json({ error: 'bookingId' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: b } = await supabase
    .from('bookings')
    .select('*, booking_services(services(name_ka, name_ru, name_en))')
    .eq('id', bookingId)
    .single();
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const names = (b.booking_services ?? [])
    .map((bs: { services: { name_ka: string; name_ru: string; name_en: string | null } | null }) =>
      bs.services ? serviceName(bs.services, locale) : ''
    )
    .filter(Boolean)
    .join(', ');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;

  const sent = await sendWhatsAppTemplate({
    to: b.client_phone,
    template: process.env.WHATSAPP_TEMPLATE_NAME ?? 'booking_confirmation',
    locale,
    bodyParams: [
      b.client_name,
      b.order_number,
      names,
      b.booking_date,
      String(b.start_time).slice(0, 5),
      `${siteUrl}/${locale}/manage/${b.cancel_token}`,
    ],
  });

  if (sent) {
    await supabase.from('bookings').update({ whatsapp_sent: true }).eq('id', bookingId);
  }
  return NextResponse.json({ sent });
}
