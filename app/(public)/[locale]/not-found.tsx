import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-5xl font-bold text-brand-gold">404</p>
      <p className="mt-3 text-muted-foreground">Page not found</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">№215</Link>
      </Button>
    </div>
  );
}
