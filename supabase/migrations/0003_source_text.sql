-- Agente Personal: texto original de cada captura (revisión fases 2+3, I-1 e I-2).
--
-- 1. items.source_text guarda el texto completo que dictó Marc (Siri, extensión, web) en cada
--    elemento que crea una captura. Así lo capturado nunca se pierde aunque la IA lo resuma o
--    lo divida mal, y la hoja de edición lo muestra como "Texto original". Opcional: los
--    elementos creados a mano y los anteriores a esta migración lo tienen a null.
-- 2. La búsqueda de duplicados (mismo texto normalizado, misma área, menos de 30 s, no
--    eliminado) lee las capturas recientes del usuario; este índice parcial la cubre.
--    La normalización (trim, minúsculas, espacios colapsados) se hace en el servidor.

alter table public.items
  add column if not exists source_text text;

create index if not exists items_recent_captures_idx
  on public.items (user_id, created_at desc)
  where deleted_at is null and source_text is not null;
