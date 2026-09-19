'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { useAdminAuth } from '@/components/admin/auth-sync';
import { serviceName, type Booking } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClientGroup {
  phone: string;
  name: string;
  bookings: Booking[];
}

export default function AdminClientsPage() {
  const { t, lang } = useAdminT();
  const { isReady } = useAdminAuth();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('*, booking_services(services(name_ka, name_ru))')
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error) {
      console.error('[load clients bookings error]:', error);
    }
    setBookings((data as Booking[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (isReady) {
      load();
    }
  }, [isReady, load]);

  const clients = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const b of bookings) {
      const g = map.get(b.client_phone);
      if (g) {
        g.bookings.push(b);
      } else {
        map.set(b.client_phone, {
          phone: b.client_phone,
          name: `${b.client_name} ${b.client_surname}`,
          bookings: [b],
        });
      }
    }
    return [...map.values()];
  }, [bookings]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('nav.clients')}</h1>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('actions.loading')}</p>
      ) : clients.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('clients.empty')}</p>
      ) : (
        clients.map((c) => (
          <Card key={c.phone}>
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => setOpen(open === c.phone ? null : c.phone)}
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {t('clients.visits')}: {c.bookings.length}
                </Badge>
                {open === c.phone ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>
            {open === c.phone && (
              <CardContent className="divide-y border-t p-0">
                {c.bookings.map((b) => (
                  <div key={b.id} className="px-4 py-2.5 text-sm">
                    <p className="font-medium">
                      {b.booking_date} · {String(b.start_time).slice(0, 5)}
                      <span className="ml-2 text-xs text-muted-foreground">{b.order_number}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {(b.booking_services ?? [])
                        .map((bs) => (bs.services ? serviceName(bs.services, lang) : ''))
                        .filter(Boolean)
                        .join(' + ')}
                    </p>
                    <p
                      className={cn(
                        'text-xs',
                        b.status === 'cancelled' ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {t(`statuses.${b.status}`)}
                    </p>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
