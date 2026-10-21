import type { Metadata, Viewport } from 'next';
import '@/styles/tokens.css';
import './globals.css';
import '@/components/ui/ui.css';

export const metadata: Metadata = {
  title: 'Agente Personal',
  description: 'Tareas, ideas, compras y regalos en un solo sitio.',
  appleWebApp: {
    capable: true,
    title: 'Agente',
    statusBarStyle: 'default',
  },
  // iOS < 17 only reads the prefixed name; Next emits the unprefixed one.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2eee8' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0e0c' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
