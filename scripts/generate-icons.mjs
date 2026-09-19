// Generates PWA/favicon icons from public/logo.png — run: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const logo = 'public/logo.png';

await mkdir('public/icons', { recursive: true });
await mkdir('app', { recursive: true });

const square = (size, bg) =>
  sharp(logo)
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toBuffer();

await sharp(await square(192, '#ffffff')).toFile('public/icons/icon-192.png');
await sharp(await square(512, '#ffffff')).toFile('public/icons/icon-512.png');
// maskable needs safe-zone padding — white bg + contain handles it
await sharp(await square(512, '#ffffff')).toFile('public/icons/icon-maskable-512.png');
await sharp(await square(180, '#ffffff')).toFile('app/apple-icon.png');
await sharp(await square(256, '#ffffff')).toFile('app/icon.png');

console.log('icons generated');
