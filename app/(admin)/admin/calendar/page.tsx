'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircleWarning } from 'lucide-react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { addDays, dayOfWeek, todayTbilisi } from '@/lib/tz';
import { serviceName, type Booking } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { useAdminAuth } from '@/components/admin/auth-sync';

type BookingRow = Booking & {
  masters: { name: string } | null;
};

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary' | 'muted'> = {
  confirmed: 'success',
  cancelled: 'destructive',
  completed: 'secondary',
  no_show: 'muted',
};

// stable color per master for quick visual grouping
const MASTER_COLORS = ['bg-amber-200', 'bg-sky-200', 'bg-emerald-200', 'bg-rose-200', 'bg-violet-200'];

export default function AdminCalendarPage() {
  const { t, lang } = useAdminT();
  const { isReady } = useAdminAuth();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [cursor, setCursor] = useState(todayTbilisi());
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createBrowserSupabase(), []);

  const range = useMemo(() => {
    if (view === 'day') return [cursor, cursor];
    // week starting Monday
    const dow = dayOfWeek(cursor); // 0=Sun
    const mondayOffset = (dow + 6) % 7;
    const start = addDays(cursor, -mondayOffset);
    return [start, addDays(start, 6)];
  }, [cursor, view]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('*, masters(name), booking_services(services(name_ka, name_ru))')
      .gte('booking_date', range[0])
      .lte('booking_date', range[1])
      .order('booking_date')
      .order('start_time');
    if (error) {
      console.error('[load calendar bookings error]:', error);
    }
    setBookings((data as BookingRow[]) ?? []);
    setLoading(false);
  }, [supabase, range]);

  useEffect(() => {
    if (isReady) {
      load();
    }
  }, [isReady, load]);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id);
    if (error) {
      toast.error(error.message || t('actions.error'));
    } else {
      toast.success(t('actions.saved'));
      load();
    }
  };

  const shift = (n: number) => setCursor((c) => addDays(c, view === 'day' ? n : n * 7));
  const masterColor = (id: string | null) => {
    if (!id) return 'bg-muted';
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return MASTER_COLORS[h % MASTER_COLORS.length];
  };

  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Tbilisi',
    }).format(new Date(`${d}T12:00:00Z`));

  const days: string[] = [];
  for (let d = range[0]; d <= range[1]; d = addDays(d, 1)) days.push(d);

  const renderBooking = (b: BookingRow) => {
    const services = (b.booking_services ?? [])
      .map((bs) => (bs.services ? serviceName(bs.services, lang) : ''))
      .filter(Boolean)
      .join(' + ');
    return (
      <Card key={b.id} className={cn('overflow-hidden', b.status === 'cancelled' && 'opacity-50')}>
        <div className={cn('h-1', masterColor(b.master_id))} />
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">
              {String(b.start_time).slice(0, 5)}–{String(b.end_time).slice(0, 5)}
            </p>
            <div className="flex items-center gap-1.5">
              {b.source === 'admin' && (
                <Badge variant="outline" className="text-[10px]">
                  {t('calendar.manual')}
                </Badge>
              )}
              {!b.whatsapp_sent && b.status === 'confirmed' && (
                <span title="WhatsApp ✗">
                  <MessageCircleWarning className="h-4 w-4 text-amber-500" />
                </span>
              )}
              <Badge variant={STATUS_VARIANT[b.status] ?? 'secondary'}>
                {t(`statuses.${b.status}`)}
              </Badge>
            </div>
          </div>
          <p className="font-medium">
            {b.client_name} {b.client_surname}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{b.client_phone}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {services}
            {b.masters?.name ? ` · ${b.masters.name}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">{b.order_number}</p>
          {b.comment && <p className="text-sm italic text-muted-foreground">“{b.comment}”</p>}
          {b.status === 'confirmed' && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="secondary" onClick={() => setStatus(b.id, 'completed')}>
                {t('actions.complete')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(b.id, 'no_show')}>
                {t('actions.noShow')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setStatus(b.id, 'cancelled')}
              >
                {t('actions.cancel')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <button className="text-sm font-medium" onClick={() => setCursor(todayTbilisi())}>
            {t('calendar.today')}
          </button>
          <Button variant="ghost" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-xl border p-0.5 text-xs font-medium">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-lg px-3 py-1.5',
                  view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                )}
              >
                {t(`calendar.${v}`)}
              </button>
            ))}
          </div>
          <Button asChild size="sm">
            <Link href="/admin/bookings/new">{t('calendar.newBooking')}</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('actions.loading')}</p>
      ) : (
        days.map((d) => {
          const dayBookings = bookings.filter((b) => b.booking_date === d);
          if (view === 'day' && !dayBookings.length) {
            return (
              <p key={d} className="py-8 text-center text-sm text-muted-foreground">
                {t('calendar.noBookings')}
              </p>
            );
          }
          return (
            <div key={d} className="space-y-2">
              {view === 'week' && (
                <h3 className="text-sm font-semibold capitalize text-muted-foreground">
                  {dayLabel(d)}
                </h3>
              )}
              {dayBookings.length ? (
                dayBookings.map(renderBooking)
              ) : (
                <p className="text-xs text-muted-foreground/60">—</p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
