import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { createAnonServerClient, supabaseConfigured } from '@/lib/supabase/server';
import { BookingFlow } from '@/components/booking-flow';
import type { Master, Service, ServiceCategory } from '@/lib/types';

import { routing } from '@/i18n/routing';

export const revalidate = 60;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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
    const [{ data: cats }, { data: svcs }, { data: mstrs }, mCatsRes] = await Promise.all([
      supabase.from('service_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('services').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('masters').select('*').eq('is_active', true).order('created_at'),
      supabase.from('master_categories').select('*').then((r) => r.data ?? [], () => []),
    ]);
    categories = cats ?? [];
    services = svcs ?? [];
    const mCats = Array.isArray(mCatsRes) ? mCatsRes : [];
    const catMap = new Map<string, string[]>();
    for (const mc of mCats) {
      if (!catMap.has(mc.master_id)) catMap.set(mc.master_id, []);
      catMap.get(mc.master_id)!.push(mc.category_id);
    }
    masters = (mstrs ?? [])
      .filter((m) => !(m as Master).is_deleted)
      .map((m) => ({
        ...m,
        category_ids: catMap.get(m.id) ?? [],
      }));
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
