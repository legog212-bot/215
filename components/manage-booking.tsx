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
import { SlotPicker, type SlotValue } from '@/components/slot-picker';
import { serviceName, type BookingDetails } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'muted' | 'secondary'> = {
  confirmed: 'success',
  cancelled: 'destructive',
  completed: 'secondary',
  no_show: 'muted',
};

export function ManageBooking({ booking, token }: { booking: BookingDetails; token: string }) {
  const t = useTranslations('manage');
  const ts = useTranslations('success');
  const tb = useTranslations('booking');
  const locale = useLocale();

  const [current, setCurrent] = useState(booking);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [slot, setSlot] = useState<SlotValue>({ date: null, time: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = current.status === 'confirmed';

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrent(data);
        setConfirmOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async () => {
    if (!slot.date || !slot.time) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${token}?locale=${locale}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', date: slot.date, start: slot.time }),
      });
      if (res.status === 409) {
        setError('slot_taken');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCurrent(data);
        setReschedOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold text-brand-ink">{current.order_number}</p>
            <Badge variant={STATUS_VARIANT[current.status] ?? 'secondary'}>
              {t(`statuses.${current.status}`)}
            </Badge>
          </div>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">{ts('services')}: </span>
              {current.services.map((s) => serviceName(s, locale)).join(' + ')}
            </p>
            <p>
              <span className="text-muted-foreground">{ts('date')}: </span>
              {current.booking_date}
            </p>
            <p>
              <span className="text-muted-foreground">{ts('time')}: </span>
              {String(current.start_time).slice(0, 5)}–{String(current.end_time).slice(0, 5)}
            </p>
            {current.master_name && (
              <p>
                <span className="text-muted-foreground">{ts('master')}: </span>
                {current.master_name}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {editable && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setSlot({ date: null, time: null });
              setError(null);
              setReschedOpen(true);
            }}
          >
            {t('reschedule')}
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => setConfirmOpen(true)}>
            {t('cancel')}
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancel')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('confirmCancel')}</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
              {t('keepIt')}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={cancel} disabled={busy}>
              {t('yesCancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reschedOpen} onOpenChange={setReschedOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('pickNewTime')}</DialogTitle>
          </DialogHeader>
          <SlotPicker
            serviceIds={current.services.map((s) => s.id)}
            masterId={current.master_id}
            value={slot}
            onChange={setSlot}
          />
          {error === 'slot_taken' && (
            <p className="text-sm font-medium text-destructive">{tb('slotTaken')}</p>
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
