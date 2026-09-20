import { getTranslations } from 'next-intl/server';
import { createAnonServerClient, supabaseConfigured } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { Link } from '@/i18n/navigation';
import { formatPrice, serviceName, type Service, type ServiceCategory } from '@/lib/types';
import { Clock, ChevronRight } from 'lucide-react';

import { routing } from '@/i18n/routing';

export const revalidate = 60;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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
    <div className="space-y-8">
      {/* hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-brand-gold/20 bg-gradient-to-b from-white to-[#f4efe6] px-6 pb-7 pt-8 text-center shadow-[0_8px_30px_rgba(196,162,101,0.12)]">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-gold/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-brand-gold/10 blur-2xl" />
        <div className="relative flex flex-col items-center">
          <Logo height={92} className="h-[92px] w-auto drop-shadow-sm" />
          <p className="mt-4 max-w-[15rem] text-sm leading-relaxed text-muted-foreground">
            {t('subtitle')}
          </p>
          <Button asChild size="lg" className="mt-6 w-full max-w-xs rounded-2xl shadow-md">
            <Link href="/booking" prefetch={true}>
              {t('bookCta')}
            </Link>
          </Button>
        </div>
      </section>

      {/* services */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-brand-ink">{t('servicesTitle')}</h2>
        </div>
        {categories.map((c) => {
          const catServices = services.filter((s) => s.category_id === c.id);
          if (!catServices.length) return null;
          return (
            <div key={c.id} className="space-y-2.5">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
                {serviceName(c, locale)}
              </h3>
              <div className="space-y-2">
                {catServices.map((s) => (
                  <Link
                    key={s.id}
                    href={{ pathname: '/booking', query: { services: s.id } }}
                    prefetch={true}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3.5 shadow-sm transition-all hover:border-brand-gold/40 hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-brand-ink">{serviceName(s, locale)}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {tc('minutes', { count: s.duration_minutes })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="whitespace-nowrap font-semibold text-brand-ink">
                        {formatPrice(s)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-brand-gold/50 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
