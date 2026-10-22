'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, useTransition } from 'react';
import { addReminders } from '@/app/actions/events';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@/components/icons';
import { Glass, Toast } from '@/components/ui';
import { addDays, dayDots, dayTitle, monthTitle, WEEKDAY_INITIALS, type AgendaItem } from '@/lib/agenda/week';
import type { SyncErrorCode } from '@/lib/calendar/taskSync';
import { RECONNECT_HREF } from '@/lib/nav';
import { DayTimeline } from './DayTimeline';
import { EventDetailSheet } from './EventDetailSheet';
import { EventSheet } from './EventSheet';
import { prefersReducedMotion, useSwipe } from './useSwipe';

export type AgendaScreenProps = {
  /** Madrid "YYYY-MM-DD". */
  today: string;
  /** The day in `?d=` (today by default). */
  selected: string;
  /** The 7 days (Monday first) of the selected day's week. */
  days: string[];
  /** Every event of that week; empty when Calendar could not be read (`error` says why). */
  items: AgendaItem[];
  error: SyncErrorCode | null;
};

const OFFLINE = 'No se han podido añadir los avisos. Revisa la conexión e inténtalo de nuevo.';

type ToastState = { id: number; message: string; actionLabel?: string; onAction?: () => void } | null;

const dayHref = (date: string, today: string) => (date === today ? '/agenda' : `/agenda?d=${date}`);

/**
 * Agenda like the iPhone Calendar: a glass week strip (Monday first, dots for busy days) over
 * the selected day's timeline. The day lives in `?d=`: another day of the same week only
 * rewrites the URL; another week asks the server for that week.
 */
export function AgendaScreen({ today, selected: initialSelected, days, items, error }: AgendaScreenProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialSelected);
  const [navigating, startNavigation] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [withReminders, setWithReminders] = useState<ReadonlySet<string>>(() => new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastId = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);

  const go = useCallback(
    (date: string) => {
      if (days.includes(date)) {
        setSelected(date);
        // Same week: no server round trip; Next keeps useSearchParams in sync with history.
        window.history.replaceState(null, '', dayHref(date, today));
      } else {
        startNavigation(() => router.replace(dayHref(date, today), { scroll: false }));
      }
    },
    [days, router, today],
  );

  const weekSwipe = useSwipe(
    (dir) => go(addDays(selected, dir === -1 ? 7 : -7)),
    (dx) => setDrag(dx === null || prefersReducedMotion() ? null : dx),
  );
  const daySwipe = useSwipe((dir) => go(addDays(selected, dir === -1 ? 1 : -1)));

  // Server answers (after adding reminders) win over the local mark once they arrive.
  const shown = items.map((it) =>
    withReminders.has(it.id) && !it.hasRequiredReminders ? { ...it, hasRequiredReminders: true } : it,
  );
  const dots = dayDots(shown, days);
  const opened = shown.find((it) => it.id === openId) ?? null;

  const showToast = useCallback((message: string, action?: { label: string; onAction: () => void }) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, actionLabel: action?.label, onAction: action?.onAction });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  async function handleAddReminders(id: string) {
    if (savingId) return;
    setSavingId(id);
    let result: Awaited<ReturnType<typeof addReminders>>;
    try {
      result = await addReminders(id);
    } catch {
      result = { ok: false, error: OFFLINE };
    }
    setSavingId(null);
    if (result.ok) {
      setWithReminders((prev) => new Set(prev).add(id));
      showToast('Avisos añadidos: 3 h y 1 h antes.');
    } else if (result.code === 'calendar_auth') {
      showToast(result.error, { label: 'Entrar', onAction: () => router.push(RECONNECT_HREF) });
    } else {
      showToast(result.error);
    }
  }

  return (
    <div className="app-agenda">
      <Glass as="header" className="ui-navbar app-agenda__head">
        <div className="ui-navbar__row">
          <div className="ui-navbar__leading">
            {selected !== today && (
              <button type="button" className="ui-bar-button" onClick={() => go(today)}>
                Hoy
              </button>
            )}
          </div>
          <div className="app-week__month">
            <button
              type="button"
              className="ui-bar-button app-week__arrow"
              aria-label="Semana anterior"
              onClick={() => go(addDays(selected, -7))}
            >
              <ChevronLeftIcon />
            </button>
            <h1 className="app-week__title" aria-live="polite">
              {monthTitle(selected)}
            </h1>
            <button
              type="button"
              className="ui-bar-button app-week__arrow"
              aria-label="Semana siguiente"
              onClick={() => go(addDays(selected, 7))}
            >
              <ChevronRightIcon />
            </button>
          </div>
          <div className="ui-navbar__trailing">
            <button type="button" className="ui-bar-button" aria-label="Nueva cita" onClick={() => setNewOpen(true)}>
              <PlusIcon />
            </button>
          </div>
        </div>

        <div className="app-week" {...weekSwipe} aria-busy={navigating}>
          <div
            className="app-week__days"
            data-dragging={drag !== null || undefined}
            style={drag !== null ? { transform: `translateX(${drag * 0.4}px)` } : undefined}
          >
            {days.map((date, i) => {
              const isToday = date === today;
              const isSelected = date === selected;
              const hasEvents = (dots[date]?.length ?? 0) > 0;
              return (
                <button
                  key={date}
                  type="button"
                  className="app-week__day"
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${dayTitle(date)}${isToday ? ', hoy' : ''}${hasEvents ? ', con eventos' : ''}`}
                  onClick={() => go(date)}
                >
                  <span className="app-week__initial" aria-hidden>
                    {WEEKDAY_INITIALS[i]}
                  </span>
                  <span className="app-week__number" data-today={isToday || undefined} data-selected={isSelected || undefined} aria-hidden>
                    {Number(date.slice(8, 10))}
                  </span>
                  <span className="app-week__dots" aria-hidden>
                    {dots[date]?.map((kind, j) => (
                      <span key={j} className="app-week__dot" data-kind={kind} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Glass>

      <div className="app-agenda__body" data-pending={navigating || undefined} {...daySwipe}>
        {error ? (
          <div className="app-notice" role="status">
            {error === 'calendar_auth' ? (
              <>
                <p>Google Calendar necesita que vuelvas a entrar para mostrar tu agenda.</p>
                <Link href={RECONNECT_HREF} className="app-notice__action">
                  Volver a entrar con Google
                </Link>
              </>
            ) : (
              <p>Google Calendar no responde ahora mismo. Vuelve a mirar en un rato.</p>
            )}
          </div>
        ) : (
          <DayTimeline
            date={selected}
            today={today}
            items={shown}
            savingId={savingId}
            onOpen={setOpenId}
            onAddReminders={handleAddReminders}
            onAddCita={() => setNewOpen(true)}
          />
        )}
      </div>

      <EventSheet open={newOpen} date={selected} onClose={() => setNewOpen(false)} />
      <EventDetailSheet
        item={opened}
        date={selected}
        saving={opened !== null && savingId === opened.id}
        onAddReminders={handleAddReminders}
        onClose={() => setOpenId(null)}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
