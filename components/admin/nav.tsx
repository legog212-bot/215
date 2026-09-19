'use client';

import { usePathname, useRouter } from 'next/navigation';
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
import { Logo } from '@/components/logo';
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
  const router = useRouter();
  const { t, lang, setLang } = useAdminT();

  if (pathname === '/admin/login') return null;

  const logout = async () => {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Logo size={40} />
          <span className="font-bold text-brand-ink">№215</span>
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-ink">
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
                'flex flex-col items-center gap-1 py-2 text-[10px] font-medium',
                pathname.startsWith(href) ? 'text-brand-gold' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              {t(key)}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
