-- Agente Personal: personas y fechas especiales.
--
-- 1. Tabla public.person_dates: fechas de una persona además del cumpleaños (aniversario,
--    santo, el día que se conocieron…). people.birthday no cambia: la app lo trata como una
--    fecha más. Al borrar la persona, sus fechas se borran en cascada.
-- 2. `yearly` (por defecto sí) = se repite cada año; la app calcula la próxima vez y lleva el
--    29 de febrero al 28 en años no bisiestos. Año 1604 = año desconocido (como Contactos).
-- 3. RLS como en 0002: propietario Y usuario permitido (private.is_allowed_user()).
-- 4. Idempotente: se puede ejecutar otra vez.

create table if not exists public.person_dates (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.people(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label      text not null check (length(btrim(label)) > 0),
  date       date not null,
  yearly     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists person_dates_person_idx on public.person_dates (person_id);
create index if not exists person_dates_user_idx on public.person_dates (user_id);

alter table public.person_dates enable row level security;

drop policy if exists person_dates_owner on public.person_dates;
create policy person_dates_owner on public.person_dates
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));
