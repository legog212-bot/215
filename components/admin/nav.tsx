'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays,
  Plus,
  Scissors,
  Clock,
  Users,
  Contact,
  LogOut,
} from 'lucide-react';
import { useAdminT } from '@/lib/admin-i18n';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin/calendar', key: 'nav.calendar', icon: CalendarDays },
  { href: '/admin/bookings/new', key: 'nav.newBooking', icon: Plus },
  { href: '/admin/services', key: 'nav.services', icon: Scissors },
  { href: '/admin/schedule', key: 'nav.schedule', icon: Clock },
  { href: '/admin/masters', key: 'nav.masters', icon: Users },
  { href: '/admin/clients', key: 'nav.clients', icon: Contact },
];

export function AdminNav() {
  const pathname = usePathname();
  const { t, lang, setLang } = useAdminT();

  if (pathname === '/admin/login') return null;

  const logout = async () => {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut().catch(() => {});
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/admin/login';
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">
            Beauty Salon
          </span>
          <span className="font-serif text-base font-bold text-brand-ink">№215</span>
          <span className="ml-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-ink">
            admin
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full border p-0.5 text-xs">
            {(['ka', 'ru'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={cn(
                  'rounded-full px-2 py-0.5 uppercase',
                  lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={logout}
            className="rounded-full p-2 text-muted-foreground hover:bg-accent"
            aria-label={t('nav.logout')}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* bottom tab bar — mobile-first */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-6">
          {ITEMS.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-[10px] leading-tight font-medium text-center overflow-hidden',
                pathname.startsWith(href) ? 'text-brand-gold' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="w-full truncate px-0.5">{t(key)}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
