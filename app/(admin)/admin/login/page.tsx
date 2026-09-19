'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAdminT } from '@/lib/admin-i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';

export default function AdminLoginPage() {
  const { t } = useAdminT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const envMissing =
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(t('login.error'));
      setBusy(false);
      return;
    }
    router.push('/admin/calendar');
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-2">
            <Logo size={56} />
            <h1 className="text-lg font-semibold">{t('login.title')}</h1>
          </div>
          {envMissing ? (
            <p className="rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">
              {t('login.noEnv')}
            </p>
          ) : (
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('login.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('login.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button className="w-full" size="lg" disabled={busy}>
                {t('login.signIn')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
