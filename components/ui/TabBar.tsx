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

/** Fixed bottom paper tab bar; the current tab gets a hand-drawn underline. Pads itself for the home indicator. */
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
          {item.key === active && (
            <svg className="ui-tabbar__mark" viewBox="0 0 34 6" aria-hidden>
              <path d="M2 3.6C9 2.4 18 3.9 32 2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </Link>
      ))}
    </Glass>
  );
}
