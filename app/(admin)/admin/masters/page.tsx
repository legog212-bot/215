'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { useAdminAuth } from '@/components/admin/auth-sync';
import type { Master } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function AdminMastersPage() {
  const { t } = useAdminT();
  const { isReady } = useAdminAuth();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [masters, setMasters] = useState<Master[]>([]);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('masters').select('*').order('created_at');
    if (error) {
      console.error('[load masters error]:', error);
      return;
    }
    setMasters(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (isReady) {
      load();
    }
  }, [isReady, load]);

  const add = async () => {
    if (!name.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('masters').insert({ name: name.trim() });
    setAdding(false);
    if (error) {
      toast.error(error.message || t('actions.error'));
      return;
    }
    toast.success(t('actions.saved'));
    setName('');
    load();
  };

  const toggle = async (m: Master) => {
    const nextState = !m.is_active;
    // Optimistic UI update
    setMasters((prev) =>
      prev.map((item) => (item.id === m.id ? { ...item, is_active: nextState } : item))
    );

    const { error } = await supabase.from('masters').update({ is_active: nextState }).eq('id', m.id);
    if (error) {
      // Revert on error
      setMasters((prev) =>
        prev.map((item) => (item.id === m.id ? { ...item, is_active: m.is_active } : item))
      );
      toast.error(error.message || t('actions.error'));
      return;
    }
    toast.success(t('actions.saved'));
  };

  const remove = async (id: string, masterName: string) => {
    if (!confirm(`Удалить мастера ${masterName}?`)) return;

    // Fails with FK constraint if the master has bookings
    const { error } = await supabase.from('masters').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        toast.error('Нельзя удалить мастера, у которого есть записи. Вместо удаления отключите его переключателем.');
      } else {
        toast.error(error.message || t('actions.error'));
      }
      return;
    }
    setMasters((prev) => prev.filter((item) => item.id !== id));
    toast.success(t('actions.saved'));
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t('nav.masters')}</h1>

      <div className="flex gap-2">
        <Input
          placeholder={t('masters.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button onClick={add} disabled={adding}>
          <Plus className="mr-1 h-4 w-4" />
          {t('masters.add')}
        </Button>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {masters.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">{t('masters.empty')}</p>
          )}
          {masters.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <p className="flex-1 font-medium">{m.name}</p>
              <Switch checked={m.is_active} onCheckedChange={() => toggle(m)} />
              <Button variant="ghost" size="icon" onClick={() => remove(m.id, m.name)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
