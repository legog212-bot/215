'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { bookingDates } from '@/lib/slots';
import { cn } from '@/lib/utils';

const LOCALE_TAGS: Record<string, string> = { ka: 'ka-GE', ru: 'ru-RU', en: 'en-GB' };

export interface SlotValue {
  date: string | null;
  time: string | null;
}

export interface SlotPickerLabels {
  chooseDate: string;
  chooseTime: string;
  noSlots: string;
  loading: string;
}

interface BaseProps {
  serviceIds: string[];
  masterId: string | null; // null = any
  value: SlotValue;
  onChange: (v: SlotValue) => void;
  labels: SlotPickerLabels;
  localeTag: string; // e.g. 'ka-GE'
}

/** Pure slot picker — works outside next-intl (admin) when labels are passed in. */
export function SlotPickerBase({
  serviceIds,
  masterId,
  value,
  onChange,
  labels,
  localeTag,
}: BaseProps) {
  const dates = useMemo(() => bookingDates(), []);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [daySlots, setDaySlots] = useState<string[] | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  const servicesParam = serviceIds.join(',');
  const masterParam = masterId ?? 'any';

  // per-day free-slot counts for the whole 21+1 day window
  useEffect(() => {
    if (!serviceIds.length) return;
    let cancelled = false;
    fetch(`/api/slots?mode=summary&master=${masterParam}&services=${servicesParam}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setCounts(d.days ?? {}))
      .catch(() => !cancelled && setCounts({}));
    return () => {
      cancelled = true;
    };
  }, [masterParam, servicesParam, serviceIds.length]);

  // slots for the selected day
  useEffect(() => {
    if (!value.date || !serviceIds.length) return;
    let cancelled = false;
    setLoadingDay(true);
    fetch(
      `/api/slots?mode=day&date=${value.date}&master=${masterParam}&services=${servicesParam}`
    )
      .then((r) => r.json())
      .then((d) => !cancelled && setDaySlots(d.slots ?? []))
      .catch(() => !cancelled && setDaySlots([]))
      .finally(() => !cancelled && setLoadingDay(false));
    return () => {
      cancelled = true;
    };
  }, [value.date, masterParam, servicesParam, serviceIds.length]);

  const weekdayFmt = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { weekday: 'short', timeZone: 'Asia/Tbilisi' }),
    [localeTag]
  );
  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Tbilisi',
      }),
    [localeTag]
  );
  const noonUtc = (d: string) => new Date(`${d}T12:00:00Z`);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">{labels.chooseDate}</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {dates.map((d) => {
            const free = counts[d];
            const disabled = free === 0;
            return (
              <button
                key={d}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ date: d, time: null })}
                className={cn(
                  'flex w-16 shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-sm shadow-sm transition-colors',
                  value.date === d
                    ? 'border-primary bg-primary text-primary-foreground'
                    : disabled
                      ? 'bg-muted text-muted-foreground opacity-50'
                      : 'bg-background hover:bg-accent'
                )}
              >
                <span className="text-xs capitalize">{weekdayFmt.format(noonUtc(d))}</span>
                <span className="font-semibold">{dayFmt.format(noonUtc(d))}</span>
              </button>
            );
          })}
        </div>
      </div>

      {value.date && (
        <div>
          <p className="mb-2 text-sm font-medium">{labels.chooseTime}</p>
          {loadingDay ? (
            <p className="text-sm text-muted-foreground">{labels.loading}</p>
          ) : daySlots && daySlots.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {daySlots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...value, time: s })}
                  className={cn(
                    'rounded-xl border px-2 py-2 text-sm font-medium shadow-sm transition-colors',
                    value.time === s
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-accent'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{labels.noSlots}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Client-site wrapper — pulls labels from next-intl messages. */
export function SlotPicker(props: Omit<BaseProps, 'labels' | 'localeTag'>) {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const locale = useLocale();
  return (
    <SlotPickerBase
      {...props}
      localeTag={LOCALE_TAGS[locale] ?? 'en-GB'}
      labels={{
        chooseDate: t('chooseDate'),
        chooseTime: t('chooseTime'),
        noSlots: t('noSlots'),
        loading: tc('loading'),
      }}
    />
  );
}
