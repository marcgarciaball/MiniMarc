import Link from 'next/link';
import type { ReactNode } from 'react';
import { Glass, TabBar, type TabBarItem } from '@/components/ui';
import {
  BagIcon,
  CaptureIcon,
  GiftIcon,
  IdeaIcon,
  ListIcon,
  SettingsIcon,
  TasksIcon,
  TodayIcon,
  TrayIcon,
} from '@/components/icons';
import { tabFor, type Section } from '@/lib/nav';

const TABS: TabBarItem[] = [
  { key: 'hoy', label: 'Hoy', href: '/hoy', icon: <TodayIcon /> },
  { key: 'tareas', label: 'Tareas', href: '/tareas', icon: <TasksIcon /> },
  // Reserved for quick capture (later task): visible, not navigable yet.
  { key: 'capturar', label: 'Capturar', href: '#', icon: <CaptureIcon />, disabled: true },
  { key: 'listas', label: 'Listas', href: '/listas', icon: <ListIcon /> },
  { key: 'ajustes', label: 'Ajustes', href: '/ajustes', icon: <SettingsIcon /> },
];

type SidebarLink = { key: Section; label: string; href: string; icon: ReactNode };

const SIDEBAR: { header?: string; links: SidebarLink[] }[] = [
  {
    links: [
      { key: 'hoy', label: 'Hoy', href: '/hoy', icon: <TodayIcon /> },
      { key: 'tareas', label: 'Tareas', href: '/tareas', icon: <TasksIcon /> },
    ],
  },
  {
    header: 'Listas',
    links: [
      { key: 'ideas', label: 'Ideas', href: '/ideas', icon: <IdeaIcon /> },
      { key: 'compras', label: 'Compras', href: '/compras', icon: <BagIcon /> },
      { key: 'regalos', label: 'Regalos', href: '/regalos', icon: <GiftIcon /> },
      { key: 'sin-clasificar', label: 'Sin clasificar', href: '/sin-clasificar', icon: <TrayIcon /> },
    ],
  },
  { links: [{ key: 'ajustes', label: 'Ajustes', href: '/ajustes', icon: <SettingsIcon /> }] },
];

/**
 * App navigation: the floating tab bar on iPhone and an iPadOS/macOS-style glass
 * sidebar from 900px (app.css shows one or the other). `active` null = nothing highlighted.
 */
export function AppNav({ active }: { active: Section | null }) {
  return (
    <>
      <Glass as="nav" className="app-sidebar" aria-label="Secciones">
        <p className="app-sidebar__title">Agente</p>
        {SIDEBAR.map((group, i) => (
          <div key={i} className="app-sidebar__group">
            {group.header && <h2 className="app-sidebar__header">{group.header}</h2>}
            <ul>
              {group.links.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    className="app-sidebar__link"
                    aria-current={link.key === active ? 'page' : undefined}
                  >
                    <span className="app-sidebar__icon" aria-hidden>
                      {link.icon}
                    </span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Glass>
      <div className="app-tabbar">
        <TabBar items={TABS} active={tabFor(active)} />
      </div>
    </>
  );
}
