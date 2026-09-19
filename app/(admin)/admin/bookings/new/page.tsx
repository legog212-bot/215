'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { useAdminAuth } from '@/components/admin/auth-sync';
import { serviceName, type Master, type Service, type ServiceCategory } from '@/lib/types';
import { SlotPickerBase, type SlotValue } from '@/components/slot-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export default function AdminNewBookingPage() {
  const { t, lang } = useAdminT();
  const { isReady } = useAdminAuth();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [masterId, setMasterId] = useState<string>('any');
  const [slot, setSlot] = useState<SlotValue>({ date: null, time: null });
  const [form, setForm] = useState({ name: '', surname: '', phone: '', comment: '' });
  const [conflict, setConflict] = useState(false);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    Promise.all([
      supabase.from('service_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('services').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('masters').select('*').eq('is_active', true).order('created_at'),
    ]).then(([c, s, m]) => {
      setCategories(c.data ?? []);
      setServices(s.data ?? []);
      setMasters(m.data ?? []);
    });
  }, [supabase, isReady]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (!form.name.trim() || !form.surname.trim() || !form.phone.trim() || !selected.size) {
      toast.error(t('bookingForm.fillFields'));
      return;
    }
    if (!slot.date || !slot.time) {
      toast.error(t('bookingForm.selectSlot'));
      return;
    }
    setBusy(true);
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        surname: form.surname.trim(),
        phone: form.phone.trim(),
        comment: form.comment.trim(),
        serviceIds: [...selected],
        masterId: masterId === 'any' ? null : masterId,
        date: slot.date,
        start: slot.time,
        locale: 'ka',
        force,
      }),
    });
    setBusy(false);
    if (res.status === 409) {
      setConflict(true);
      return;
    }
    if (!res.ok) {
      toast.error(t('actions.error'));
      return;
    }
    toast.success(t('bookingForm.created'));
    router.push('/admin/calendar');
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t('bookingForm.title')}</h1>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('bookingForm.clientName')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('bookingForm.clientSurname')}</Label>
              <Input
                value={form.surname}
                onChange={(e) => setForm({ ...form, surname: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('bookingForm.phone')}</Label>
            <Input
              type="tel"
              placeholder="+995 5XX XX XX XX"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('bookingForm.comment')}</Label>
            <Input
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label>{t('bookingForm.services')}</Label>
        {categories.map((c) => {
          const catServices = services.filter((s) => s.category_id === c.id);
          if (!catServices.length) return null;
          return (
            <div key={c.id}>
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                {serviceName(c, lang)}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {catServices.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-sm"
                  >
                    <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                    {serviceName(s, lang)}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label>{t('bookingForm.master')}</Label>
        <Select value={masterId} onValueChange={setMasterId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t('bookingForm.anyMaster')}</SelectItem>
            {masters.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <SlotPickerBase
          serviceIds={[...selected]}
          masterId={masterId === 'any' ? null : masterId}
          value={slot}
          onChange={(v) => {
            setSlot(v);
            setConflict(false);
          }}
          localeTag={lang === 'ka' ? 'ka-GE' : 'ru-RU'}
          labels={{
            chooseDate: t('bookingForm.date'),
            chooseTime: t('bookingForm.time'),
            noSlots: t('bookingForm.noSlots'),
            loading: t('actions.loading'),
          }}
        />
      )}

      {conflict && (
        <div className="space-y-2 rounded-xl border border-destructive/50 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">{t('bookingForm.conflict')}</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
            {t('bookingForm.force')}
          </label>
        </div>
      )}

      <Button className="w-full" size="lg" onClick={submit} disabled={busy}>
        {t('bookingForm.create')}
      </Button>
    </div>
  );
}
