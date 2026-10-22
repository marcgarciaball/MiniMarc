import Link from 'next/link';
import type { ReactNode } from 'react';
import { InsetList, LargeTitle, Row } from '@/components/ui';
import type { Area } from '@/lib/db/types';
import type { Digest, DigestArea, DigestBirthday, DigestEvent, DigestTask } from '@/lib/digest/build';
import { formatDay, formatDue } from '@/lib/format';
import { RECONNECT_HREF } from '@/lib/nav';
import { formatLongDate, madridDateTime, madridToUtc } from '@/lib/time';
import { PushButton } from './PushButton';

export type HoyScreenProps = {
  digest: Digest;
  tz: string;
  /** VAPID public key (server env); empty hides "Activar notificaciones". */
  vapidPublicKey: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A section header with either its rows or one quiet line. */
function Section({ header, empty, rows }: { header: string; empty: ReactNode; rows: ReactNode[] }) {
  if (rows.length > 0) return <InsetList header={header}>{rows}</InsetList>;
  return (
    <section className="ui-inset-list">
      <h2 className="ui-inset-list__header">{header}</h2>
      <div className="app-hoy__empty">{empty}</div>
    </section>
  );
}

function eventTime(e: DigestEvent, tz: string): string {
  const start = Date.parse(e.startsAt);
  if (Date.parse(e.endsAt) - start >= DAY_MS) return 'Todo el día';
  return madridDateTime(new Date(start), tz).time;
}

function taskRow({ item, overdue }: DigestTask, today: string, area: Area) {
  const due = formatDue(item, today);
  return (
    <Row
      key={item.id}
      href={`/tareas?area=${area}`}
      chevron={false}
      title={item.title}
      subtitle={overdue ? `Vencida · ${due.day}` : undefined}
      detail={due.time}
    />
  );
}

function taskRows(area: DigestArea, today: string, key: Area): ReactNode[] {
  const rows = area.items.map((t) => taskRow(t, today, key));
  if (area.more > 0) rows.push(<Row key="more" href={`/tareas?area=${key}`} title={`+${area.more} más`} />);
  return rows;
}

function birthdayWhen(b: DigestBirthday, today: string): string {
  if (b.daysLeft <= 1) return formatDay(b.date, today);
  return `En ${b.daysLeft} días · ${formatDay(b.date, today)}`;
}

function birthdayRow(b: DigestBirthday, today: string) {
  const ideas = b.giftIdeas.map((g) => g.title).join(', ');
  return (
    <Row
      key={b.person.id}
      href={`/regalos/${b.person.id}`}
      title={b.person.name}
      subtitle={ideas ? `${birthdayWhen(b, today)} · Ideas: ${ideas}` : birthdayWhen(b, today)}
      detail={b.giftIdeas.length ? undefined : 'Sin ideas'}
    />
  );
}

/** The morning digest as a screen: readable in ~20 s, one calm section per area. */
export function HoyScreen({ digest, tz, vapidPublicKey }: HoyScreenProps) {
  const today = digest.date;
  const longDate = formatLongDate(madridToUtc(today, '12:00', tz), tz);

  const events = digest.events.map((e) => <Row key={e.id} title={e.title} detail={eventTime(e, tz)} />);

  return (
    <LargeTitle title="Hoy">
      <div className="app-hoy__intro">
        <p className="app-hoy__date">{longDate.charAt(0).toUpperCase() + longDate.slice(1)}</p>
        <p className="app-hoy__headline">{digest.headline}</p>
      </div>

      <Section
        header="Citas de hoy"
        rows={events}
        empty={
          digest.calendarError === 'calendar_auth' ? (
            <>
              No se ha podido leer Google Calendar.{' '}
              <Link href={RECONNECT_HREF} className="app-notice__action">
                Volver a entrar con Google
              </Link>
            </>
          ) : digest.calendarError ? (
            'Google Calendar no responde ahora mismo. Mira la Agenda en un rato.'
          ) : (
            'Ninguna cita hoy.'
          )
        }
      />

      <Section header="Tareas · Personal" rows={taskRows(digest.tasks.personal, today, 'personal')} empty="Nada personal para hoy." />
      <Section header="Tareas · Trabajo" rows={taskRows(digest.tasks.trabajo, today, 'trabajo')} empty="Nada de trabajo para hoy." />

      <Section
        header="Cumpleaños"
        rows={digest.birthdays.map((b) => birthdayRow(b, today))}
        empty="Ningún cumpleaños en las próximas dos semanas."
      />

      {digest.unclassified > 0 ? (
        <InsetList>
          <Row href="/sin-clasificar" title={`${digest.unclassified} sin clasificar`} />
        </InsetList>
      ) : (
        <p className="app-hoy__empty app-hoy__empty--solo">Todo clasificado.</p>
      )}

      {vapidPublicKey && <PushButton publicKey={vapidPublicKey} />}
    </LargeTitle>
  );
}
