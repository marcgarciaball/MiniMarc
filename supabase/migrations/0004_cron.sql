-- Agente Personal: resumen de la mañana (Tarea 14).
--
-- 1. settings guarda el titular del resumen del día (una sola llamada a Gemini al día, la
--    comparten el cron y la pantalla Hoy).
-- 2. Un trabajo de pg_cron llama cada hora (minuto 0, UTC) a POST /api/cron/morning con
--    `Authorization: Bearer <cron_secret>`. La ruta decide si toca enviar el resumen (hora
--    elegida en Ajustes, en la zona de settings.tz) y hace el mantenimiento horario.
--    Vercel Hobby solo permite un cron diario y no sabe de horas locales; por eso va aquí.
--    La URL y el secreto se leen de Supabase Vault en cada ejecución; nunca están en git.
--    Marc los crea una vez en el SQL Editor (ver docs/despliegue.md, "Resumen de la mañana"):
--      select vault.create_secret('https://mini-marc-personal.vercel.app', 'app_url');
--      select vault.create_secret('<el mismo valor que CRON_SECRET en Vercel>', 'cron_secret');
-- 3. Idempotente: se puede ejecutar otra vez; el trabajo se desprograma antes de volver a
--    programarlo. Si pg_cron o pg_net no están disponibles en el plan, la parte del cron se
--    salta con un aviso (NOTICE) y el resto de la migración se aplica igual; entonces se usa
--    un cron externo gratuito (docs/despliegue.md).

alter table public.settings
  add column if not exists last_digest_headline text,
  add column if not exists last_digest_headline_date date;

do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron o pg_net no disponibles: usa un cron externo (docs/despliegue.md)';
    return;
  end if;

  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;

  if exists (select 1 from cron.job where jobname = 'agente-resumen-manana') then
    perform cron.unschedule('agente-resumen-manana');
  end if;

  perform cron.schedule(
    'agente-resumen-manana',
    '0 * * * *',
    $job$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'app_url'), '/')
             || '/api/cron/morning',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $job$
  );
end
$cron$;
