/**
 * Optimistic list updates (useOptimistic in the list screens): the row changes at once and the
 * server's answer replaces it; on failure React drops the optimistic state by itself (rollback)
 * and the screen shows a calm toast. Pure: unit-tested.
 */
import type { Item } from '@/lib/db/types';
import { parseNewItem, type MovePatch } from './items';

export type ListOp =
  | { kind: 'remove'; id: string }
  | { kind: 'add'; item: Item }
  | { kind: 'patch'; id: string; patch: MovePatch };

/** Prefix of the ids of rows not saved yet (they cannot be opened or ticked). */
export const DRAFT_PREFIX = 'draft:';
export const isDraft = (item: Pick<Item, 'id'>) => item.id.startsWith(DRAFT_PREFIX);

/** `items` with the pending operations applied in order. Adds go at the end of the list. */
export function applyListOps(items: Item[], ops: readonly ListOp[], withAdds = true): Item[] {
  let out = items;
  for (const op of ops) {
    if (op.kind === 'remove') out = out.filter((i) => i.id !== op.id);
    else if (op.kind === 'patch') out = out.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i));
    else if (withAdds && !out.some((i) => i.id === op.item.id)) out = [...out, op.item];
  }
  return out;
}

/**
 * Whether an edited item still belongs to the list it was in: same type, same area for tasks,
 * still pending, still unclassified in review mode (saving there files it), same person on a
 * person's page. When not, the optimistic update removes the row.
 */
export function staysInList(item: Item, patch: MovePatch, opts: { reviewMode?: boolean; personId?: string } = {}): boolean {
  const next = { ...item, ...patch };
  if (opts.reviewMode) return false;
  if (next.type !== item.type) return false;
  if (item.type === 'tarea' && next.area !== item.area) return false;
  if (item.status === 'pendiente' && next.status !== 'pendiente') return false;
  if (opts.personId && next.personId !== opts.personId) return false;
  return true;
}

/** The row a new item will become, from the add form; null if the form would be refused. */
export function draftItem(fd: FormData, n: number, now: Date): Item | null {
  let fields;
  try {
    fields = parseNewItem(fd);
  } catch {
    return null;
  }
  return {
    id: `${DRAFT_PREFIX}${n}`,
    notes: null,
    area: null,
    dueAt: null,
    hasTime: false,
    status: 'pendiente',
    personId: null,
    origin: 'web',
    needsReview: false,
    confidence: null,
    calendarEventId: null,
    syncError: null,
    sourceText: null,
    author: null,
    readingState: null,
    link: null,
    linkTitle: null,
    linkImage: null,
    linkSite: null,
    createdAt: now.toISOString(),
    deletedAt: null,
    ...fields,
  };
}

/** Whether a new item shows in a list created with these defaults. */
export function fitsNewList(item: Item, defaults: { type: string; area?: string; personId?: string }): boolean {
  if (item.type !== defaults.type) return false;
  if (defaults.area && item.area !== defaults.area) return false;
  return (item.personId ?? undefined) === (defaults.personId ?? undefined);
}
