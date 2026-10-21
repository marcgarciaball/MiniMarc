# Agente Personal — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas `- [ ]`.

**Objetivo:** Web instalable (PWA) + atajo de Siri + extensión de Chrome que centralizan tareas (personal/trabajo), citas, ideas, compras futuras y regalos, con resumen matinal.

**Arquitectura:** Next.js (App Router) sobre Vercel Hobby; Supabase (Postgres + Auth + RLS) como almacén único. Las citas y los avisos de tareas con hora viven en Google Calendar vía API. La IA (Gemini, intercambiable tras una interfaz) solo clasifica capturas no marcadas como Trabajo y redacta la frase del resumen.

**Stack:** Next.js + TypeScript, Supabase (`@supabase/ssr`), Google Calendar API (`googleapis`), Gemini API, `zod`, `web-push`, Vitest, Manifest V3 (extensión).

**Spec:** `docs/superpowers/specs/2026-10-21-agente-personal-design.md`

## Método de ejecución (ahorro de tokens)

- **Modelos:** la sesión que orquesta no escribe código de producto. Cada tarea con lógica o UI la implementa un subagente **Opus 5.5** (decisión de Marc). Las tareas marcadas `[haiku]` (documentación, configuración mecánica) las hace un subagente Haiku.
- **Contexto mínimo por subagente:** recibe solo *Restricciones globales* + su tarea + los bloques *Interfaces* de las tareas de las que depende. No lee la spec entera salvo que la tarea lo indique.
- **Verificación barata:** durante una tarea solo se ejecutan los tests de esa tarea (`npx vitest run <archivo>`). La suite completa y `tsc --noEmit` se ejecutan **una vez al final de cada fase**.
- **Sin relecturas:** no releer archivos recién editados; confiar en el error de la herramienta.
- **Revisión por fases:** un revisor independiente por **fase** (no por tarea), con el diff de la fase. Cada fase termina en algo que Marc puede usar y se detiene para su visto bueno.
- **Un commit por tarea**, mensaje `feat|chore|test: …`.

## Restricciones globales

- Idioma de la interfaz: **español**. Zona horaria por defecto: **Europe/Madrid** (configurable en ajustes).
- Valores literales: `ItemType = 'tarea' | 'idea' | 'compra' | 'regalo'`; `Area = 'personal' | 'trabajo'`; `ItemStatus = 'pendiente' | 'hecho' | 'archivado'`.
- Avisos de citas y de tareas con hora: **180 min y 60 min antes**, siempre (`reminders.overrides` de Calendar, método `popup`).
- **Coste 0 €:** Vercel Hobby, Supabase gratuito, Gemini nivel gratuito. Verificar los límites vigentes antes de depender de ellos; si algo exige pagar, parar y avisar a Marc.
- **Usuario único:** solo entra el correo de Marc (variable `ALLOWED_EMAIL`); cualquier otro se rechaza.
- **El contenido de Trabajo nunca se envía a la IA:** ni capturas marcadas Trabajo, ni tareas/citas de trabajo en el resumen, ni títulos de citas.
- Ante fallo de IA, de Calendar o de red, **lo capturado nunca se pierde**: se guarda como `needs_review = true` ("Sin clasificar").
- Tokens de API (Siri, extensión): aleatorios de ≥32 bytes, guardados solo como hash SHA-256, revocables, nunca en logs.
- La IA interna de la app es **Gemini en su nivel gratuito** (decisión de Marc). La clave se crea en Google AI Studio sobre un proyecto **sin facturación activada**, para que superar el límite dé error y nunca un cargo. Se usa el modelo gratuito más barato disponible (verificar el nombre vigente) y se limita el uso (un resumen al día; una llamada por captura, con tope diario en `lib/ai/gemini.ts`). Si se agota la cuota, se aplica el fallback de "Sin clasificar".
- La IA va tras la interfaz `AiProvider`; ningún otro código importa el SDK de Gemini.
- Los modelos que escriben el código (Opus 5.5) no tienen relación con la IA de la app (Gemini).
- PWA para iOS ≥ 16.4; objetivos táctiles ≥ 44 pt; respetar zonas seguras; modo claro y oscuro.
- Estética iOS (ver spec §5). Prohibido: degradados morado-azul, brillos de neón, iconos de destellos de IA, cuadrículas de tarjetas idénticas con sombra grande, emojis decorativos, blobs de fondo, texto motivacional.

## Foco de revisión

Entradas que la spec no cubre con una prueba y que más probablemente fallarían; cada una tiene su test en la tarea que posee el código.

1. **Captura vacía o solo espacios** → rechazada con 400, no se guarda nada (Tarea 10).
2. **Gemini caído, con timeout o devolviendo JSON inválido** → se guarda como "Sin clasificar" con el texto original (Tareas 9 y 10).
3. **Captura Trabajo con un proveedor de IA que lanza error si se le llama** → el test falla si se llama; también para el resumen (Tareas 10 y 14).
4. **Calendar devuelve 401/403 (refresh token revocado) o 5xx** → la tarea/captura se guarda igual, con `sync_error` visible y reintento posible (Tareas 7 y 10).
5. **Fechas relativas con cambio horario (último domingo de octubre/marzo en Madrid) o ya pasadas** ("hoy a las 9" dicho a las 10) → hora correcta en Madrid; la hora pasada va a "Sin clasificar" (Tareas 9 y 10).

---

## Fase 1 — Base usable

### Tarea 1: Proyecto, herramientas y repositorio

**Archivos:**
- Crear: proyecto Next.js (TypeScript, App Router, sin Tailwind salvo que el constructor lo prefiera), `vitest.config.ts`, `.env.example`, `.gitignore`, `README.md`
- Crear: `lib/time.ts`, `tests/time.test.ts`

**Interfaces:**
- Produce: `toMadrid(d: Date, tz?: string): { date: string /*YYYY-MM-DD*/; hour: number }` y `madridToUtc(dateStr: string, time: string, tz?: string): Date`.

- [ ] Paso 1: `git init`, scaffold de Next.js, instalar `vitest`, `zod`, `@supabase/ssr`, `googleapis`, `web-push`. Script `npm test` = `vitest run`.
- [ ] Paso 2: test `madridToUtc('2026-10-25','10:00')` (día del cambio a horario de invierno) = `2026-10-25T09:00:00Z`; `madridToUtc('2026-07-01','10:00')` = `2026-07-01T08:00:00Z`; `toMadrid(2026-03-29T00:30Z).hour === 1`. Ejecutar: falla.
- [ ] Paso 3: implementar `lib/time.ts` con `Intl.DateTimeFormat`, sin dependencias nuevas.
- [ ] Paso 4: ejecutar `npx vitest run tests/time.test.ts`: pasa.
- [ ] Paso 5: `.env.example` con `ALLOWED_EMAIL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `APP_TZ=Europe/Madrid`. Commit.

### Tarea 2: Esquema de datos y repositorios

**Archivos:**
- Crear: `supabase/migrations/0001_init.sql`, `lib/db/types.ts`, `lib/db/items.ts`, `lib/db/people.ts`, `tests/db/items.test.ts`

**Interfaces:**
- Produce (`lib/db/types.ts`): `Item { id; type: ItemType; title; notes: string|null; area: Area|null; dueAt: string|null; hasTime: boolean; status: ItemStatus; personId: string|null; origin: 'web'|'siri'|'extension'; needsReview: boolean; confidence: number|null; calendarEventId: string|null; syncError: string|null; createdAt; deletedAt: string|null }`; `Person { id; name; birthday: string|null; notes: string|null }`.
- Produce (`lib/db/items.ts`): `createItem(input: NewItem): Promise<Item>`, `listItems(f: {type?; area?; status?; needsReview?}): Promise<Item[]>`, `updateItem(id, patch): Promise<Item>`, `softDeleteItem(id): Promise<void>`, `restoreItem(id): Promise<void>`, `purgeDeletedOlderThan(days: 30): Promise<number>`.
- Produce (`lib/db/people.ts`): `upsertPersonByName(name): Promise<Person>`, `listPeople(): Promise<Person[]>`, `upcomingBirthdays(from: string, days: number): Promise<Person[]>`.

- [ ] Paso 1: migración con tablas `items`, `people`, `api_tokens (id, name, token_hash, created_at, revoked_at)`, `google_credentials (refresh_token, calendar_tasks_id)`, `settings (digest_hour int default 8, tz text, last_digest_date date)`, `push_subscriptions`. RLS activada: solo `auth.uid()` del propietario; el usuario de servicio la salta.
- [ ] Paso 2: tests con repositorio en memoria (mismo contrato que Supabase, inyectado): `createItem` con `type:'regalo'` y persona enlazada; `listItems({area:'trabajo'})` no devuelve tareas personales; `softDeleteItem` excluye de `listItems` y `restoreItem` lo recupera; `purgeDeletedOlderThan(30)` solo borra los eliminados hace >30 días; `upcomingBirthdays` incluye 14 días hacia delante y cruza fin de año. Ejecutar: fallan.
- [ ] Paso 3: implementar repositorios sobre un cliente inyectable (`SupabaseClient`) con adaptador en memoria para tests.
- [ ] Paso 4: ejecutar `npx vitest run tests/db`: pasa.
- [ ] Paso 5: commit.

### Tarea 3: Login con Google y acceso restringido

**Archivos:**
- Crear: `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `middleware.ts`, `app/login/page.tsx`, `app/auth/callback/route.ts`, `lib/auth/allowlist.ts`, `tests/auth/allowlist.test.ts`

**Interfaces:**
- Produce: `isAllowedEmail(email: string | undefined, allowed = process.env.ALLOWED_EMAIL): boolean`; `requireUser(): Promise<User>` (lanza redirección a `/login`).

- [ ] Paso 1: test `isAllowedEmail('marc@x.com','marc@x.com') === true`, mayúsculas/espacios ignorados, otro correo `false`, `undefined` `false`. Ejecutar: falla.
- [ ] Paso 2: implementar `allowlist.ts`.
- [ ] Paso 3: login OAuth Google con scopes `calendar` y `access_type=offline`, `prompt=consent`. En el callback: si el correo no está permitido, cerrar sesión y volver a `/login`; si lo está, guardar `provider_refresh_token` en `google_credentials` (Supabase no lo conserva).
- [ ] Paso 4: `middleware.ts` protege todo salvo `/login`, `/auth/*`, `/api/capture`, `/api/cron/*`, `/api/push/*` (estas validan su propio token).
- [ ] Paso 5: ejecutar el test: pasa. Commit.

### Tarea 4: Sistema visual iOS y punto de revisión visual

**Archivos:**
- Crear: `styles/tokens.css`, `components/ui/{Glass,NavBar,TabBar,InsetList,Row,Sheet,Switch,LargeTitle}.tsx`, `app/dev/design/page.tsx`

**Interfaces:**
- Produce: tokens CSS (`--bg`, `--surface-glass`, `--hairline`, `--accent`, `--radius-continuous`) con modo claro/oscuro; componentes con props tipadas exportados desde `components/ui`.

- [ ] Paso 1: proponer paleta cálida y contenida con un único acento (decisión del implementador, justificada en una línea en `README.md`), fuente `-apple-system`, `backdrop-filter`, bordes 0,5 px, títulos grandes colapsables, hoja modal arrastrable.
- [ ] Paso 2: página `/dev/design` con todos los componentes en claro y oscuro.
- [ ] Paso 3: verificar en un iPhone real o en el simulador que la PWA no muestra barra del navegador y respeta zonas seguras. Capturas guardadas en `docs/design/`.
- [ ] Paso 4: **parar y enseñar las capturas a Marc**; ajustar paleta si lo pide. Commit.

### Tarea 5: Pantallas de las cinco áreas y PWA

**Archivos:**
- Crear: `app/(app)/layout.tsx`, `app/(app)/{tareas,ideas,compras,regalos,sin-clasificar}/page.tsx`, `app/(app)/regalos/[personId]/page.tsx`, `app/actions/items.ts`, `public/manifest.webmanifest`, `public/sw.js`, iconos en `public/icons/`, `tests/actions/items.test.ts`

**Interfaces:**
- Consume: repositorios de la Tarea 2, componentes de la Tarea 4.
- Produce: server actions `addItem(formData)`, `toggleDone(id)`, `moveItem(id, patch)`, `deleteItem(id)`, `undoDelete(id)`.

- [ ] Paso 1: tests de acciones: `addItem` con título vacío lanza error; `deleteItem` seguido de `undoDelete` restaura; en `/tareas` la lista Personal y la de Trabajo son vistas separadas y no comparten elementos.
- [ ] Paso 2: implementar acciones y pantallas: Tareas (selector Personal/Trabajo), Ideas, Compras, Regalos agrupados por persona con alta de personas y cumpleaños, Sin clasificar.
- [ ] Paso 3: manifest (`display: standalone`, iconos, `theme_color`), service worker mínimo (caché de lectura; sin captura offline), iconos propios y pantalla de arranque cuidada.
- [ ] Paso 4: ejecutar tests de la tarea: pasan. Commit.

### Tarea 6: Despliegue (Vercel + Supabase + Google OAuth) `[haiku]`

**Archivos:**
- Crear: `docs/despliegue.md`, `vercel.json`

- [ ] Paso 1: guía paso a paso para Marc: proyecto Supabase, aplicar migración, proyecto Google Cloud, pantalla de consentimiento en producción, URIs de redirección, variables en Vercel, dominio `*.vercel.app`.
- [ ] Paso 2: **Marc ejecuta la guía.** Verificar: iniciar sesión con su correo, que otro correo es rechazado, y que la PWA se instala en el iPhone.
- [ ] Paso 3: comprobar los límites vigentes de los planes gratuitos y anotarlos en la guía. Commit.

**Fin de la fase 1:** suite completa + `tsc --noEmit` + revisión de fase + visto bueno de Marc.

---

## Fase 2 — Calendario

### Tarea 7: Cliente de Google Calendar y sincronización de tareas con hora

**Archivos:**
- Crear: `lib/calendar/client.ts`, `lib/calendar/taskSync.ts`, `tests/calendar/client.test.ts`, `tests/calendar/taskSync.test.ts`

**Interfaces:**
- Produce (`client.ts`): `createCalendarClient(auth): CalendarGateway` con `CalendarGateway { createEvent(calendarId, e: {title; startsAt: Date; endsAt?: Date}): Promise<string>; updateEvent(calendarId, eventId, e): Promise<void>; deleteEvent(calendarId, eventId): Promise<void>; listEvents(range: {from: Date; to: Date}): Promise<CalendarEvent[]>; ensureCalendar(name: 'Tareas'): Promise<string> }`. `CalendarEvent { id; title; startsAt; endsAt; calendarId; hasRequiredReminders: boolean }`.
- Produce (`taskSync.ts`): `syncTaskEvent(item: Item, gw: CalendarGateway): Promise<{ eventId: string | null; error: string | null }>`.

- [ ] Paso 1: tests con `CalendarGateway` simulado: crear un evento envía `reminders.overrides = [{method:'popup',minutes:180},{method:'popup',minutes:60}]` y `useDefault:false`; `syncTaskEvent` de una tarea con `hasTime` crea evento en el calendario "Tareas"; al completarla o borrarla elimina el evento; sin `hasTime` no crea nada; si el gateway lanza 401, devuelve `{eventId:null, error:'calendar_auth'}` sin lanzar; si lanza 5xx devuelve `calendar_unavailable`; `hasRequiredReminders` es `false` para un evento sin 180/60. Ejecutar: fallan.
- [ ] Paso 2: implementar con `googleapis`, renovando el access token desde `google_credentials.refresh_token`.
- [ ] Paso 3: conectar `syncTaskEvent` en las acciones `addItem/toggleDone/moveItem/deleteItem` guardando `calendarEventId` y `syncError`.
- [ ] Paso 4: ejecutar `npx vitest run tests/calendar`: pasa. Commit.

### Tarea 8: Agenda de citas y guía de configuración del iPhone

**Archivos:**
- Crear: `app/(app)/agenda/page.tsx`, `app/(app)/ajustes/page.tsx`, `app/actions/events.ts`, `docs/iphone.md` `[haiku para docs/iphone.md]`

**Interfaces:**
- Consume: `CalendarGateway`. Produce: `addEvent(formData)`; vista que marca los eventos con `hasRequiredReminders === false` con aviso discreto.

- [ ] Paso 1: test de `addEvent`: título vacío lanza error; fin anterior al inicio lanza error; se llama a `createEvent` en el calendario principal con avisos 180/60.
- [ ] Paso 2: implementar agenda (hoy y próximos días) y alta de cita.
- [ ] Paso 3: ajustes con lista de comprobación: avisos predeterminados 180/60 en Google Calendar, cuenta de Google en el calendario de Apple, calendario "Tareas" marcado para sincronizar con iOS, notificaciones activas en una sola app. Guía en `docs/iphone.md`.
- [ ] Paso 4: tests y commit. **Marc crea una cita y confirma que llegan los dos avisos al iPhone.**

**Fin de la fase 2:** suite completa + `tsc` + revisión + visto bueno.

---

## Fase 3 — Captura inteligente

### Tarea 9: Proveedor de IA y clasificación

**Archivos:**
- Crear: `lib/ai/provider.ts`, `lib/ai/gemini.ts`, `lib/ai/classify.ts`, `lib/ai/schema.ts`, `tests/ai/classify.test.ts`

**Interfaces:**
- Produce (`provider.ts`): `interface AiProvider { generateJson(prompt: string, schema: ZodSchema<T>, opts?: {timeoutMs?: number}): Promise<T>; generateText(prompt: string, opts?: {timeoutMs?: number}): Promise<string> }`.
- Produce (`classify.ts`): `classify(text: string, ctx: { now: Date; tz: string; people: string[] }, ai: AiProvider): Promise<Classification[]>`, con `Classification { kind: 'tarea'|'idea'|'compra'|'regalo'|'cita'; title: string; notes?: string; personName?: string; startsAt?: string /*ISO UTC*/; hasTime: boolean; confidence: number }`. Nunca devuelve el área Trabajo.

- [ ] Paso 1: tests con `AiProvider` simulado: "comprar leche y llamar a mamá" devuelve 2 elementos; JSON inválido o timeout **lanza `ClassifyError`** (el llamante lo convierte en "Sin clasificar"); resultado con `confidence < 0.6` se devuelve tal cual (el umbral lo aplica la Tarea 10); una `startsAt` con hora ya pasada respecto a `ctx.now` se marca `confidence: 0`; "el jueves a las 10 médico" con `now` = domingo 2026-10-25 resuelve a la hora local de Madrid correcta (usar `madridToUtc`). Ejecutar: fallan.
- [ ] Paso 2: implementar `classify` (prompt en español, salida validada con `zod`) y `GeminiProvider` con el SDK oficial, con timeout y un reintento.
- [ ] Paso 3: ejecutar `npx vitest run tests/ai`: pasa. Commit.

### Tarea 10: Pipeline de captura y endpoint `/api/capture`

**Archivos:**
- Crear: `lib/capture/pipeline.ts`, `lib/auth/tokens.ts`, `app/api/capture/route.ts`, `tests/capture/pipeline.test.ts`, `tests/auth/tokens.test.ts`

**Interfaces:**
- Produce (`tokens.ts`): `createApiToken(name: string): Promise<{ id: string; token: string }>` (el token en claro se devuelve una sola vez), `verifyApiToken(authHeader: string | null): Promise<boolean>`, `revokeApiToken(id: string): Promise<void>`.
- Produce (`pipeline.ts`): `captureText(input: { text: string; area?: 'trabajo'; origin: 'web'|'siri'|'extension' }, deps: { ai: AiProvider; items: ItemsRepo; people: PeopleRepo; calendar: CalendarGateway; now: Date }): Promise<{ items: Item[]; eventIds: string[] }>`.
- Endpoint: `POST /api/capture` con cabecera `Authorization: Bearer <token>`, cuerpo `{ text, area? }`; `200 { items }`, `400` texto vacío, `401` token inválido.

- [ ] Paso 1: tests de tokens: se guarda solo el hash; un token revocado falla; cabecera mal formada falla.
- [ ] Paso 2: tests de pipeline: texto vacío o solo espacios lanza error y no guarda nada; `area:'trabajo'` crea una tarea de trabajo **sin llamar a `ai`** (el proveedor simulado lanza si se le llama); con `ai` lanzando `ClassifyError` guarda un elemento con `needsReview: true` y el texto original; confianza < 0.6 → `needsReview: true`; `kind:'cita'` crea evento con avisos 180/60 y no crea fila en `items`; Calendar con 401 guarda el elemento con `syncError` y no pierde el texto; "regalo para mamá: pañuelo" crea/enlaza la persona "mamá"; un mismo texto idéntico recibido dos veces en <30 s no se duplica. Ejecutar: fallan.
- [ ] Paso 3: implementar tokens (SHA-256, comparación en tiempo constante) y `captureText`.
- [ ] Paso 4: ruta `POST /api/capture` que construye las dependencias reales y llama al pipeline.
- [ ] Paso 5: ejecutar `npx vitest run tests/capture tests/auth`: pasa. Commit.

### Tarea 11: Bandeja "Recién añadido", captura en la web y gestión de tokens

**Archivos:**
- Crear: `components/CaptureBar.tsx`, `app/(app)/bandeja/page.tsx`, `app/api/tokens/route.ts`, ampliar `app/(app)/ajustes/page.tsx`

**Interfaces:**
- Consume: `captureText`, `createApiToken`. Produce: `CaptureBar` (campo siempre visible con interruptor "Trabajo", entrada de voz del teclado de iOS), vista que lista lo capturado en las últimas 24 h con acción de mover/corregir con un toque y deshacer.

- [ ] Paso 1: test de la acción `captureFromWeb(formData)`: con interruptor Trabajo activo llama al pipeline con `area:'trabajo'`.
- [ ] Paso 2: implementar `CaptureBar`, bandeja con correcciones y papelera de 30 días (usa `softDeleteItem`/`restoreItem`).
- [ ] Paso 3: en Ajustes, crear y revocar tokens con nombre ("Siri", "Siri trabajo", "Extensión"); el token se muestra una sola vez.
- [ ] Paso 4: test y commit.

### Tarea 12: Atajos de Siri `[haiku]`

**Archivos:**
- Crear: `docs/siri.md`

- [ ] Paso 1: guía de dos atajos: "Apunta" (dicta → `POST /api/capture` con token "Siri") y "Apunta en trabajo" (envía `area:"trabajo"` con token "Siri trabajo"). Respaldo: si el `POST` falla, guardar el texto en una nota de Apple.
- [ ] Paso 2: **Marc crea los atajos siguiendo la guía** y comprueba: dictado de tarea personal, de trabajo, de cita y de regalo; y con modo avión (respaldo en Notas).
- [ ] Paso 3: commit.

**Fin de la fase 3:** suite completa + `tsc` + revisión + visto bueno.

---

## Fase 4 — Hoy

### Tarea 13: Resumen del día (lógica)

**Archivos:**
- Crear: `lib/digest/build.ts`, `tests/digest/build.test.ts`

**Interfaces:**
- Consume: repositorios, `CalendarGateway`, `AiProvider`.
- Produce: `buildDigest(date: string, deps): Promise<Digest>` con `Digest { events: DigestEvent[]; tasks: { personal: Item[]; trabajo: Item[] }; birthdays: { person: Person; giftIdeas: Item[] }[]; headline: string }`. Eventos y tareas de trabajo vienen de la base de datos; `headline` se genera solo con datos personales.

- [ ] Paso 1: tests: con tareas de trabajo y citas de trabajo, el prompt enviado al `AiProvider` simulado **no contiene** ninguno de sus títulos (probar con cadenas centinela); con IA caída, `headline` es un texto fijo ("Buenos días") y el resumen se devuelve completo; cumpleaños a 10 días incluye las ideas de regalo de esa persona y a 20 días no aparece; tareas vencidas aparecen separadas por área; el resultado cabe en una pantalla (máx. 5 tareas por área, el resto como "+N"). Ejecutar: fallan.
- [ ] Paso 2: implementar `buildDigest` (el texto de personas y regalos va a la IA; lo de Trabajo nunca).
- [ ] Paso 3: ejecutar `npx vitest run tests/digest`: pasa. Commit.

### Tarea 14: Pantalla Hoy, notificación matinal y push

**Archivos:**
- Crear: `app/(app)/hoy/page.tsx`, `app/api/cron/morning/route.ts`, `app/api/push/subscribe/route.ts`, `lib/push/send.ts`, `lib/cron/shouldSendDigest.ts`, `public/sw.js` (añadir manejo de `push`), `supabase/migrations/0002_cron.sql`, `tests/cron/shouldSendDigest.test.ts`

**Interfaces:**
- Produce: `shouldSendDigest(now: Date, s: { digestHour: number; tz: string; lastDigestDate: string | null }): boolean`; `sendPush(sub, payload): Promise<void>` (borra la suscripción si el servicio responde 404/410).

- [ ] Paso 1: tests de `shouldSendDigest`: a las 08:00 Madrid con `digestHour=8` y `lastDigestDate` distinto de hoy → `true`; mismo día ya enviado → `false`; a las 07:00 → `false`; el día del cambio horario sigue disparando a las 08:00 locales. Ejecutar: fallan.
- [ ] Paso 2: implementar `shouldSendDigest` y la ruta `/api/cron/morning` (valida `CRON_SECRET`, calcula `shouldSendDigest`, genera el resumen, envía push, guarda `last_digest_date`).
- [ ] Paso 3: la programación usa **`pg_cron` + `pg_net` de Supabase cada hora**, llamando a la ruta (Vercel Hobby solo permite un cron diario y no respeta la hora local). Verificar que ambas extensiones siguen disponibles en el plan gratuito; si no, recurrir a un cron externo gratuito y avisar a Marc.
- [ ] Paso 4: pantalla `/hoy` (inicio de la app) que genera el resumen al abrirla si el push falló; botón para activar notificaciones (exige PWA instalada).
- [ ] Paso 5: ejecutar tests y commit. **Marc comprueba que a la hora elegida llega la notificación al iPhone y que el resumen se lee en ~20 s.**

**Fin de la fase 4:** suite completa + `tsc` + revisión + visto bueno.

---

## Fase 5 — Extensión de Chrome

### Tarea 15: Extensión MV3

**Archivos:**
- Crear: `extension/manifest.json`, `extension/popup.html`, `extension/popup.ts`, `extension/options.html`, `extension/options.ts`, `extension/lib/api.ts`, `tests/extension/api.test.ts`, `app/api/hoy/route.ts`

**Interfaces:**
- Produce (`api.ts`): `sendCapture(baseUrl: string, token: string, text: string, area?: 'trabajo'): Promise<{ ok: boolean }>` y `fetchHoy(baseUrl, token): Promise<Digest>`. `GET /api/hoy` con `Authorization: Bearer`.

- [ ] Paso 1: tests de `api.ts` con `fetch` simulado: añade la cabecera `Authorization`; `sendCapture` con respuesta 401 devuelve `{ok:false}`; texto vacío no llama a la red.
- [ ] Paso 2: implementar popup (campo de captura con interruptor Trabajo, resumen de Hoy, enlace a la app), atajo de teclado (`commands`), página de opciones para URL y token. Permisos mínimos: `storage` y el host de la app.
- [ ] Paso 3: `GET /api/hoy` protegido por token (misma lógica que `/api/capture`).
- [ ] Paso 4: ejecutar tests; Marc carga la extensión descomprimida y comprueba captura en menos de 3 s. Commit.

---

## Fase 6 — Pulido

### Tarea 16: Exportación, modo oscuro, accesibilidad y cierre

**Archivos:**
- Crear: `app/api/export/route.ts`, `lib/export/serialize.ts`, `tests/export/serialize.test.ts`; modificar estilos y `docs/despliegue.md`

**Interfaces:**
- Produce: `serializeExport(items: Item[], people: Person[], fmt: 'json'|'csv'): string`.

- [ ] Paso 1: tests: JSON contiene todos los campos y elementos eliminados con `deletedAt`; CSV escapa comas, comillas y saltos de línea; vacío produce solo cabecera. Ejecutar: fallan.
- [ ] Paso 2: implementar exportación y botón en Ajustes (requiere sesión).
- [ ] Paso 3: repaso de modo oscuro, contraste, foco, `aria-label`, tamaños táctiles; limpiar la papelera (`purgeDeletedOlderThan`) en la tarea horaria.
- [ ] Paso 4: suite completa, `tsc --noEmit`, revisión final de todo el repositorio, y repaso de los criterios de éxito de la spec §9 con Marc. Commit.
