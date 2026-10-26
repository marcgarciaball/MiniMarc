/**
 * Capture pipeline: whatever Marc dictates (Siri, extension, web) becomes items or citas.
 * Rule zero: the text is never lost. La captura guarda el texto entero en un provisional
 * (`aiState: 'pendiente'`) y responde; la IA pasa después, en `classifyPending`, que solo
 * retira el provisional cuando lo clasificado ya está guardado. Any AI failure leaves it as
 * "Sin clasificar"; a Calendar failure saves the cita as an item with `syncError`; if one of
 * several items fails to save, the provisional stays. Trabajo text never reaches the AI.
 * Pure: everything comes in through `deps` (tests use the memory backend and fakes).
 */
import { createCita } from '@/lib/actions/events';
import { SYNC_UNAVAILABLE } from '@/lib/actions/items';
import { classify, type Classification } from '@/lib/ai/classify';
import type { AiProvider } from '@/lib/ai/provider';
import type { CalendarGateway } from '@/lib/calendar/client';
import { taskSyncHook } from '@/lib/calendar/taskSync';
import type { ItemsRepo } from '@/lib/db/items';
import type { PeopleRepo } from '@/lib/db/people';
import type { Item, ItemType, NewItem, Origin, PersonDate } from '@/lib/db/types';
import { DEFAULT_TZ } from '@/lib/time';

export const TITLE_MAX = 200;
export const MIN_CONFIDENCE = 0.6;
export const DEDUP_WINDOW_MS = 30_000;

export type CaptureInput = { text: string; area?: 'trabajo'; origin: Origin };
/** A special date saved from a capture (`kind: 'fecha'`); a birthday has no `id`. */
export type CapturedDate = Pick<PersonDate, 'personId' | 'label' | 'date'> & { personName: string };
export type CaptureResult = {
  items: Item[];
  eventIds: string[];
  dates?: CapturedDate[];
  /** Por qué no se clasificó (causeMessage). Solo cuando la IA falló: el aviso lo cuenta. */
  aiError?: string;
  /** El texto está guardado pero la IA aún no lo ha visto (classifyPending viene después). */
  pending?: true;
};

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
}

/** Empty or whitespace-only text: nothing is saved (the endpoint answers 400). */
export class EmptyCaptureError extends Error {
  constructor() {
    super('El texto está vacío');
    this.name = 'EmptyCaptureError';
  }
}

// ---------- Dedup ----------

export function normalizeCapture(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A capture with the same normalized text and area saved less than 30 s ago (and not deleted):
 * its items, so a Shortcut retry or a re-dictation returns them instead of saving twice. Looked
 * up in the database, so it works across serverless instances. The repo is already scoped to
 * the user. If the lookup fails, the capture goes ahead (better a duplicate than a loss).
 */
async function recentDuplicate(text: string, input: CaptureInput, deps: CaptureDeps): Promise<Item[]> {
  const now = deps.now.getTime();
  const key = normalizeCapture(text);
  const trabajo = input.area === 'trabajo';
  try {
    const recent = await deps.items.listRecentCaptures(new Date(now - DEDUP_WINDOW_MS).toISOString());
    return recent
      .filter(
        (i) =>
          now - Date.parse(i.createdAt) < DEDUP_WINDOW_MS &&
          (i.area === 'trabajo') === trabajo &&
          normalizeCapture(i.sourceText ?? '') === key,
      )
      .sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
  } catch {
    return [];
  }
}

// ---------- Pipeline ----------

export async function captureText(input: CaptureInput, deps: CaptureDeps): Promise<CaptureResult> {
  const text = input.text.trim();
  if (!text) throw new EmptyCaptureError();

  const existing = await recentDuplicate(text, input, deps);
  if (existing.length > 0) {
    // Un reintento de Siri a los 5 s devuelve el provisional, que sigue esperando a la IA.
    const pending = existing.some((i) => i.aiState === 'pendiente');
    return { items: existing, eventIds: [], ...(pending && { pending: true as const }) };
  }

  return run(text, input, deps);
}

async function run(text: string, input: CaptureInput, deps: CaptureDeps): Promise<CaptureResult> {
  const { origin } = input;

  // Trabajo never goes to the AI: one work task with the text as is.
  if (input.area === 'trabajo') {
    const item = await deps.items.createItem({ ...textFields(text), type: 'tarea', area: 'trabajo', origin, sourceText: text });
    return { items: [item], eventIds: [] };
  }

  // Personal: el texto se guarda entero y la captura ya responde. La IA tarda entre 2 y 60 s,
  // así que pasa después (classifyPending), desde after() o desde el cron.
  const item = await deps.items.createItem({ ...unclassified(text, origin), aiState: 'pendiente' });
  return { items: [item], eventIds: [], pending: true };
}

/** El item provisional: el texto entero, sin clasificar, a la espera de la IA. */
function unclassified(text: string, origin: Origin): NewItem {
  return { ...textFields(text), type: 'tarea', area: null, needsReview: true, origin, sourceText: text };
}

/**
 * La IA, ya fuera de la captura: clasifica el texto de un provisional y guarda lo clasificado.
 * El orden es la regla cero: primero se crea todo lo clasificado y solo después se borra (en
 * blando, recuperable en la Papelera) el provisional. Si la IA falla, o si no se pudo guardar
 * nada, el provisional se queda donde estaba con `aiState: 'fallo'`.
 */
export async function classifyPending(itemId: string, deps: CaptureDeps): Promise<CaptureResult> {
  // Relee el item. listItems ya descarta los borrados y los que ya no están pendientes, así que
  // un provisional que el usuario tocó antes que la IA sencillamente no aparece.
  const pending = (await deps.items.listItems({ aiState: 'pendiente' })).find((i) => i.id === itemId);
  if (!pending?.sourceText) return { items: [], eventIds: [] };
  const { sourceText: text, origin } = pending;

  // Fuera del try de la IA: si la base de datos no da las personas, se clasifica igual (sin la
  // lista de nombres) y, sobre todo, el fallo no se cuenta como si fuera de la IA.
  let people: string[] = [];
  try {
    people = (await deps.people.listPeople()).map((p) => p.name);
  } catch (err) {
    console.error('listPeople failed:', err instanceof Error ? err.name : 'unknown error');
  }

  let classified: Classification[] = [];
  let aiError: string | undefined;
  try {
    classified = await classify(text, { now: deps.now, tz: deps.tz ?? DEFAULT_TZ, people }, deps.ai);
  } catch (err) {
    aiError = causeMessage(err);
    // ClassifyError (timeout, daily cap, invalid JSON) or anything else: the provisional stays.
    // Logged (never the text) so a capture that lands in Sin clasificar says why. Con una causa
    // desconocida se añade el nombre del error, que no lleva datos dentro: los que sí podrían
    // llevarlos (JSON, esquema) ya salen clasificados como invalid_output.
    console.error('classify failed:', aiError, aiError === 'unknown' ? `(${errorName(err)})` : '');
  }
  if (classified.length === 0) return keepProvisional(deps, pending, aiError);

  // Each element is saved on its own: one failure does not undo or block the others.
  const out: CaptureResult = { items: [], eventIds: [] };
  let failure: unknown = null;
  for (const c of classified) {
    try {
      await saveClassified(c, text, origin, deps, out);
    } catch (err) {
      failure ??= err;
    }
  }

  // Something was not saved: the provisional stays, so the whole text is still there.
  if (failure !== null) {
    out.items.push(...(await keepProvisional(deps, pending)).items);
    return out;
  }

  // Lo clasificado ya existe: solo ahora se retira el provisional.
  try {
    await deps.items.softDeleteItem(itemId);
  } catch (err) {
    // Peor un duplicado que una pérdida: lo clasificado se queda y el provisional también.
    console.error('softDeleteItem failed:', err instanceof Error ? err.name : 'unknown error');
  }
  return out;
}

/** El provisional se queda con el texto entero, marcado como fallo para la Bandeja y el cron. */
async function keepProvisional(deps: CaptureDeps, item: Item, aiError?: string): Promise<CaptureResult> {
  const failed: Pick<Item, 'aiState' | 'needsReview'> = { aiState: 'fallo', needsReview: true };
  let kept: Item;
  try {
    kept = await deps.items.updateItem(item.id, failed);
  } catch (err) {
    console.error('updateItem failed:', err instanceof Error ? err.name : 'unknown error');
    kept = { ...item, ...failed };
  }
  return { items: [kept], eventIds: [], ...(aiError && { aiError }) };
}

/** Saves one classified element into `out`: a cita in Calendar, or an item. Throws if the item insert fails. */
async function saveClassified(c: Classification, text: string, origin: Origin, deps: CaptureDeps, out: CaptureResult) {
  const confident = c.confidence >= MIN_CONFIDENCE;

  if (c.kind === 'cita' && confident && c.startsAt && c.hasTime) {
    const location = c.location ? locationField(c.location) : null;
    const event = {
      title: c.title,
      startsAt: new Date(c.startsAt),
      ...(c.notes && { description: c.notes }),
      ...(location && { location }),
    };
    const r = await createCita({ calendar: deps.calendar }, event);
    if (r.ok) {
      out.eventIds.push(r.eventId);
      return;
    }
    // Calendar failed: keep the cita as an item to review, with the error visible.
    out.items.push(
      await deps.items.createItem({ ...fromClassification(c, origin), needsReview: true, syncError: r.error, sourceText: text }),
    );
    return;
  }

  if (c.kind === 'fecha' && confident && c.personName && c.label && c.date) {
    (out.dates ??= []).push(await savePersonDate(deps, c.personName, c.label, c.date, c.notes));
    return;
  }

  const fields: NewItem = { ...fromClassification(c, origin), needsReview: !confident, sourceText: text };
  if (c.kind === 'regalo' && c.personName) fields.personId = await personId(deps, c.personName);
  const item = await deps.items.createItem(fields);
  out.items.push(await syncDatedTask(deps, item));
}

/** El nombre del error más profundo de la cadena: TypeError, PostgrestError, CalendarError… */
function errorName(err: unknown): string {
  let name = 'desconocido';
  const seen = new Set<unknown>();
  for (let e: unknown = err; e && typeof e === 'object' && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    const n = (e as { name?: unknown }).name;
    if (typeof n === 'string' && n) name = n;
  }
  return name;
}

/**
 * Why a classification failed, as a fixed word. Never the error's own message: a JSON or schema
 * failure carries a piece of the model's output, which is the note's text.
 */
export function causeMessage(err: unknown): string {
  const seen = new Set<unknown>();
  for (let e: unknown = err; e && typeof e === 'object' && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    const { name, message } = e as { name?: unknown; message?: unknown };
    if (name === 'ZodError' || name === 'SyntaxError') return 'invalid_output';
    if (typeof message !== 'string') continue;
    if (message.includes('Tiempo de espera agotado')) return 'timeout';
    if (message.includes('Tope diario')) return 'daily_cap';
    if (message.includes('Falta GEMINI_API_KEY')) return 'no_api_key';
    if (message.includes('Respuesta vacía')) return 'empty_response';
    // Billing, not rate limiting: waiting does not fix it. Checked first, as it also says
    // RESOURCE_EXHAUSTED.
    if (/\b402\b|prepayment|credits are depleted/i.test(message)) return 'no_credit';
    if (/RESOURCE_EXHAUSTED|\b429\b/.test(message)) return 'quota';
    // A retired model: every capture fails at once, so it must not read as a generic error.
    if (/NOT_FOUND|\b404\b|no longer available/.test(message)) return 'model_not_found';
  }
  return 'unknown';
}

/** Title (max 200 chars) from the original text; a longer text is kept whole in `notes`. */
export function textFields(text: string): Pick<NewItem, 'title' | 'notes'> {
  if (text.length <= TITLE_MAX) return { title: text, notes: null };
  return { title: `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`, notes: text };
}

/** Ubicación de la nota en una sola línea (max 200 chars); null si queda vacía. */
export function locationField(s: string): string | null {
  return s.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX).trimEnd() || null;
}

function fromClassification(c: Classification, origin: Origin): NewItem & { type: ItemType } {
  // A cita that does not end up in Calendar is kept as a task with its date; a doubtful fecha
  // goes to Sin clasificar as a task too.
  const type: ItemType = c.kind === 'cita' || c.kind === 'fecha' ? 'tarea' : c.kind;
  const { title, notes } = textFields(c.title);
  const item: NewItem & { type: ItemType } = {
    type,
    title,
    notes: c.notes ?? notes,
    area: type === 'tarea' ? 'personal' : null,
    dueAt: type === 'libro' ? null : (c.startsAt ?? null),
    hasTime: type === 'libro' ? false : c.hasTime,
    confidence: c.confidence,
    origin,
  };
  // A book starts as "por leer" (the repo's default); its author is kept for the future search.
  if (type === 'libro' && c.author) item.author = c.author.slice(0, TITLE_MAX);
  const location = c.location ? locationField(c.location) : null;
  if (location) item.location = location;
  return item;
}

/**
 * A person's special date: creates (or reuses) the person by name. "Cumpleaños" sets the
 * birthday; any other label adds a yearly person date, unless the same one is already there
 * (a retried capture). Throws if saving fails (the text then goes to Sin clasificar).
 */
async function savePersonDate(
  deps: CaptureDeps,
  name: string,
  label: string,
  date: string,
  notes: string | undefined,
): Promise<CapturedDate> {
  const person = await deps.people.upsertPersonByName(name);
  const saved = { personId: person.id, personName: person.name, date };
  if (/^cumplea/i.test(label)) {
    await deps.people.updatePerson(person.id, { birthday: date });
    return { ...saved, label: 'Cumpleaños' };
  }
  const existing = await deps.people.listDates(person.id);
  if (!existing.some((d) => d.date === date && d.label.toLowerCase() === label.toLowerCase())) {
    await deps.people.addDate({ personId: person.id, label, date, notes: notes ?? null });
  }
  return { ...saved, label };
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
 * A classified task with a date gets its "Tareas" event, as the item actions do (taskSyncHook
 * decides: a time makes it a 30 min event, no time makes it an all-day one). Never throws: the
 * item is already saved.
 */
async function syncDatedTask(deps: CaptureDeps, item: Item): Promise<Item> {
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
