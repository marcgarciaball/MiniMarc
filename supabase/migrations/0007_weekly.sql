-- Agente Personal: resumen semanal (aviso el lunes o el domingo).
--
-- 1. settings.weekly_digest: 'lunes' (lunes a las 08:00, la semana que empieza; por defecto),
--    'domingo' (domingo a las 20:00, la semana siguiente) u 'off'. Se elige en Ajustes.
-- 2. settings.last_weekly_date: el lunes de la última semana enviada. El cron horario
--    (/api/cron/morning) no repite una semana ya enviada, tampoco al pasar de domingo a lunes.
-- 3. settings.last_week_headline / _week: la frase de la IA de la semana, una llamada por
--    semana (como last_digest_headline en 0004). A la IA no llega nada de Trabajo.
-- 4. RLS como en 0002: propietario Y usuario permitido (private.is_allowed_user()).
-- 5. Idempotente: se puede ejecutar otra vez.
--
-- Hasta aplicarla, la app sigue funcionando: el resumen semanal queda desactivado.

alter table public.settings
  add column if not exists weekly_digest text not null default 'lunes',
  add column if not exists last_weekly_date date,
  add column if not exists last_week_headline text,
  add column if not exists last_week_headline_week date;

do $check$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_weekly_digest_check') then
    alter table public.settings
      add constraint settings_weekly_digest_check check (weekly_digest in ('lunes', 'domingo', 'off'));
  end if;
end
$check$;

alter table public.settings enable row level security;

drop policy if exists settings_owner on public.settings;
create policy settings_owner on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed_user()));
