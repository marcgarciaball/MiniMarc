import Link from 'next/link';
import type { ReactNode } from 'react';
import { Glass } from './Glass';

export type TabBarItem = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
};

export type TabBarProps = {
  items: TabBarItem[];
  /** `key` of the current tab. */
  active: string;
};

/** Fixed bottom glass tab bar; pads itself for the home indicator. */
export function TabBar({ items, active }: TabBarProps) {
  return (
    <Glass as="nav" className="ui-tabbar" aria-label="Secciones">
      {items.map((item) => (
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
      ))}
    </Glass>
  );
}
