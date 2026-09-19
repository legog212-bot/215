import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { createAnonServerClient, supabaseConfigured } from '@/lib/supabase/server';
import { BookingFlow } from '@/components/booking-flow';
import type { Master, Service, ServiceCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BookingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booking' });

  let categories: ServiceCategory[] = [];
  let services: Service[] = [];
  let masters: Master[] = [];

  if (supabaseConfigured()) {
    const supabase = createAnonServerClient();
    const [{ data: cats }, { data: svcs }, { data: mstrs }] = await Promise.all([
      supabase.from('service_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('services').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('masters').select('*').eq('is_active', true).order('created_at'),
    ]);
    categories = cats ?? [];
    services = svcs ?? [];
    masters = mstrs ?? [];
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">{t('title')}</h1>
      <Suspense>
        <BookingFlow categories={categories} services={services} masters={masters} />
      </Suspense>
    </div>
  );
}
