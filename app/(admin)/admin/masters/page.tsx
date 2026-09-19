'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import type { Master } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function AdminMastersPage() {
  const { t } = useAdminT();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [masters, setMasters] = useState<Master[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('masters').select('*').order('created_at');
    setMasters(data ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from('masters').insert({ name: name.trim() });
    if (error) return toast.error(t('actions.error'));
    setName('');
    load();
  };

  const toggle = async (m: Master) => {
    await supabase.from('masters').update({ is_active: !m.is_active }).eq('id', m.id);
    load();
  };

  const remove = async (id: string) => {
    // fails with FK error if the master has bookings — then just deactivate
    const { error } = await supabase.from('masters').delete().eq('id', id);
    if (error) toast.error(t('actions.error'));
    load();
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
        <Button onClick={add}>
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
              <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
