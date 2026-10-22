-- Agente Personal: fotos en los elementos.
--
-- 1. Bucket privado `photos` en Supabase Storage (no público): máximo ~8 MB por imagen, solo
--    JPEG, PNG, WebP y HEIC. La app reduce las fotos en el navegador (1600 px, ~0,8) antes de
--    subirlas, para no gastar el 1 GB gratuito; el límite del bucket es solo una red de seguridad.
-- 2. RLS en storage.objects: cada usuario solo lee, sube, cambia y borra objetos bajo su propia
--    carpeta `{auth.uid()}/…`, y además debe ser el usuario permitido (mismo patrón que 0002,
--    private.is_allowed_user()). Las imágenes se ven con URL firmadas que crea el servidor con la
--    sesión del usuario. La purga del cron (30 días en la papelera) usa la service role.
-- 3. Tabla public.item_photos: una fila por foto (varias por elemento). Al borrar el elemento de
--    verdad (purga), sus filas se borran en cascada; los objetos del bucket los borra el cron.
--    El borrado suave (papelera) no toca las fotos.
-- 4. Idempotente: se puede ejecutar otra vez.

-- Bucket ------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS de Storage: solo la carpeta propia y solo el usuario permitido ---------------
-- (storage.foldername(name))[1] es el primer segmento de la ruta: '{uid}/{item}/{foto}.webp'.
drop policy if exists photos_owner_select on storage.objects;
create policy photos_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_allowed_user())
  );

drop policy if exists photos_owner_insert on storage.objects;
create policy photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_allowed_user())
  );

drop policy if exists photos_owner_update on storage.objects;
create policy photos_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_allowed_user())
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_allowed_user())
  );

drop policy if exists photos_owner_delete on storage.objects;
create policy photos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_allowed_user())
  );

-- Fotos de los elementos ----------------------------------------------------------
create table if not exists public.item_photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path       text not null unique check (length(btrim(path)) > 0),
  width      int check (width is null or width > 0),
  height     int check (height is null or height > 0),
  created_at timestamptz not null default now()
);
create index if not exists item_photos_item_idx on public.item_photos (item_id, created_at);
create index if not exists item_photos_user_idx on public.item_photos (user_id);

alter table public.item_photos enable row level security;

drop policy if exists item_photos_owner on public.item_photos;
create policy item_photos_owner on public.item_photos
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));
