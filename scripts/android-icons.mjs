// Generates Android launcher icons, the notification icon and splash screens
// from assets/s-mark.png. Run after `npx cap add android`: npm run icons:android
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const RES = 'android/app/src/main/res';
const MARK = 'assets/s-mark.png';
const NAVY = '#0E1A3A';
if (!existsSync(RES)) throw new Error('Run `npx cap add android` first.');

async function markOnCircle(size, circleRatio, bg) {
  const circle = Math.round(size * circleRatio);
  const markH = Math.round(circle * 0.78);
  const mark = await sharp(MARK).resize({ height: markH }).png().toBuffer();
  const { width: markW } = await sharp(mark).metadata();
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
    <circle cx="${size / 2}" cy="${size / 2}" r="${circle / 2}" fill="#fff"/></svg>`);
  return sharp(base).composite([{ input: mark, left: Math.round((size - markW) / 2), top: Math.round((size - markH) / 2) }]).png();
}

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  const dir = `${RES}/mipmap-${d}`;
  mkdirSync(dir, { recursive: true });
  // Legacy square + round icons (48dp).
  await (await markOnCircle(48 * k, 0.86, NAVY)).toFile(`${dir}/ic_launcher.png`);
  await (await markOnCircle(48 * k, 0.86, NAVY)).toFile(`${dir}/ic_launcher_round.png`);
  // Adaptive foreground (108dp canvas, artwork inside the 66dp safe zone).
  await (await markOnCircle(108 * k, 0.6, null)).toFile(`${dir}/ic_launcher_foreground.png`);
  // Notification icon: white silhouette of the mark (24dp).
  const nd = `${RES}/drawable-${d}`;
  mkdirSync(nd, { recursive: true });
  const px = Math.round(24 * k);
  const alpha = await sharp(MARK).resize({ height: px - 2 * k, width: px, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).extractChannel('alpha').toBuffer();
  await sharp({ create: { width: px, height: Math.round(px - 2 * k), channels: 3, background: '#ffffff' } })
    .joinChannel(alpha).png().toFile(`${nd}/ic_stat_pulse.png`);
}
writeFileSync(`${RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${NAVY}</color>\n</resources>\n`);

// Splash screens: navy background with the mark in a white circle.
for (const orient of ['port', 'land']) {
  for (const [d, k] of Object.entries(densities)) {
    const [w, h] = orient === 'port' ? [320 * k, 480 * k] : [480 * k, 320 * k];
    const m = Math.round(Math.min(w, h) * 0.32);
    const icon = await (await markOnCircle(m, 1, null)).toBuffer();
    await sharp({ create: { width: w, height: h, channels: 4, background: NAVY } })
      .composite([{ input: icon, left: Math.round((w - m) / 2), top: Math.round((h - m) / 2) }])
      .png().toFile(`${RES}/drawable-${orient}-${d}/splash.png`);
  }
}
const m = 160;
const icon = await (await markOnCircle(m, 1, null)).toBuffer();
await sharp({ create: { width: 480, height: 800, channels: 4, background: NAVY } }).composite([{ input: icon, left: 160, top: 320 }]).png().toFile(`${RES}/drawable/splash.png`);
console.log('Android icons and splash screens written.');
