import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { routing } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { Link } from '@/i18n/navigation';
import { Toaster } from '@/components/ui/sonner';
import '../../globals.css';

export const dynamic = 'force-dynamic';

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
      <body>
        <NextIntlClientProvider>
          <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4">
            <header className="flex items-center justify-between py-5">
              <Link href="/" className="flex items-center gap-3">
                <Logo size={52} />
                <div className="leading-tight">
                  <p className="text-xl font-bold tracking-wide text-brand-ink">№215</p>
                  <p className="text-[11px] uppercase tracking-widest text-brand-gold">
                    Beauty Salon
                  </p>
                </div>
              </Link>
              <LanguageSwitcher />
            </header>
            <main className="flex-1 pb-8">{children}</main>
            <footer className="border-t py-4 text-center text-xs text-muted-foreground">
              Care • Radiance • You
            </footer>
          </div>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
