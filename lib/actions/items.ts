/**
 * Logic behind the item server actions (app/actions/items.ts) and the list screens.
 * Pure: everything goes through the repos in `deps`, so tests run on the memory backend.
 */
import { z } from 'zod';
import type { ItemsRepo } from '@/lib/db/items';
import type { PeopleRepo } from '@/lib/db/people';
import type { Area, Item, ItemPatch, ItemType, NewItem, Person } from '@/lib/db/types';
import { isValidDate, toDue } from '@/lib/time';
import { UserError } from './result';

/** Same shape as Tarea 7's `syncTaskEvent(item, gw)`. */
export type SyncResult = { eventId: string | null; error: string | null };

/**
 * Called after every write with the item as it now stands (a deleted item carries `deletedAt`).
 * Its result is stored as `calendarEventId` / `syncError`. It may throw: `afterWrite` catches it,
 * stores SYNC_UNAVAILABLE and the action still succeeds (the item is already saved).
 * Tarea 7 plugs Google Calendar in here; see `getDeps()` in lib/actions/server.ts.
 */
export type ItemSync = (item: Item) => Promise<SyncResult>;

/** `syncError` stored when the sync hook throws instead of reporting an error. */
export const SYNC_UNAVAILABLE = 'calendar_unavailable';

export interface ActionDeps {
  items: ItemsRepo;
  people: PeopleRepo;
  sync?: ItemSync;
}

const ITEM_TYPES = ['tarea', 'idea', 'compra', 'regalo'] as const satisfies readonly ItemType[];
const AREAS = ['personal', 'trabajo'] as const satisfies readonly Area[];

const EMPTY_TITLE = 'El título no puede estar vacío';

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

/** Reads the add-item form: title, type, area, notes, personId, dueDate, dueTime. */
export function parseNewItem(fd: FormData): NewItem {
  const title = field(fd, 'title');
  if (!title) throw new UserError(EMPTY_TITLE);
  const type = z.enum(ITEM_TYPES).parse(field(fd, 'type') || 'tarea');
  const areaRaw = field(fd, 'area');
  const area = areaRaw ? z.enum(AREAS).parse(areaRaw) : type === 'tarea' ? 'personal' : null;
  return {
    type,
    title,
    area,
    notes: field(fd, 'notes') || null,
    personId: type === 'regalo' ? field(fd, 'personId') || null : null,
    ...due(field(fd, 'dueDate'), field(fd, 'dueTime')),
    origin: 'web',
  };
}

function due(date: string, time: string) {
  try {
    return toDue(date, time);
  } catch {
    throw new UserError('La fecha no es válida.');
  }
}

/** What the UI may change on an existing item (edit sheet, swipe, "Mover a…"). */
export const movePatchSchema = z
  .object({
    title: z.string(),
    notes: z.string().nullable(),
    type: z.enum(ITEM_TYPES),
    area: z.enum(AREAS).nullable(),
    personId: z.string().nullable(),
    status: z.enum(['pendiente', 'hecho', 'archivado']),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    hasTime: z.boolean(),
    needsReview: z.boolean(),
  })
  .partial()
  .strict();

export type MovePatch = z.infer<typeof movePatchSchema>;

async function findItem(deps: ActionDeps, id: string): Promise<Item> {
  const item = (await deps.items.listItems()).find((i) => i.id === id);
  if (!item) throw new Error(`No existe el elemento ${id}`);
  return item;
}

/**
 * Runs the sync hook and stores what it reports, if anything changed.
 * Never throws: the item write has already happened, so a sync failure (or failing to store
 * its result) must not turn it into a reported failure, which would invite a duplicate.
 */
async function afterWrite(deps: ActionDeps, item: Item): Promise<Item> {
  if (!deps.sync) return item;
  let fields: Pick<Item, 'calendarEventId' | 'syncError'>;
  try {
    const r = await deps.sync(item);
    fields = { calendarEventId: r.eventId, syncError: r.error };
  } catch {
    fields = { calendarEventId: item.calendarEventId, syncError: SYNC_UNAVAILABLE };
  }
  if (fields.calendarEventId === item.calendarEventId && fields.syncError === item.syncError) return item;
  try {
    if (item.deletedAt) {
      // Deleted rows stay hidden; the update keeps Undo able to recreate the event.
      await deps.items.updateItem(item.id, fields);
      return { ...item, ...fields };
    }
    return await deps.items.updateItem(item.id, fields);
  } catch {
    return item;
  }
}

export async function addItem(deps: ActionDeps, fd: FormData): Promise<Item> {
  const created = await deps.items.createItem(parseNewItem(fd));
  return afterWrite(deps, created);
}

export async function toggleDone(deps: ActionDeps, id: string): Promise<Item> {
  const item = await findItem(deps, id);
  const status = item.status === 'hecho' ? 'pendiente' : 'hecho';
  return afterWrite(deps, await deps.items.updateItem(id, { status }));
}

export async function moveItem(deps: ActionDeps, id: string, patch: MovePatch): Promise<Item> {
  const clean: ItemPatch = movePatchSchema.parse(patch);
  if (clean.title !== undefined) {
    clean.title = clean.title.trim();
    if (!clean.title) throw new UserError(EMPTY_TITLE);
  }
  const current = await findItem(deps, id);
  const type = clean.type ?? current.type;
  // A task always belongs to one area, so it never shows up in both Tareas views.
  if (type === 'tarea' && (clean.area ?? current.area) == null) clean.area = 'personal';
  if (type !== 'regalo' && current.personId && clean.personId === undefined) clean.personId = null;
  // Only tasks have a due date: leaving 'tarea' drops it (and, via sync, its Calendar event).
  if (type !== 'tarea' && (current.dueAt || current.hasTime || clean.dueAt || clean.hasTime)) {
    clean.dueAt = null;
    clean.hasTime = false;
  }
  return afterWrite(deps, await deps.items.updateItem(id, clean));
}

export async function deleteItem(deps: ActionDeps, id: string): Promise<void> {
  const item = await findItem(deps, id);
  await deps.items.softDeleteItem(id);
  await afterWrite(deps, { ...item, deletedAt: new Date().toISOString() });
}

export async function undoDelete(deps: ActionDeps, id: string): Promise<Item> {
  await deps.items.restoreItem(id);
  return afterWrite(deps, await findItem(deps, id));
}

// ---------- People ----------

function parseBirthday(fd: FormData): string | null {
  const b = field(fd, 'birthday');
  if (!b) return null;
  if (!isValidDate(b)) throw new UserError('La fecha no es válida.');
  return b;
}

/** Reads name and birthday ('YYYY-MM-DD', optional) and creates (or reuses) the person. */
export async function addPerson(deps: ActionDeps, fd: FormData): Promise<Person> {
  const birthday = parseBirthday(fd);
  const person = await deps.people.upsertPersonByName(field(fd, 'name'));
  return birthday ? deps.people.updatePerson(person.id, { birthday }) : person;
}

export async function updatePerson(deps: ActionDeps, id: string, fd: FormData): Promise<Person> {
  return deps.people.updatePerson(id, {
    name: field(fd, 'name'),
    birthday: parseBirthday(fd),
    notes: field(fd, 'notes') || null,
  });
}

// ---------- Lists (read side of the screens) ----------

const byDueThenNewest = (a: Item, b: Item) => {
  if (a.dueAt && b.dueAt) return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
};

/** Pending, classified tasks of one area. A task without area counts as Personal. */
export async function listTareas(deps: ActionDeps, area: Area): Promise<Item[]> {
  const all = await deps.items.listItems({ type: 'tarea', status: 'pendiente', needsReview: false });
  return all.filter((i) => (i.area ?? 'personal') === area).sort(byDueThenNewest);
}

/** Pending, classified items of one type (Ideas, Compras…), newest first. */
export async function listByType(deps: ActionDeps, type: ItemType): Promise<Item[]> {
  return deps.items.listItems({ type, status: 'pendiente', needsReview: false });
}

/**
 * Pending items waiting for review. With `area`, only that area (no area counts as Personal),
 * so Personal and Trabajo are never listed together; without it, all of them (for counts).
 */
export async function listSinClasificar(deps: ActionDeps, area?: Area): Promise<Item[]> {
  const all = await deps.items.listItems({ status: 'pendiente', needsReview: true });
  return area ? all.filter((i) => (i.area ?? 'personal') === area) : all;
}

export interface RegalosGroups {
  people: { person: Person; items: Item[] }[];
  /** Gifts with no person (or whose person no longer exists). */
  unassigned: Item[];
}

/** Every person (alphabetical) with their pending gifts, plus the gifts with no person. */
export async function listRegalos(deps: ActionDeps): Promise<RegalosGroups> {
  const [people, gifts] = await Promise.all([deps.people.listPeople(), listByType(deps, 'regalo')]);
  const known = new Set(people.map((p) => p.id));
  return {
    people: people.map((person) => ({ person, items: gifts.filter((g) => g.personId === person.id) })),
    unassigned: gifts.filter((g) => !g.personId || !known.has(g.personId)),
  };
}
