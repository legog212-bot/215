import { getTranslations } from 'next-intl/server';
import { createServiceClient, supabaseConfigured } from '@/lib/supabase/server';
import { ManageBooking } from '@/components/manage-booking';
import type { VisitDetails } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ManagePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: 'manage' });

  let visit: VisitDetails | null = null;
  if (supabaseConfigured()) {
    const supabase = createServiceClient();
    const { data } = await supabase.rpc('get_visit_by_token', { p_token: token });
    visit = (data as VisitDetails) ?? null;
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">{t('title')}</h1>
      {visit ? (
        <ManageBooking visit={visit} />
      ) : (
        <p className="text-muted-foreground">{t('notFound')}</p>
      )}
    </div>
  );
}
