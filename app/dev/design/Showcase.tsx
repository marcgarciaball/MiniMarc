'use client';

import { useState, type ReactNode } from 'react';
import {
  Glass,
  InsetList,
  LargeTitle,
  NavBar,
  Row,
  Segmented,
  Sheet,
  Switch,
  TabBar,
  Wallpaper,
  type TabBarItem,
} from '@/components/ui';
import { formatLongDate } from '@/lib/time';
import { BellIcon, CaptureIcon, Circle, ClockIcon, GlobeIcon, ListIcon, SettingsIcon, TodayIcon } from './icons';

type Theme = 'light' | 'dark';

const AREAS = [
  { value: 'personal', label: 'Personal' },
  { value: 'trabajo', label: 'Trabajo' },
];

const TABS: TabBarItem[] = [
  { key: 'hoy', label: 'Hoy', href: '#hoy', icon: <TodayIcon /> },
  { key: 'listas', label: 'Listas', href: '#listas', icon: <ListIcon /> },
  { key: 'capturar', label: 'Capturar', href: '#capturar', icon: <CaptureIcon /> },
  { key: 'ajustes', label: 'Ajustes', href: '#ajustes', icon: <SettingsIcon /> },
];

/** Every `components/ui` primitive, in automatic, light and dark mode. Shared by /dev/design and the static preview script. */
export function DesignShowcase({ today }: { today: Date }) {
  return (
    <main className="dd-page">
      <header className="dd-intro">
        <h1>Sistema visual</h1>
        <p>Componentes de components/ui en modo automático, claro y oscuro.</p>
      </header>
      <div className="dd-panels">
        <Panel label="Automático" today={today} />
        <Panel label="Claro" theme="light" today={today} />
        <Panel label="Oscuro" theme="dark" today={today} />
      </div>
    </main>
  );
}

function Panel({ label, theme, today }: { label: string; theme?: Theme; today: Date }) {
  return (
    <section className={theme ? 'dd-panel dd-panel--forced' : 'dd-panel'} data-theme={theme}>
      <h2 className="dd-panel__label">{label}</h2>
      <Frame>
        <TodayScreen today={today} />
      </Frame>
      <Frame short>
        <SheetScreen />
      </Frame>
    </section>
  );
}

function Frame({ short, children }: { short?: boolean; children: ReactNode }) {
  return (
    <div className={short ? 'dd-frame dd-frame--short' : 'dd-frame'}>
      <Wallpaper />
      <div className="dd-statusbar" aria-hidden>
        9:41
      </div>
      <div className="dd-scroll ui-tabbar-inset">{children}</div>
    </div>
  );
}

function TodayScreen({ today }: { today: Date }) {
  return (
    <>
      <LargeTitle
        title="Hoy"
        trailing={
          <button type="button" className="ui-bar-button">
            Editar
          </button>
        }
      >
        <p className="dd-date">{formatLongDate(today)}</p>
        <Glass as="section" className="dd-next" aria-label="Próxima cita">
          <p className="dd-next__eyebrow">Próxima cita</p>
          <div className="dd-next__main">
            <h2 className="dd-next__title">Médico</h2>
            <p className="dd-next__time">10:00</p>
          </div>
          <p className="dd-next__meta">
            <BellIcon />
            Avisos 3 h y 1 h antes
          </p>
        </Glass>
        <div className="dd-segmented">
          <Segmented label="Área" options={AREAS} defaultValue="personal" />
        </div>
        <InsetList header="Tareas">
          <Row leading={<Circle />} title="Recoger el traje del tinte" detail="18:00" />
          <Row leading={<Circle />} title="Llamar al seguro del coche" subtitle="Mañana" />
          <Row leading={<Circle />} title="Regalo para Ainhoa" subtitle="Regalo · cumple el 2 de noviembre" />
          <Row leading={<Circle />} title="Leche de avena y café" subtitle="Compra" />
        </InsetList>
        <InsetList header="Avisos" footer="Las citas y las tareas con hora avisan 3 h y 1 h antes.">
          <Row
            leading={
              <span className="ui-icon-tile">
                <BellIcon />
              </span>
            }
            title="Notificaciones"
            trailing={<Switch label="Notificaciones" defaultChecked />}
          />
          <Row
            leading={
              <span className="ui-icon-tile">
                <ClockIcon />
              </span>
            }
            title="Resumen diario"
            detail="8:00"
            href="#resumen"
          />
          <Row
            leading={
              <span className="ui-icon-tile">
                <GlobeIcon />
              </span>
            }
            title="Zona horaria"
            detail="Madrid"
            href="#zona"
          />
        </InsetList>
      </LargeTitle>
      <TabBar items={TABS} active="hoy" />
    </>
  );
}

function SheetScreen() {
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  return (
    <>
      <NavBar
        title="Compras"
        trailing={
          <button type="button" className="ui-bar-button" onClick={() => setOpen(true)}>
            Añadir
          </button>
        }
      />
      <div className="dd-spacer" />
      <InsetList header="Supermercado">
        <Row leading={<Circle />} title="Leche de avena" />
        <Row leading={<Circle />} title="Café en grano" />
        <Row leading={<Circle />} title="Papel de horno" />
      </InsetList>
      <Sheet
        open={open}
        onClose={close}
        title="Nueva compra"
        leading={
          <button type="button" className="ui-bar-button" onClick={close}>
            Cancelar
          </button>
        }
        trailing={
          <button type="button" className="ui-bar-button ui-bar-button--strong" onClick={close}>
            Añadir
          </button>
        }
      >
        <InsetList>
          <Row title="Bombillas E27" />
        </InsetList>
        <InsetList footer="Las compras de Trabajo no se envían a la IA.">
          <Row title="Lista" detail="Supermercado" chevron />
          <Row title="Trabajo" trailing={<Switch label="Trabajo" />} />
        </InsetList>
      </Sheet>
    </>
  );
}
