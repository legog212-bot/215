'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlotPicker, type SlotValue } from '@/components/slot-picker';
import { cn } from '@/lib/utils';
import { formatPrice, serviceName, type Master, type Service, type ServiceCategory } from '@/lib/types';

interface Props {
  categories: ServiceCategory[];
  services: Service[];
  masters: Master[];
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
  const [masterId, setMasterId] = useState<string | null>(
    masters.length === 1 ? masters[0].id : null
  );
  const [slot, setSlot] = useState<SlotValue>({ date: null, time: null });
  const [form, setForm] = useState({ name: '', surname: '', phone: '', comment: '', website: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeServices = services.filter((s) => s.is_active);
  const chosen = activeServices.filter((s) => selected.has(s.id));
  const chosenCategoryIds = useMemo(
    () => [...new Set(chosen.map((s) => s.category_id))],
    [chosen]
  );

  const eligibleMasters = useMemo(() => {
    if (chosenCategoryIds.length === 0) return masters;
    const hasCategoryRestrictions = masters.some(
      (m) => m.category_ids && m.category_ids.length > 0
    );
    if (!hasCategoryRestrictions) return masters;
    return masters.filter((m) => {
      if (!m.category_ids || m.category_ids.length === 0) return true;
      return chosenCategoryIds.every((cid) => m.category_ids?.includes(cid));
    });
  }, [masters, chosenCategoryIds]);

  const totalDuration = chosen.reduce((a, s) => a + s.duration_minutes, 0);
  const priceFrom = chosen.reduce((a, s) => a + Number(s.price_from), 0);
  const priceTo = chosen.reduce((a, s) => a + Number(s.price_to ?? s.price_from), 0);

  const multiMaster = eligibleMasters.length > 1;
  // steps: 0 services, 1 master (skipped if single), 2 slot, 3 details
  const steps = multiMaster ? [0, 1, 2, 3] : [0, 2, 3];
  const stepLabels = [t('stepServices'), t('stepMaster'), t('stepTime'), t('stepDetails')];

  useEffect(() => {
    if (eligibleMasters.length === 1) {
      setMasterId(eligibleMasters[0].id);
    } else if (masterId && !eligibleMasters.some((m) => m.id === masterId)) {
      setMasterId(null);
    }
  }, [eligibleMasters, masterId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSlot({ date: null, time: null }); // duration changed → slots invalid
  };

  const goNext = () => {
    setError(null);
    const idx = steps.indexOf(step);
    if (step === 0 && selected.size === 0) return setError(t('selectServiceError'));
    if (step === 2 && (!slot.date || !slot.time)) return setError(t('selectTimeError'));
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
          serviceIds: [...selected],
          masterId,
          date: slot.date,
          start: slot.time,
          locale,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError(t('slotTaken'));
        setStep(2);
        setSlot({ ...slot, time: null });
        return;
      }
      if (!res.ok) {
        setError(data.error === 'phone' ? t('phoneInvalid') : t('genericError'));
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

      {step === 1 && multiMaster && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('chooseMaster')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setMasterId(null);
                setSlot({ date: null, time: null });
              }}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all shadow-sm',
                masterId === null
                  ? 'border-primary bg-primary text-primary-foreground shadow-md'
                  : 'bg-background hover:bg-accent border-black/5'
              )}
            >
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase',
                  masterId === null
                    ? 'bg-white/20 text-white'
                    : 'bg-secondary text-brand-ink'
                )}
              >
                ★
              </div>
              <div>
                <p className="font-semibold text-sm">{t('anyMaster')}</p>
                <p
                  className={cn(
                    'text-xs',
                    masterId === null ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  )}
                >
                  {t('anyMasterHint')}
                </p>
              </div>
            </button>
            {eligibleMasters.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMasterId(m.id);
                  setSlot({ date: null, time: null });
                }}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all shadow-sm',
                  masterId === m.id
                    ? 'border-primary bg-primary text-primary-foreground shadow-md'
                    : 'bg-background hover:bg-accent border-black/5'
                )}
              >
                {m.photo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.photo_url}
                    alt={m.name}
                    className="h-11 w-11 shrink-0 rounded-full object-cover border border-black/10 shadow-sm"
                  />
                ) : (
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase',
                      masterId === m.id
                        ? 'bg-white/20 text-white'
                        : 'bg-secondary text-brand-ink'
                    )}
                  >
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm">{m.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <SlotPicker
          serviceIds={[...selected]}
          masterId={masterId}
          value={slot}
          onChange={setSlot}
        />
      )}

      {step === 3 && (
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
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-medium">
                {chosen.map((s) => serviceName(s, locale)).join(' + ')}
              </p>
              <p className="text-muted-foreground">
                {slot.date} · {slot.time} —{' '}
                {masters.find((m) => m.id === masterId)?.name ?? t('anyMaster')}
              </p>
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
        {step !== 3 ? (
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
