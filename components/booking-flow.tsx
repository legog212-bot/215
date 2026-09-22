'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlotPicker, type BlockedInterval } from '@/components/slot-picker';
import { cn } from '@/lib/utils';
import { timeToMinutes } from '@/lib/tz';
import { formatPrice, serviceName, type Master, type Service, type ServiceCategory } from '@/lib/types';

interface Props {
  categories: ServiceCategory[];
  services: Service[];
  masters: Master[];
}

interface Leg {
  masterId: string | null; // null = any free master
  date: string | null;
  time: string | null;
}

export function BookingFlow({ categories, services, masters }: Props) {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselected = useMemo(
    () => new Set((searchParams.get('services') ?? '').split(',').filter(Boolean)),
    [searchParams]
  );

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(preselected);
  const [legs, setLegs] = useState<Record<string, Leg>>({});
  const [form, setForm] = useState({ name: '', surname: '', phone: '', comment: '', website: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeServices = services.filter((s) => s.is_active);
  const chosen = activeServices.filter((s) => selected.has(s.id));

  /** Masters qualified for ONE service — a specialist can't take other categories. */
  const mastersForService = (s: Service): Master[] => {
    const anyRestricted = masters.some((m) => m.category_ids && m.category_ids.length > 0);
    if (!anyRestricted) return masters;
    return masters.filter(
      (m) => !m.category_ids?.length || m.category_ids.includes(s.category_id)
    );
  };

  const legFor = (s: Service): Leg => {
    const existing = legs[s.id];
    if (existing) return existing;
    const eligible = mastersForService(s);
    return { masterId: eligible.length === 1 ? eligible[0].id : null, date: null, time: null };
  };

  const setLeg = (serviceId: string, patch: Partial<Leg>) =>
    setLegs((prev) => {
      const service = services.find((s) => s.id === serviceId);
      const base = prev[serviceId] ?? (service ? legFor(service) : { masterId: null, date: null, time: null });
      return { ...prev, [serviceId]: { ...base, ...patch } };
    });

  /** Intervals the visitor already occupies via other chosen services. */
  const blockedFor = (serviceId: string): BlockedInterval[] =>
    chosen
      .filter((s) => s.id !== serviceId)
      .map((s) => {
        const leg = legs[s.id];
        if (!leg?.date || !leg.time) return null;
        const startMin = timeToMinutes(leg.time);
        return { date: leg.date, startMin, endMin: startMin + s.duration_minutes };
      })
      .filter((b): b is BlockedInterval => b !== null);

  const totalDuration = chosen.reduce((a, s) => a + s.duration_minutes, 0);
  const priceFrom = chosen.reduce((a, s) => a + Number(s.price_from), 0);
  const priceTo = chosen.reduce((a, s) => a + Number(s.price_to ?? s.price_from), 0);

  // steps: 0 services, 1 schedule (per-service master+time), 2 details
  const steps = [0, 1, 2];
  const stepLabels = [t('stepServices'), t('stepTime'), t('stepDetails')];

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const legsComplete = () =>
    chosen.every((s) => {
      const leg = legFor(s);
      return leg.date && leg.time;
    });

  /** Client-side sanity check: chosen legs never overlap each other. */
  const legsOverlap = () => {
    const filled = chosen
      .map((s) => ({ s, leg: legFor(s) }))
      .filter((x) => x.leg.date && x.leg.time);
    for (let i = 0; i < filled.length; i++) {
      for (let j = i + 1; j < filled.length; j++) {
        const a = filled[i];
        const b = filled[j];
        if (a.leg.date !== b.leg.date) continue;
        const a0 = timeToMinutes(a.leg.time!);
        const a1 = a0 + a.s.duration_minutes;
        const b0 = timeToMinutes(b.leg.time!);
        const b1 = b0 + b.s.duration_minutes;
        if (a0 < b1 && b0 < a1) return true;
      }
    }
    return false;
  };

  const goNext = () => {
    setError(null);
    const idx = steps.indexOf(step);
    if (step === 0 && selected.size === 0) return setError(t('selectServiceError'));
    if (step === 1) {
      if (!legsComplete()) return setError(t('selectTimeError'));
      if (legsOverlap()) return setError(t('legsOverlap'));
    }
    setStep(steps[idx + 1]);
  };
  const goBack = () => {
    setError(null);
    setStep(steps[steps.indexOf(step) - 1]);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.surname.trim() || !form.phone.trim()) {
      return setError(t('fillFieldsError'));
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          surname: form.surname.trim(),
          phone: form.phone.trim(),
          comment: form.comment.trim(),
          website: form.website, // honeypot
          legs: chosen.map((s) => {
            const leg = legFor(s);
            return {
              serviceIds: [s.id],
              masterId: leg.masterId,
              date: leg.date,
              start: leg.time,
            };
          }),
          locale,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError(data.error === 'legs_overlap' ? t('legsOverlap') : t('slotTaken'));
        setStep(1);
        return;
      }
      if (!res.ok) {
        setError(
          data.error === 'phone'
            ? t('phoneInvalid')
            : data.error === 'rate_limited'
              ? t('rateLimited')
              : t('genericError')
        );
        return;
      }
      sessionStorage.setItem(
        'lastBooking',
        JSON.stringify({
          orderNumber: data.orderNumber,
          token: data.cancelToken,
          whatsappSent: data.whatsappSent,
        })
      );
      router.push(`/${locale}/booking/success`);
    } catch {
      setError(t('genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* progress */}
      <div className="flex gap-1.5">
        {steps.map((s, i) => (
          <div
            key={s}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              steps.indexOf(step) >= i ? 'bg-primary' : 'bg-muted'
            )}
            title={stepLabels[s]}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('chooseServices')}</h2>
          {categories.map((c) => {
            const catServices = activeServices.filter((s) => s.category_id === c.id);
            if (!catServices.length) return null;
            return (
              <div key={c.id}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {serviceName(c, locale)}
                </h3>
                <div className="space-y-2">
                  {catServices.map((s) => (
                    <Card
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggle(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle(s.id);
                        }
                      }}
                      className={cn(
                        'cursor-pointer rounded-2xl border-black/5 transition-all active:scale-[0.99]',
                        selected.has(s.id)
                          ? 'border-brand-gold/50 bg-brand-gold/5 shadow-md'
                          : 'hover:border-brand-gold/30 hover:shadow-md'
                      )}
                    >
                      <CardContent className="flex items-center gap-3 p-4">
                        {/* checkbox is visual only — the whole card toggles */}
                        <Checkbox checked={selected.has(s.id)} className="pointer-events-none" tabIndex={-1} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-brand-ink">{serviceName(s, locale)}</p>
                          <p className="text-sm text-muted-foreground">
                            {tc('minutes', { count: s.duration_minutes })}
                          </p>
                        </div>
                        <p className="font-semibold text-brand-ink">{formatPrice(s)}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          {selected.size > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3 text-sm">
              <span>
                {t('totalDuration')}: {tc('minutes', { count: totalDuration })}
              </span>
              <span className="font-semibold">
                {priceFrom === priceTo ? `${priceFrom} ₾` : `${priceFrom}-${priceTo} ₾`}
              </span>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">{t('stepTime')}</h2>
          {chosen.map((s) => {
            const eligible = mastersForService(s);
            const leg = legFor(s);
            const showMasterChips = eligible.length > 1;
            return (
              <Card key={s.id} className="rounded-2xl">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-brand-ink">{serviceName(s, locale)}</p>
                    <p className="shrink-0 text-sm text-muted-foreground">
                      {tc('minutes', { count: s.duration_minutes })}
                    </p>
                  </div>

                  {showMasterChips && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setLeg(s.id, { masterId: null, time: null })}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                          leg.masterId === null
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-accent'
                        )}
                      >
                        {t('anyMaster')}
                      </button>
                      {eligible.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setLeg(s.id, { masterId: m.id, time: null })}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                            leg.masterId === m.id
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-accent'
                          )}
                        >
                          {m.photo_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={m.photo_url}
                              alt={m.name}
                              className="h-5 w-5 rounded-full object-cover"
                            />
                          )}
                          {m.name}
                        </button>
                      ))}
                    </div>
                  )}

                  <SlotPicker
                    serviceIds={[s.id]}
                    masterId={leg.masterId}
                    durationMinutes={s.duration_minutes}
                    blocked={blockedFor(s.id)}
                    value={{ date: leg.date, time: leg.time }}
                    onChange={(v) => setLeg(s.id, { date: v.date, time: v.time })}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('stepDetails')}</h2>
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t('firstName')}</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="surname">{t('lastName')}</Label>
                  <Input
                    id="surname"
                    value={form.surname}
                    onChange={(e) => setForm({ ...form, surname: e.target.value })}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">{t('phone')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder={t('phoneHint')}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comment">{t('comment')}</Label>
                <Input
                  id="comment"
                  placeholder={t('commentPlaceholder')}
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                />
              </div>
              {/* honeypot — bots fill it, humans never see it */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              {chosen.map((s) => {
                const leg = legFor(s);
                const masterName =
                  masters.find((m) => m.id === leg.masterId)?.name ?? t('anyMaster');
                return (
                  <div key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <div>
                      <p className="font-medium">{serviceName(s, locale)}</p>
                      <p className="text-muted-foreground">
                        {leg.date} · {leg.time} — {masterName}
                      </p>
                    </div>
                    <p className="font-semibold text-brand-ink whitespace-nowrap">
                      {formatPrice(s)}
                    </p>
                  </div>
                );
              })}
              {chosen.length > 0 && (
                <div className="border-t pt-2 mt-1 flex items-baseline justify-between">
                  <p className="font-semibold">{t('total')}</p>
                  <p className="font-bold text-brand-ink text-base">
                    {priceFrom === priceTo
                      ? `${priceFrom} ₾`
                      : `${priceFrom}–${priceTo} ₾`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <div className="flex gap-3">
        {steps.indexOf(step) > 0 && (
          <Button variant="outline" onClick={goBack} disabled={submitting}>
            {tc('back')}
          </Button>
        )}
        {step !== 2 ? (
          <Button className="flex-1" size="lg" onClick={goNext}>
            {tc('next')}
          </Button>
        ) : (
          <Button className="flex-1" size="lg" onClick={submit} disabled={submitting}>
            {submitting ? t('submitting') : t('confirm')}
          </Button>
        )}
      </div>
    </div>
  );
}
