/**
 * Logic behind the item server actions (app/actions/items.ts) and the list screens.
 * Pure: everything goes through the repos in `deps`, so tests run on the memory backend.
 */
import { z } from 'zod';
import type { ItemsRepo } from '@/lib/db/items';
import type { PeopleRepo } from '@/lib/db/people';
import type { Area, Item, ItemPatch, ItemType, NewItem, Person } from '@/lib/db/types';
import { isValidDate, toDue } from '@/lib/time';

/**
 * Called after every write with the item as it now stands (a deleted item carries `deletedAt`).
 * Returns the sync fields to store, or null to leave them untouched.
 * Tarea 7 plugs Google Calendar in here (`syncTaskEvent`); see `deps()` in app/actions/items.ts.
 */
export type ItemSync = (item: Item) => Promise<Pick<Item, 'calendarEventId' | 'syncError'> | null>;

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
  if (!title) throw new Error(EMPTY_TITLE);
  const type = z.enum(ITEM_TYPES).parse(field(fd, 'type') || 'tarea');
  const areaRaw = field(fd, 'area');
  const area = areaRaw ? z.enum(AREAS).parse(areaRaw) : type === 'tarea' ? 'personal' : null;
  return {
    type,
    title,
    area,
    notes: field(fd, 'notes') || null,
    personId: type === 'regalo' ? field(fd, 'personId') || null : null,
    ...toDue(field(fd, 'dueDate'), field(fd, 'dueTime')),
    origin: 'web',
  };
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

/** Runs the sync hook and stores what it reports, if anything changed. */
async function afterWrite(deps: ActionDeps, item: Item): Promise<Item> {
  if (!deps.sync) return item;
  const res = await deps.sync(item);
  if (!res || (res.calendarEventId === item.calendarEventId && res.syncError === item.syncError)) return item;
  if (item.deletedAt) {
    // Deleted rows stay hidden; the update keeps Undo able to recreate the event.
    await deps.items.updateItem(item.id, res);
    return { ...item, ...res };
  }
  return deps.items.updateItem(item.id, res);
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
    if (!clean.title) throw new Error(EMPTY_TITLE);
  }
  const current = await findItem(deps, id);
  const type = clean.type ?? current.type;
  // A task always belongs to one area, so it never shows up in both Tareas views.
  if (type === 'tarea' && (clean.area ?? current.area) == null) clean.area = 'personal';
  if (type !== 'regalo' && current.personId && clean.personId === undefined) clean.personId = null;
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
  if (!isValidDate(b)) throw new Error(`Fecha no válida: ${b}`);
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

export async function listSinClasificar(deps: ActionDeps): Promise<Item[]> {
  return deps.items.listItems({ status: 'pendiente', needsReview: true });
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
