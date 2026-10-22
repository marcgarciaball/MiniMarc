import type { ReactNode } from 'react';
import { Glass, LargeTitle, SkeletonBar, SkeletonList, SkeletonRegion, type SkeletonRowShape } from '@/components/ui';
import { WEEKDAY_INITIALS } from '@/lib/agenda/week';

/*
 * What each screen shows while its data streams in: the real title and chrome at once, then
 * glass skeleton rows shaped like that screen's content. Part of the static shell (no data).
 */

/** A list screen (Tareas, Ideas, Compras…): the title and skeleton rows. */
export function ScreenFallback({
  title,
  leading,
  rows = 6,
  segmented,
  sections,
  ...shape
}: {
  title: string;
  leading?: ReactNode;
  rows?: number;
  /** A Personal/Trabajo (or reading state) selector above the list. */
  segmented?: boolean;
  /** Several sections with these headers (e.g. Personal and Trabajo). */
  sections?: string[];
} & SkeletonRowShape) {
  return (
    <LargeTitle title={title} leading={leading}>
      <SkeletonRegion>
        {segmented && (
          <div className="app-segmented">
            <SkeletonBar width="100%" height={32} radius={9} />
          </div>
        )}
        {sections ? (
          sections.map((header, i) => <SkeletonList key={header} header={header} rows={i === 0 ? 3 : 2} {...shape} />)
        ) : (
          <SkeletonList rows={rows} {...shape} />
        )}
      </SkeletonRegion>
    </LargeTitle>
  );
}

/** Recién añadido: Personal and Trabajo, each row with its destination, time and "Mover". */
export function InboxFallback() {
  return <ScreenFallback title="Recién añadido" sections={['Personal', 'Trabajo']} detail trailing />;
}

/** Hoy: the date and the headline, then its sections. */
export function HoyFallback() {
  return (
    <LargeTitle title="Hoy">
      <SkeletonRegion>
        <div className="app-hoy__intro">
          <SkeletonBar width="44%" height={13} style={{ margin: '3px 0' }} />
          <span className="app-headline-pending" style={{ marginTop: 8 }} />
        </div>
        <SkeletonList header="Citas de hoy" rows={2} subtitle={false} detail />
        <SkeletonList header="Tareas · Personal" rows={3} subtitle={false} detail />
        <SkeletonList header="Tareas · Trabajo" rows={2} subtitle={false} detail />
        <SkeletonList header="Fechas" rows={1} />
      </SkeletonRegion>
    </LargeTitle>
  );
}

/** Semana: the week line, seven day rows, then dates and tasks. */
export function SemanaFallback() {
  return (
    <LargeTitle title="Semana">
      <SkeletonRegion>
        <div className="app-hoy__intro">
          <SkeletonBar width="40%" height={13} style={{ margin: '3px 0' }} />
          <span className="app-headline-pending" style={{ marginTop: 8 }} />
        </div>
        <SkeletonList header="Días" rows={7} detail />
        <SkeletonList header="Fechas de la semana" rows={1} />
      </SkeletonRegion>
    </LargeTitle>
  );
}

/** Personas: a column of glass cards. */
export function PersonasFallback() {
  return (
    <LargeTitle title="Personas">
      <SkeletonRegion>
        <ul className="app-person-cards">
          {['36%', '28%', '44%', '32%'].map((w, i) => (
            <li key={i}>
              <div className="ui-glass app-person-card">
                <SkeletonBar width={w} height={16} style={{ margin: '3px 0' }} />
                <SkeletonBar width="52%" height={13} style={{ margin: '4px 0 2px' }} />
              </div>
            </li>
          ))}
        </ul>
      </SkeletonRegion>
    </LargeTitle>
  );
}

/** Agenda: the glass header with the week strip, and the day's timeline. */
export function AgendaFallback() {
  return (
    <div className="app-agenda">
      <Glass as="header" className="ui-navbar app-agenda__head">
        <div className="ui-navbar__row">
          <div className="ui-navbar__leading" />
          <div className="app-week__month">
            <SkeletonBar width={140} height={18} />
          </div>
          <div className="ui-navbar__trailing" />
        </div>
        <div className="app-week" aria-hidden>
          <div className="app-week__days">
            {WEEKDAY_INITIALS.map((initial) => (
              <span key={initial} className="app-week__day">
                <span className="app-week__initial">{initial}</span>
                <span className="app-week__number">
                  <SkeletonBar width={22} height={18} radius={7} />
                </span>
              </span>
            ))}
          </div>
        </div>
      </Glass>
      <div className="app-agenda__body">
        <SkeletonRegion>
          <section className="app-day">
            <h2 className="app-day__title">
              <SkeletonBar width={180} height={20} />
            </h2>
            <div className="app-skeleton-timeline">
              {[0, 1, 2, 3, 4, 5].map((h) => (
                <div key={h} className="app-skeleton-timeline__hour">
                  {(h === 1 || h === 4) && <SkeletonBar width="100%" height={h === 1 ? 52 : 34} radius={10} />}
                </div>
              ))}
            </div>
          </section>
        </SkeletonRegion>
      </div>
    </div>
  );
}
