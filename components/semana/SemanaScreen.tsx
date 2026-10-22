import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { InsetList, LargeTitle, Row } from '@/components/ui';
import { addDays, clockTime, isAllDay, WEEKDAY_INITIALS, weekLabel } from '@/lib/agenda/week';
import type { Area } from '@/lib/db/types';
import type { DigestArea, DigestDate, DigestEvent, DigestTask } from '@/lib/digest/build';
import { weekSummaryLine, type WeekDay, type WeekDigest } from '@/lib/digest/week';
import { formatDay, formatDue } from '@/lib/format';
import { RECONNECT_HREF } from '@/lib/nav';
import { yearsText } from '@/lib/people/format';
import { madridDateTime } from '@/lib/time';

export type SemanaScreenProps = {
  week: WeekDigest;
  /** Monday of the current week (shows "Esta semana" when looking at another one). */
  thisWeek: string;
};

/** Entries shown per day row before "+N más". */
const MAX_ENTRIES = 3;

const weekHref = (start: string, thisWeek: string) => (start === thisWeek ? '/semana' : `/semana?w=${start}`);

/** A section header with either its rows or one quiet line (as in Hoy). */
function Section({ header, empty, rows }: { header: string; empty: ReactNode; rows: ReactNode[] }) {
  if (rows.length > 0) return <InsetList header={header}>{rows}</InsetList>;
  return (
    <section className="ui-inset-list">
      <h2 className="ui-inset-list__header">{header}</h2>
      <div className="app-hoy__empty">{empty}</div>
    </section>
  );
}

function eventWhen(e: DigestEvent, date: string): string {
  if (isAllDay(e) || Date.parse(e.endsAt) - Date.parse(e.startsAt) >= 24 * 60 * 60 * 1000) return 'Día';
  return madridDateTime(new Date(e.startsAt)).date === date ? clockTime(e.startsAt) : 'Sigue';
}

type Entry = { key: string; when: string; title: string; task: boolean };

function entries(day: WeekDay): Entry[] {
  return [
    ...day.events.map((e) => ({ key: `e-${e.id}`, when: eventWhen(e, day.date), title: e.title.trim() || '(Sin título)', task: false })),
    ...day.tasks.map((t) => ({
      key: `t-${t.item.id}`,
      when: t.item.hasTime && t.item.dueAt ? clockTime(t.item.dueAt) : '',
      title: t.item.title,
      task: true,
    })),
  ];
}

/** One compact day: weekday tile, up to 3 events/tasks, the whole row opens the Agenda on that day. */
function DayRow({ day, index, today }: { day: WeekDay; index: number; today: string }) {
  const all = entries(day);
  const shown = all.slice(0, MAX_ENTRIES);
  const isToday = day.date === today;
  return (
    <Link
      href={`/agenda?d=${day.date}`}
      className="ui-row app-semana__day"
      data-today={isToday || undefined}
      aria-current={isToday ? 'date' : undefined}
    >
      <span className="app-semana__date" aria-hidden>
        <span className="app-semana__initial">{WEEKDAY_INITIALS[index]}</span>
        <span className="app-semana__number">{Number(day.date.slice(8, 10))}</span>
      </span>
      <span className="ui-row__body">
        <span className="app-semana__entries">
          {all.length === 0 && <span className="app-semana__free">Libre</span>}
          {shown.map((e) => (
            <span key={e.key} className="app-semana__entry" data-kind={e.task ? 'task' : 'event'}>
              <span className="app-semana__when">{e.when}</span>
              <span className="app-semana__title">{e.title}</span>
            </span>
          ))}
          {all.length > MAX_ENTRIES && <span className="app-semana__more">+{all.length - MAX_ENTRIES} más</span>}
        </span>
        <svg className="ui-row__chevron" viewBox="0 0 8 14" aria-hidden>
          <path d="M1.5 1.5L6.5 7L1.5 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

function taskRows(area: DigestArea, today: string, key: Area): ReactNode[] {
  const rows = area.items.map(({ item, overdue }: DigestTask) => {
    const due = formatDue(item, today);
    return (
      <Row
        key={item.id}
        href={`/tareas?area=${key}`}
        chevron={false}
        title={item.title}
        subtitle={overdue ? `Vencida · ${due.day}` : due.day}
        detail={due.time}
      />
    );
  });
  if (area.more > 0) rows.push(<Row key="more" href={`/tareas?area=${key}`} title={`+${area.more} más`} />);
  return rows;
}

function dateRow(d: DigestDate, today: string) {
  const when = [formatDay(d.date, today), yearsText(d.yearsSince)].filter(Boolean).join(' · ');
  const ideas = d.giftIdeas.map((g) => g.title).join(', ');
  return (
    <Row
      key={`${d.person.id}-${d.dateId ?? 'birthday'}-${d.date}`}
      href={`/personas/${d.person.id}`}
      title={`${d.label} · ${d.person.name}`}
      subtitle={ideas ? `${when} · Ideas: ${ideas}` : when}
      detail={d.giftIdeas.length ? undefined : 'Sin ideas'}
    />
  );
}

/** The week at a glance (~30 s): 7 day rows, then the week's dates and tasks per area. */
export function SemanaScreen({ week, thisWeek }: SemanaScreenProps) {
  const { weekStart, today } = week;
  const counts = weekSummaryLine(week);
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);

  return (
    <LargeTitle
      title="Semana"
      leading={
        <Link href={weekHref(prev, thisWeek)} className="ui-bar-button app-week__arrow" aria-label="Semana anterior">
          <ChevronLeftIcon />
        </Link>
      }
      trailing={
        <>
          {weekStart !== thisWeek && (
            <Link href="/semana" className="ui-bar-button">
              Esta semana
            </Link>
          )}
          <Link href={weekHref(next, thisWeek)} className="ui-bar-button app-week__arrow" aria-label="Semana siguiente">
            <ChevronRightIcon />
          </Link>
        </>
      }
    >
      <div className="app-hoy__intro">
        <p className="app-hoy__date">{weekLabel(weekStart)}</p>
        <p className="app-hoy__headline">{week.headline ?? counts}</p>
        {week.headline && <p className="app-hoy__date app-semana__counts">{counts}</p>}
        {week.calendarError && (
          <p className="app-hoy__date app-semana__counts" role="status">
            {week.calendarError === 'calendar_auth' ? (
              <>
                No se ha podido leer Google Calendar.{' '}
                <Link href={RECONNECT_HREF} className="app-notice__action">
                  Volver a entrar con Google
                </Link>
              </>
            ) : (
              'Google Calendar no responde ahora mismo; faltan las citas.'
            )}
          </p>
        )}
      </div>

      <InsetList header="Días">
        {week.days.map((day, i) => (
          <DayRow key={day.date} day={day} index={i} today={today} />
        ))}
      </InsetList>

      <Section header="Fechas de la semana" rows={week.dates.map((d) => dateRow(d, today))} empty="Ninguna fecha especial esta semana." />
      <Section header="Tareas · Personal" rows={taskRows(week.tasks.personal, today, 'personal')} empty="Nada personal esta semana." />
      <Section header="Tareas · Trabajo" rows={taskRows(week.tasks.trabajo, today, 'trabajo')} empty="Nada de trabajo esta semana." />

      {week.unclassified > 0 && (
        <InsetList>
          <Row href="/sin-clasificar" title={`${week.unclassified} sin clasificar`} />
        </InsetList>
      )}
    </LargeTitle>
  );
}
