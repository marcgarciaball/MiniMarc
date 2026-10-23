# Mejoras de Agente Personal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los seis huecos que impiden que Marc confíe del todo en la app (recurrentes, posponer, repaso de lo olvidado, captura sin cobertura, estado del sistema, restaurar/copia) y los cuatro menores (etiquetas con compras agrupadas, marcar varias, subtareas, Siri de lectura).

**Architecture:** Nada nuevo en la arquitectura: cada mejora sigue el patrón que ya existe. Lógica pura en `lib/**` sobre repos inyectables y probada con el backend en memoria (`lib/db/memory.ts`); las Server Actions son envoltorios finos en `app/actions/**` que pasan por `runAction` e invalidan etiquetas de caché (`lib/cache/tags.ts`); las columnas nuevas se añaden en migraciones idempotentes y se tratan como opcionales (`OPTIONAL_FIELDS` en `lib/db/items.ts`) para que la app siga funcionando antes de aplicarlas. La única pieza de infraestructura nueva es un entorno DOM para vitest, que permite probar las pantallas sin levantar servidor.

**Tech Stack:** Next.js 16.4.2 (App Router, React 19.3), TypeScript, Supabase (Postgres + Storage + RLS), Google Calendar API, Gemini (`@google/genai`), web-push, zod 4, vitest 5. Se añade: `@testing-library/react`, `@testing-library/user-event`, `jsdom`.

**Spec:** `docs/superpowers/specs/2026-10-21-agente-personal-design.md` (documento de diseño original) y, para el alcance de este plan, `docs/superpowers/specs/2026-10-22-mejoras-design.md`.

## Global Constraints

- **Coste 0 €.** Nada de servicios nuevos de pago: Vercel Hobby, Supabase gratuito, Gemini gratuito. Las copias van al Storage de Supabase (1 GB gratis).
- **Trabajo nunca pasa por la IA.** Ninguna función nueva puede meter títulos, notas ni texto de elementos con `area === 'trabajo'` en un prompt. Los tests lo comprueban con cadenas centinela, como en `tests/digest/build.test.ts`.
- **Nada se pierde.** Ningún camino nuevo puede descartar texto que Marc haya escrito; ante el fallo, se guarda donde se pueda y se le dice.
- **Interfaz en español**, sin emojis como decoración, sin texto motivacional. Identificadores y comentarios de código en inglés, como el resto del repositorio.
- **Idioma de las migraciones:** un archivo por tarea, idempotente (`if not exists`, `drop policy if exists`), con RLS `user_id = (select auth.uid()) and (select private.is_allowed_user())` como en `0005`/`0006`.
- **Columnas nuevas = opcionales.** Toda columna añadida aquí se registra en `OPTIONAL_FIELDS` (`lib/db/items.ts`) o se lee con tolerancia al error `42703`, como hace `lib/db/settings.ts`.
- **Diseño:** vidrio esmerilado, acento azul glaciar único, tokens de `styles/tokens.css`, componentes de `components/ui`, objetivos táctiles ≥ 44 px, AA de contraste.
- Cada tarea termina con `npm test` en verde y `npx tsc --noEmit` sin errores antes del commit.

## Review Focus

- **Tarea repetida que lleva meses vencida:** al completarla, la siguiente ocurrencia debe caer en el futuro, no seguir vencida (Tarea 1).
- **Cambio de hora:** una tarea repetida a las 09:00 de Madrid sigue a las 09:00 cruzando el cambio de hora, no a las 08:00 ni a las 10:00 (Tarea 1).
- **Día 31 y 29 de febrero:** repetición mensual desde el 31 y anual desde el 29-feb caen en el último día del mes y en el 28-feb (Tarea 1).
- **Cola sin conexión enviada dos veces** (dos pestañas, o un reintento sobre un envío que sí llegó): no puede crear elementos duplicados (Tarea 6).
- **JSON de restauración ajeno o manipulado:** ids que ya existen, tipos desconocidos, campos que faltan: nunca debe romper ni sobrescribir lo que ya hay (Tarea 8).

---

## Fase 0 — Cimiento de pruebas

### Tarea 0: Entorno de pruebas de pantallas

**Files:**
- Create: `tests/screens/setup.ts`, `tests/screens/itemsScreen.test.tsx`, `tests/screens/captureBar.test.tsx`, `tests/screens/itemSheet.test.tsx`
- Modify: `vitest.config.ts`, `package.json`, `README.md`

**Interfaces:**
- Produce: entorno `jsdom` por archivo (`// @vitest-environment jsdom`) para `tests/screens/**`, con el resto de la suite sin tocar. `tests/screens/setup.ts` exporta `renderScreen(ui)` (envoltorio de `render` de Testing Library) y los dobles de las Server Actions.
- Las Server Actions se sustituyen con `vi.mock('@/app/actions/items', ...)` devolviendo `ActionResult` controlados.

**Va primero a propósito:** casi todas las tareas de la Fase A tocan `ItemSheet` y `ItemsScreen`. Con el entorno montado antes, **cada tarea posterior añade su propio test de pantalla en su Paso de tests** (se señala en cada una), en vez de retrofitarlos al final.

**Decisión del plan (mía, no de Marc):** se prueban las pantallas con Testing Library sobre jsdom, no con Playwright. Da cobertura de las pantallas sin levantar servidor ni base de datos, encaja con la suite de vitest que ya existe y no cuesta nada. **Queda fuera a propósito** lo que jsdom no puede comprobar: los gestos de deslizar reales, la física de las hojas, el desenfoque del vidrio y el aspecto visual. Si más adelante hiciera falta, Playwright se añade aparte.

- [ ] **Paso 1: instalar** `npm i -D @testing-library/react @testing-library/user-event jsdom` y añadir `"test:screens": "vitest run tests/screens"` a los scripts.
- [ ] **Paso 2: escribir los tests que fallan.** `itemsScreen.test.tsx`:

```tsx
test('marcar una tarea la quita de la lista y ofrece deshacer')     // el título desaparece; aparece "Deshacer"
test('«Deshacer» vuelve a llamar a la acción')                      // toggleDone llamado dos veces con el mismo id
test('si la acción falla, el toast lo dice y la fila vuelve')
test('una lista vacía muestra su texto tranquilo')
test('cada fila tiene un objetivo táctil accesible')                // el botón de marcar tiene aria-label
```
`captureBar.test.tsx`:
```tsx
test('escribir y enviar llama a la acción de captura y vacía el campo')
test('si la captura falla, el toast lo dice y el texto no se pierde')
test('no envía nada con el campo vacío')
```
`itemSheet.test.tsx`:
```tsx
test('abrir una fila carga sus datos en la hoja')
test('guardar manda el patch con el título y la fecha editados')
test('cerrar sin guardar no llama a ninguna acción')
```

- [ ] **Paso 3: ejecutar `npm run test:screens`** · Espera: FAIL (los componentes aún no exponen todo lo que piden los tests; si alguno pasa a la primera, comprobar que el test realmente ejerce la pantalla).
- [ ] **Paso 4: ajustar lo mínimo** en los componentes para que las pantallas sean comprobables (`aria-label` y `role` que falten). Ningún cambio de comportamiento.
- [ ] **Paso 5: ejecutar `npm test`** · Espera: toda la suite, antigua y nueva, PASS.
- [ ] **Paso 6: documentar** en `README.md`, sección Desarrollo: `npm test` lo corre todo; `npm run test:screens`, solo las pantallas; y qué queda fuera (gestos y aspecto visual).
- [ ] **Paso 7: commit**

```bash
git add package.json package-lock.json vitest.config.ts tests README.md components
git commit -m "test: entorno de pruebas de pantallas (listas, captura y hoja de edición)"
```

---

---

## Fase A — Confianza (Tareas 1-6)

### Tarea 1: Lógica de repetición

**Files:**
- Create: `lib/recurrence.ts`, `tests/recurrence/next.test.ts`

**Interfaces:**
- Produce: `export const REPEATS = ['diaria', 'semanal', 'mensual', 'anual'] as const`; `export type Repeat = (typeof REPEATS)[number]`; `export const REPEAT_LABELS: Record<Repeat, string>` = `{ diaria: 'Cada día', semanal: 'Cada semana', mensual: 'Cada mes', anual: 'Cada año' }`; `export function isRepeat(v: unknown): v is Repeat`; `export function nextDue(dueAt: string, repeat: Repeat, opts: { after: Date; hasTime: boolean; tz?: string }): string`.
- `nextDue` devuelve ISO UTC. Avanza desde `dueAt` tantos periodos como haga falta hasta quedar estrictamente después de `after`, conservando la hora local de Madrid (`toMadrid`/`madridToUtc` de `lib/time.ts`). Sin hora (`hasTime: false`) la hora local es `00:00`. Mensual y anual recortan al último día del mes cuando el día no existe.

- [ ] **Paso 1: escribir los tests que fallan** en `tests/recurrence/next.test.ts`:

```ts
// 2026-10-22T07:00:00Z = 09:00 Madrid
test('diaria avanza un día conservando la hora local')      // dueAt 2026-10-22T07:00:00Z, after 2026-10-22T08:00:00Z → '2026-10-23T07:00:00.000Z'
test('semanal sobre una tarea vencida salta al futuro')     // dueAt 2026-09-01T07:00:00Z, after 2026-10-22T08:00:00Z → '2026-10-27T07:00:00.000Z'
test('mantiene las 09:00 de Madrid al cruzar el cambio de hora') // dueAt 2026-10-24T07:00:00Z (09:00 CEST), semanal, after 2026-10-24T08:00:00Z → '2026-10-31T08:00:00.000Z' (09:00 CET)
test('mensual desde el 31 cae en el último día del mes')    // dueAt 2026-01-31, mensual → '2026-02-28', y otra vez → '2026-03-31'
test('anual desde el 29 de febrero cae en el 28')           // dueAt 2028-02-29, anual → '2029-02-28'
test('sin hora, la siguiente también es sin hora')          // hasTime false → la fecha resultante es medianoche de Madrid
```

- [ ] **Paso 2: ejecutar `npx vitest run tests/recurrence`** · Espera: FAIL, "Cannot find module '@/lib/recurrence'".
- [ ] **Paso 3: implementar `lib/recurrence.ts`.** Trabaja en componentes de fecha de Madrid (`toMadrid` da `{ date, hour }`; usa `madridDateTime` para la hora exacta), suma el periodo sobre los componentes, recorta el día al último del mes de destino y vuelve a UTC con `madridToUtc`. Bucle `while (resultado <= after)`, con tope de 1000 vueltas.
- [ ] **Paso 4: ejecutar `npx vitest run tests/recurrence`** · Espera: PASS.
- [ ] **Paso 5: commit**

```bash
git add lib/recurrence.ts tests/recurrence/next.test.ts
git commit -m "feat: lógica de repetición de tareas (diaria, semanal, mensual, anual)"
```

---

### Tarea 2: Tareas que se repiten

**Files:**
- Create: `supabase/migrations/0010_recurrencia.sql`
- Modify: `lib/db/types.ts` (campo `repeat` en `Item`), `lib/db/items.ts` (`COLUMNS`, `OPTIONAL_FIELDS`, valor por defecto `repeat: null`), `lib/actions/items.ts` (`parseNewItem`, `movePatchSchema`, `toggleDone`), `lib/actions/forms.ts` (`editPatchFromForm`), `components/items/ItemSheet.tsx`, `components/items/ItemsScreen.tsx` (`subtitleFor`), `docs/despliegue.md`
- Test: `tests/actions/repeat.test.ts`, `tests/db/items.test.ts` (añadir), `tests/actions/forms.test.ts` (añadir)

**Interfaces:**
- Consume: `nextDue`, `REPEATS`, `REPEAT_LABELS`, `isRepeat` (Tarea 1).
- Produce: `Item.repeat: Repeat | null` (columna `repeat`); `toggleDone` sobre una tarea pendiente con `repeat` y `dueAt` marca la actual como `hecho` y crea una nueva fila pendiente con `dueAt: nextDue(...)`, el mismo `repeat`, título, notas, área y persona, y devuelve **la nueva** (es la que el usuario sigue viendo en la lista).

- [ ] **Paso 1: escribir la migración** `supabase/migrations/0010_recurrencia.sql`: `alter table public.items add column if not exists repeat text check (repeat is null or repeat in ('diaria','semanal','mensual','anual'));` con el comentario de cabecera al estilo de `0008`.
- [ ] **Paso 2: escribir los tests que fallan** en `tests/actions/repeat.test.ts`, sobre `createMemoryBackend` como el resto de `tests/actions`:

```ts
test('completar una tarea repetida crea la siguiente y cierra la actual')
  // la fila original queda status 'hecho'; hay una nueva pendiente con dueAt = nextDue y el mismo repeat
test('la nueva ocurrencia hereda título, notas, área y persona, y no hereda calendarEventId ni syncError')
test('completar una tarea repetida sin fecha no crea ninguna nueva')
test('deshacer (volver a completar la nueva) no encadena ocurrencias infinitas') // toggleDone sobre la 'hecho' la devuelve a 'pendiente' sin crear filas
test('la nueva ocurrencia pasa por el hook de sync (recibe su evento de Calendar)')
```
Y en `tests/actions/forms.test.ts`: `test('editPatchFromForm lee repeat solo en tareas')`.
Y en `tests/screens/itemSheet.test.tsx` (Tarea 0): `test('«Repetir» solo aparece en tareas con fecha')` y `test('guardar manda el patch con repeat')`.

- [ ] **Paso 3: ejecutar `npx vitest run tests/actions`** · Espera: FAIL.
- [ ] **Paso 4: añadir el campo.** `Item.repeat: Repeat | null` en `lib/db/types.ts` con comentario (`Solo las tareas con fecha repiten`), `repeat: 'repeat'` en `COLUMNS`, `'repeat'` en `OPTIONAL_FIELDS`, `repeat: null` en el objeto por defecto de `createItem`.
- [ ] **Paso 5: implementar en `lib/actions/items.ts`.** `parseNewItem` lee `repeat` (solo si `type === 'tarea'` y hay `dueAt`; si no, `null`). `movePatchSchema` gana `repeat: z.enum(REPEATS).nullable()`. `moveItem` pone `repeat: null` cuando el tipo deja de ser `tarea` o se queda sin `dueAt`. `toggleDone`: si la tarea es `pendiente`, tiene `repeat` y `dueAt`, llama a `deps.items.updateItem(id, { status: 'hecho', repeat: null })` y después `saveNewItem` con la ocurrencia siguiente; devuelve la nueva. (Quitar `repeat` de la fila cerrada evita que un "deshacer" encadene.)
- [ ] **Paso 6: UI.** En `ItemSheet.tsx`, fila "Repetir" (un `<select>` con las cinco opciones: "Nunca" + `REPEAT_LABELS`) visible solo cuando el tipo es `tarea` y hay fecha, al estilo de las filas existentes. En `editPatchFromForm` añadir `patch.repeat = isRepeat(v) ? v : null` dentro de la rama `tarea`. En `subtitleFor` de `ItemsScreen.tsx`, añadir `REPEAT_LABELS[item.repeat]` a `parts` cuando lo haya.
- [ ] **Paso 7: documentar** en `docs/despliegue.md`, sección de migraciones: aplicar `0010_recurrencia.sql`.
- [ ] **Paso 8: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: todo PASS, sin errores de tipos.
- [ ] **Paso 9: commit**

```bash
git add supabase/migrations/0010_recurrencia.sql lib components docs tests
git commit -m "feat: tareas que se repiten (cada día, semana, mes o año)"
```

---

### Tarea 3: Posponer

**Files:**
- Create: `lib/actions/snooze.ts`, `tests/actions/snooze.test.ts`
- Modify: `lib/actions/itemActions.ts`, `app/actions/items.ts`, `components/items/ItemSheet.tsx`, `components/hoy/HoyScreen.tsx`

**Interfaces:**
- Produce: `export const SNOOZES = [{ key: 'tarde', label: 'Esta tarde' }, { key: 'manana', label: 'Mañana' }, { key: 'semana', label: 'La semana que viene' }] as const`; `export type SnoozeKey = (typeof SNOOZES)[number]['key']`; `export function snoozedDue(item: Pick<Item, 'dueAt' | 'hasTime'>, key: SnoozeKey, now: Date, tz?: string): { dueAt: string; hasTime: boolean }`; `export async function snoozeItem(deps: ActionDeps, id: string, key: SnoozeKey): Promise<Item>` (delega en `moveItem`, así la sincronización con Calendar y las reglas de tipo se reutilizan).
- Server Action: `snoozeItem(id: string, key: SnoozeKey): Promise<ActionResult<Item>>` en `app/actions/items.ts`, registrada en `createItemActions` con `WRITES.item`.
- Reglas de `snoozedDue`, todas en hora de Madrid: `tarde` → hoy a las 18:00 (si ya pasaron las 18:00, mañana a las 18:00); `manana` → mañana, conservando la hora si `hasTime`, si no sin hora; `semana` → dentro de 7 días desde hoy, misma regla de hora. Siempre devuelve un instante futuro.

- [ ] **Paso 1: escribir los tests que fallan** en `tests/actions/snooze.test.ts`:

```ts
test('«Esta tarde» pone las 18:00 de hoy')                    // now 09:00 Madrid → hoy 18:00, hasTime true
test('«Esta tarde» pasadas las 18:00 pasa a mañana')          // now 20:00 Madrid → mañana 18:00
test('«Mañana» conserva la hora de una tarea con hora')       // dueAt 09:00 → mañana 09:00, hasTime true
test('«Mañana» en una tarea sin hora sigue sin hora')         // hasTime false → medianoche de Madrid, hasTime false
test('«La semana que viene» suma 7 días')
test('posponer una tarea vencida la coloca en el futuro')
test('snoozeItem guarda el cambio y vuelve a sincronizar con Calendar')
```
Y en `tests/screens/itemSheet.test.tsx` (Tarea 0): `test('«Posponer» aparece en una tarea con fecha y llama a la acción con la clave elegida')`.

- [ ] **Paso 2: ejecutar `npx vitest run tests/actions/snooze.test.ts`** · Espera: FAIL.
- [ ] **Paso 3: implementar `lib/actions/snooze.ts`** con `madridDateTime`/`madridToUtc` de `lib/time.ts`.
- [ ] **Paso 4: exponer la acción:** entrada `snoozeItem` en `createItemActions` (`run(WRITES.item, (d) => snooze.snoozeItem(d, id, key), SAVE_FAILED)`) y envoltorio en `app/actions/items.ts`.
- [ ] **Paso 5: UI.** En `ItemSheet.tsx`, para una tarea pendiente con fecha, una fila de tres píldoras "Posponer" con las etiquetas de `SNOOZES`; al tocar, cierra la hoja y llama a la acción (optimista, como `save`). En `HoyScreen.tsx`, cada tarea vencida muestra "Posponer" con las mismas tres opciones.
- [ ] **Paso 6: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 7: commit**

```bash
git add lib app components tests
git commit -m "feat: posponer una tarea a esta tarde, mañana o la semana que viene"
```

---

### Tarea 4: Repaso de lo olvidado en Hoy

**Files:**
- Create: `supabase/migrations/0011_repaso.sql`, `lib/digest/review.ts`, `tests/digest/review.test.ts`
- Modify: `lib/db/types.ts`, `lib/db/items.ts`, `lib/digest/build.ts`, `lib/digest/hoyApi.ts`, `components/hoy/HoyScreen.tsx`, `lib/actions/items.ts`, `lib/actions/itemActions.ts`, `app/actions/items.ts`, `docs/despliegue.md`
- Test: `tests/digest/build.test.ts` (añadir), `tests/digest/hoyApi.test.ts` (añadir)

**Interfaces:**
- Produce: `Item.reviewedAt: string | null` (columna `reviewed_at`); `export const REVIEW_AFTER_DAYS = 30`; `export const MAX_REVIEW = 3`; `export function pickForReview(pending: Item[], now: Date, opts?: { days?: number; max?: number }): Item[]`; `export async function markReviewed(deps: ActionDeps, id: string): Promise<Item>` y su Server Action `markReviewed(id)` con `WRITES.item`.
- `pickForReview` devuelve como mucho `max` elementos **pendientes, sin fecha, no `needsReview`, de tipo `idea`, `compra` o `regalo`** (nunca `tarea` ni `libro`), creados hace más de `days` días y con `reviewedAt` nulo o anterior a `days` días; ordenados del más antiguo al más reciente. Los de `area === 'trabajo'` se incluyen (vienen de la base de datos, nunca de la IA).
- `Digest` gana `review: Item[]`, relleno por `buildDigest`. **No entra en el prompt**: `headlinePrompt` no cambia.

- [ ] **Paso 1: migración** `0011_repaso.sql`: `alter table public.items add column if not exists reviewed_at timestamptz;`
- [ ] **Paso 2: escribir los tests que fallan** en `tests/digest/review.test.ts`:

```ts
test('una idea de hace 40 días sin fecha entra en el repaso')
test('una idea de hace 10 días no entra')
test('una tarea con fecha nunca entra, por vieja que sea')
test('un elemento marcado como repasado hace 5 días no vuelve a entrar')
test('un elemento marcado como repasado hace 40 días vuelve a entrar')
test('devuelve como mucho 3, los más antiguos primero')
test('«Sin clasificar» nunca entra en el repaso')
```
Y en `tests/digest/build.test.ts`: `test('el titular de la IA no menciona nada del repaso')` (centinela en el título de una idea vieja, comprobando que no aparece en el prompt).

- [ ] **Paso 3: ejecutar `npx vitest run tests/digest`** · Espera: FAIL.
- [ ] **Paso 4: implementar** `lib/digest/review.ts`, el campo `reviewedAt` (`COLUMNS`, `OPTIONAL_FIELDS`, defecto `null`) y la llamada desde `buildDigest` (ya tiene `pending` cargado: `review: pickForReview(pending, deps.now)`).
- [ ] **Paso 5: `markReviewed`** en `lib/actions/items.ts` (`updateItem(id, { reviewedAt: new Date().toISOString() })`), su entrada en `createItemActions` y su envoltorio en `app/actions/items.ts`.
- [ ] **Paso 6: UI.** Sección "¿Sigue en pie?" al final de `HoyScreen.tsx`, solo si `review.length > 0`: una `InsetList` con los elementos, cada uno con dos acciones, "Sí" (llama a `markReviewed`) y "Ya no" (llama a `deleteItem`, con el toast de deshacer que ya existe). Pie: "Lo guardaste hace N días y no lo has vuelto a tocar."
- [ ] **Paso 7: `hoyApi.ts`** añade `review: { id, title, type }[]` a `HoyResponse` (sin notas), y su test en `tests/digest/hoyApi.test.ts`.
- [ ] **Paso 8: documentar** la migración en `docs/despliegue.md`.
- [ ] **Paso 9: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 10: commit**

```bash
git add supabase lib app components docs tests
git commit -m "feat: repaso en Hoy de lo guardado hace tiempo y sin tocar"
```

---

### Tarea 5: Cola de captura sin conexión (lógica)

**Files:**
- Create: `lib/capture/queue.ts`, `tests/capture/queue.test.ts`

**Interfaces:**
- Produce, sobre un almacén inyectado para poder probarlo sin IndexedDB:
  - `export interface QueuedCapture { id: string; text: string; area?: 'trabajo'; type?: ItemType; createdAt: number; tries: number }`
  - `export interface QueueStore { list(): Promise<QueuedCapture[]>; put(entry: QueuedCapture): Promise<void>; remove(id: string): Promise<void> }`
  - `export function memoryQueueStore(): QueueStore` (tests)
  - `export function indexedDbQueueStore(): QueueStore` — IndexedDB `agente-captura` / `pendientes`, al estilo de `lib/share/stash.ts`
  - `export const MAX_QUEUE = 50`, `export const MAX_TRIES = 5`
  - `export async function enqueue(store: QueueStore, entry: Omit<QueuedCapture, 'id' | 'createdAt' | 'tries'>, now: Date): Promise<QueuedCapture>` — descarta la más antigua si ya hay `MAX_QUEUE`
  - `export async function flushQueue(store: QueueStore, send: (e: QueuedCapture) => Promise<ActionResult<unknown>>): Promise<{ sent: number; left: number }>` — **secuencial**, una sola a la vez; quita la entrada cuando `send` devuelve `ok`; con fallo incrementa `tries` y **para** (la conexión sigue mal); al llegar a `MAX_TRIES` la quita y la cuenta como perdida.
  - `export function isFlushing(): boolean` / un cerrojo interno para que dos llamadas simultáneas no envíen lo mismo dos veces.

- [ ] **Paso 1: escribir los tests que fallan** en `tests/capture/queue.test.ts`, con `memoryQueueStore`:

```ts
test('enqueue guarda el texto con su id y 0 intentos')
test('enqueue con la cola llena descarta la más antigua')         // MAX_QUEUE entradas → la nueva entra, la más vieja sale
test('flushQueue envía en orden de llegada y vacía la cola')
test('flushQueue para en el primer fallo y deja el resto')        // send falla en la 2ª → sent 1, left 2
test('un envío fallido suma un intento')
test('a los 5 intentos la entrada se descarta')                   // y flushQueue la cuenta como no enviada
test('dos flushQueue a la vez no envían la misma entrada dos veces') // send lento; segunda llamada devuelve {sent:0,left:n}
```

- [ ] **Paso 2: ejecutar `npx vitest run tests/capture/queue.test.ts`** · Espera: FAIL.
- [ ] **Paso 3: implementar `lib/capture/queue.ts`.** `indexedDbQueueStore` copia el patrón `openDb`/`run` de `lib/share/stash.ts` (no se prueba: es la capa fina sobre el navegador).
- [ ] **Paso 4: ejecutar `npx vitest run tests/capture`** · Espera: PASS.
- [ ] **Paso 5: commit**

```bash
git add lib/capture/queue.ts tests/capture/queue.test.ts
git commit -m "feat: cola de capturas pendientes de enviar"
```

---

### Tarea 6: Capturar sin cobertura

**Files:**
- Modify: `components/CaptureBar.tsx`, `components/app/AppShell.tsx`, `app/actions/capture.ts`, `lib/capture/pipeline.ts` (deduplicación)
- Create: `components/app/CaptureQueue.tsx`, `tests/capture/dedup.test.ts`

**Interfaces:**
- Consume: `enqueue`, `flushQueue`, `indexedDbQueueStore` (Tarea 5); la Server Action de captura ya existente en `app/actions/capture.ts`.
- Produce: `<CaptureQueue />`, cliente, montado en `AppShell`: al montar y en cada evento `online` llama a `flushQueue`; mientras haya entradas muestra una píldora discreta "N sin enviar" sobre la barra de pestañas, que al tocarla fuerza un intento.
- Produce en `lib/capture/pipeline.ts`: la deduplicación existente por `sourceText` pasa a aceptar una ventana explícita, `DEDUP_WINDOW_MS = 10 * 60 * 1000`, para que un reenvío de la cola no cree un duplicado.

- [ ] **Paso 1: escribir los tests que fallan.** En `tests/capture/dedup.test.ts`: `test('el mismo texto enviado dos veces en 10 minutos solo crea un elemento')` y `test('el mismo texto 11 minutos después sí crea otro')`, sobre `captureText` con el backend en memoria. En `tests/screens/captureBar.test.tsx` (Tarea 0): `test('sin conexión, el texto se encola y el toast lo dice')` (con `navigator.onLine` a false y la acción fallando).
- [ ] **Paso 2: ejecutar `npx vitest run tests/capture/dedup.test.ts`** · Espera: FAIL.
- [ ] **Paso 3: implementar la ventana de deduplicación** en `lib/capture/pipeline.ts`, comparando `sourceText` normalizado (trim + minúsculas) contra `listRecentCaptures(since)`.
- [ ] **Paso 4: `CaptureBar.tsx`.** Si la acción de captura devuelve `{ ok: false }` **y** `navigator.onLine === false` (o el error es el de conexión), encola en lugar de mostrar el error, limpia el campo y enseña el toast "Sin conexión: se enviará al recuperarla". Con conexión, se comporta como hasta ahora.
- [ ] **Paso 5: `CaptureQueue.tsx`** y su montaje en `AppShell.tsx`.
- [ ] **Paso 6: actualizar la cabecera de `public/sw.js`**: ya no es cierto que no haya captura sin conexión; explicar que la cola vive en IndexedDB (`agente-captura`) y la vacía la app, no el worker.
- [ ] **Paso 7: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 8: commit**

```bash
git add components app lib public tests
git commit -m "feat: capturar sin cobertura (cola local que se envía sola al volver la conexión)"
```

---

## Fase B — Robustez (Tareas 7-9)

### Tarea 7: Estado del sistema en Ajustes

**Files:**
- Create: `supabase/migrations/0012_estado.sql`, `lib/status/system.ts`, `components/ajustes/StatusSection.tsx`, `tests/status/system.test.ts`
- Modify: `lib/db/settings.ts`, `lib/cron/morning.ts`, `app/(app)/ajustes/page.tsx`, `docs/despliegue.md`

**Interfaces:**
- Produce en `lib/db/settings.ts`: `Settings.lastCronAt: string | null` (columna `last_cron_at`) y `Settings.lastCronError: string | null` (`last_cron_error`), leídos con la misma tolerancia al error `42703` que ya usa el archivo.
- Produce en `lib/cron/morning.ts`: al terminar `runMorning`, `settings.update({ lastCronAt: now.toISOString(), lastCronError: r.maintenanceFailed ? 'maintenance' : null })`, dentro de un `try/catch` que nunca cambie el resultado.
- Produce en `lib/status/system.ts`:
  - `export type Health = 'ok' | 'warn' | 'error'`
  - `export interface StatusLine { key: string; title: string; detail: string; health: Health }`
  - `export const CRON_STALE_HOURS = 3`
  - `export function systemStatus(input: { now: Date; settings: Settings; syncErrors: number; pushSubs: number; calendar: 'ok' | 'auth' | 'unavailable' }): StatusLine[]`
- Las cuatro líneas, en este orden: `cron` ("Tarea horaria"), `digest` ("Resumen de la mañana"), `calendar` ("Google Calendar"), `push` ("Notificaciones"). Reglas: cron `error` si `lastCronAt` es nulo o más viejo que `CRON_STALE_HOURS`; digest `warn` si `lastDigestDate` no es hoy ni ayer; calendar `error` con `auth` ("Vuelve a iniciar sesión"), `warn` con `unavailable`, y `warn` si `syncErrors > 0`; push `warn` si `pushSubs === 0`.

- [ ] **Paso 1: migración** `0012_estado.sql`: `alter table public.settings add column if not exists last_cron_at timestamptz;` y `add column if not exists last_cron_error text;`
- [ ] **Paso 2: escribir los tests que fallan** en `tests/status/system.test.ts`:

```ts
test('todo al día devuelve cuatro líneas en ok')
test('la tarea horaria sin ejecutarse en 4 h sale en error')
test('la tarea horaria que nunca se ha ejecutado sale en error')
test('el resumen de anteayer sale en warn')
test('Calendar con error de permiso sale en error y pide volver a entrar')
test('con 2 elementos sin sincronizar, Calendar sale en warn y dice cuántos')
test('sin suscripciones push, las notificaciones salen en warn')
test('ninguna línea incluye títulos de elementos') // centinela: un título en los datos no aparece en ningún `detail`
```

- [ ] **Paso 3: ejecutar `npx vitest run tests/status`** · Espera: FAIL.
- [ ] **Paso 4: implementar** `lib/status/system.ts`, los dos campos en `lib/db/settings.ts` y la escritura al final de `runMorning` (con su test en `tests/cron/morning.test.ts`: `test('el cron guarda la hora de su última ejecución')`).
- [ ] **Paso 5: UI.** `StatusSection.tsx`: `InsetList` con cabecera "Estado", una `Row` por línea con un punto de color (verde/ámbar/rojo con los tokens existentes; además del color, el texto dice el estado, por accesibilidad). Montarla en `app/(app)/ajustes/page.tsx` dentro de un `<Suspense>`, como las otras secciones, con los datos leídos en el servidor.
- [ ] **Paso 6: documentar** la migración en `docs/despliegue.md`.
- [ ] **Paso 7: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 8: commit**

```bash
git add supabase lib components app docs tests
git commit -m "feat: estado del sistema en Ajustes (cron, resumen, Calendar y avisos)"
```

---

### Tarea 8: Restaurar desde una copia

**Files:**
- Create: `lib/export/restore.ts`, `app/api/import/route.ts`, `components/ajustes/ImportSection.tsx`, `tests/export/restore.test.ts`
- Modify: `app/(app)/ajustes/page.tsx`

**Interfaces:**
- Produce en `lib/export/restore.ts`:
  - `export const restoreSchema` (zod) sobre la forma de `ExportData`, **tolerante**: campos desconocidos se ignoran, elementos con tipo desconocido se descartan.
  - `export interface RestorePlan { people: Person[]; items: Item[]; personDates: PersonDate[]; skipped: { items: number; people: number; personDates: number }; invalid: number }`
  - `export function planRestore(incoming: unknown, existing: { items: Item[]; people: Person[]; personDates: PersonDate[] }): RestorePlan` — **nunca sobrescribe**: todo id que ya exista se cuenta en `skipped`; las personas se comparan además por nombre en minúsculas (el índice único de `0001`); las fechas y elementos cuya persona no exista pierden el `personId` en lugar de descartarse.
  - `export async function runRestore(deps: ActionDeps, plan: RestorePlan): Promise<{ created: number }>` — crea personas primero y reasigna los `personId` nuevos; los elementos entran con `origin: 'web'` y sin `calendarEventId` ni `syncError` (los eventos se recrean con el hook de sync).
- Produce `POST /api/import`: sesión obligatoria (`requireUser`), cuerpo JSON de hasta 10 MB, devuelve `{ created, skipped, invalid }`. Invalida `WRITES.capture`.

- [ ] **Paso 1: escribir los tests que fallan** en `tests/export/restore.test.ts`:

```ts
test('restaura un export completo en una base vacía')
test('un id que ya existe se salta, no se sobrescribe')         // el título existente no cambia
test('una persona con el mismo nombre se reutiliza, no se duplica')
test('un elemento con tipo desconocido se cuenta en invalid y no se crea')
test('un JSON que no es un export devuelve un plan vacío con invalid')   // '{"foo":1}', y también un array suelto
test('un regalo cuya persona no viene en el archivo se crea sin persona')
test('los elementos restaurados no traen calendarEventId ni syncError')
test('un export de 1000 elementos no tarda más de un segundo en planificarse')
```

- [ ] **Paso 2: ejecutar `npx vitest run tests/export`** · Espera: FAIL.
- [ ] **Paso 3: implementar** `lib/export/restore.ts`.
- [ ] **Paso 4: implementar** `app/api/import/route.ts` y `components/ajustes/ImportSection.tsx` (un `<input type="file" accept="application/json">` dentro de la sección "Tus datos", con confirmación antes de enviar y un resumen al terminar: "Restaurados N · Saltados M").
- [ ] **Paso 5: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 6: commit**

```bash
git add lib app components tests
git commit -m "feat: restaurar los datos desde un export JSON"
```

---

### Tarea 9: Copia automática semanal

**Files:**
- Create: `supabase/migrations/0013_copias.sql`, `lib/backup/weekly.ts`, `tests/backup/weekly.test.ts`
- Modify: `lib/cron/morning.ts`, `lib/cron/server.ts`, `components/ajustes/ExportSection.tsx`, `docs/despliegue.md`

**Interfaces:**
- Produce la migración: bucket privado `backups` (como el de `photos` en `0005`, sin `allowed_mime_types`, límite 20 MB) con las cuatro políticas de RLS sobre `storage.objects` restringidas a la carpeta `{auth.uid()}/`.
- Produce en `lib/backup/weekly.ts`:
  - `export const KEEP_BACKUPS = 4`
  - `export function backupPath(userId: string, date: string): string` → `` `${userId}/${date}.json` ``
  - `export function shouldBackup(now: Date, lastBackupDate: string | null, tz: string): boolean` — una vez por semana, el lunes, tras el resumen diario; usa el mismo lunes que `shouldSendWeekly`.
  - `export async function runBackup(deps: { now: Date; tz: string; userId: string; data: () => Promise<ExportData>; put(path: string, body: string): Promise<void>; list(prefix: string): Promise<string[]>; remove(paths: string[]): Promise<void> }): Promise<{ path: string; removed: number }>` — escribe la copia y borra las que sobren de `KEEP_BACKUPS`, las más antiguas primero.
- `runMorning` gana un paso opcional de mantenimiento, `backup?: () => Promise<unknown>`, que corre después del semanal y **nunca** cambia el resultado del resumen; `MorningResult` gana `backup: 'done' | 'not_due' | 'failed'`.
- `ExportSection.tsx` añade un pie con la fecha de la última copia automática.

- [ ] **Paso 1: migración** `0013_copias.sql`.
- [ ] **Paso 2: escribir los tests que fallan** en `tests/backup/weekly.test.ts`:

```ts
test('el lunes sin copia de esta semana toca copia')
test('el lunes con la copia de hoy ya hecha no toca')
test('un miércoles no toca')
test('runBackup escribe el JSON en {userId}/{fecha}.json')
test('con 5 copias, borra la más antigua y deja 4')
test('si el borrado de las viejas falla, la copia nueva se mantiene')
test('un fallo de la copia no cambia el resultado del resumen diario')   // en tests/cron/morning.test.ts
```

- [ ] **Paso 3: ejecutar `npx vitest run tests/backup tests/cron`** · Espera: FAIL.
- [ ] **Paso 4: implementar** `lib/backup/weekly.ts`, el engarce en `runMorning` y el cableado real en `lib/cron/server.ts` (cliente de servicio sobre el bucket `backups`, reutilizando `buildExport`).
- [ ] **Paso 5: documentar** en `docs/despliegue.md`: la migración, el bucket y dónde ver las copias.
- [ ] **Paso 6: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 7: commit**

```bash
git add supabase lib components docs tests
git commit -m "feat: copia semanal automática en Storage (se guardan las últimas 4)"
```

---

## Fase C — Menores (Tareas 10-13)

### Tarea 10: Etiquetas, y compras agrupadas por tienda

**Files:**
- Create: `supabase/migrations/0014_etiquetas.sql`, `lib/tags.ts`, `tests/tags/tags.test.ts`
- Modify: `lib/db/types.ts`, `lib/db/items.ts`, `lib/actions/items.ts`, `lib/actions/forms.ts`, `components/items/ItemSheet.tsx`, `components/items/ItemsScreen.tsx`, `app/(app)/compras/page.tsx`, `lib/search/*`, `docs/despliegue.md`

**Decisión del plan (mía, no de Marc):** "agrupar la compra por tienda" se resuelve con las etiquetas en vez de con una columna `tienda` propia. La pantalla Compras agrupa por la primera etiqueta del elemento, así "Mercadona" o "Ferretería" son etiquetas normales y sirven igual en Ideas o Regalos. Una columna menos y una idea menos que aprender.

**Interfaces:**
- Produce: `Item.tags: string[]` (columna `tags text[] not null default '{}'`).
- Produce en `lib/tags.ts`: `export const MAX_TAGS = 5`, `export const TAG_MAX_LENGTH = 24`; `export function parseTags(raw: string): string[]` — separa por comas, recorta, quita vacíos y duplicados sin distinguir mayúsculas ni acentos (reutilizar el normalizador del buscador), conserva la forma escrita la primera vez, corta a `MAX_TAGS` y a `TAG_MAX_LENGTH`; `export function formatTags(tags: string[]): string`; `export function groupByFirstTag(items: Item[]): { tag: string | null; items: Item[] }[]` — grupos ordenados alfabéticamente, el grupo sin etiqueta al final.

- [ ] **Paso 1: migración** `0014_etiquetas.sql`: `alter table public.items add column if not exists tags text[] not null default '{}';` más `create index if not exists items_tags_idx on public.items using gin (tags);`
- [ ] **Paso 2: escribir los tests que fallan** en `tests/tags/tags.test.ts`:

```ts
test('parseTags separa por comas y recorta')                   // ' casa , Mercadona ' → ['casa', 'Mercadona']
test('parseTags quita duplicados sin distinguir acentos ni mayúsculas') // 'Café, cafe' → ['Café']
test('parseTags corta a 5 etiquetas y a 24 caracteres')
test('parseTags con texto vacío devuelve lista vacía')
test('groupByFirstTag ordena los grupos y deja el de sin etiqueta al final')
test('el buscador encuentra por etiqueta')                     // en tests/search/search.test.ts
```

- [ ] **Paso 3: ejecutar `npx vitest run tests/tags tests/search`** · Espera: FAIL.
- [ ] **Paso 4: implementar** `lib/tags.ts`, el campo (`COLUMNS`, `OPTIONAL_FIELDS`, defecto `[]`), `tags` en `movePatchSchema` (`z.array(z.string()).max(MAX_TAGS)`) y en `parseNewItem`/`editPatchFromForm` (campo de texto libre, pasado por `parseTags`).
- [ ] **Paso 5: UI.** Fila "Etiquetas" en `ItemSheet.tsx` (un campo de texto con el pie "Separadas por comas"); las etiquetas se muestran como píldoras pequeñas en `subtitleFor`. `app/(app)/compras/page.tsx` pasa a `ItemsScreen` una sección por grupo de `groupByFirstTag`, con la etiqueta como cabecera y "Sin tienda" en el último.
- [ ] **Paso 6: buscador:** incluir `tags` en el texto indexado de `lib/search`.
- [ ] **Paso 7: documentar** la migración en `docs/despliegue.md`.
- [ ] **Paso 8: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 9: commit**

```bash
git add supabase lib components app docs tests
git commit -m "feat: etiquetas en los elementos y compras agrupadas por tienda"
```

---

### Tarea 11: Marcar varias a la vez

**Files:**
- Create: `lib/actions/bulk.ts`, `tests/actions/bulk.test.ts`
- Modify: `components/items/ItemsScreen.tsx`, `lib/actions/itemActions.ts`, `app/actions/items.ts`, `tests/screens/itemsScreen.test.tsx`

**Interfaces:**
- Consume: `toggleDone`, `deleteItem` (`lib/actions/items.ts`), el modo optimista de `ItemsScreen`.
- Produce: `export const MAX_BULK = 50`; `export async function completeMany(deps: ActionDeps, ids: string[]): Promise<{ done: string[]; failed: string[] }>` — secuencial, nunca lanza, devuelve qué salió y qué no; `export async function deleteMany(deps: ActionDeps, ids: string[]): Promise<{ done: string[]; failed: string[] }>`. Server Actions `completeMany(ids)` / `deleteMany(ids)` con `WRITES.item`.
- UI: `ItemsScreen` gana el modo selección (botón "Seleccionar" en la barra cuando la pantalla tiene más de una fila). En ese modo las filas muestran un círculo de selección, el deslizamiento se desactiva y aparece una barra inferior de vidrio con "Hecho (N)" y "Eliminar (N)". Al terminar, un toast con deshacer para los que salieron bien.

- [ ] **Paso 1: escribir los tests que fallan** en `tests/actions/bulk.test.ts`:

```ts
test('completeMany marca todas las indicadas')
test('completeMany con una que no existe devuelve el resto en done y esa en failed')
test('completeMany respeta las repeticiones')                   // una tarea repetida genera su siguiente ocurrencia
test('deleteMany borra en suave y se puede deshacer una por una')
test('más de MAX_BULK ids devuelve un UserError')
```
Y en `tests/screens/itemsScreen.test.tsx`: `test('en modo selección, elegir dos y pulsar Hecho llama a completeMany con los dos ids')`.

- [ ] **Paso 2: ejecutar `npx vitest run tests/actions/bulk.test.ts`** · Espera: FAIL.
- [ ] **Paso 3: implementar** `lib/actions/bulk.ts` y sus Server Actions.
- [ ] **Paso 4: implementar el modo selección** en `ItemsScreen.tsx`, reutilizando `addOp({ kind: 'remove' })` para cada id al confirmar.
- [ ] **Paso 5: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 6: commit**

```bash
git add lib app components tests
git commit -m "feat: seleccionar varias y marcarlas o eliminarlas de una vez"
```

---

### Tarea 12: Subtareas

**Files:**
- Create: `supabase/migrations/0015_subtareas.sql`, `lib/actions/subtasks.ts`, `tests/actions/subtasks.test.ts`
- Modify: `lib/db/types.ts`, `lib/db/items.ts`, `lib/actions/items.ts`, `components/items/ItemSheet.tsx`, `components/items/ItemsScreen.tsx`, `lib/export/serialize.ts`, `docs/despliegue.md`

**Interfaces:**
- Produce: `Item.parentId: string | null` (columna `parent_id uuid references public.items(id) on delete cascade`, con índice).
- Produce en `lib/actions/subtasks.ts`: `export const MAX_SUBTASKS = 20`; `export async function addSubtask(deps: ActionDeps, parentId: string, title: string): Promise<Item>` — hereda tipo, área y persona del padre, sin fecha, sin repetición; rechaza con `UserError` si el padre ya es una subtarea (un solo nivel), si el padre no existe o si se pasa de `MAX_SUBTASKS`; `export function subtaskProgress(children: Item[]): { done: number; total: number } | null` (null sin hijos).
- `listItems` y todas las listas de pantalla pasan a excluir las subtareas: `ItemFilter` gana `topLevel?: boolean` y las funciones de `lib/actions/items.ts` (`listTareas`, `listByType`, `listLibros`, `listSinClasificar`, `listRecent`) lo piden. La Papelera y el export **sí** las incluyen.
- `deleteItem` sobre un padre borra en suave también a sus hijos; `undoDelete` los recupera.

- [ ] **Paso 1: migración** `0015_subtareas.sql`: la columna, `create index if not exists items_parent_idx on public.items (parent_id);`
- [ ] **Paso 2: escribir los tests que fallan** en `tests/actions/subtasks.test.ts`:

```ts
test('una subtarea hereda tipo, área y persona del padre')
test('una subtarea no aparece en la lista de su tipo')
test('una subtarea de una subtarea se rechaza')
test('un padre no puede ser su propio padre')                 // parentId === id → UserError
test('más de 20 subtareas se rechazan')
test('subtaskProgress cuenta las hechas sobre el total')
test('borrar el padre borra también las subtareas, y deshacer las recupera')
test('el export incluye las subtareas con su parentId')
```

- [ ] **Paso 3: ejecutar `npx vitest run tests/actions/subtasks.test.ts`** · Espera: FAIL.
- [ ] **Paso 4: implementar** el campo, el filtro `topLevel` y `lib/actions/subtasks.ts`.
- [ ] **Paso 5: UI.** En `ItemSheet.tsx` (modo edición), una lista de subtareas con su círculo para marcar y un campo "Añadir subtarea" al final. En `subtitleFor` de `ItemsScreen.tsx`, "2 de 5" cuando el elemento tenga hijos.
- [ ] **Paso 6: documentar** la migración en `docs/despliegue.md`.
- [ ] **Paso 7: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 8: commit**

```bash
git add supabase lib components docs tests
git commit -m "feat: subtareas dentro de un elemento"
```

---

### Tarea 13: Siri que lee el día

**Files:**
- Modify: `lib/digest/hoyApi.ts`, `app/api/hoy/route.ts`, `docs/siri.md`
- Create: `lib/digest/spoken.ts`, `tests/digest/spoken.test.ts`

**Interfaces:**
- Produce en `lib/digest/spoken.ts`: `export const SPOKEN_MAX_TASKS = 3`; `export function spokenDigest(d: Digest): string` — texto plano de una sola frase por bloque, pensado para que Siri lo lea en unos 20 segundos: el titular, las citas con su hora ("A las diez, médico"), las tareas de hoy por área contadas y las tres primeras de cada una por título, las fechas especiales de hoy, y lo que haya sin clasificar. Sin markdown, sin emojis, sin URLs, sin saltos de línea dobles.
- Produce en `handleHoy`: `GET /api/hoy?formato=texto` devuelve ese texto con `Content-Type: text/plain; charset=utf-8`; sin el parámetro, el JSON de siempre, sin cambios.

- [ ] **Paso 1: escribir los tests que fallan** en `tests/digest/spoken.test.ts`:

```ts
test('un día vacío se lee como el titular tranquilo y nada más')
test('las citas se leen con su hora en palabras del reloj')     // 10:00 → 'A las 10:00, médico'
test('de más de tres tareas por área, lee tres y dice cuántas quedan')
test('las tareas de Trabajo se leen desde los datos, no desde la IA')  // centinela: el título de trabajo aparece en el texto
test('no contiene markdown, emojis ni URLs')
test('una fecha especial de hoy se lee con el nombre de la persona')
```
Y en `tests/digest/hoyApi.test.ts`: `test('?formato=texto devuelve text/plain')` y `test('sin el parámetro sigue devolviendo el JSON de siempre')`.

- [ ] **Paso 2: ejecutar `npx vitest run tests/digest`** · Espera: FAIL.
- [ ] **Paso 3: implementar** `lib/digest/spoken.ts` y la rama de `handleHoy`.
- [ ] **Paso 4: documentar** en `docs/siri.md` el atajo "¿Qué tengo hoy?": `GET` a `/api/hoy?formato=texto` con la cabecera `Authorization: Bearer <token>` y la acción "Hablar texto", paso a paso, como los atajos que ya están documentados.
- [ ] **Paso 5: ejecutar `npm test` y `npx tsc --noEmit`** · Espera: PASS.
- [ ] **Paso 6: commit**

```bash
git add lib app docs tests
git commit -m "feat: Siri lee el día (GET /api/hoy?formato=texto)"
```

---

## Cierre

- [ ] **Suite completa:** `npm test` y `npx tsc --noEmit` y `npm run lint`, todo limpio.
- [ ] **Revisión de rama completa** con superpowers:requesting-code-review.
- [ ] **Migraciones:** `0010`–`0015` aplicadas en Supabase y anotadas en `docs/despliegue.md`.
- [ ] **README:** actualizar "Qué hace" con repeticiones, posponer, repaso, captura sin cobertura, etiquetas, subtareas y copias.
