import Link from 'next/link';
import type { ReactNode } from 'react';
import { Glass, TabBar, type TabBarItem } from '@/components/ui';
import {
  AgendaIcon,
  BagIcon,
  BookIcon,
  CaptureIcon,
  ClockIcon,
  GiftIcon,
  IdeaIcon,
  ListIcon,
  PersonIcon,
  SettingsIcon,
  TasksIcon,
  TodayIcon,
  TrayIcon,
  WeekIcon,
} from '@/components/icons';
import { tabFor, type Section } from '@/lib/nav';
import { CaptureLink } from './CaptureLink';

/*
 * At most 5 tabs. Capturar is not a tab: on iPhone the CaptureBar floats right above the tab bar;
 * on desktop the sidebar's first action focuses it. The Bandeja lives under Listas; the week
 * (/semana) is reached from Hoy ("Ver la semana") and lights up the Hoy tab.
 */
const TABS: TabBarItem[] = [
  { key: 'hoy', label: 'Hoy', href: '/hoy', icon: <TodayIcon /> },
  { key: 'agenda', label: 'Agenda', href: '/agenda', icon: <AgendaIcon /> },
  { key: 'tareas', label: 'Tareas', href: '/tareas', icon: <TasksIcon /> },
  { key: 'listas', label: 'Listas', href: '/listas', icon: <ListIcon /> },
  { key: 'ajustes', label: 'Ajustes', href: '/ajustes', icon: <SettingsIcon /> },
];

type SidebarLink = { key: Section; label: string; href: string; icon: ReactNode };

const SIDEBAR: { header?: string; links: SidebarLink[] }[] = [
  {
    links: [
      { key: 'hoy', label: 'Hoy', href: '/hoy', icon: <TodayIcon /> },
      { key: 'semana', label: 'Semana', href: '/semana', icon: <WeekIcon /> },
      { key: 'agenda', label: 'Agenda', href: '/agenda', icon: <AgendaIcon /> },
      { key: 'tareas', label: 'Tareas', href: '/tareas', icon: <TasksIcon /> },
      { key: 'bandeja', label: 'Recién añadido', href: '/bandeja', icon: <ClockIcon /> },
    ],
  },
  {
    header: 'Listas',
    links: [
      { key: 'ideas', label: 'Ideas', href: '/ideas', icon: <IdeaIcon /> },
      { key: 'compras', label: 'Compras', href: '/compras', icon: <BagIcon /> },
      { key: 'regalos', label: 'Regalos', href: '/regalos', icon: <GiftIcon /> },
      { key: 'libros', label: 'Libros', href: '/libros', icon: <BookIcon /> },
      { key: 'personas', label: 'Personas', href: '/personas', icon: <PersonIcon /> },
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
        <CaptureLink className="app-sidebar__link app-sidebar__capture">
          <span className="app-sidebar__icon" aria-hidden>
            <CaptureIcon />
          </span>
          Capturar
        </CaptureLink>
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
