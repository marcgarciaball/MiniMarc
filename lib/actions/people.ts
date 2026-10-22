/**
 * Logic behind the Personas screens and the person-date server actions (app/actions/people.ts).
 * Pure: everything goes through the repos in `deps`, so tests run on the memory backend.
 */
import type { UpcomingDate } from '@/lib/db/people';
import type { Person, PersonDate } from '@/lib/db/types';
import { dateFormError } from './forms';
import { listByType, type ActionDeps } from './items';
import { UserError } from './result';

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
};

export { dateFormError };

/** Fields: label, date ('YYYY-MM-DD'), yearly ('false' = one-off; anything else = yearly), notes. */
function parseDateForm(fd: FormData): Pick<PersonDate, 'label' | 'date' | 'yearly' | 'notes'> {
  const error = dateFormError(fd);
  if (error) throw new UserError(error);
  return {
    label: field(fd, 'label'),
    date: field(fd, 'date'),
    yearly: field(fd, 'yearly') !== 'false',
    notes: field(fd, 'notes') || null,
  };
}

export async function addPersonDate(deps: ActionDeps, personId: string, fd: FormData): Promise<PersonDate> {
  return deps.people.addDate({ personId, ...parseDateForm(fd) });
}

export async function updatePersonDate(deps: ActionDeps, id: string, fd: FormData): Promise<PersonDate> {
  return deps.people.updateDate(id, parseDateForm(fd));
}

export async function deletePersonDate(deps: ActionDeps, id: string): Promise<void> {
  await deps.people.deleteDate(id);
}

/** How far ahead the Personas list looks for each person's next date (a whole year). */
export const NEXT_DATE_WINDOW_DAYS = 365;

/** One Personas card. */
export interface PersonaCard {
  person: Person;
  /** The nearest birthday or special date (today included), if any in the next year. */
  next: UpcomingDate | null;
  /** First non-empty line of the notes. */
  notesLine: string | null;
  /** Pending gift ideas. */
  giftCount: number;
  /** Photos on those gift ideas. */
  photoCount: number;
}

/** itemId → number of photos. */
export type PhotoCounter = (itemIds: string[]) => Promise<Record<string, number>>;

/**
 * Every person as a summary card: nearest date first; people with no date after, alphabetical.
 * Photo counts are an extra: if `countPhotos` fails they stay at 0.
 */
export async function listPersonas(deps: ActionDeps, today: string, countPhotos?: PhotoCounter): Promise<PersonaCard[]> {
  const [people, upcoming, gifts] = await Promise.all([
    deps.people.listPeople(),
    deps.people.upcomingDates(today, NEXT_DATE_WINDOW_DAYS),
    listByType(deps, 'regalo'),
  ]);
  let photos: Record<string, number> = {};
  if (countPhotos && gifts.length > 0) {
    try {
      photos = await countPhotos(gifts.map((g) => g.id));
    } catch {
      photos = {};
    }
  }
  const cards = people.map((person): PersonaCard => {
    const own = gifts.filter((g) => g.personId === person.id);
    return {
      person,
      next: upcoming.find((u) => u.person.id === person.id) ?? null,
      notesLine: person.notes?.split('\n').map((l) => l.trim()).find(Boolean) ?? null,
      giftCount: own.length,
      photoCount: own.reduce((n, g) => n + (photos[g.id] ?? 0), 0),
    };
  });
  // listPeople is alphabetical and sort is stable: ties keep that order.
  return cards.sort((a, b) => (a.next?.daysUntil ?? Infinity) - (b.next?.daysUntil ?? Infinity));
}
