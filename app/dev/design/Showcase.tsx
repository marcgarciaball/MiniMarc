'use client';

import { useState, type ReactNode } from 'react';
import { Glass, InsetList, LargeTitle, NavBar, Row, Sheet, Switch, TabBar, type TabBarItem } from '@/components/ui';
import { BellIcon, CaptureIcon, Circle, ClockIcon, ListIcon, SettingsIcon, TodayIcon } from './icons';

type Theme = 'light' | 'dark';

const TABS: TabBarItem[] = [
  { key: 'hoy', label: 'Hoy', href: '#hoy', icon: <TodayIcon /> },
  { key: 'listas', label: 'Listas', href: '#listas', icon: <ListIcon /> },
  { key: 'capturar', label: 'Capturar', href: '#capturar', icon: <CaptureIcon /> },
  { key: 'ajustes', label: 'Ajustes', href: '#ajustes', icon: <SettingsIcon /> },
];

/** Every `components/ui` primitive, in automatic, light and dark mode. Shared by /dev/design and the static preview script. */
export function DesignShowcase() {
  return (
    <main className="dd-page">
      <header className="dd-intro">
        <h1>Sistema visual</h1>
        <p>Componentes de components/ui en modo automático, claro y oscuro.</p>
      </header>
      <div className="dd-panels">
        <Panel label="Automático" />
        <Panel label="Claro" theme="light" />
        <Panel label="Oscuro" theme="dark" />
      </div>
    </main>
  );
}

function Panel({ label, theme }: { label: string; theme?: Theme }) {
  return (
    <section className={theme ? 'dd-panel dd-panel--forced' : 'dd-panel'} data-theme={theme}>
      <h2 className="dd-panel__label">{label}</h2>
      <Frame>
        <TodayScreen />
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
      <div className="dd-statusbar" aria-hidden>
        9:41
      </div>
      <div className="dd-scroll">{children}</div>
    </div>
  );
}

function TodayScreen() {
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
        <p className="dd-date">martes, 21 de octubre</p>
        <InsetList header="Pendiente">
          <Row leading={<Circle />} title="Llamar al dentista" subtitle="Personal" detail="10:00" />
          <Row leading={<Circle />} title="Revisar presupuesto Q4" subtitle="Trabajo" detail="12:30" />
          <Row leading={<Circle />} title="Comprar pilas AA" subtitle="Compra" />
          <Row leading={<Circle />} title="Regalo para Laura" subtitle="Regalo · antes del 2 nov" />
        </InsetList>
        <InsetList header="Avisos" footer="Los avisos llegan 3 h y 1 h antes de cada cita.">
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
          <Row title="Zona horaria" detail="Madrid" href="#zona" />
          <Row title="Incluir trabajo" trailing={<Switch label="Incluir trabajo" />} />
        </InsetList>
        <InsetList header="Material">
          <div className="dd-glass-demo">
            <p aria-hidden>Llamar al dentista · Revisar presupuesto · Comprar pilas · Regalo para Laura</p>
            <Glass className="dd-glass-demo__pane">Vidrio</Glass>
          </div>
        </InsetList>
        <InsetList header="Ideas">
          <Row title="Ordenar fotos del viaje a Lisboa" href="#idea-1" />
          <Row title="Probar receta de lentejas" href="#idea-2" />
          <Row title="Leer sobre jardines verticales" href="#idea-3" />
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
        <Row leading={<Circle />} title="Pilas AA" />
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
