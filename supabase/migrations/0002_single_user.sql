-- Agente Personal: usuario único en la capa de datos (revisión fase 1, I-1 y M-1).
--
-- 1. private.app_config guarda el único correo permitido. Postgres no ve las variables de
--    Vercel, así que Marc lo escribe una vez en el SQL Editor (ver docs/despliegue.md, paso 1):
--      insert into private.app_config (allowed_email) values ('tu-correo@gmail.com')
--      on conflict (id) do update set allowed_email = excluded.allowed_email;
--    El esquema `private` no está expuesto en la Data API: nadie lo lee desde el navegador.
-- 2. Un trigger BEFORE INSERT en auth.users rechaza crear cualquier usuario cuyo correo no sea
--    ese (también si no hay correo configurado: falla cerrado). Funciona con cualquier
--    proveedor y flujo (PKCE, implícito, enlace mágico), porque todos acaban insertando aquí.
--    No hace falta activar nada en el panel.
-- 3. Las políticas RLS exigen, además de user_id = auth.uid(), que el correo del JWT sea el
--    permitido. Así un usuario creado antes de esta migración tampoco puede leer ni escribir.
-- 4. google_credentials deja de ser accesible para anon/authenticated: solo la service role
--    (servidor) lee o escribe el refresh token de Google.
--
-- Sin bloqueos: el primer inicio de sesión de Marc crea su usuario con su correo, que pasa el
-- trigger. Si el correo no está configurado, el alta falla con "Database error saving new
-- user" y basta con ejecutar el insert de arriba y volver a entrar.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Configuración (una sola fila) -------------------------------------------------
create table if not exists private.app_config (
  id            boolean primary key default true check (id),
  allowed_email text not null check (allowed_email = lower(btrim(allowed_email)) and allowed_email like '%@%')
);
revoke all on private.app_config from public, anon, authenticated;

-- ¿Es este el correo permitido? (null o vacío → no) -----------------------------
create or replace function private.is_allowed_email(email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select lower(btrim(email)) = c.allowed_email from private.app_config c where c.id),
    false
  );
$$;

-- ¿La petición actual viene del usuario permitido? (lee el correo del JWT) -------
create or replace function private.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_allowed_email(auth.jwt() ->> 'email');
$$;

revoke all on function private.is_allowed_email(text) from public, anon, authenticated;
revoke all on function private.is_allowed_user() from public, anon;
-- Las políticas RLS se evalúan con el rol de la petición, que necesita ver la función.
grant usage on schema private to authenticated;
grant execute on function private.is_allowed_user() to authenticated;

-- Trigger en auth.users: solo se puede crear el usuario permitido ----------------
create or replace function private.reject_other_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Altas, y cambios de correo de un usuario existente.
  if tg_op = 'INSERT' or new.email is distinct from old.email then
    if not private.is_allowed_email(new.email) then
      raise exception 'Registro no permitido: Agente Personal es de un solo usuario'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.reject_other_users() from public, anon, authenticated;

drop trigger if exists single_user_only on auth.users;
create trigger single_user_only
  before insert or update of email on auth.users
  for each row execute function private.reject_other_users();

-- RLS: propietario Y usuario permitido ------------------------------------------
-- `(select ...)` hace que Postgres evalúe la función una vez por consulta, no por fila.
drop policy if exists people_owner on public.people;
create policy people_owner on public.people
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

drop policy if exists items_owner on public.items;
create policy items_owner on public.items
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

drop policy if exists api_tokens_owner on public.api_tokens;
create policy api_tokens_owner on public.api_tokens
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

drop policy if exists settings_owner on public.settings;
create policy settings_owner on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

drop policy if exists push_subscriptions_owner on public.push_subscriptions;
create policy push_subscriptions_owner on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));

-- google_credentials: solo la service role (M-1) ---------------------------------
-- Sin política y sin permisos para los roles del navegador: el refresh token de Google no se
-- puede leer ni escribir con la clave pública. RLS sigue activa (0001) y la service role la salta.
drop policy if exists google_credentials_owner on public.google_credentials;
revoke all on public.google_credentials from anon, authenticated;
