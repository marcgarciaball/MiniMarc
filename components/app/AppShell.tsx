import type { ReactNode } from 'react';

export type AppShellProps = {
  /** Usually `<AppNav>` (tab bar on iPhone, sidebar from 900px). */
  nav: ReactNode;
  /** Usually `<CaptureBar>`: above the tab bar on iPhone, at the top of the column from 900px. */
  capture?: ReactNode;
  children: ReactNode;
};

/**
 * Layout of every signed-in screen, over the glacier Wallpaper of the root layout.
 * Below 900px: iPhone layout, content above the floating tab bar (and the capture bar).
 * From 900px: glass sidebar on the left and a centred column of at most 720px.
 */
export function AppShell({ nav, capture, children }: AppShellProps) {
  return (
    <div className="app-shell" data-capture={capture ? '' : undefined}>
      {nav}
      <main className="app-main ui-tabbar-inset">
        {capture}
        {children}
      </main>
    </div>
  );
}
