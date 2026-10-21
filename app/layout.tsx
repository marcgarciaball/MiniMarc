import type { Metadata, Viewport } from 'next';
import '@/styles/tokens.css';
import './globals.css';
import '@/components/ui/ui.css';
import { Wallpaper } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Agente Personal',
  description: 'Tareas, ideas, compras y regalos en un solo sitio.',
  appleWebApp: {
    capable: true,
    title: 'Agente',
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
      </body>
    </html>
  );
}
