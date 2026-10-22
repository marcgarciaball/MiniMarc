-- Agente Personal: apartado de libros (por leer, leyendo, leídos) con portada.
--
-- 1. items.type admite 'libro'. La CHECK de 0001 era anónima (Postgres la llamó
--    items_type_check); el bloque DO borra cualquier CHECK de items sobre `type` y la crea de
--    nuevo con nombre fijo, así que da igual cómo se llamara.
-- 2. items.author (texto libre, opcional): se guarda en el elemento para que la búsqueda futura
--    lo encuentre.
-- 3. items.reading_state: null (no es un libro) o 'por_leer' | 'leyendo' | 'leido'.
--    Regla (lib/db/items.ts): un libro 'leido' tiene status 'hecho'; 'por_leer' y 'leyendo',
--    'pendiente'. Archivar un libro no cambia su estado de lectura.
-- 4. items.link: enlace opcional del libro (ficha, tienda, reseña…).
-- 5. La portada es una foto normal del elemento (item_photos, 0005).
-- 6. RLS sin cambios: las políticas de items son por fila (0002).
-- 7. Idempotente: se puede ejecutar otra vez.
--
-- Hasta aplicarla, la app sigue funcionando; solo falla guardar un libro.

do $types$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%type%''tarea''%'
  loop
    execute format('alter table public.items drop constraint %I', c.conname);
  end loop;
  alter table public.items
    add constraint items_type_check check (type in ('tarea', 'idea', 'compra', 'regalo', 'libro'));
end
$types$;

alter table public.items
  add column if not exists author text,
  add column if not exists reading_state text,
  add column if not exists link text;

do $reading$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_reading_state_check') then
    alter table public.items
      add constraint items_reading_state_check
      check (reading_state is null or reading_state in ('por_leer', 'leyendo', 'leido'));
  end if;
end
$reading$;
