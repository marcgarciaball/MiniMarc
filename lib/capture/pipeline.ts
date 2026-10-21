/**
 * Capture pipeline: whatever Marc dictates (Siri, extension, web) becomes items or citas.
 * Rule zero: the text is never lost. Any AI failure saves it as "Sin clasificar"; a Calendar
 * failure saves the cita as an item with `syncError`. Trabajo text never reaches the AI.
 * Pure: everything comes in through `deps` (tests use the memory backend and fakes).
 */
import { createHash } from 'node:crypto';
import { createCita } from '@/lib/actions/events';
import { SYNC_UNAVAILABLE } from '@/lib/actions/items';
import { classify, type Classification } from '@/lib/ai/classify';
import type { AiProvider } from '@/lib/ai/provider';
import type { CalendarGateway } from '@/lib/calendar/client';
import { taskSyncHook } from '@/lib/calendar/taskSync';
import type { ItemsRepo } from '@/lib/db/items';
import type { PeopleRepo } from '@/lib/db/people';
import type { Item, ItemType, NewItem, Origin } from '@/lib/db/types';
import { DEFAULT_TZ } from '@/lib/time';

export const TITLE_MAX = 200;
export const MIN_CONFIDENCE = 0.6;
export const DEDUP_WINDOW_MS = 30_000;

export type CaptureInput = { text: string; area?: 'trabajo'; origin: Origin };
export type CaptureResult = { items: Item[]; eventIds: string[] };

export interface CaptureDeps {
  ai: AiProvider;
  items: ItemsRepo;
  people: PeopleRepo;
  /**
   * Loads the Calendar gateway (calendarGatewayFor on the server). Lazy, so a capture that needs
   * no event reads no credentials, and a load failure (no refresh token) only becomes a syncError.
   */
  calendar: () => Promise<CalendarGateway>;
  now: Date;
  /** Defaults to Europe/Madrid. */
  tz?: string;
  /** Defaults to a process-wide store (see createCaptureDedup). */
  dedup?: CaptureDedup;
  /** Scopes the dedup key; the route passes the token's owner. */
  userId?: string;
}

/** Empty or whitespace-only text: nothing is saved (the endpoint answers 400). */
export class EmptyCaptureError extends Error {
  constructor() {
    super('El texto está vacío');
    this.name = 'EmptyCaptureError';
  }
}

// ---------- Dedup ----------

/**
 * Recent captures by user + normalized text + area, so a Shortcut retry within 30 s returns the
 * first result instead of saving twice. Stores the promise, so simultaneous duplicates share one
 * save; a failed save is forgotten so a retry goes through. In memory: on serverless it only
 * catches retries that land on the same warm instance (best effort).
 */
export interface CaptureDedup {
  entries: Map<string, { at: number; result: Promise<CaptureResult> }>;
}

export function createCaptureDedup(): CaptureDedup {
  return { entries: new Map() };
}

const sharedDedup = createCaptureDedup();

export function normalizeCapture(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupKey(userId: string, text: string, area: string): string {
  return createHash('sha256').update(`${userId}\n${area}\n${normalizeCapture(text)}`).digest('hex');
}

// ---------- Pipeline ----------

export async function captureText(input: CaptureInput, deps: CaptureDeps): Promise<CaptureResult> {
  const text = input.text.trim();
  if (!text) throw new EmptyCaptureError();

  const dedup = deps.dedup ?? sharedDedup;
  const now = deps.now.getTime();
  for (const [k, e] of dedup.entries) if (now - e.at >= DEDUP_WINDOW_MS) dedup.entries.delete(k);

  const key = dedupKey(deps.userId ?? '', text, input.area ?? '');
  const previous = dedup.entries.get(key);
  if (previous) return previous.result;

  const result = run(text, input, deps);
  dedup.entries.set(key, { at: now, result });
  result.catch(() => {
    if (dedup.entries.get(key)?.result === result) dedup.entries.delete(key);
  });
  return result;
}

async function run(text: string, input: CaptureInput, deps: CaptureDeps): Promise<CaptureResult> {
  const { origin } = input;

  // Trabajo never goes to the AI: one work task with the text as is.
  if (input.area === 'trabajo') {
    return { items: [await deps.items.createItem({ ...textFields(text), type: 'tarea', area: 'trabajo', origin })], eventIds: [] };
  }

  let classified: Classification[] = [];
  try {
    const people = (await deps.people.listPeople()).map((p) => p.name);
    classified = await classify(text, { now: deps.now, tz: deps.tz ?? DEFAULT_TZ, people }, deps.ai);
  } catch {
    // ClassifyError (timeout, daily cap, invalid JSON) or anything else: fall through to "Sin clasificar".
  }
  if (classified.length === 0) {
    const item = await deps.items.createItem({ ...textFields(text), type: 'tarea', area: null, needsReview: true, origin });
    return { items: [item], eventIds: [] };
  }

  const out: CaptureResult = { items: [], eventIds: [] };
  for (const c of classified) {
    const confident = c.confidence >= MIN_CONFIDENCE;

    if (c.kind === 'cita' && confident && c.startsAt && c.hasTime) {
      const event = { title: c.title, startsAt: new Date(c.startsAt), ...(c.notes && { description: c.notes }) };
      const r = await createCita({ calendar: deps.calendar }, event);
      if (r.ok) {
        out.eventIds.push(r.eventId);
        continue;
      }
      // Calendar failed: keep the cita as an item to review, with the error visible.
      out.items.push(await deps.items.createItem({ ...fromClassification(c, origin), needsReview: true, syncError: r.error }));
      continue;
    }

    const fields: NewItem = { ...fromClassification(c, origin), needsReview: !confident };
    if (c.kind === 'regalo' && c.personName) fields.personId = await personId(deps, c.personName);
    const item = await deps.items.createItem(fields);
    out.items.push(await syncTimedTask(deps, item));
  }
  return out;
}

/** Title (max 200 chars) from the original text; a longer text is kept whole in `notes`. */
function textFields(text: string): Pick<NewItem, 'title' | 'notes'> {
  if (text.length <= TITLE_MAX) return { title: text, notes: null };
  return { title: `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`, notes: text };
}

function fromClassification(c: Classification, origin: Origin): NewItem & { type: ItemType } {
  // A cita that does not end up in Calendar is kept as a task with its date.
  const type: ItemType = c.kind === 'cita' ? 'tarea' : c.kind;
  const { title, notes } = textFields(c.title);
  return {
    type,
    title,
    notes: c.notes ?? notes,
    area: type === 'tarea' ? 'personal' : null,
    dueAt: c.startsAt ?? null,
    hasTime: c.hasTime,
    confidence: c.confidence,
    origin,
  };
}

/** Links a gift to its person; if that fails the gift is still saved, just without a person. */
async function personId(deps: CaptureDeps, name: string): Promise<string | null> {
  try {
    return (await deps.people.upsertPersonByName(name)).id;
  } catch {
    return null;
  }
}

/**
 * A classified, timed task gets its "Tareas" event, as the item actions do (taskSyncHook only
 * acts on such tasks). Never throws: the item is already saved.
 */
async function syncTimedTask(deps: CaptureDeps, item: Item): Promise<Item> {
  let fields: Pick<Item, 'calendarEventId' | 'syncError'>;
  try {
    const r = await taskSyncHook(deps.calendar)(item);
    fields = { calendarEventId: r.eventId, syncError: r.error };
  } catch {
    fields = { calendarEventId: null, syncError: SYNC_UNAVAILABLE };
  }
  if (!fields.calendarEventId && !fields.syncError) return item;
  try {
    return await deps.items.updateItem(item.id, fields);
  } catch {
    return { ...item, ...fields };
  }
}
