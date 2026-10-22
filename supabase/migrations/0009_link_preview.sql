-- Agente Personal: vista previa de enlaces y buscador.
--
-- 1. items.link_title, link_image y link_site: la vista previa del enlace del elemento (título de
--    la página, URL de og:image y nombre del sitio). La rellena el servidor después de guardar
--    (lib/links/server.ts, con after()) o, si eso falla, el trabajo horario. link_site se escribe
--    en cada intento (el dominio si la página no da nombre): null = aún no se ha intentado.
-- 2. Búsqueda sin distinguir mayúsculas ni acentos: public.search_normalize(text) hace
--    lower() + translate() de las vocales acentuadas, ñ, ç, ý (mayúsculas y minúsculas).
--    Se eligió translate y no la extensión unaccent porque unaccent no es IMMUTABLE (no puede ir
--    en una columna generada sin un envoltorio que depende del esquema donde se instaló la
--    extensión) y porque la app normaliza el texto buscado con la misma tabla
--    (lib/search/normalize.ts): lo que se guarda y lo que se busca se normalizan igual, sin
--    depender de ninguna extensión. Funciona en el plan gratuito tal cual.
-- 3. items.search_text y people.search_text: columnas generadas (stored) con el texto ya
--    normalizado; la app busca con ilike sobre ellas. items: title, notes, source_text, author y
--    link_title. people: name y notes.
-- 4. RLS sin cambios: las políticas de items y people son por fila (0002).
-- 5. Idempotente: se puede ejecutar otra vez.
--
-- Hasta aplicarla, la app sigue funcionando: no hay vistas previas y el buscador busca sin
-- ignorar los acentos (ilike sobre las columnas originales).

alter table public.items
  add column if not exists link_title text,
  add column if not exists link_image text,
  add column if not exists link_site text;

create or replace function public.search_normalize(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select translate(
    lower(coalesce(t, '')),
    'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿÁÀÂÄÃÅĀÉÈÊËĒÍÌÎÏĪÓÒÔÖÕØŌÚÙÛÜŪÑÇÝŸ',
    'aaaaaaaeeeeeiiiiiooooooouuuuuncyyaaaaaaaeeeeeiiiiiooooooouuuuuncyy'
  );
$$;

alter table public.items
  add column if not exists search_text text generated always as (
    public.search_normalize(
      coalesce(title, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(source_text, '') || ' ' ||
      coalesce(author, '') || ' ' || coalesce(link_title, '')
    )
  ) stored;

alter table public.people
  add column if not exists search_text text generated always as (
    public.search_normalize(coalesce(name, '') || ' ' || coalesce(notes, ''))
  ) stored;

-- Items whose preview the hourly job still has to fetch.
create index if not exists items_missing_preview_idx
  on public.items (user_id, created_at desc)
  where link is not null and link_site is null and deleted_at is null;
