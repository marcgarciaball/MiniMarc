import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';
import type { Item, ItemFilter, ItemPatch, NewItem } from './types';

export interface ItemsRepo {
  createItem(input: NewItem): Promise<Item>;
  listItems(f?: ItemFilter): Promise<Item[]>;
  updateItem(id: string, patch: ItemPatch): Promise<Item>;
  softDeleteItem(id: string): Promise<void>;
  restoreItem(id: string): Promise<void>;
  /** Soft-deleted items deleted within the last `days` days, most recently deleted first (Papelera). */
  listDeleted(days: number): Promise<Item[]>;
  purgeDeletedOlderThan(days: number): Promise<number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Correspondencia única camelCase (Item) ↔ snake_case (columna). */
const COLUMNS = {
  id: 'id',
  type: 'type',
  title: 'title',
  notes: 'notes',
  area: 'area',
  dueAt: 'due_at',
  hasTime: 'has_time',
  status: 'status',
  personId: 'person_id',
  origin: 'origin',
  needsReview: 'needs_review',
  confidence: 'confidence',
  calendarEventId: 'calendar_event_id',
  syncError: 'sync_error',
  createdAt: 'created_at',
  deletedAt: 'deleted_at',
} as const satisfies Record<keyof Item, string>;

export function rowToItem(row: Row): Item {
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(COLUMNS)) out[k] = row[col] ?? null;
  out.hasTime = Boolean(row.has_time);
  out.needsReview = Boolean(row.needs_review);
  out.confidence = row.confidence == null ? null : Number(row.confidence);
  return out as unknown as Item;
}

export function itemToRow(item: Partial<Item>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === undefined) continue;
    const col = COLUMNS[k as keyof Item];
    if (col) row[col] = v;
  }
  return row;
}

export function createItemsRepo(
  backend: DbBackend,
  opts: { now?: () => Date } = {},
): ItemsRepo {
  const now = opts.now ?? (() => new Date());

  return {
    async createItem(input) {
      const full: Omit<Item, 'id' | 'createdAt' | 'deletedAt'> = {
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
        ...input,
      };
      return rowToItem(await backend.insert('items', itemToRow(full)));
    },

    async listItems(f = {}) {
      const eq = itemToRow({
        type: f.type,
        area: f.area,
        status: f.status,
        needsReview: f.needsReview,
      });
      const gte = f.createdSince ? { created_at: f.createdSince } : undefined;
      const rows = await backend.select('items', { eq, isNull: ['deleted_at'], gte });
      return rows
        .map(rowToItem)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },

    async updateItem(id, patch) {
      return rowToItem(await backend.update('items', id, itemToRow(patch)));
    },

    async softDeleteItem(id) {
      await backend.update('items', id, { deleted_at: now().toISOString() });
    },

    async restoreItem(id) {
      await backend.update('items', id, { deleted_at: null });
    },

    async listDeleted(days) {
      const since = new Date(now().getTime() - days * DAY_MS).toISOString();
      const rows = await backend.select('items', { notNull: ['deleted_at'], gte: { deleted_at: since } });
      return rows
        .map(rowToItem)
        .sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!));
    },

    async purgeDeletedOlderThan(days) {
      const cutoff = new Date(now().getTime() - days * DAY_MS);
      return backend.remove('items', { notNull: ['deleted_at'], lt: { deleted_at: cutoff.toISOString() } });
    },
  };
}

export function createSupabaseItemsRepo(
  client: SupabaseClient,
  opts: { userId?: string; now?: () => Date } = {},
): ItemsRepo {
  return createItemsRepo(createSupabaseBackend(client, opts), opts);
}
