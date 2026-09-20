'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircleWarning, Phone, ChevronRight as Arrow } from 'lucide-react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { useAdminAuth } from '@/components/admin/auth-sync';
import { addDays, dayOfWeek, todayTbilisi } from '@/lib/tz';
import {
  serviceName,
  type Booking,
  type BookingStatus,
  type Master,
  type Service,
  type ServiceCategory,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BookingEditSheet } from '@/components/admin/booking-edit-sheet';
import { cn } from '@/lib/utils';

type BookingRow = Booking & { masters: { name: string } | null };

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary' | 'muted'> = {
  confirmed: 'success',
  cancelled: 'destructive',
  completed: 'secondary',
  no_show: 'muted',
};

const MASTER_COLORS = ['bg-amber-300', 'bg-sky-300', 'bg-emerald-300', 'bg-rose-300', 'bg-violet-300'];
const STATUS_FILTERS: (BookingStatus | 'all')[] = ['all', 'confirmed', 'completed', 'no_show', 'cancelled'];

export default function AdminCalendarPage() {
  const { t, lang } = useAdminT();
  const { isReady } = useAdminAuth();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [view, setView] = useState<'day' | 'week'>('day');
  const [cursor, setCursor] = useState(todayTbilisi());
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BookingRow | null>(null);

  // filters
  const [masterFilter, setMasterFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');

  const range = useMemo(() => {
    if (view === 'day') return [cursor, cursor];
    const dow = dayOfWeek(cursor);
    const mondayOffset = (dow + 6) % 7;
    const start = addDays(cursor, -mondayOffset);
    return [start, addDays(start, 6)];
  }, [cursor, view]);

  // reference data (once)
  useEffect(() => {
    if (!isReady) return;
    Promise.all([
      supabase.from('masters').select('*').order('created_at'),
      supabase.from('service_categories').select('*').order('sort_order'),
      supabase.from('services').select('*').order('sort_order'),
    ]).then(([m, c, s]) => {
      setMasters(m.data ?? []);
      setCategories(c.data ?? []);
      setServices(s.data ?? []);
    });
  }, [isReady, supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*, masters(name), booking_services(service_id, services(name_ka, name_ru, name_en))')
      .gte('booking_date', range[0])
      .lte('booking_date', range[1])
      .order('booking_date')
      .order('start_time');
    setBookings((data as BookingRow[]) ?? []);
    setLoading(false);
  }, [supabase, range]);

  useEffect(() => {
    if (isReady) load();
  }, [isReady, load]);

  const shift = (n: number) => setCursor((c) => addDays(c, view === 'day' ? n : n * 7));

  const masterColor = (id: string | null) => {
    if (!id) return 'bg-black/10';
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return MASTER_COLORS[h % MASTER_COLORS.length];
  };

  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Tbilisi',
    }).format(new Date(`${d}T12:00:00Z`));

  const days: string[] = [];
  for (let d = range[0]; d <= range[1]; d = addDays(d, 1)) days.push(d);

  const visible = bookings.filter(
    (b) =>
      (masterFilter === 'all' || b.master_id === masterFilter) &&
      (statusFilter === 'all' || b.status === statusFilter)
  );

  const renderBooking = (b: BookingRow) => {
    const svc = (b.booking_services ?? [])
      .map((bs) => (bs.services ? serviceName(bs.services, lang) : ''))
      .filter(Boolean)
      .join(' + ');
    return (
      <button key={b.id} type="button" onClick={() => setEditing(b)} className="w-full text-left">
        <Card
          className={cn(
            'overflow-hidden rounded-2xl border-black/5 transition-all hover:shadow-md active:scale-[0.99]',
            b.status === 'cancelled' && 'opacity-55'
          )}
        >
          <div className="flex">
            <div className={cn('w-1.5 shrink-0', masterColor(b.master_id))} />
            <CardContent className="flex-1 space-y-1.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-bold text-brand-ink">
                  {String(b.start_time).slice(0, 5)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    –{String(b.end_time).slice(0, 5)}
                  </span>
                </p>
                <div className="flex items-center gap-1.5">
                  {b.source === 'admin' && (
                    <Badge variant="outline" className="text-[10px]">
                      {t('calendar.manual')}
                    </Badge>
                  )}
                  {!b.whatsapp_sent && b.status === 'confirmed' && (
                    <MessageCircleWarning className="h-4 w-4 text-amber-500" />
                  )}
                  <Badge variant={STATUS_VARIANT[b.status] ?? 'secondary'}>
                    {t(`statuses.${b.status}`)}
                  </Badge>
                </div>
              </div>
              <p className="font-medium text-brand-ink">
                {b.client_name} {b.client_surname}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                {b.client_phone}
              </p>
              {svc && <p className="text-sm text-muted-foreground">{svc}</p>}
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-xs text-muted-foreground">
                  {b.masters?.name ?? t('bookingForm.anyMaster')} · {b.order_number}
                </span>
                <Arrow className="h-4 w-4 text-brand-gold/50" />
              </div>
            </CardContent>
          </div>
        </Card>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* date nav + view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <button
            className="rounded-lg px-2 py-1 text-sm font-medium hover:bg-accent"
            onClick={() => setCursor(todayTbilisi())}
          >
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

      {/* current period label */}
      <p className="text-sm font-semibold capitalize text-brand-ink">
        {view === 'day' ? dayLabel(cursor) : `${dayLabel(range[0])} — ${dayLabel(range[1])}`}
      </p>

      {/* filters */}
      <div className="space-y-2">
        {masters.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={masterFilter === 'all'} onClick={() => setMasterFilter('all')}>
              {t('calendar.allMasters')}
            </FilterChip>
            {masters.map((m) => (
              <FilterChip
                key={m.id}
                active={masterFilter === m.id}
                onClick={() => setMasterFilter(m.id)}
              >
                {m.name}
              </FilterChip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? t('calendar.allStatuses') : t(`statuses.${s}`)}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* list */}
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('actions.loading')}</p>
      ) : (
        days.map((d) => {
          const dayBookings = visible.filter((b) => b.booking_date === d);
          if (view === 'day') {
            return dayBookings.length ? (
              <div key={d} className="space-y-2.5">{dayBookings.map(renderBooking)}</div>
            ) : (
              <p key={d} className="py-10 text-center text-sm text-muted-foreground">
                {t('calendar.noBookings')}
              </p>
            );
          }
          if (!dayBookings.length) return null;
          return (
            <div key={d} className="space-y-2.5">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-gold">
                {dayLabel(d)}
              </h3>
              {dayBookings.map(renderBooking)}
            </div>
          );
        })
      )}

      <BookingEditSheet
        booking={editing}
        masters={masters}
        categories={categories}
        services={services}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-brand-ink bg-brand-ink text-white'
          : 'border-black/10 bg-white text-muted-foreground hover:border-brand-gold/40'
      )}
    >
      {children}
    </button>
  );
}
