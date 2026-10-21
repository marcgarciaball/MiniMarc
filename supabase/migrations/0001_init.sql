-- Agente Personal: esquema inicial.
-- RLS activada en todas las tablas: cada fila pertenece a auth.uid().
-- El rol service_role (clave de servicio) salta RLS por diseño de Supabase.

create extension if not exists pgcrypto;

-- Personas ------------------------------------------------------------------
create table public.people (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  birthday   date,
  notes      text,
  created_at timestamptz not null default now()
);
create unique index people_user_name_uniq on public.people (user_id, lower(btrim(name)));

-- Elementos (tareas, ideas, compras, regalos) --------------------------------
create table public.items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type              text not null check (type in ('tarea', 'idea', 'compra', 'regalo')),
  title             text not null check (length(btrim(title)) > 0),
  notes             text,
  area              text check (area in ('personal', 'trabajo')),
  due_at            timestamptz,
  has_time          boolean not null default false,
  status            text not null default 'pendiente' check (status in ('pendiente', 'hecho', 'archivado')),
  person_id         uuid references public.people(id) on delete set null,
  origin            text not null default 'web' check (origin in ('web', 'siri', 'extension')),
  needs_review      boolean not null default false,
  confidence        real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  calendar_event_id text,
  sync_error        text,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index items_user_active_idx on public.items (user_id, created_at desc) where deleted_at is null;
create index items_deleted_at_idx on public.items (deleted_at) where deleted_at is not null;
create index items_person_idx on public.items (person_id);

-- Tokens de API (Siri, extensión): solo hash SHA-256 ----------------------------
create table public.api_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Credenciales de Google (una fila por usuario) ------------------------------
create table public.google_credentials (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  refresh_token     text not null,
  calendar_tasks_id text,
  updated_at        timestamptz not null default now()
);

-- Ajustes (una fila por usuario) ---------------------------------------------
create table public.settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  digest_hour      int not null default 8 check (digest_hour between 0 and 23),
  tz               text not null default 'Europe/Madrid',
  last_digest_date date
);

-- Suscripciones Web Push ------------------------------------------------------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- RLS: solo el propietario ----------------------------------------------------
alter table public.people             enable row level security;
alter table public.items              enable row level security;
alter table public.api_tokens         enable row level security;
alter table public.google_credentials enable row level security;
alter table public.settings           enable row level security;
alter table public.push_subscriptions enable row level security;

create policy people_owner on public.people
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy items_owner on public.items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy api_tokens_owner on public.api_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy google_credentials_owner on public.google_credentials
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy settings_owner on public.settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_owner on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
