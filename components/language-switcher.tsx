'use client';

import { useLocale } from 'next-intl';
import { usePathname, Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const LOCALES = ['ka', 'ru', 'en'] as const;

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex gap-1 rounded-full border bg-background p-1 text-xs font-medium shadow-sm">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          className={cn(
            'rounded-full px-2.5 py-1 uppercase transition-colors',
            l === locale
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}
