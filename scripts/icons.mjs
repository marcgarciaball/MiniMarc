/**
 * Writes the SVG sources for the app icons and iOS launch screens:
 *   node scripts/icons.mjs <dir>
 * then renders them to public/icons with: npx @resvg/resvg-js-cli [--fit-width N] in.svg out.png
 * (icon.svg → icon-192/512, square.svg → icon-maskable-512 and apple-touch-icon 180, splash-*.svg → icons/splash/).
 */
import { writeFileSync } from 'node:fs';
const out = process.argv[2];

const glyph = `
  <rect x="120" y="150" width="232" height="56" rx="28" fill="#ffffff"/>
  <rect x="160" y="228" width="232" height="56" rx="28" fill="#ffffff" fill-opacity="0.78"/>
  <rect x="120" y="306" width="232" height="56" rx="28" fill="#ffffff" fill-opacity="0.56"/>`;

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7499bf"/>
      <stop offset="1" stop-color="#335a80"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

/** Full-bleed square (apple-touch-icon, maskable): the platform applies its own mask. */
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#sheen)"/>${glyph}
</svg>`;

/** "any" icon: rounded tile with transparent corners. */
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" rx="115" fill="url(#bg)"/>
  <rect width="512" height="512" rx="115" fill="url(#sheen)"/>${glyph}
</svg>`;

writeFileSync(`${out}/icon.svg`, rounded);
writeFileSync(`${out}/square.svg`, square);

/** Launch screen: wallpaper gradient with the icon centred at 100pt. */
const splash = (w, h, scale, dark) => {
  const [a, b, c] = dark ? ['#121a24', '#0c131b', '#090e14'] : ['#eef2f7', '#dfe7ef', '#cfdbe7'];
  const size = 100 * scale;
  const x = (w - size) / 2;
  const y = (h - size) / 2 - 20 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="wp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
    </linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="${8 * scale}" stdDeviation="${12 * scale}" flood-color="${dark ? '#000000' : '#2a4260'}" flood-opacity="${dark ? 0.45 : 0.18}"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#wp)"/>
  <g filter="url(#sh)" transform="translate(${x} ${y}) scale(${size / 512})">${defs}
    <rect width="512" height="512" rx="115" fill="url(#bg)"/>
    <rect width="512" height="512" rx="115" fill="url(#sheen)"/>${glyph}
  </g>
</svg>`;
};

const SPLASH = [
  [390, 844], // iPhone 12–14
  [393, 852], // iPhone 14 Pro, 15, 15 Pro, 16
  [402, 874], // iPhone 16 Pro, 17, 17 Pro
  [430, 932], // iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [440, 956], // iPhone 16 Pro Max, 17 Pro Max
];
for (const [w, h] of SPLASH) {
  for (const dark of [false, true]) {
    writeFileSync(`${out}/splash-${w}x${h}-${dark ? 'dark' : 'light'}.svg`, splash(w * 3, h * 3, 3, dark));
  }
}
