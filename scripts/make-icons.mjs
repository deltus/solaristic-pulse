// Generates app icons from assets/s-mark.png (the blue "S" network mark).
// Run: npm run icons
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const NAVY = '#0E1A3A';
const MARK = 'assets/s-mark.png';
mkdirSync('public/icons', { recursive: true });

// Icon = navy square (optionally rounded), white circle, blue mark inside.
async function icon(size, { circleRatio = 0.78, radius = 0 } = {}) {
  const circle = Math.round(size * circleRatio);
  const markH = Math.round(circle * 0.78);
  const mark = await sharp(MARK).resize({ height: markH }).png().toBuffer();
  const { width: markW } = await sharp(mark).metadata();
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#14235A"/><stop offset="1" stop-color="${NAVY}"/></linearGradient></defs>
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${circle / 2}" fill="#fff"/>
    </svg>`
  );
  return sharp(bg)
    .composite([{ input: mark, left: Math.round((size - markW) / 2), top: Math.round((size - markH) / 2) }])
    .png();
}

await (await icon(192, { radius: 36 })).toFile('public/icons/icon-192.png');
await (await icon(512, { radius: 96 })).toFile('public/icons/icon-512.png');
// Maskable: full-bleed square, mark kept inside the 80% safe zone.
await (await icon(512, { circleRatio: 0.62 })).toFile('public/icons/maskable-512.png');
await (await icon(180, { circleRatio: 0.8 })).toFile('public/icons/apple-touch-icon.png');
await (await icon(64, { radius: 14, circleRatio: 0.86 })).toFile('public/icons/favicon-64.png');
// Transparent mark for in-app header / PIN screen.
await sharp(MARK).resize({ height: 160 }).png().toFile('public/icons/mark.png');
console.log('Icons written to public/icons');
