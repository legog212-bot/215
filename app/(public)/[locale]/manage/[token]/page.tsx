import { getTranslations } from 'next-intl/server';
import { createServiceClient, supabaseConfigured } from '@/lib/supabase/server';
import { ManageBooking } from '@/components/manage-booking';
import type { BookingDetails } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ManagePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: 'manage' });

  let booking: BookingDetails | null = null;
  if (supabaseConfigured()) {
    const supabase = createServiceClient();
    const { data } = await supabase.rpc('get_booking_by_token', { p_token: token });
    booking = (data as BookingDetails) ?? null;
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">{t('title')}</h1>
      {booking ? (
        <ManageBooking booking={booking} token={token} />
      ) : (
        <p className="text-muted-foreground">{t('notFound')}</p>
      )}
    </div>
  );
}
