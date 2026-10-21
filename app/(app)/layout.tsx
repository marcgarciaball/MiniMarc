import { Suspense } from 'react';
import { CaptureBar } from '@/components/CaptureBar';
import { AppNav } from '@/components/app/AppNav';
import { AppShell } from '@/components/app/AppShell';
import { CurrentAppNav } from '@/components/app/CurrentAppNav';
import '@/components/app/app.css';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      nav={
        // usePathname suspends under /regalos/[personId] while prerendering; the fallback is the same nav, unhighlighted.
        <Suspense fallback={<AppNav active={null} />}>
          <CurrentAppNav />
        </Suspense>
      }
      capture={<CaptureBar />}
    >
      {children}
    </AppShell>
  );
}
