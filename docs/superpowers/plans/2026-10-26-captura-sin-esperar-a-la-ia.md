# Captura sin esperar a la IA (y ubicación) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una nota dictada o escrita con fecha, hora y lugar acabe siempre bien clasificada y con su ubicación, aunque la IA tarde un minuto en contestar.

**Architecture:** La captura deja de llamar a la IA dentro de la petición: guarda al instante un item provisional (`aiState: 'pendiente'`) y responde. La clasificación corre después, con `after()` de `next/server`, y materializa el resultado (items, cita de Calendar, fecha de persona) antes de borrar el provisional, de modo que el texto nunca se pierde. El cron horario que ya existe recoge lo que `after()` no llegara a terminar. En paralelo, la ubicación pasa a ser un campo de primera clase: la extrae la IA, se guarda en el item y viaja al evento de Calendar.

**Tech Stack:** Next 16.4 (App Router, `after`, `maxDuration`), TypeScript, Supabase (migración SQL), Vitest, Gemini vía `@google/genai`.

**Spec:** No hay documento de diseño: acordado en chat el 2026-10-26 tras una investigación con `superpowers:systematic-debugging`. La evidencia que lo motiva está resumida en "Por qué" más abajo; el camino de captura está documentado en la cabecera de `lib/capture/pipeline.ts`.

## Por qué

Medido con `scripts/probe-classify.ts` el 2026-10-26, misma nota, rondas intercaladas entre modelos:

| modelo | dentro de 8 s | mín | mediana | máx |
|---|---|---|---|---|
| gemini-3.5-flash-lite | 0/3 | 19.571 ms | 22.395 ms | 56.280 ms |
| gemini-3.1-flash-lite | 1/3 | 2.452 ms | 31.920 ms | 61.695 ms |
| gemini-flash-lite-latest | 0/3 | 15.502 ms | 21.873 ms | 41.417 ms |

Una de nueve llamadas cupo en el presupuesto de 8 s. No es un modelo lento: es una latencia entre 2 s y un minuto sin patrón, igual en todos. La premisa del código ("la IA contesta en segundos") es falsa, y cada vez que falla el usuario pierde la clasificación de una nota que la IA entiende perfectamente.

## Global Constraints

- **Regla cero:** el texto nunca se pierde. Todo item guarda el texto entero en `sourceText`; ningún fallo de IA, Calendar o base de datos puede dejar una captura sin fila.
- **Trabajo nunca pasa por la IA.** El camino `area: 'trabajo'` sigue siendo síncrono y sin clasificar.
- **Los chips tipados** (Tarea, Idea, Compra, Regalo, Libro, Cita) siguen siendo síncronos y sin IA. Solo "Auto" difiere.
- **Nunca registrar el texto de la nota, los prompts, las respuestas del modelo ni la clave.** `causeMessage` devuelve palabras fijas por ese motivo.
- **Solo `lib/ai/gemini.ts` importa `@google/genai`** (lo comprueba `tests/ai/gemini.test.ts`).
- `maxDuration = 60` es el techo de la ventana de `after()` en Vercel. Presupuesto de IA: `DEFAULT_TIMEOUT_MS = 25000` con un reintento ⇒ peor caso ~50 s, dentro del techo.
- Migración nueva: `supabase/migrations/0010_ubicacion_y_clasificacion_diferida.sql`. No modificar migraciones ya aplicadas.
- Mensajes de usuario en español, igual que los de `AI_ERROR_TEXT`.

## Review Focus

Entradas que la implementación encontrará y que ningún paso de abajo ejercita por sí solo. Cada línea tiene su test asignado a la tarea que posee el código.

1. **Captura repetida mientras la primera sigue pendiente** (Siri reintenta a los 5 s): el dedup de 30 s debe devolver el provisional, no crear un segundo. → Tarea 5.
2. **La clasificación termina sobre un item que el usuario ya borró o editó a mano**: no debe resucitarlo ni pisar sus cambios. → Tarea 5.
3. **La IA acierta pero Calendar falla** al materializar la cita: debe quedar como tarea con fecha y `syncError`, nunca perderse. → Tarea 6.
4. **Ubicación larguísima o con saltos de línea** (una dirección pegada): debe recortarse como el título, sin romper el evento de Calendar. → Tarea 2.
5. **Un item provisional que lleva horas pendiente** porque `after()` murió con la función: el cron debe recogerlo, y no debe recoger dos veces el mismo. → Tarea 7.

---

### Task 1: La IA extrae la ubicación

**Files:**
- Modify: `lib/ai/schema.ts` (`modelItemSchema`)
- Modify: `lib/ai/classify.ts` (`Classification`, `buildPrompt`, `classify`)
- Test: `tests/ai/classify.test.ts`

**Interfaces:**
- Produces: `Classification.location?: string` — la dirección o el sitio tal como se dijo, sin la etiqueta "Ubicación:".

- [ ] **Step 1: Write the failing tests** en `tests/ai/classify.test.ts`

```ts
it('saca la ubicación de una nota que la trae escrita', async () => {
  const { ai } = fakeAi({
    items: [{ kind: 'cita', title: 'Renovar carnet de conducir', location: 'Avinguda del Cardenal Benlloch, 4, Valencia',
              date: '2026-11-04', time: '17:40', confidence: 0.95 }],
  });
  const [c] = await classify('Renovar carnet de conducir Fecha: 04-11-2026 17:40 Ubicación: Avinguda del Cardenal Benlloch, 4, Valencia', ctx, ai);
  expect(c.location).toBe('Avinguda del Cardenal Benlloch, 4, Valencia');
  expect(c.title).toBe('Renovar carnet de conducir');
});

it('no inventa ubicación cuando no se dice ninguna', async () => {
  const { ai } = fakeAi({ items: [{ kind: 'compra', title: 'leche', confidence: 0.9 }] });
  expect((await classify('comprar leche', ctx, ai))[0].location).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/ai/classify.test.ts`. Expected: FAIL (`location` no existe en el esquema, zod lo descarta).

- [ ] **Step 3: Add `location: optionalText` to `modelItemSchema`**, `location?: string` to `Classification`, copy it through in `classify`, and add one line to `buildPrompt`'s Reglas: la ubicación va en `location` (dirección o sitio, sin la palabra "Ubicación"), nunca dentro de `title`; sin lugar, null.

- [ ] **Step 4: Run to verify they pass** — same command. Expected: PASS, y los 931 tests existentes siguen verdes.

- [ ] **Step 5: Commit** — `feat: la IA extrae la ubicación de la nota`

---

### Task 2: El item guarda la ubicación

**Files:**
- Create: `supabase/migrations/0010_ubicacion_y_clasificacion_diferida.sql`
- Modify: `lib/db/types.ts` (`Item`), `lib/db/items.ts` (`COLUMNS`)
- Modify: `lib/capture/pipeline.ts` (`fromClassification`)
- Test: `tests/capture/pipeline.test.ts`, `tests/db/items.test.ts`

**Interfaces:**
- Consumes: `Classification.location` (Tarea 1).
- Produces: `Item.location: string | null`, columna `location`. La migración crea también `ai_state` (Tarea 4), para no tener dos migraciones.

- [ ] **Step 1: Write the failing tests**

```ts
it('guarda la ubicación clasificada en el item', async () => { /* captureText con una clasificación con location → item.location */ });

it('recorta una ubicación larguísima a TITLE_MAX y aplana los saltos de línea', () => {
  expect(locationField('a\nb')).toBe('a b');
  expect(locationField('x'.repeat(300))!.length).toBe(TITLE_MAX);
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/capture tests/db`.

- [ ] **Step 3: Write the migration and the mapping.** SQL: `alter table items add column location text, add column ai_state text check (ai_state in ('pendiente','fallo'))`. Las políticas RLS de `0002_single_user.sql` son por tabla, no por columna: añadir columnas no obliga a tocarlas, y `tests/db/migrations.test.ts` solo vigila las migraciones ya existentes. Añade `location: 'location'` y `aiState: 'ai_state'` a `COLUMNS` y los campos a `Item`. Implementa `locationField(s: string): string | null` en `lib/capture/pipeline.ts` (colapsa espacios y saltos, recorta a `TITLE_MAX`, `null` si queda vacío) y úsalo en `fromClassification`.

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Commit** — `feat: los items guardan la ubicación`

---

### Task 3: La ubicación llega a Google Calendar

**Files:**
- Modify: `lib/calendar/client.ts` (`TimedEventInput`, `AllDayEventInput`, `eventBody`)
- Modify: `lib/capture/pipeline.ts` (`saveClassified`, rama `cita`), `lib/calendar/taskSync.ts`
- Test: `tests/calendar/taskSync.test.ts`, `tests/capture/pipeline.test.ts`

**Interfaces:**
- Consumes: `Item.location` (Tarea 2), `Classification.location` (Tarea 1).
- Produces: `TimedEventInput.location?: string` y `AllDayEventInput.location?: string`, enviados como `location` en el cuerpo del evento.

- [ ] **Step 1: Write the failing tests**

```ts
it('manda la ubicación al evento de la cita', async () => { /* createEvent recibe location */ });
it('no manda el campo location cuando el item no tiene ubicación', async () => { /* 'location' in body === false */ });
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/calendar tests/capture`.

- [ ] **Step 3: Add `location?: string` a ambos `EventInput`** y `...(e.location && { location: e.location })` en `eventBody`; pásala desde `saveClassified` y desde `taskSyncHook`.

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Commit** — `feat: la cita lleva su ubicación a Calendar`

---

### Task 4: Estado de clasificación en el item

**Files:**
- Modify: `lib/db/types.ts` (`Item`, `ItemFilter`), `lib/db/items.ts` (`listItems`)
- Test: `tests/db/items.test.ts`

**Interfaces:**
- Consumes: la columna `ai_state` creada en Tarea 2.
- Produces: `Item.aiState: 'pendiente' | 'fallo' | null` y `ItemFilter.aiState`, para que el cron encuentre los pendientes.

- [ ] **Step 1: Write the failing test**

```ts
it('filtra items por aiState', async () => {
  // dos items, uno 'pendiente' y otro null → listItems({ aiState: 'pendiente' }) devuelve solo el primero
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/db/items.test.ts`.

- [ ] **Step 3: Add the type, the filter branch in `listItems`, and the memory backend's equivalent.**

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `feat: los items saben si están pendientes de clasificar`

---

### Task 5: La captura guarda al instante y deja la IA para después

**Files:**
- Modify: `lib/capture/pipeline.ts` (`run`, `captureText`)
- Test: `tests/capture/pipeline.test.ts`

**Interfaces:**
- Consumes: `Item.aiState` (Tarea 4).
- Produces:
  - `captureText(input, deps): Promise<CaptureResult>` — ya no llama a la IA; guarda un provisional y devuelve `{ items: [provisional], eventIds: [], pending: true }`.
  - `CaptureResult.pending?: true`.
  - `classifyPending(itemId: string, deps: CaptureDeps): Promise<CaptureResult>` — hace la llamada a la IA y materializa el resultado. Exportada para `after()` y para el cron.

El provisional es el mismo item que hoy produce `unclassified()`, más `aiState: 'pendiente'`.

`classifyPending` es la pieza con reglas propias, en este orden:

1. Relee el item por id. Si no existe, está borrado (`deletedAt`), o su `aiState` ya no es `'pendiente'`, no hace nada: el usuario lo tocó antes que la IA.
2. Clasifica `sourceText`. Si la IA falla, deja `aiState: 'fallo'` y `needsReview: true`, y devuelve el error en `aiError`. El texto sigue donde estaba.
3. Si la IA acierta, **crea primero** todo lo clasificado (reutilizando `saveClassified`) y **solo después**, si se guardó al menos una cosa, borra el provisional (`softDeleteItem`). Si no se guardó nada, el provisional se queda con `aiState: 'fallo'`.

- [ ] **Step 1: Write the failing tests**

```ts
it('la captura responde sin llamar a la IA', async () => {
  const ai = { generateJson: vi.fn(), generateText: vi.fn() };
  const r = await captureText({ text: 'Renovar carnet…', origin: 'web' }, { ...deps, ai });
  expect(ai.generateJson).not.toHaveBeenCalled();
  expect(r.pending).toBe(true);
  expect(r.items[0].sourceText).toBe('Renovar carnet…');
  expect(r.items[0].aiState).toBe('pendiente');
});

it('clasificar después sustituye el provisional por lo clasificado', async () => {
  const { items } = await captureText({ text: 'comprar leche y llamar a mamá', origin: 'web' }, deps);
  await classifyPending(items[0].id, deps);
  const left = await deps.items.listItems({ status: 'pendiente' });
  expect(left.map((i) => i.title)).toEqual(['leche', 'Llamar a mamá']);
});

it('un fallo de la IA deja el provisional con aiState fallo y el texto entero', async () => { /* … */ });

it('si no se pudo guardar nada, el provisional sobrevive', async () => { /* createItem falla → provisional intacto, aiState 'fallo' */ });

// Review Focus 1
it('una captura repetida a los 5 s devuelve el provisional, no crea otro', async () => { /* … */ });

// Review Focus 2
it('no toca un provisional que el usuario borró o ya revisó', async () => {
  const { items } = await captureText({ text: 'algo', origin: 'web' }, deps);
  await deps.items.softDeleteItem(items[0].id);
  await classifyPending(items[0].id, deps);
  expect(await deps.items.listItems({ status: 'pendiente' })).toEqual([]);
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/capture/pipeline.test.ts`.

- [ ] **Step 3: Implement.** Parte `run` en dos: la rama `trabajo` se queda síncrona tal cual; la rama personal guarda el provisional y vuelve. Mueve el bloque de `classify` + bucle de `saveClassified` a `classifyPending`. `listPeople` se lee dentro de `classifyPending`, no en la captura.

- [ ] **Step 4: Run to verify they pass** — y la suite entera: `npx vitest run`.

- [ ] **Step 5: Commit** — `feat: la captura no espera a la IA`

---

### Task 6: Materializar bien la cita cuando Calendar falla

**Files:**
- Modify: `lib/capture/pipeline.ts` (`saveClassified`, si Tarea 5 lo dejó pendiente)
- Test: `tests/capture/pipeline.test.ts`

**Interfaces:**
- Consumes: `classifyPending` (Tarea 5).

- [ ] **Step 1: Write the failing test** (Review Focus 3)

```ts
it('una cita cuyo Calendar falla queda como tarea con fecha, syncError y sin provisional duplicado', async () => {
  // calendar que lanza → classifyPending deja UN item tarea con dueAt, hasTime, syncError y needsReview
  // y ningún provisional suelto con el texto crudo
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — el fallo de Calendar ya produce un item; asegúrate de que cuenta como "se guardó algo" y por tanto el provisional se borra.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `fix: una cita sin Calendar no deja dos filas`

---

### Task 7: Red de seguridad — el cron recoge lo pendiente

**Files:**
- Modify: `lib/cron/morning.ts` (`MorningDeps`, `MorningResult`, bloque de mantenimiento), `lib/cron/server.ts`
- Create: `lib/capture/sweep.ts`
- Test: `tests/cron/morning.test.ts`, `tests/capture/sweep.test.ts`

**Interfaces:**
- Consumes: `classifyPending` (Tarea 5), `ItemFilter.aiState` (Tarea 4).
- Produces:
  - `sweepPending(deps: CaptureDeps, opts: { olderThanMs: number; limit: number }): Promise<number>` — clasifica los provisionales pendientes creados hace más de `olderThanMs`, como mucho `limit`, y devuelve cuántos.
  - `MorningDeps.classifyPending?: () => Promise<number>` y `MorningResult.classified: number`, igual que `refreshPreviews`/`previews`.

Valores: `olderThanMs` = 5 min (para no pisar un `after()` todavía en vuelo), `limit` = 20.

- [ ] **Step 1: Write the failing tests** (Review Focus 5)

```ts
it('clasifica los pendientes de hace más de 5 minutos', async () => { /* … */ });
it('no toca uno de hace 30 segundos, que puede seguir en after()', async () => { /* … */ });
it('no vuelve a coger el que ya clasificó', async () => { /* segunda pasada devuelve 0 */ });
it('un fallo en uno no impide clasificar el resto', async () => { /* … */ });
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/capture/sweep.test.ts tests/cron`.

- [ ] **Step 3: Implement `sweepPending`** y engánchalo en el bloque de mantenimiento de `runMorning` con el mismo patrón defensivo que `refreshPreviews` (try/catch que no tumba el resto del cron), más el cableado real en `lib/cron/server.ts`.

- [ ] **Step 4: Run to verify they pass.**

- [ ] **Step 5: Commit** — `feat: el cron recoge las capturas que se quedaron sin clasificar`

---

### Task 8: Cablear `after()` y el presupuesto de tiempo

**Files:**
- Modify: `lib/capture/server.ts`, `lib/capture/session.ts`, `lib/capture/web.ts`
- Modify: `app/api/capture/route.ts` (`export const maxDuration = 60`)
- Modify: `lib/ai/gemini.ts` (`DEFAULT_TIMEOUT_MS`)
- Test: `tests/capture/web.test.ts`, `tests/capture/handler.test.ts`, `tests/ai/gemini.test.ts`

**Interfaces:**
- Consumes: `classifyPending` (Tarea 5).
- Produces: `scheduleClassification(itemId: string, userId: string): void` en `lib/capture/server.ts` — envuelve `after()` con el cliente service-role (las cookies de sesión no sirven una vez enviada la respuesta, igual que en `lib/links/server.ts`), traga cualquier error e invalida la caché del usuario al terminar.

- [ ] **Step 1: Write the failing tests**

```ts
it('la captura programa la clasificación con after', async () => { /* deps.after recibe una tarea; el id es el del provisional */ });
it('un fallo dentro de after no rompe la respuesta', async () => { /* … */ });
it('el presupuesto de IA y un reintento caben en maxDuration', () => {
  expect(DEFAULT_TIMEOUT_MS * 2).toBeLessThanOrEqual(60_000);
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** `scheduleClassification` siguiendo el patrón de `withServerPreviews`. `DEFAULT_TIMEOUT_MS` pasa de `8000` a `25000`, con el comentario de por qué (medición del 2026-10-26: mediana ~20-30 s). `maxDuration = 60` en la ruta de captura y en la página que aloja la server action.

- [ ] **Step 4: Run to verify they pass** — `npx vitest run`.

- [ ] **Step 5: Commit** — `feat: la clasificación corre después de la respuesta`

---

### Task 9: Lo que ve y oye el usuario

**Files:**
- Modify: `lib/capture/handler.ts` (`captureMessage`), `components/items/ItemsScreen.tsx` o `components/items/ItemRow.tsx`, `components/items/ItemSheet.tsx`
- Test: `tests/capture/handler.test.ts`, `tests/screens/*`

**Interfaces:**
- Consumes: `CaptureResult.pending` (Tarea 5), `Item.aiState` (Tarea 4), `Item.location` (Tarea 2).

- [ ] **Step 1: Write the failing tests**

```ts
it('una captura pendiente se anuncia como tal', () => {
  expect(captureMessage({ items: [item], eventIds: [], pending: true })).toBe('Guardado. Lo clasifico en un momento.');
});
it('un item pendiente se muestra como "Clasificando…", no como pendiente de revisar', () => { /* … */ });
it('la hoja del item muestra y deja editar la ubicación', () => { /* … */ });
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** El texto exacto de `captureMessage` cuando `pending`: `'Guardado. Lo clasifico en un momento.'` (lo habla Siri, así que frase corta y cerrada). Cuando `aiState === 'fallo'`, el mensaje sigue siendo el de `AI_ERROR_TEXT`. En la lista, un item con `aiState === 'pendiente'` muestra "Clasificando…" en lugar del pie de revisión. En `ItemSheet`, una fila de Ubicación editable, encima de Fecha, con el mismo patrón que Notas.

- [ ] **Step 4: Run to verify they pass** — `npx vitest run`.

- [ ] **Step 5: Commit** — `feat: la app dice cuándo está clasificando y muestra la ubicación`

---

### Task 10: Documentación y cierre

**Files:**
- Modify: `docs/despliegue.md` (migración 0010, `maxDuration`), `lib/capture/pipeline.ts` (comentario de cabecera)
- Test: la suite entera

- [ ] **Step 1: Update the header comment of `lib/capture/pipeline.ts`** para que describa el camino nuevo: la captura guarda y responde; la clasificación corre después; regla cero intacta.

- [ ] **Step 2: Add migration 0010 to the table in `docs/despliegue.md`** y una nota de que la captura ya no espera a la IA.

- [ ] **Step 3: Run the whole suite and the linters** — `npx vitest run && npx tsc --noEmit && npx eslint`. Expected: todo verde.

- [ ] **Step 4: Verify in the real app** — captura "Renovar carnet de conducir Fecha: 04-11-2026 17:40 Ubicación: Avinguda del Cardenal Benlloch, 4, Valencia": responde al instante, y en menos de un minuto aparece como cita en Calendar con su dirección.

- [ ] **Step 5: Commit** — `docs: la captura ya no espera a la IA`
