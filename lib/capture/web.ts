/**
 * The CaptureBar's server action (app/actions/capture.ts), testable: the pipeline deps come in
 * through `WebCaptureDeps`. Same rules as POST /api/capture, but it answers with an
 * ActionResult so the bar keeps the typed text on any failure. Never logs the text.
 */
import { createCita, EVENT_ERROR_MESSAGES, parseNewEvent } from '@/lib/actions/events';
import { attempt, UserError, type ActionResult } from '@/lib/actions/result';
import type { Item, ItemType } from '@/lib/db/types';
import { BANDEJA_HREF } from '@/lib/nav';
import { captureMessage, MAX_CAPTURE_LENGTH } from './handler';
import { QUICK_KINDS } from './kinds';
import { captureText, EmptyCaptureError, textFields, type CaptureDeps, type CaptureInput } from './pipeline';
import { saveTypedItem } from './typed';

export interface WebCaptureDeps {
  /** The signed-in user's pipeline deps (redirects to /login without a session). */
  captureDeps: () => Promise<CaptureDeps>;
  /** Defaults to `captureText`; tests spy on it. */
  capture?: typeof captureText;
  /** Next's `unstable_rethrow`, so redirect() still works. */
  rethrow?: (e: unknown) => void;
}

export type WebCapture = { message: string };

const SAVE_FAILED = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const EMPTY = 'El texto está vacío';

function str(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
}

/** The typed text, as is. Throws a UserError when it is empty or too long. */
function readText(fd: FormData): string {
  const text = str(fd, 'text');
  if (!text.trim()) throw new UserError(EMPTY);
  if (text.length > MAX_CAPTURE_LENGTH) throw new UserError(`El texto supera los ${MAX_CAPTURE_LENGTH} caracteres`);
  return text;
}

/**
 * Reads `text` and `area` ('trabajo' when the bar's Trabajo switch is on; anything else is
 * ignored) and runs the capture pipeline with origin 'web'. Trabajo goes to the pipeline's
 * no-AI path. On success, `message` is the same "Guardado en …" Siri speaks.
 */
export async function captureFromWeb(fd: FormData, deps: WebCaptureDeps): Promise<ActionResult<WebCapture>> {
  const capture = deps.capture ?? captureText;
  return attempt(
    async () => {
      const captureDeps = await deps.captureDeps();
      const text = readText(fd);
      const input: CaptureInput = { text, origin: 'web' };
      if (fd.get('area') === 'trabajo') input.area = 'trabajo';
      try {
        return { message: captureMessage(await capture(input, captureDeps)) };
      } catch (err) {
        if (err instanceof EmptyCaptureError) throw new UserError(EMPTY);
        deps.rethrow?.(err);
        console.error('web capture failed:', err instanceof Error ? err.message : 'unknown error');
        throw err;
      }
    },
    SAVE_FAILED,
    deps.rethrow,
  );
}

// ---------- Quick capture (type chips) ----------

/** `href` is where the toast's "Ver" goes. */
export type QuickCapture = { message: string; href: string };

const ITEM_HREF: Record<Exclude<ItemType, 'tarea' | 'regalo'>, string> = { idea: '/ideas', compra: '/compras' };

function itemHref(item: Item): string {
  if (item.type === 'tarea') return `/tareas?area=${item.area ?? 'personal'}`;
  if (item.type === 'regalo') return item.personId ? `/regalos/${item.personId}` : '/regalos';
  return ITEM_HREF[item.type];
}

/**
 * The CaptureBar with a chip chosen. Fields: `text`, `kind` (QUICK_KINDS, default 'auto'),
 * `area` ('trabajo' or anything else = Personal; only Auto and Tarea use it), Tarea's
 * `dueDate`/`dueTime`, Regalo's `personId` or `personName` (new person), Cita's `date`,
 * `start`, `end`. Auto is `captureFromWeb`; every other chip never calls the AI and reuses
 * the item actions (Tarea syncs to Calendar like any timed task) or `createCita` (180/60).
 * Same guarantees: empty text saves nothing, failures come back as `{ ok: false }`.
 */
export async function quickCapture(fd: FormData, deps: WebCaptureDeps): Promise<ActionResult<QuickCapture>> {
  const kind = str(fd, 'kind') || 'auto';
  if (kind === 'auto') {
    const r = await captureFromWeb(fd, deps);
    return r.ok ? { ok: true, value: { ...r.value, href: BANDEJA_HREF } } : r;
  }
  return attempt(
    async () => {
      const captureDeps = await deps.captureDeps();
      const text = readText(fd);
      if (!(QUICK_KINDS as readonly string[]).includes(kind)) throw new UserError('Tipo de captura no válido');
      if (kind === 'cita') return saveCita(text, fd, captureDeps);
      return saveItem(kind as ItemType, text, fd, captureDeps);
    },
    SAVE_FAILED,
    deps.rethrow,
  );
}

async function saveItem(type: ItemType, text: string, fd: FormData, deps: CaptureDeps): Promise<QuickCapture> {
  const fields = {
    area: str(fd, 'area'),
    dueDate: str(fd, 'dueDate'),
    dueTime: str(fd, 'dueTime'),
    personId: str(fd, 'personId'),
    personName: str(fd, 'personName'),
  };
  const item = await saveTypedItem(type, text, fields, deps, 'web');
  return { message: captureMessage({ items: [item], eventIds: [] }), href: itemHref(item) };
}

async function saveCita(text: string, fd: FormData, deps: CaptureDeps): Promise<QuickCapture> {
  const { title, notes } = textFields(text.trim());
  const form = new FormData();
  form.set('title', title);
  for (const name of ['date', 'start', 'end']) form.set(name, str(fd, name));
  if (notes) form.set('notes', notes);
  const event = parseNewEvent(form);
  const r = await createCita({ calendar: deps.calendar }, event);
  if (r.ok) return { message: 'Guardado en Calendar', href: '/agenda' };
  // Calendar failed: the cita is kept as a task to review, with the error visible (as the pipeline does).
  try {
    await deps.items.createItem({
      type: 'tarea',
      title,
      notes,
      area: 'personal',
      dueAt: event.startsAt.toISOString(),
      hasTime: true,
      needsReview: true,
      syncError: r.error,
      origin: 'web',
      sourceText: text,
    });
  } catch {
    throw new UserError(EVENT_ERROR_MESSAGES[r.error]);
  }
  const why = r.error === 'calendar_auth' ? 'Calendar necesita que vuelvas a entrar' : 'Calendar no responde';
  return { message: `${why}: guardado en Sin clasificar`, href: '/sin-clasificar' };
}
