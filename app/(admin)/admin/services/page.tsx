'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { formatPrice, serviceName, type Service, type ServiceCategory } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

import { useAdminAuth } from '@/components/admin/auth-sync';

interface ServiceForm {
  id?: string;
  category_id: string;
  name_ka: string;
  name_ru: string;
  name_en: string;
  price_from: string;
  price_to: string;
  duration_minutes: string;
}

interface CategoryForm {
  id?: string;
  name_ka: string;
  name_ru: string;
  name_en: string;
}

export default function AdminServicesPage() {
  const { t, lang } = useAdminT();
  const { isReady } = useAdminAuth();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceForm, setServiceForm] = useState<ServiceForm | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('service_categories').select('*').order('sort_order'),
      supabase.from('services').select('*').order('sort_order'),
    ]);
    setCategories(c.data ?? []);
    setServices(s.data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (isReady) {
      load();
    }
  }, [isReady, load]);

  const saveService = async () => {
    if (!serviceForm) return;
    setBusy(true);
    const payload = {
      category_id: serviceForm.category_id,
      name_ka: serviceForm.name_ka.trim(),
      name_ru: serviceForm.name_ru.trim(),
      name_en: serviceForm.name_en.trim() || null,
      price_from: Number(serviceForm.price_from),
      price_to: serviceForm.price_to === '' ? null : Number(serviceForm.price_to),
      duration_minutes: Number(serviceForm.duration_minutes) || 30,
    };
    const { error } = serviceForm.id
      ? await supabase.from('services').update(payload).eq('id', serviceForm.id)
      : await supabase
          .from('services')
          .insert({ ...payload, sort_order: services.length });
    setBusy(false);
    if (error) return toast.error(error.message || t('actions.error'));
    setServiceForm(null);
    load();
  };

  const saveCategory = async () => {
    if (!categoryForm) return;
    setBusy(true);
    const payload = {
      name_ka: categoryForm.name_ka.trim(),
      name_ru: categoryForm.name_ru.trim(),
      name_en: categoryForm.name_en.trim() || null,
    };
    const { error } = categoryForm.id
      ? await supabase.from('service_categories').update(payload).eq('id', categoryForm.id)
      : await supabase
          .from('service_categories')
          .insert({ ...payload, sort_order: categories.length });
    setBusy(false);
    if (error) return toast.error(error.message || t('actions.error'));
    setCategoryForm(null);
    load();
  };

  const removeService = async (id: string) => {
    if (!confirm(t('services.confirmDeleteService'))) return;
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        toast.error('Нельзя удалить услугу с существующими записями. Отключите её переключателем.');
      } else {
        toast.error(error.message || t('actions.error'));
      }
      return;
    }
    toast.success(t('actions.saved'));
    load();
  };

  const removeCategory = async (id: string) => {
    if (!confirm(t('services.confirmDeleteCategory'))) return;
    const { error } = await supabase.from('service_categories').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        toast.error('Нельзя удалить категорию с привязанными услугами.');
      } else {
        toast.error(error.message || t('actions.error'));
      }
      return;
    }
    toast.success(t('actions.saved'));
    load();
  };

  // swap sort_order with the neighbour — simple, mobile-friendly ordering
  const move = async (
    table: 'services' | 'service_categories',
    items: { id: string; sort_order: number }[],
    index: number,
    dir: -1 | 1
  ) => {
    const other = index + dir;
    if (other < 0 || other >= items.length) return;
    const a = items[index];
    const b = items[other];
    await supabase.from(table).update({ sort_order: b.sort_order }).eq('id', a.id);
    await supabase.from(table).update({ sort_order: a.sort_order }).eq('id', b.id);
    load();
  };

  const toggleCategory = async (c: ServiceCategory, v: boolean) => {
    setCategories((prev) => prev.map((item) => (item.id === c.id ? { ...item, is_active: v } : item)));
    const { error } = await supabase.from('service_categories').update({ is_active: v }).eq('id', c.id);
    if (error) {
      setCategories((prev) => prev.map((item) => (item.id === c.id ? { ...item, is_active: c.is_active } : item)));
      toast.error(error.message || t('actions.error'));
      return;
    }
    toast.success(t('actions.saved'));
  };

  const toggleService = async (s: Service, v: boolean) => {
    setServices((prev) => prev.map((item) => (item.id === s.id ? { ...item, is_active: v } : item)));
    const { error } = await supabase.from('services').update({ is_active: v }).eq('id', s.id);
    if (error) {
      setServices((prev) => prev.map((item) => (item.id === s.id ? { ...item, is_active: s.is_active } : item)));
      toast.error(error.message || t('actions.error'));
      return;
    }
    toast.success(t('actions.saved'));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('nav.services')}</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCategoryForm({ name_ka: '', name_ru: '', name_en: '' })}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t('services.addCategory')}
        </Button>
      </div>

      {categories.map((c, ci) => {
        const catServices = services.filter((s) => s.category_id === c.id);
        return (
          <Card key={c.id} className={cn_off(c.is_active)}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">{serviceName(c, lang)}</h2>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={c.is_active}
                    onCheckedChange={(v) => toggleCategory(c, v)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move('service_categories', categories, ci, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move('service_categories', categories, ci, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCategoryForm({
                        id: c.id,
                        name_ka: c.name_ka,
                        name_ru: c.name_ru,
                        name_en: c.name_en ?? '',
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeCategory(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {catServices.map((s, si) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{serviceName(s, lang)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(s)} · {s.duration_minutes} min
                      </p>
                    </div>
                    <Switch
                      checked={s.is_active}
                      onCheckedChange={(v) => toggleService(s, v)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => move('services', catServices, si, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => move('services', catServices, si, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setServiceForm({
                          id: s.id,
                          category_id: s.category_id,
                          name_ka: s.name_ka,
                          name_ru: s.name_ru,
                          name_en: s.name_en ?? '',
                          price_from: String(s.price_from),
                          price_to: s.price_to == null ? '' : String(s.price_to),
                          duration_minutes: String(s.duration_minutes),
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeService(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    setServiceForm({
                      category_id: c.id,
                      name_ka: '',
                      name_ru: '',
                      name_en: '',
                      price_from: '',
                      price_to: '',
                      duration_minutes: '30',
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t('services.addService')}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* service dialog */}
      <Dialog open={!!serviceForm} onOpenChange={(o) => !o && setServiceForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('services.addService')}</DialogTitle>
          </DialogHeader>
          {serviceForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t('services.category')}</Label>
                <Select
                  value={serviceForm.category_id}
                  onValueChange={(v) => setServiceForm({ ...serviceForm, category_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {serviceName(c, lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('services.nameKa')}</Label>
                  <Input
                    value={serviceForm.name_ka}
                    onChange={(e) => setServiceForm({ ...serviceForm, name_ka: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('services.nameRu')}</Label>
                  <Input
                    value={serviceForm.name_ru}
                    onChange={(e) => setServiceForm({ ...serviceForm, name_ru: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('services.nameEn')}</Label>
                  <Input
                    value={serviceForm.name_en}
                    onChange={(e) => setServiceForm({ ...serviceForm, name_en: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('services.priceFrom')}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={serviceForm.price_from}
                    onChange={(e) => setServiceForm({ ...serviceForm, price_from: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('services.priceTo')}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t('services.priceToHint')}
                    value={serviceForm.price_to}
                    onChange={(e) => setServiceForm({ ...serviceForm, price_to: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('services.duration')}</Label>
                  <Input
                    type="number"
                    min="5"
                    step="5"
                    value={serviceForm.duration_minutes}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, duration_minutes: e.target.value })
                    }
                  />
                </div>
              </div>
              <Button className="w-full" onClick={saveService} disabled={busy}>
                {t('actions.save')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* category dialog */}
      <Dialog open={!!categoryForm} onOpenChange={(o) => !o && setCategoryForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('services.addCategory')}</DialogTitle>
          </DialogHeader>
          {categoryForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t('services.nameKa')}</Label>
                <Input
                  value={categoryForm.name_ka}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_ka: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('services.nameRu')}</Label>
                <Input
                  value={categoryForm.name_ru}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_ru: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('services.nameEn')}</Label>
                <Input
                  value={categoryForm.name_en}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_en: e.target.value })}
                />
              </div>
              <Button className="w-full" onClick={saveCategory} disabled={busy}>
                {t('actions.save')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cn_off(active: boolean) {
  return active ? '' : 'opacity-50';
}
