import type { ReactNode, Ref } from 'react';
import { Glass } from './Glass';

export type NavBarProps = {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /**
   * `true` (default): frosted glass bar with a hairline and the inline title.
   * `false`: transparent, title hidden — used under a LargeTitle before it scrolls away.
   */
  collapsed?: boolean;
  ref?: Ref<HTMLElement>;
};

/** Sticky top bar. Put `.ui-bar-button` buttons/links in `leading`/`trailing`. */
export function NavBar({ title, leading, trailing, collapsed = true, ref }: NavBarProps) {
  return (
    <Glass as="header" ref={ref} className="ui-navbar" data-collapsed={collapsed}>
      <div className="ui-navbar__row">
        <div className="ui-navbar__leading">{leading}</div>
        <div className="ui-navbar__title" aria-hidden={!collapsed}>
          {title}
        </div>
        <div className="ui-navbar__trailing">{trailing}</div>
      </div>
    </Glass>
  );
}
