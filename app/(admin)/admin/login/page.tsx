'use client';

import { useState } from 'react';
import { useAdminT } from '@/lib/admin-i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function AdminLoginPage() {
  const { t } = useAdminT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503) {
          setError('Supabase не настроен в Netlify (проверьте переменные окружения).');
        } else if (res.status === 429) {
          setError('Слишком много попыток входа. Подождите 1 минуту.');
        } else if (data.error === 'Invalid login credentials' || res.status === 401) {
          setError('Неверный пароль.');
        } else if (data.error === 'Email not confirmed') {
          setError('Email не подтверждён в Supabase. Отметьте "Auto Confirm User" в Supabase Dashboard.');
        } else {
          setError(data.error || t('login.error'));
        }
        setBusy(false);
        return;
      }
      if (data.session) {
        try {
          const supabase = createBrowserSupabase();
          await supabase.auth.setSession(data.session);
        } catch (e) {
          console.error('[setSession error]:', e);
        }
      }
      window.location.href = '/admin/calendar';
    } catch {
      setError('Ошибка сети при входе. Попробуйте ещё раз.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-3">
            <Logo size={72} />
            <h1 className="text-lg font-semibold">{t('login.title')}</h1>
          </div>
          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button className="w-full" size="lg" disabled={busy}>
              {t('login.signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
