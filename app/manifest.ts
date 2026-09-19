import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Beauty Salon №215',
    short_name: '№215',
    description: 'Online booking — Care • Radiance • You',
    start_url: '/ka',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
