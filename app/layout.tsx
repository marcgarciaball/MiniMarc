import type { Metadata, Viewport } from 'next';
import '@/styles/tokens.css';
import './globals.css';
import '@/components/ui/ui.css';
import { Wallpaper } from '@/components/ui';
import { ServiceWorker } from '@/components/app/ServiceWorker';

/** iPhone screens (pt) with a launch image at @3x, light and dark (public/icons/splash). */
const SPLASH_SIZES = [
  [390, 844],
  [393, 852],
  [402, 874],
  [430, 932],
  [440, 956],
] as const;

const startupImage = SPLASH_SIZES.flatMap(([w, h]) =>
  (['light', 'dark'] as const).map((scheme) => ({
    url: `/icons/splash/splash-${w}x${h}-${scheme}.png`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
  })),
);

export const metadata: Metadata = {
  title: 'Agente Personal',
  description: 'Tareas, ideas, compras y regalos en un solo sitio.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
  },
  appleWebApp: {
    capable: true,
    title: 'Agente',
    startupImage,
    // 'default' keeps dark status-bar text over the pale glacier wallpaper (and light text in dark mode);
    // 'black-translucent' would force white text, unreadable over the light glass bar.
    statusBarStyle: 'default',
  },
  // iOS < 17 only reads the prefixed name; Next emits the unprefixed one.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Top tone of the wallpaper, so the status bar blends into the glass nav bar.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#121a24' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es">
      <body>
        <Wallpaper />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
