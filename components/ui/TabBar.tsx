import Link from 'next/link';
import type { ReactNode } from 'react';
import { Glass } from './Glass';

export type TabBarItem = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** Reserved slot: shown, not yet navigable. */
  disabled?: boolean;
};

export type TabBarProps = {
  items: TabBarItem[];
  /** `key` of the current tab. */
  active: string;
};

/**
 * Floating glass tab bar (iOS 26 style capsule) above the home indicator; the current tab
 * gets a glacier tint. Pad scroll content with `.ui-tabbar-inset` so nothing hides under it.
 */
export function TabBar({ items, active }: TabBarProps) {
  return (
    <Glass as="nav" className="ui-tabbar" aria-label="Secciones">
      {items.map((item) =>
        item.disabled ? (
          <span key={item.key} className="ui-tabbar__item" aria-disabled="true">
            <span className="ui-tabbar__icon" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </span>
        ) : (
        <Link
          key={item.key}
          href={item.href}
          className="ui-tabbar__item"
          aria-current={item.key === active ? 'page' : undefined}
        >
          <span className="ui-tabbar__icon" aria-hidden>
            {item.icon}
          </span>
          {item.label}
        </Link>
        ),
      )}
    </Glass>
  );
}
