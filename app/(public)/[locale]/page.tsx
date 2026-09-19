import { getTranslations } from 'next-intl/server';
import { createAnonServerClient, supabaseConfigured } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { formatPrice, serviceName, type Service, type ServiceCategory } from '@/lib/types';
import { Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  const tc = await getTranslations({ locale, namespace: 'common' });

  let categories: ServiceCategory[] = [];
  let services: Service[] = [];

  if (supabaseConfigured()) {
    const supabase = createAnonServerClient();
    const [{ data: cats }, { data: svcs }] = await Promise.all([
      supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('services').select('*').eq('is_active', true).order('sort_order'),
    ]);
    categories = cats ?? [];
    services = svcs ?? [];
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-brand-ink px-6 py-8 text-center text-white shadow-md">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-sm text-white/70">{t('subtitle')}</p>
        <Button asChild size="lg" className="mt-5">
          <Link href="/booking">{t('bookCta')}</Link>
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('servicesTitle')}</h2>
        {categories.map((c) => {
          const catServices = services.filter((s) => s.category_id === c.id);
          if (!catServices.length) return null;
          return (
            <div key={c.id}>
              <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-brand-gold">
                {serviceName(c, locale)}
              </h3>
              <Card>
                <CardContent className="divide-y p-0">
                  {catServices.map((s) => (
                    <Link
                      key={s.id}
                      href={{ pathname: '/booking', query: { services: s.id } }}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent"
                    >
                      <div>
                        <p className="font-medium">{serviceName(s, locale)}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {tc('minutes', { count: s.duration_minutes })}
                        </p>
                      </div>
                      <p className="font-semibold text-brand-ink">{formatPrice(s)}</p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </section>
    </div>
  );
}
