import { randomUUID } from 'node:crypto';
import type { DbBackend, Row, TableName, Where } from './backend';

function matches(row: Row, where: Where = {}): boolean {
  for (const [k, v] of Object.entries(where.eq ?? {})) if (row[k] !== v) return false;
  for (const [k, v] of Object.entries(where.ieq ?? {})) {
    const cur = row[k];
    if (typeof cur !== 'string' || cur.toLowerCase() !== v.toLowerCase()) return false;
  }
  for (const k of where.isNull ?? []) if (row[k] != null) return false;
  for (const k of where.notNull ?? []) if (row[k] == null) return false;
  for (const [k, v] of Object.entries(where.lt ?? {})) {
    const cur = row[k];
    if (cur == null || Date.parse(String(cur)) >= Date.parse(v)) return false;
  }
  for (const [k, v] of Object.entries(where.gte ?? {})) {
    const cur = row[k];
    if (cur == null || Date.parse(String(cur)) < Date.parse(v)) return false;
  }
  for (const [k, v] of Object.entries(where.in ?? {})) if (!v.includes(row[k])) return false;
  return true;
}

/** Backend en memoria con el mismo contrato que el de Supabase (para tests). */
export function createMemoryBackend(opts: { now?: () => Date } = {}): DbBackend & {
  tables: Record<TableName, Row[]>;
} {
  const now = opts.now ?? (() => new Date());
  const tables: Record<TableName, Row[]> = { items: [], people: [], item_photos: [] };

  return {
    tables,
    async insert(table, row) {
      const full: Row = { id: randomUUID(), created_at: now().toISOString(), ...row };
      tables[table].push(full);
      return { ...full };
    },
    async select(table, where) {
      return tables[table].filter((r) => matches(r, where)).map((r) => ({ ...r }));
    },
    async update(table, id, patch) {
      const row = tables[table].find((r) => r.id === id);
      if (!row) throw new Error(`update ${table} ${id}: not found`);
      Object.assign(row, patch);
      return { ...row };
    },
    async remove(table, where) {
      const before = tables[table].length;
      tables[table] = tables[table].filter((r) => !matches(r, where));
      return before - tables[table].length;
    },
  };
}
