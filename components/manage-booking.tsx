'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SlotPicker, type BlockedInterval, type SlotValue } from '@/components/slot-picker';
import { serviceName, type BookingDetails, type VisitDetails, type VisitLeg } from '@/lib/types';
import { timeToMinutes } from '@/lib/tz';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'muted' | 'secondary'> = {
  confirmed: 'success',
  cancelled: 'destructive',
  completed: 'secondary',
  no_show: 'muted',
};

export function ManageBooking({ visit }: { visit: VisitDetails }) {
  const t = useTranslations('manage');
  const ts = useTranslations('success');
  const tb = useTranslations('booking');
  const locale = useLocale();

  const [legs, setLegs] = useState<VisitLeg[]>(visit.legs);
  const [confirmLeg, setConfirmLeg] = useState<VisitLeg | null>(null);
  const [reschedLeg, setReschedLeg] = useState<VisitLeg | null>(null);
  const [slot, setSlot] = useState<SlotValue>({ date: null, time: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The visitor's other legs block rescheduling onto overlapping times. */
  const blockedFor = (legId: string): BlockedInterval[] =>
    legs
      .filter((l) => l.id !== legId && l.status === 'confirmed')
      .map((l) => ({
        date: l.booking_date,
        startMin: timeToMinutes(String(l.start_time).slice(0, 5)),
        endMin: timeToMinutes(String(l.end_time).slice(0, 5)),
      }));

  const applyUpdate = (legId: string, updated: BookingDetails) =>
    setLegs((prev) =>
      prev.map((l) =>
        l.id === legId
          ? {
              ...l,
              status: updated.status,
              booking_date: updated.booking_date,
              start_time: updated.start_time,
              end_time: updated.end_time,
              master_id: updated.master_id,
              master_name: updated.master_name,
            }
          : l
      )
    );

  const cancel = async () => {
    if (!confirmLeg) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${confirmLeg.cancel_token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        setError('failed');
        return;
      }
      const data = await res.json();
      applyUpdate(confirmLeg.id, data);
      setConfirmLeg(null);
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async () => {
    if (!reschedLeg || !slot.date || !slot.time) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${reschedLeg.cancel_token}?locale=${locale}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', date: slot.date, start: slot.time }),
      });
      if (res.status === 409) {
        setError('slot_taken');
        return;
      }
      if (!res.ok) {
        setError('failed');
        return;
      }
      const data = await res.json();
      applyUpdate(reschedLeg.id, data);
      setReschedLeg(null);
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <p className="text-lg font-bold text-brand-ink">{visit.order_number}</p>
          <p className="text-sm text-muted-foreground">
            {visit.client_name} {visit.client_surname}
          </p>
        </CardContent>
      </Card>

      {legs.map((leg) => {
        const editable = leg.status === 'confirmed';
        return (
          <Card key={leg.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-brand-ink">
                  {leg.services.map((s) => serviceName(s, locale)).join(' + ')}
                </p>
                <Badge variant={STATUS_VARIANT[leg.status] ?? 'secondary'}>
                  {t(`statuses.${leg.status}`)}
                </Badge>
              </div>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">{ts('date')}: </span>
                  {leg.booking_date}
                </p>
                <p>
                  <span className="text-muted-foreground">{ts('time')}: </span>
                  {String(leg.start_time).slice(0, 5)}–{String(leg.end_time).slice(0, 5)}
                </p>
                {leg.master_name && (
                  <p>
                    <span className="text-muted-foreground">{ts('master')}: </span>
                    {leg.master_name}
                  </p>
                )}
              </div>
              {editable && (
                <div className="flex gap-3 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSlot({ date: null, time: null });
                      setError(null);
                      setReschedLeg(leg);
                    }}
                  >
                    {t('reschedule')}
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      setError(null);
                      setConfirmLeg(leg);
                    }}
                  >
                    {t('cancel')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {visit.comment && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {visit.comment}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmLeg !== null} onOpenChange={(o) => !o && setConfirmLeg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancel')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('confirmCancel')}</p>
          {error === 'failed' && (
            <p className="text-sm font-medium text-destructive">{t('actionFailed')}</p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmLeg(null)}>
              {t('keepIt')}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={cancel} disabled={busy}>
              {t('yesCancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reschedLeg !== null} onOpenChange={(o) => !o && setReschedLeg(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('pickNewTime')}</DialogTitle>
          </DialogHeader>
          {reschedLeg && (
            <SlotPicker
              serviceIds={reschedLeg.services.map((s) => s.id)}
              masterId={reschedLeg.master_id}
              durationMinutes={reschedLeg.services.reduce(
                (a, s) => a + s.duration_minutes,
                0
              )}
              blocked={blockedFor(reschedLeg.id)}
              value={slot}
              onChange={setSlot}
            />
          )}
          {error === 'slot_taken' && (
            <p className="text-sm font-medium text-destructive">{tb('slotTaken')}</p>
          )}
          {error === 'failed' && (
            <p className="text-sm font-medium text-destructive">{t('actionFailed')}</p>
          )}
          <Button
            className={cn('w-full')}
            onClick={reschedule}
            disabled={busy || !slot.date || !slot.time}
          >
            {t('saveNewTime')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
