import type { SupabaseClient } from '@supabase/supabase-js';

export type TableName = 'items' | 'people';
export type Row = Record<string, unknown>;

/** Filtros combinados con AND. */
export interface Where {
  eq?: Row;
  /** Igualdad insensible a mayúsculas (sin comodines). */
  ieq?: Record<string, string>;
  isNull?: string[];
  notNull?: string[];
  /** Columna de timestamp < valor ISO. */
  lt?: Record<string, string>;
}

/** Backend mínimo sobre el que se construyen los repositorios. */
export interface DbBackend {
  insert(table: TableName, row: Row): Promise<Row>;
  select(table: TableName, where?: Where): Promise<Row[]>;
  /** Lanza si no existe la fila. */
  update(table: TableName, id: string, patch: Row): Promise<Row>;
  /** Devuelve el número de filas borradas. */
  remove(table: TableName, where: Where): Promise<number>;
}

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyWhere<Q extends Record<string, any>>(q: Q, where: Where = {}): Q {
  for (const [k, v] of Object.entries(where.eq ?? {})) q = q.eq(k, v);
  for (const [k, v] of Object.entries(where.ieq ?? {})) q = q.ilike(k, escapeLike(v));
  for (const k of where.isNull ?? []) q = q.is(k, null);
  for (const k of where.notNull ?? []) q = q.not(k, 'is', null);
  for (const [k, v] of Object.entries(where.lt ?? {})) q = q.lt(k, v);
  return q;
}

/**
 * Backend sobre Supabase. Con `userId` (cliente de servicio, que salta RLS)
 * se fija `user_id` al insertar y se filtra por él en el resto de operaciones;
 * sin él, `user_id` toma `auth.uid()` por defecto y RLS limita el acceso.
 */
export function createSupabaseBackend(
  client: SupabaseClient,
  opts: { userId?: string } = {},
): DbBackend {
  const own = (w: Where = {}): Where =>
    opts.userId ? { ...w, eq: { ...w.eq, user_id: opts.userId } } : w;

  return {
    async insert(table, row) {
      const data = opts.userId ? { ...row, user_id: opts.userId } : row;
      const res = await client.from(table).insert(data).select().single();
      if (res.error) throw new Error(`insert ${table}: ${res.error.message}`);
      return res.data as Row;
    },
    async select(table, where) {
      const res = await applyWhere(client.from(table).select(), own(where));
      if (res.error) throw new Error(`select ${table}: ${res.error.message}`);
      return (res.data ?? []) as Row[];
    },
    async update(table, id, patch) {
      const res = await applyWhere(
        client.from(table).update(patch),
        own({ eq: { id } }),
      )
        .select()
        .single();
      if (res.error) throw new Error(`update ${table} ${id}: ${res.error.message}`);
      return res.data as Row;
    },
    async remove(table, where) {
      const res = await applyWhere(client.from(table).delete({ count: 'exact' }), own(where));
      if (res.error) throw new Error(`delete ${table}: ${res.error.message}`);
      return res.count ?? 0;
    },
  };
}
