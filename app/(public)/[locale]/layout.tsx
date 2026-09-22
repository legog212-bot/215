import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { routing } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Link } from '@/i18n/navigation';
import { Toaster } from '@/components/ui/sonner';
import '../../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale}>
      <body className="bg-[#faf8f4]" style={{ backgroundColor: '#faf8f4' }}>
        <NextIntlClientProvider>
          <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-[#faf8f4]/80 px-4 py-2.5 backdrop-blur-md">
              <Link
                href="/"
                className="inline-flex items-baseline gap-1.5 transition-transform active:scale-[0.98]"
                aria-label="Beauty Salon №215"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">
                  Beauty Salon
                </span>
                <span className="font-serif text-lg font-bold tracking-tight text-brand-ink">
                  №215
                </span>
              </Link>
              <LanguageSwitcher />
            </header>
            <main className="flex-1 px-4 pb-10 pt-4">{children}</main>
            <footer className="border-t border-black/5 py-5 text-center text-[11px] uppercase tracking-[0.2em] text-brand-gold">
              Care • Radiance • You
            </footer>
          </div>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
