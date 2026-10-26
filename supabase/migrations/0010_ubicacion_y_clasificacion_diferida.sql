-- Agente Personal: ubicación de la nota y clasificación diferida.
--
-- 1. items.location: la dirección o el sitio que la IA extrae de la nota. Va al campo Ubicación
--    del evento de Calendar.
-- 2. items.ai_state: 'pendiente' = la captura se guardó sin esperar a la IA y falta clasificarla;
--    'fallo' = la clasificación falló; null = nada que hacer.
-- 3. RLS sin cambios: las políticas de items son por fila (0002), no por columna.
-- 4. Idempotente: se puede ejecutar otra vez.
--
-- Hasta aplicarla, la app sigue funcionando: no escribe estas columnas mientras valgan null.

alter table public.items
  add column if not exists location text,
  add column if not exists ai_state text check (ai_state in ('pendiente', 'fallo'));
