import type { ReactNode } from 'react';

export type AppShellProps = {
  /** Usually `<AppNav>` (tab bar on iPhone, sidebar from 900px). */
  nav: ReactNode;
  children: ReactNode;
};

/**
 * Layout of every signed-in screen, over the glacier Wallpaper of the root layout.
 * Below 900px: iPhone layout, content above the floating tab bar.
 * From 900px: glass sidebar on the left and a centred column of at most 720px.
 */
export function AppShell({ nav, children }: AppShellProps) {
  return (
    <div className="app-shell">
      {nav}
      <main className="app-main ui-tabbar-inset">{children}</main>
    </div>
  );
}
