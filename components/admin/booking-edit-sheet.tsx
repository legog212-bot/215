'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, X, CalendarClock, UserRound, Scissors, CircleCheck, CircleSlash } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { serviceName, type Booking, type Master, type Service, type ServiceCategory } from '@/lib/types';
import { minutesToTime, timeToMinutes } from '@/lib/tz';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SlotPickerBase } from '@/components/slot-picker';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type BookingRow = Booking & { masters: { name: string } | null };

interface Props {
  booking: BookingRow | null;
  masters: Master[];
  categories: ServiceCategory[];
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary' | 'muted'> = {
  confirmed: 'success',
  cancelled: 'destructive',
  completed: 'secondary',
  no_show: 'muted',
};

export function BookingEditSheet({ booking, masters, categories, services, onClose, onSaved }: Props) {
  const { t, lang } = useAdminT();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [masterId, setMasterId] = useState<string>('none');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);

  // hydrate local state whenever a new booking is opened
  useEffect(() => {
    if (!booking) return;
    setMasterId(booking.master_id ?? 'none');
    setSelected(new Set((booking.booking_services ?? []).map((bs) => bs.service_id)));
    setDate(booking.booking_date);
    setTime(String(booking.start_time).slice(0, 5));
    setName(booking.client_name);
    setSurname(booking.client_surname);
    setPhone(booking.client_phone);
    setComment(booking.comment ?? '');
    setShowReschedule(false);
  }, [booking]);

  if (!booking) return null;

  const activeServices = services.filter((s) => s.is_active || selected.has(s.id));
  const duration = activeServices
    .filter((s) => selected.has(s.id))
    .reduce((a, s) => a + s.duration_minutes, 0);

  const toggleService = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setStatus = async (status: string) => {
    setBusy(true);
    const { error } = await supabase.from('bookings').update({ status }).eq('id', booking.id);
    setBusy(false);
    if (error) return toast.error(error.message || t('actions.error'));
    toast.success(t('actions.saved'));
    onSaved();
    onClose();
  };

  const save = async () => {
    if (!selected.size) return toast.error(t('bookingForm.fillFields'));
    if (!date || !time) return toast.error(t('bookingForm.selectSlot'));
    if (!name.trim() || !surname.trim() || !phone.trim()) {
      return toast.error(t('bookingForm.fillFields'));
    }
    setBusy(true);
    const startMin = timeToMinutes(time);
    const endMin = startMin + duration;
    const end = minutesToTime(endMin);

    // the DB index only catches an identical start_time, so check the whole
    // interval here — otherwise 10:00–12:00 and 11:00–13:00 could coexist
    let overlapQuery = supabase
      .from('bookings')
      .select('start_time, end_time')
      .eq('booking_date', date)
      .eq('status', 'confirmed')
      .neq('id', booking.id);
    overlapQuery =
      masterId === 'none'
        ? overlapQuery.is('master_id', null)
        : overlapQuery.eq('master_id', masterId);
    const { data: sameDay } = await overlapQuery;
    const clash = (sameDay ?? []).some(
      (b) => startMin < timeToMinutes(b.end_time) && timeToMinutes(b.start_time) < endMin
    );
    if (clash) {
      setBusy(false);
      return toast.error(t('bookingForm.overlap'));
    }

    const { error: upErr } = await supabase
      .from('bookings')
      .update({
        master_id: masterId === 'none' ? null : masterId,
        booking_date: date,
        start_time: time,
        end_time: end,
        client_name: name.trim(),
        client_surname: surname.trim(),
        client_phone: phone.trim(),
        comment: comment.trim() || null,
      })
      .eq('id', booking.id);

    if (upErr) {
      setBusy(false);
      if (upErr.code === '23505') return toast.error(t('bookingForm.conflict'));
      return toast.error(upErr.message || t('actions.error'));
    }

    // replace services only when the selection actually changed, so a failed
    // insert can't leave the booking with no services at all
    const before = new Set((booking.booking_services ?? []).map((bs) => bs.service_id));
    const changed =
      before.size !== selected.size || [...selected].some((id) => !before.has(id));
    if (changed) {
      await supabase.from('booking_services').delete().eq('booking_id', booking.id);
      const { error: svcErr } = await supabase
        .from('booking_services')
        .insert([...selected].map((service_id) => ({ booking_id: booking.id, service_id })));
      if (svcErr) {
        setBusy(false);
        // restore the previous set so the booking never ends up empty
        await supabase
          .from('booking_services')
          .insert([...before].map((service_id) => ({ booking_id: booking.id, service_id })));
        return toast.error(svcErr.message || t('actions.error'));
      }
    }

    setBusy(false);
    toast.success(t('actions.saved'));
    onSaved();
    onClose();
  };

  return (
    <Sheet open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <div className="mb-4 flex items-center gap-3 pr-8">
          <SheetTitle>
            {booking.client_name} {booking.client_surname}
          </SheetTitle>
          <Badge variant={STATUS_VARIANT[booking.status] ?? 'secondary'}>
            {t(`statuses.${booking.status}`)}
          </Badge>
        </div>
        <p className="-mt-2 mb-4 text-xs text-muted-foreground">{booking.order_number}</p>

        {/* quick status actions */}
        <div className="mb-5 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="justify-start gap-2"
            disabled={busy || booking.status === 'completed'}
            onClick={() => setStatus('completed')}
          >
            <CircleCheck className="h-4 w-4" /> {t('actions.complete')}
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            disabled={busy || booking.status === 'no_show'}
            onClick={() => setStatus('no_show')}
          >
            <CircleSlash className="h-4 w-4" /> {t('actions.noShow')}
          </Button>
          {booking.status !== 'confirmed' && (
            <Button
              variant="secondary"
              className="justify-start gap-2"
              disabled={busy}
              onClick={() => setStatus('confirmed')}
            >
              <Check className="h-4 w-4" /> {t('statuses.confirmed')}
            </Button>
          )}
          <Button
            variant="destructive"
            className="justify-start gap-2"
            disabled={busy || booking.status === 'cancelled'}
            onClick={() => setStatus('cancelled')}
          >
            <X className="h-4 w-4" /> {t('actions.cancel')}
          </Button>
        </div>

        {/* master */}
        <section className="mb-5 space-y-2">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" /> {t('bookingForm.master')}
          </Label>
          <div className="flex flex-wrap gap-2">
            <Chip active={masterId === 'none'} onClick={() => setMasterId('none')}>
              {t('bookingForm.anyMaster')}
            </Chip>
            {masters.map((m) => (
              <Chip key={m.id} active={masterId === m.id} onClick={() => setMasterId(m.id)}>
                {m.name}
              </Chip>
            ))}
          </div>
        </section>

        {/* services */}
        <section className="mb-5 space-y-2">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <Scissors className="h-3.5 w-3.5" /> {t('bookingForm.services')}
          </Label>
          <div className="space-y-3">
            {categories.map((c) => {
              const catServices = activeServices.filter((s) => s.category_id === c.id);
              if (!catServices.length) return null;
              return (
                <div key={c.id}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-gold">
                    {serviceName(c, lang)}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {catServices.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleService(s.id)}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors',
                          selected.has(s.id)
                            ? 'border-brand-gold/50 bg-brand-gold/5'
                            : 'border-black/5 bg-white'
                        )}
                      >
                        <Checkbox checked={selected.has(s.id)} className="pointer-events-none" tabIndex={-1} />
                        <span className="min-w-0 truncate">{serviceName(s, lang)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* date / time */}
        <section className="mb-5 space-y-2">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> {t('bookingForm.date')} / {t('bookingForm.time')}
          </Label>
          <div className="flex items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm">
            <span className="font-medium text-brand-ink">
              {date} · {time}
            </span>
            <Button variant="outline" size="sm" onClick={() => setShowReschedule((v) => !v)}>
              {t('actions.edit')}
            </Button>
          </div>
          {showReschedule && selected.size > 0 && (
            <div className="rounded-xl border border-black/5 bg-white p-3">
              <SlotPickerBase
                serviceIds={[...selected]}
                masterId={masterId === 'none' ? null : masterId}
                value={{ date, time }}
                onChange={(v) => {
                  setDate(v.date);
                  setTime(v.time);
                }}
                localeTag={lang === 'ka' ? 'ka-GE' : 'ru-RU'}
                allowAllDates
                labels={{
                  chooseDate: t('bookingForm.date'),
                  chooseTime: t('bookingForm.time'),
                  noSlots: t('bookingForm.noSlots'),
                  loading: t('actions.loading'),
                  manualHint: t('calendar.manualSlotsHint'),
                }}
              />
            </div>
          )}
        </section>

        {/* contacts */}
        <section className="mb-5 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('bookingForm.clientName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('bookingForm.clientSurname')}</Label>
            <Input value={surname} onChange={(e) => setSurname(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('bookingForm.phone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('bookingForm.comment')}</Label>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </section>

        <div className="sticky bottom-0 -mx-5 border-t border-black/5 bg-[#faf8f4] px-5 pb-2 pt-3">
          <Button className="w-full" size="lg" onClick={save} disabled={busy}>
            {t('actions.save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Chip({
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
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-gold bg-brand-gold text-white'
          : 'border-black/10 bg-white text-brand-ink hover:border-brand-gold/40'
      )}
    >
      {children}
    </button>
  );
}
