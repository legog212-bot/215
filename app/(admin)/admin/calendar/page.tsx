'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MessageCircleWarning,
  Phone,
  ChevronRight as Arrow,
  Calendar as CalendarIcon,
  Plus,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

  // Compute Monday-to-Sunday 7-day strip around the cursor date
  const weekStart = useMemo(() => {
    const dow = dayOfWeek(cursor);
    const mondayOffset = (dow + 6) % 7; // Monday is 0, Sunday is 6
    return addDays(cursor, -mondayOffset);
  }, [cursor]);

  const currentWeekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Always load the whole week so that indicators for all 7 days are always live
  const range = useMemo(() => {
    return [weekStart, addDays(weekStart, 6)];
  }, [weekStart]);

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

  const shift = (n: number) => {
    setCursor((c) => addDays(c, view === 'day' ? n : n * 7));
  };

  const masterColor = (id: string | null) => {
    if (!id) return 'bg-black/10';
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return MASTER_COLORS[h % MASTER_COLORS.length];
  };

  const monthYearLabel = useMemo(() => {
    return new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'ru-RU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Tbilisi',
    }).format(new Date(`${cursor}T12:00:00Z`));
  }, [cursor, lang]);

  const dayFullLabel = (d: string) =>
    new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Tbilisi',
    }).format(new Date(`${d}T12:00:00Z`));

  const dayShortName = (d: string) =>
    new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'ru-RU', {
      weekday: 'short',
      timeZone: 'Asia/Tbilisi',
    }).format(new Date(`${d}T12:00:00Z`));

  const dayNumber = (d: string) => d.split('-')[2];

  // Visible bookings filtered by master and status
  const visible = bookings.filter(
    (b) =>
      (masterFilter === 'all' || b.master_id === masterFilter) &&
      (statusFilter === 'all' || b.status === statusFilter)
  );

  // Check if a date has any bookings in the database (regardless of status filter, to show dot indicator)
  const hasAnyBookingsOnDate = (d: string) => {
    return bookings.some((b) => b.booking_date === d);
  };

  const dayVisibleBookings = visible.filter((b) => b.booking_date === cursor);

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

  const isCurrentCursorSunday = dayOfWeek(cursor) === 0;

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar: Month / Period + Nav Arrows + View Toggle + New Booking */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => shift(-1)}
            title={view === 'day' ? t('calendar.prevDay') : t('calendar.prevWeek')}
            className="h-8 w-8 rounded-lg"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="min-w-[130px] text-center text-sm font-bold capitalize text-brand-ink">
            {monthYearLabel}
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => shift(1)}
            title={view === 'day' ? t('calendar.nextDay') : t('calendar.nextWeek')}
            className="h-8 w-8 rounded-lg"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <button
            type="button"
            className="ml-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-brand-ink shadow-2xs hover:bg-accent active:scale-95 transition-all"
            onClick={() => setCursor(todayTbilisi())}
          >
            {t('calendar.today')}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Day / Week Switch */}
          <div className="flex rounded-xl border border-black/10 bg-black/5 p-0.5 text-xs font-medium">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-lg px-3 py-1.5 transition-all',
                  view === v
                    ? 'bg-white font-semibold text-brand-ink shadow-xs'
                    : 'text-muted-foreground hover:text-brand-ink'
                )}
              >
                {t(`calendar.${v}`)}
              </button>
            ))}
          </div>

          {/* New Booking Button */}
          <Button asChild size="sm" className="bg-primary text-white hover:bg-primary/90">
            <Link href={`/admin/bookings/new?date=${cursor}`}>
              <Plus className="mr-1 h-4 w-4" />
              {t('calendar.newBooking')}
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. Horizontal 7-Day Mini-Calendar Strip (Mon to Sun) */}
      <div className="rounded-2xl border border-black/10 bg-white p-2 shadow-2xs">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {currentWeekDays.map((d) => {
            const isSunday = dayOfWeek(d) === 0;
            const isToday = d === todayTbilisi();
            const isSelected = view === 'day' && cursor === d;
            const hasBookings = hasAnyBookingsOnDate(d);

            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setCursor(d);
                  setView('day');
                }}
                className={cn(
                  'group relative flex flex-col items-center justify-between rounded-xl py-2 px-1 text-center transition-all',
                  // Base styling
                  'border border-transparent',
                  // Selected state
                  isSelected
                    ? 'border-brand-ink bg-brand-ink text-white shadow-sm font-semibold'
                    : isSunday
                      ? 'bg-muted/30 text-muted-foreground/75 hover:border-black/20 hover:bg-muted/60'
                      : 'hover:border-brand-gold/40 hover:bg-brand-gold/5 text-brand-ink',
                  // Today outline indicator if not selected
                  !isSelected && isToday && 'border-primary/50 font-semibold'
                )}
              >
                {/* Day of Week */}
                <span
                  className={cn(
                    'text-[10px] sm:text-xs uppercase tracking-wider font-medium',
                    isSelected
                      ? 'text-brand-gold'
                      : isSunday
                        ? 'text-muted-foreground/60'
                        : 'text-muted-foreground'
                  )}
                >
                  {dayShortName(d)}
                </span>

                {/* Day Number */}
                <span
                  className={cn(
                    'my-0.5 text-base sm:text-lg font-bold leading-tight',
                    isSelected ? 'text-white' : 'text-brand-ink'
                  )}
                >
                  {dayNumber(d)}
                </span>

                {/* Bottom Row: Dot Indicator or Day Off label */}
                <div className="flex h-3 items-center justify-center">
                  {hasBookings ? (
                    <span
                      title={t('calendar.hasBookings')}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full ring-1 ring-white/50',
                        isSelected ? 'bg-brand-gold' : 'bg-brand-gold shadow-2xs'
                      )}
                    />
                  ) : isSunday ? (
                    <span
                      className={cn(
                        'text-[9px] font-medium leading-none tracking-tight',
                        isSelected ? 'text-white/60' : 'text-muted-foreground/60'
                      )}
                    >
                      {t('calendar.dayOffShort')}
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Compact Filter Bar: Master + Status + Count Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Master Select */}
          <Select value={masterFilter} onValueChange={setMasterFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder={t('calendar.allMasters')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                {t('calendar.allMasters')}
              </SelectItem>
              {masters.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Select */}
          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as BookingStatus | 'all')}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder={t('calendar.allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s === 'all' ? t('calendar.allStatuses') : t(`statuses.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Count of records */}
        <Badge variant="secondary" className="text-xs font-medium">
          {view === 'day' ? dayVisibleBookings.length : visible.length} {t('calendar.records')}
        </Badge>
      </div>

      {/* 4. Calendar Content */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          <p>{t('actions.loading')}</p>
        </div>
      ) : view === 'day' ? (
        /* DAY VIEW */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold capitalize text-brand-ink">
              {dayFullLabel(cursor)}
            </h2>
            {isCurrentCursorSunday && (
              <Badge variant="outline" className="text-[11px] border-dashed text-muted-foreground">
                {t('calendar.sundayDayOff')}
              </Badge>
            )}
          </div>

          {dayVisibleBookings.length > 0 ? (
            <div className="space-y-2.5">{dayVisibleBookings.map(renderBooking)}</div>
          ) : (
            <Card className="border-dashed border-black/15 bg-white/70 py-10 text-center">
              <CardContent className="flex flex-col items-center justify-center space-y-3 p-4">
                <div className="rounded-full bg-muted p-3 text-muted-foreground">
                  <CalendarIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-brand-ink">
                    {isCurrentCursorSunday ? t('calendar.sundayDayOff') : t('calendar.noBookings')}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs mt-1">
                    {isCurrentCursorSunday
                      ? t('calendar.dayOffHint')
                      : t('calendar.noBookingsHint')}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline" className="border-brand-gold/60 text-brand-ink">
                  <Link href={`/admin/bookings/new?date=${cursor}`}>
                    <Plus className="mr-1.5 h-3.5 w-3.5 text-brand-gold" />
                    {t('calendar.createManualBooking')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* WEEK VIEW — ALL 7 DAYS DISPLAYED CLEANLY */
        <div className="space-y-4">
          {currentWeekDays.map((d) => {
            const dayBookings = visible.filter((b) => b.booking_date === d);
            const isSunday = dayOfWeek(d) === 0;

            return (
              <div
                key={d}
                className={cn(
                  'rounded-2xl border bg-white p-3 space-y-3 transition-all',
                  isSunday ? 'border-black/5 bg-muted/10' : 'border-black/10'
                )}
              >
                {/* Day Header */}
                <div
                  className="flex cursor-pointer items-center justify-between rounded-lg p-1 transition-colors hover:bg-muted/40"
                  onClick={() => {
                    setCursor(d);
                    setView('day');
                  }}
                  title={t('calendar.openDay')}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold capitalize text-brand-ink hover:text-brand-gold transition-colors">
                      {dayFullLabel(d)}
                    </h3>
                    {isSunday && (
                      <Badge variant="outline" className="text-[10px] border-dashed text-muted-foreground">
                        {t('calendar.dayOff')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={dayBookings.length > 0 ? 'secondary' : 'outline'} className="text-xs font-semibold">
                      {dayBookings.length} {t('calendar.records')}
                    </Badge>
                    <Arrow className="h-4 w-4 text-muted-foreground/60" />
                  </div>
                </div>

                {/* Day Bookings or Day Empty State */}
                {dayBookings.length > 0 ? (
                  <div className="space-y-2">{dayBookings.map(renderBooking)}</div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-dashed border-black/10 bg-background/50 px-3 py-2.5 text-xs text-muted-foreground">
                    <span>
                      {isSunday
                        ? 'Воскресенье — выходной (запись только вручную)'
                        : t('calendar.noBookings')}
                    </span>
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs font-medium text-brand-gold hover:text-brand-gold/80">
                      <Link href={`/admin/bookings/new?date=${d}`}>
                        <Plus className="mr-1 h-3 w-3" />
                        {t('calendar.newBooking')}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Booking Edit Sheet */}
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
