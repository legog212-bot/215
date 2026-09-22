import { NextResponse } from 'next/server';

export function GET() {
  const manifest = {
    name: '№215 Admin',
    short_name: '№215 Admin',
    description: 'Salon №215 — Admin Panel',
    start_url: '/admin/calendar',
    scope: '/admin',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#232323',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
