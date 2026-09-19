'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import type { Master, WorkingHours } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

import { useAdminAuth } from '@/components/admin/auth-sync';

interface DayRow {
  is_day_off: boolean;
  open_time: string;
  close_time: string;
}

const emptyRow: DayRow = { is_day_off: false, open_time: '10:00', close_time: '20:00' };

export default function AdminSchedulePage() {
  const { t } = useAdminT();
  const { isReady } = useAdminAuth();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [masters, setMasters] = useState<Master[]>([]);
  const [scope, setScope] = useState<string>('salon'); // 'salon' | master id
  const [rows, setRows] = useState<DayRow[]>(Array.from({ length: 7 }, () => ({ ...emptyRow })));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: m }, { data: h }] = await Promise.all([
      supabase.from('masters').select('*').eq('is_active', true).order('created_at'),
      supabase.from('working_hours').select('*'),
    ]);
    setMasters(m ?? []);
    const hours = (h as WorkingHours[]) ?? [];
    const scoped = hours.filter((r) =>
      scope === 'salon' ? r.master_id === null : r.master_id === scope
    );
    const next = Array.from({ length: 7 }, (_, dow) => {
      const row = scoped.find((r) => r.day_of_week === dow);
      return row
        ? {
            is_day_off: row.is_day_off,
            open_time: row.open_time?.slice(0, 5) ?? '10:00',
            close_time: row.close_time?.slice(0, 5) ?? '20:00',
          }
        : { ...emptyRow };
    });
    setRows(next);
  }, [supabase, scope]);

  useEffect(() => {
    if (isReady) {
      load();
    }
  }, [isReady, load]);

  const save = async () => {
    setBusy(true);
    const masterId = scope === 'salon' ? null : scope;
    // wipe the scope's rows, insert fresh — simpler than upserting null-keyed rows
    let del = supabase.from('working_hours').delete();
    del = masterId ? del.eq('master_id', masterId) : del.is('master_id', null);
    const { error: delError } = await del;
    if (delError) {
      setBusy(false);
      return toast.error(delError.message || t('actions.error'));
    }

    const inserts = rows.map((r, dow) => ({
      master_id: masterId,
      day_of_week: dow,
      open_time: r.is_day_off ? null : r.open_time,
      close_time: r.is_day_off ? null : r.close_time,
      is_day_off: r.is_day_off,
    }));
    const { error } = await supabase.from('working_hours').insert(inserts);
    setBusy(false);
    if (error) return toast.error(error.message || t('actions.error'));
    toast.success(t('actions.saved'));
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t('nav.schedule')}</h1>

      <Select value={scope} onValueChange={setScope}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="salon">{t('schedule.salonDefault')}</SelectItem>
          {masters.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="divide-y p-0">
          {rows.map((r, dow) => (
            <div key={dow} className="flex items-center gap-3 px-4 py-3">
              <p className="w-24 shrink-0 text-sm font-medium">{t(`schedule.days.${dow}`)}</p>
              <Switch
                checked={!r.is_day_off}
                onCheckedChange={(v) =>
                  setRows(rows.map((x, i) => (i === dow ? { ...x, is_day_off: !v } : x)))
                }
              />
              {r.is_day_off ? (
                <span className="text-sm text-muted-foreground">{t('schedule.dayOff')}</span>
              ) : (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    type="time"
                    className="h-9 w-[7.5rem]"
                    value={r.open_time}
                    onChange={(e) =>
                      setRows(rows.map((x, i) => (i === dow ? { ...x, open_time: e.target.value } : x)))
                    }
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    className="h-9 w-[7.5rem]"
                    value={r.close_time}
                    onChange={(e) =>
                      setRows(rows.map((x, i) => (i === dow ? { ...x, close_time: e.target.value } : x)))
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={save} disabled={busy}>
        {t('actions.save')}
      </Button>
    </div>
  );
}
