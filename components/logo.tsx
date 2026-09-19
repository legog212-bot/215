import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  width?: number;
  height?: number;
  size?: number;
  priority?: boolean;
}

export function Logo({ className, width, height, size, priority = true }: LogoProps) {
  const ASPECT_RATIO = 1024 / 610;

  let finalWidth: number;
  let finalHeight: number;

  if (width && height) {
    finalWidth = width;
    finalHeight = height;
  } else if (height) {
    finalHeight = height;
    finalWidth = Math.round(height * ASPECT_RATIO);
  } else if (width) {
    finalWidth = width;
    finalHeight = Math.round(width / ASPECT_RATIO);
  } else if (size) {
    finalHeight = size;
    finalWidth = Math.round(size * ASPECT_RATIO);
  } else {
    finalHeight = 64;
    finalWidth = Math.round(64 * ASPECT_RATIO);
  }

  return (
    <Image
      src="/logo.png"
      alt="Beauty Salon №215"
      width={finalWidth}
      height={finalHeight}
      className={cn('object-contain', className)}
      quality={100}
      unoptimized
      priority={priority}
    />
  );
}
