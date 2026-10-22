/**
 * Cache tags of Marc's data (no Next imports: unit-tested). Every cached read of a page tags
 * itself with the scopes it shows; every write action invalidates the scopes it may change,
 * through `invalidateUser` (see lib/actions/run.ts), so a write is never followed by stale data.
 *
 * Tags hold only the user id (they are stored in plain text): never names, titles or tokens.
 */

/** items: every item list (and their photos). people: personas and their dates. calendar:
 * Google Calendar events (agenda, Hoy, Semana). settings: digest hour, weekly summary, tz. */
export const DATA_SCOPES = ['items', 'people', 'calendar', 'settings'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

/** "items:<userId>" and so on. */
export function tagFor(scope: DataScope, userId: string): string {
  if (!userId) throw new Error('tagFor: missing user id');
  return `${scope}:${userId}`;
}

/** Tags of a read that shows these scopes. */
export function tagsFor(userId: string, scopes: readonly DataScope[]): string[] {
  return [...new Set(scopes)].map((s) => tagFor(s, userId));
}

/** What each kind of write may change. */
export const WRITES = {
  /** Items: lists, Hoy/Semana; a timed task also syncs to the "Tareas" calendar. */
  item: ['items', 'calendar'],
  /** A person (name, birthday, notes): Personas, Regalos, Hoy's dates. */
  person: ['people', 'items'],
  /** A person's special date. */
  personDate: ['people'],
  /** A photo of an item (the lists carry their signed URLs). */
  photo: ['items'],
  /** A cita or its reminders in Google Calendar. */
  event: ['calendar'],
  /** The capture bar or a share: may create items, people and citas. */
  capture: ['items', 'people', 'calendar'],
  /** Ajustes. */
  settings: ['settings'],
  /** A link preview stored after a save (after() or the hourly job). */
  preview: ['items'],
  /** The hourly job: task sync, trash purge, previews, and the digest marks in settings. */
  maintenance: ['items', 'calendar', 'settings'],
} as const satisfies Record<string, readonly DataScope[]>;

/** Expires the tags of `scopes` for `userId` with `update` (Next's updateTag on the server). */
export function invalidateUser(userId: string, scopes: readonly DataScope[], update: (tag: string) => void): void {
  for (const tag of tagsFor(userId, scopes)) update(tag);
}
