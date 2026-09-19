import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Logo({ className, size = 48 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="Beauty Salon №215"
      width={size}
      height={size}
      className={cn('rounded-xl object-contain', className)}
      quality={100}
      unoptimized
      priority
    />
  );
}
