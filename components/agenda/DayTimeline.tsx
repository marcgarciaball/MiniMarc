'use client';

import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { BellIcon, CheckIcon, PlusIcon } from '@/components/icons';
import { clockTime, dayTitle, layoutDay, nowMinutes, type AgendaItem, type DayBlock } from '@/lib/agenda/week';

/** Height of one hour on the timeline (px). */
const HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;
/** Where the day opens when it is not today. */
const DEFAULT_SCROLL_MIN = 8 * 60;
/** Blocks this tall (minutes), alone in their row, have room for an inline "Añadir avisos". */
const INLINE_ACTION_MIN = 60;

const HOURS = Array.from({ length: 24 }, (_, h) => h);

// ---------- Current minute (client only, so the server render never guesses it) ----------

function subscribeMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, 15_000);
  return () => clearInterval(timer);
}
const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => null;

function useNowMinute(): number | null {
  return useSyncExternalStore(subscribeMinute, minuteSnapshot, serverMinute);
}

// ---------- Pieces ----------

export function needsReminders(item: AgendaItem): boolean {
  return !item.allDay && !item.hasRequiredReminders;
}

export function canAddReminders(item: AgendaItem): boolean {
  return needsReminders(item) && item.isPrimary && !item.isTask;
}

export function timeRange(item: AgendaItem): string {
  if (item.allDay) return 'Todo el día';
  const start = clockTime(item.startsAt);
  const end = clockTime(item.endsAt);
  return item.isTask || start === end ? start : `${start} – ${end}`;
}

export function ReminderBadge({ item }: { item: AgendaItem }) {
  if (item.allDay) return null;
  return item.hasRequiredReminders ? (
    <span className="app-badge" aria-label="Avisos 3 horas y 1 hora antes">
      <BellIcon />3 h · 1 h
    </span>
  ) : (
    <span className="app-badge app-badge--quiet">Sin avisos</span>
  );
}

type TimelineProps = {
  date: string;
  today: string;
  items: AgendaItem[];
  savingId: string | null;
  onOpen: (id: string) => void;
  onAddReminders: (id: string) => void;
  onAddCita: () => void;
};

/** One day: all-day band, then 24 hours with the events as blocks (side by side when they overlap). */
export function DayTimeline({ date, today, items, savingId, onOpen, onAddReminders, onAddCita }: TimelineProps) {
  const { allDay, blocks } = layoutDay(items, date);
  const minute = useNowMinute();
  const now = minute === null ? null : nowMinutes(new Date(minute * 60_000), date);
  const anchorRef = useRef<HTMLDivElement>(null);
  const empty = allDay.length === 0 && blocks.length === 0;

  // Open each day around 08:00, or an hour before now on today. Only when the day changes.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      window.scrollTo({ top: 0 });
      return;
    }
    const current = date === today ? nowMinutes(new Date(), date) : null;
    const target = current === null ? DEFAULT_SCROLL_MIN : Math.max(0, current - 60);
    anchor.style.top = `${target * PX_PER_MIN}px`;
    anchor.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [date, today, empty]);

  return (
    <section className="app-day" aria-label={dayTitle(date)}>
      <h2 className="app-day__title">
        {dayTitle(date)}
        {date === today && <span className="app-day__today">Hoy</span>}
      </h2>

      {allDay.length > 0 && (
        <ul className="app-day__allday" aria-label="Todo el día">
          {allDay.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="app-allday"
                data-task={item.isTask || undefined}
                onClick={() => onOpen(item.id)}
              >
                {item.isTask && <CheckIcon />}
                <span className="app-allday__title">{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {empty ? (
        <div className="app-day__empty">
          <p>Nada este día</p>
          <button type="button" className="ui-bar-button" onClick={onAddCita}>
            <PlusIcon />
            Añadir cita
          </button>
        </div>
      ) : (
        blocks.length > 0 && (
          <div className="app-timeline" style={{ height: 24 * HOUR_PX }}>
            <div ref={anchorRef} className="app-timeline__anchor" aria-hidden />
            {HOURS.map((h) => (
              <div key={h} className="app-timeline__hour" style={{ top: h * HOUR_PX }} aria-hidden>
                <span>{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
            {blocks.map((b) => (
              <EventBlock
                key={b.item.id}
                block={b}
                saving={savingId === b.item.id}
                onOpen={onOpen}
                onAddReminders={onAddReminders}
              />
            ))}
            {now !== null && (
              <div className="app-timeline__now" style={{ top: now * PX_PER_MIN }}>
                <span>{`${String(Math.floor(now / 60)).padStart(2, '0')}:${String(now % 60).padStart(2, '0')}`}</span>
              </div>
            )}
          </div>
        )
      )}
    </section>
  );
}

function EventBlock({
  block,
  saving,
  onOpen,
  onAddReminders,
}: {
  block: DayBlock;
  saving: boolean;
  onOpen: (id: string) => void;
  onAddReminders: (id: string) => void;
}) {
  const { item, top, height, col, cols } = block;
  const style = {
    top: top * PX_PER_MIN,
    height: height * PX_PER_MIN,
    '--col': col,
    '--cols': cols,
  } as CSSProperties;
  const roomy = height >= 45;
  const inlineAction = canAddReminders(item) && cols === 1 && height >= INLINE_ACTION_MIN;

  return (
    <div className="app-event" style={style} data-task={item.isTask || undefined} data-compact={!roomy || undefined}>
      <button type="button" className="app-event__open" onClick={() => onOpen(item.id)}>
        <span className="app-event__title">
          {item.isTask && <CheckIcon />}
          {item.title}
        </span>
        <span className="app-event__meta">
          {timeRange(item)}
          {item.location && roomy && ` · ${item.location}`}
        </span>
        {roomy && <ReminderBadge item={item} />}
      </button>
      {inlineAction && (
        <button
          type="button"
          className="app-event__action"
          disabled={saving}
          onClick={() => onAddReminders(item.id)}
        >
          {saving ? 'Añadiendo…' : 'Añadir avisos'}
        </button>
      )}
    </div>
  );
}
