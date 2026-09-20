'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Plus, Trash2, Edit3, Upload, Camera, X } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { useAdminAuth } from '@/components/admin/auth-sync';
import { serviceName, type Master, type ServiceCategory } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function AdminMastersPage() {
  const { t, lang } = useAdminT();
  const { isReady } = useAdminAuth();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [masters, setMasters] = useState<Master[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaster, setEditingMaster] = useState<Master | null>(null);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mastersRes, categoriesRes, masterCatsRes] = await Promise.all([
        supabase.from('masters').select('*').order('created_at'),
        supabase.from('service_categories').select('*').order('sort_order'),
        Promise.resolve(supabase.from('master_categories').select('*')).catch(() => ({ data: [] })),
      ]);

      const allMasters = (mastersRes.data as Master[]) ?? [];
      const cats = (categoriesRes.data as ServiceCategory[]) ?? [];
      const masterCats = (masterCatsRes.data as { master_id: string; category_id: string }[]) ?? [];

      // Map categories to masters
      const masterCatMap = new Map<string, string[]>();
      for (const mc of masterCats) {
        if (!masterCatMap.has(mc.master_id)) masterCatMap.set(mc.master_id, []);
        masterCatMap.get(mc.master_id)!.push(mc.category_id);
      }

      const enriched = allMasters.map((m) => ({
        ...m,
        category_ids: masterCatMap.get(m.id) ?? [],
      }));

      // Filter out soft-deleted masters by default
      setMasters(enriched.filter((m) => !m.is_deleted));
      setCategories(cats);
    } catch (err) {
      console.error('Error loading masters:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (isReady) {
      load();
    }
  }, [isReady, load]);

  const openAddDialog = () => {
    setEditingMaster(null);
    setFirstName('');
    setLastName('');
    setPhotoUrl('');
    setIsActive(true);
    setSelectedCategoryIds(new Set(categories.map((c) => c.id))); // Pre-select all categories by default
    setDialogOpen(true);
  };

  const openEditDialog = (m: Master) => {
    setEditingMaster(m);
    // Parse first and last name
    if (m.first_name) {
      setFirstName(m.first_name);
      setLastName(m.last_name || '');
    } else {
      const parts = (m.name || '').trim().split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    }
    setPhotoUrl(m.photo_url || '');
    setIsActive(m.is_active);
    setSelectedCategoryIds(new Set(m.category_ids || []));
    setDialogOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Выберите изображение (JPG, PNG, WEBP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Размер файла не должен превышать 5MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('masters')
        .upload(filename, file, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage.from('masters').getPublicUrl(filename);
      setPhotoUrl(publicUrlData.publicUrl);
      toast.success('Фото успешно загружено');
    } catch (err: unknown) {
      console.error('Photo upload error:', err);
      toast.error('Не удалось загрузить фото. Проверьте права хранилища.');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const save = async () => {
    if (!firstName.trim()) {
      toast.error('Укажите имя мастера');
      return;
    }

    setSaving(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    try {
      let masterId = editingMaster?.id;

      if (editingMaster) {
        // Update existing master
        const updatePayload: Record<string, unknown> = {
          name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          photo_url: photoUrl || null,
          is_active: isActive,
        };

        const { error } = await supabase.from('masters').update(updatePayload).eq('id', editingMaster.id);
        if (error) {
          // If columns don't exist yet, fallback to name and is_active
          await supabase.from('masters').update({ name: fullName, is_active: isActive }).eq('id', editingMaster.id);
        }
      } else {
        // Insert new master
        const insertPayload: Record<string, unknown> = {
          name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          photo_url: photoUrl || null,
          is_active: isActive,
          is_deleted: false,
        };

        const { data, error } = await supabase.from('masters').insert(insertPayload).select().single();
        if (error) {
          // Fallback if migration not yet applied
          const { data: fbData, error: fbErr } = await supabase
            .from('masters')
            .insert({ name: fullName, is_active: isActive })
            .select()
            .single();
          if (fbErr) throw fbErr;
          masterId = fbData?.id;
        } else {
          masterId = data?.id;
        }
      }

      // Update master_categories
      if (masterId) {
        try {
          await supabase.from('master_categories').delete().eq('master_id', masterId);
          if (selectedCategoryIds.size > 0) {
            const rows = Array.from(selectedCategoryIds).map((cid) => ({
              master_id: masterId,
              category_id: cid,
            }));
            await supabase.from('master_categories').insert(rows);
          }
        } catch (catErr) {
          console.warn('Could not sync master_categories (migration might be pending):', catErr);
        }
      }

      toast.success(t('actions.saved'));
      setDialogOpen(false);
      load();
    } catch (err: unknown) {
      console.error('Save master error:', err);
      toast.error(t('actions.error'));
    } finally {
      setSaving(false);
    }
  };

  const toggleMasterActive = async (m: Master) => {
    const nextState = !m.is_active;
    setMasters((prev) =>
      prev.map((item) => (item.id === m.id ? { ...item, is_active: nextState } : item))
    );

    const { error } = await supabase.from('masters').update({ is_active: nextState }).eq('id', m.id);
    if (error) {
      setMasters((prev) =>
        prev.map((item) => (item.id === m.id ? { ...item, is_active: m.is_active } : item))
      );
      toast.error(error.message || t('actions.error'));
      return;
    }
    toast.success(t('actions.saved'));
  };

  // Soft delete preserving booking history
  const removeMaster = async (m: Master) => {
    const confirmed = confirm(
      `${t('masters.deleteConfirm')}\n\nМастер: ${m.first_name ? `${m.first_name} ${m.last_name || ''}` : m.name}`
    );
    if (!confirmed) return;

    try {
      // Soft-delete: mark is_deleted = true and is_active = false
      const { error } = await supabase
        .from('masters')
        .update({ is_deleted: true, is_active: false })
        .eq('id', m.id);

      if (error) {
        // Fallback: if is_deleted column does not exist yet, deactivate
        await supabase.from('masters').update({ is_active: false }).eq('id', m.id);
      }

      setMasters((prev) => prev.filter((item) => item.id !== m.id));
      toast.success(t('actions.saved'));
    } catch (err) {
      console.error('Error soft-deleting master:', err);
      toast.error(t('actions.error'));
    }
  };

  const getMasterDisplayName = (m: Master) => {
    if (m.first_name) {
      return `${m.first_name} ${m.last_name || ''}`.trim();
    }
    return m.name;
  };

  const getMasterInitials = (m: Master) => {
    if (m.first_name) {
      return `${m.first_name[0] || ''}${m.last_name?.[0] || ''}`.toUpperCase();
    }
    return (m.name || 'M')
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-ink">{t('nav.masters')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Управление мастерами, фото и специализацией по разделам услуг
          </p>
        </div>
        <Button onClick={openAddDialog} className="bg-primary text-white hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />
          {t('masters.add')}
        </Button>
      </div>

      {/* Master Cards List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          <p>{t('actions.loading')}</p>
        </div>
      ) : masters.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('masters.empty')}</p>
            <Button onClick={openAddDialog} variant="outline">
              <Plus className="mr-1.5 h-4 w-4" />
              {t('masters.add')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {masters.map((m) => {
            const assignedCategories = categories.filter((c) =>
              (m.category_ids || []).includes(c.id)
            );

            return (
              <Card
                key={m.id}
                className={cn(
                  'overflow-hidden rounded-2xl border border-black/10 transition-all hover:shadow-md',
                  !m.is_active && 'opacity-60 bg-muted/20'
                )}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    {/* Photo / Initials Avatar */}
                    <div className="flex items-center gap-3">
                      {m.photo_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={m.photo_url}
                          alt={m.name}
                          className="h-12 w-12 rounded-full object-cover ring-2 ring-brand-gold/30 shadow-xs"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/15 text-sm font-bold text-brand-gold ring-2 ring-brand-gold/20">
                          {getMasterInitials(m)}
                        </div>
                      )}

                      <div>
                        <p className="font-semibold text-brand-ink text-base">
                          {getMasterDisplayName(m)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.is_active ? (
                            <span className="text-emerald-600 font-medium">● Активен</span>
                          ) : (
                            <span className="text-muted-foreground">Неактивен</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Active Toggle Switch */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={m.is_active}
                        onCheckedChange={() => toggleMasterActive(m)}
                        title={m.is_active ? 'Деактивировать' : 'Активировать'}
                      />
                    </div>
                  </div>

                  {/* Categories Specialization Pills */}
                  <div className="space-y-1 pt-1 border-t border-black/5">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      {t('masters.categories')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {assignedCategories.length > 0 ? (
                        assignedCategories.map((c) => (
                          <Badge
                            key={c.id}
                            variant="secondary"
                            className="rounded-lg px-2 py-0.5 text-[11px] font-normal"
                          >
                            {serviceName(c, lang)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          {t('masters.noCategories')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions: Edit & Soft-delete */}
                  <div className="flex items-center justify-end gap-1 pt-2 border-t border-black/5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-medium text-brand-ink hover:text-brand-gold"
                      onClick={() => openEditDialog(m)}
                    >
                      <Edit3 className="mr-1 h-3.5 w-3.5" />
                      {t('actions.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-medium text-destructive hover:bg-destructive/10"
                      onClick={() => removeMaster(m)}
                      title="Удалить мастера (сохраняя историю записей)"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t('actions.delete')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Master Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMaster ? t('masters.edit') : t('masters.add')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Photo Upload & Preview */}
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="relative group">
                {photoUrl ? (
                  <div className="relative h-24 w-24 rounded-full overflow-hidden ring-3 ring-brand-gold/50 shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                      title="Удалить фото"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-full border-2 border-dashed border-brand-gold/50 bg-brand-gold/5 text-brand-gold hover:bg-brand-gold/10 transition-colors"
                  >
                    <Camera className="h-6 w-6 mb-1" />
                    <span className="text-[10px] font-medium text-center px-1">Добавить фото</span>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
              >
                <Upload className="mr-1.5 h-3 w-3" />
                {uploadingPhoto ? 'Загрузка…' : t('masters.photoUpload')}
              </Button>
            </div>

            {/* Name Fields (English) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs font-semibold">
                  {t('masters.firstName')} *
                </Label>
                <Input
                  id="firstName"
                  placeholder="e.g. Nino"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs font-semibold">
                  {t('masters.lastName')}
                </Label>
                <Input
                  id="lastName"
                  placeholder="e.g. Beridze"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            {/* Category Specialization Checkboxes */}
            <div className="space-y-2 pt-2 border-t border-black/5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  {t('masters.categories')}
                </Label>
                <button
                  type="button"
                  className="text-[11px] text-brand-gold hover:underline"
                  onClick={() => {
                    if (selectedCategoryIds.size === categories.length) {
                      setSelectedCategoryIds(new Set());
                    } else {
                      setSelectedCategoryIds(new Set(categories.map((c) => c.id)));
                    }
                  }}
                >
                  {selectedCategoryIds.size === categories.length ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                {categories.map((c) => {
                  const isChecked = selectedCategoryIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border p-2.5 text-xs font-medium cursor-pointer transition-colors',
                        isChecked
                          ? 'border-brand-gold/60 bg-brand-gold/10 text-brand-ink'
                          : 'border-black/10 bg-background text-muted-foreground hover:bg-accent'
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleCategory(c.id)}
                      />
                      <span className="flex-1">{serviceName(c, lang)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Active Switch */}
            <div className="flex items-center justify-between rounded-xl border border-black/10 p-3">
              <div>
                <p className="text-sm font-medium text-brand-ink">{t('masters.active')}</p>
                <p className="text-xs text-muted-foreground">Доступен для новых записей</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            {/* Save Button */}
            <Button
              className="w-full bg-primary text-white hover:bg-primary/90"
              size="lg"
              onClick={save}
              disabled={saving || uploadingPhoto}
            >
              {saving ? t('actions.loading') : t('actions.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
