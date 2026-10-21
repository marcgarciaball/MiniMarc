import type { Metadata, Viewport } from 'next';
import '@/styles/tokens.css';
import './globals.css';
import '@/components/ui/ui.css';
import { fontVariables } from './fonts';

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
    { media: '(prefers-color-scheme: light)', color: '#f3eee3' },
    { media: '(prefers-color-scheme: dark)', color: '#1e1d1a' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
