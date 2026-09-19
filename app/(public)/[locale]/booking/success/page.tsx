'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

interface LastBooking {
  orderNumber: string;
  token: string;
  whatsappSent: boolean;
}

export default function BookingSuccessPage() {
  const t = useTranslations('success');
  const [booking, setBooking] = useState<LastBooking | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('lastBooking');
      setBooking(raw ? JSON.parse(raw) : null);
    } catch {
      setBooking(null);
    }
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  return (
    <div className="space-y-6 pt-6 text-center">
      <CheckCircle2 className="mx-auto h-16 w-16 text-brand-gold" />
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {booking ? (
        <Card className="text-left">
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('orderNumber')}
              </p>
              <p className="text-xl font-bold text-brand-ink">{booking.orderNumber}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {booking.whatsappSent ? t('whatsappNote') : t('whatsappFailed')}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/manage/${booking.token}`}>{t('manageLink')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{t('whatsappNote')}</p>
      )}

      <Button asChild variant="ghost">
        <Link href="/">{t('home')}</Link>
      </Button>
    </div>
  );
}
