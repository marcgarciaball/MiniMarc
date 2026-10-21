# Agente Personal — Documento de diseño

Fecha: 2026-10-21 · Usuario: Marc (un solo usuario) · Idioma de la interfaz: español

Leyenda: **[Marc]** = lo dijo o decidió Marc. **[Mi decisión]** = decisión mía que Marc debe revisar. **[Constructor]** = se deja a quien lo construya.

---

## 1. Intención y por qué

Marc se olvida de cosas con frecuencia y vive pendiente de recordatorios, lo que le genera estrés. No sabe qué sistema usar ni cómo organizarse. **[Marc]**

Quiere **un único lugar** donde guardar todo, sin saltar entre Google Tasks, Keep y otras apps, accesible desde el ordenador y el móvil, todo interconectado. Y quiere que añadir cosas sea tan fácil como hablar. **[Marc]**

El valor real no es la tecnología, sino que Marc **confíe** en que todo lo que suelta en el sistema queda guardado, en su sitio y le volverá a aparecer en el momento adecuado. Si deja de confiar, vuelve a apoyarse en la cabeza y el proyecto ha fracasado.

## 2. Qué se construye

1. **Web app instalable (PWA)** que funciona en ordenador y en iPhone (añadida a la pantalla de inicio). **[Marc]** (web + app) / **[Mi decisión]** (PWA en vez de app nativa).
2. **Atajo de Siri** para dictar y que el contenido llegue a la app. **[Marc]** (Siri/asistente) / **[Mi decisión]** (atajo de Siri hacia un endpoint propio).
3. **Extensión de Chrome** para acceder con un clic desde el navegador sin tener una pestaña abierta. **[Marc]**
4. **Resumen de inicio de día** con IA: pantalla "Hoy" y notificación por la mañana. **[Marc]** lo quiere; el contenido es **[Mi decisión]**.

Marc cambia a iPhone mañana (2026-10-22) y no tendrá Gemini móvil. **[Marc]** Marc sabe programar y quiere conocer las decisiones técnicas. **[Marc]**

## 3. Las cinco áreas de contenido **[Marc]**

| # | Área | Descripción |
|---|------|-------------|
| 1 | **Tareas** | Pendientes separados en **Personal** y **Trabajo**, sin mezclarse nunca en las vistas. |
| 2 | **Citas** | Eventos de calendario con aviso **3 h antes y 1 h antes**, siempre. |
| 3 | **Ideas e historias** | Cualquier cosa que se le pase por la cabeza, guardada para después. |
| 4 | **Comprar más adelante** | Cosas que cree que necesitará comprar, pero no ahora. |
| 5 | **Regalos** | Ideas de regalo para personas concretas (mamá, papá, Ainhoa y futuras). |

Modelo de datos orientativo **[Mi decisión]** (el esquema exacto es **[Constructor]**):

- `items`: id, tipo (`tarea | idea | compra | regalo`), título, notas, área (`personal | trabajo`, solo relevante en tareas), fecha/hora límite opcional, estado (`pendiente | hecho | archivado`), persona opcional (para regalos), origen (`web | siri | extension`), creado, confianza de clasificación.
- `people`: id, nombre, fecha de cumpleaños opcional, notas. Los regalos se enlazan a una persona. Cumpleaños y fechas señaladas alimentan el resumen de la mañana.
- Las **citas viven en Google Calendar**, no se duplican como filas propias; la app las lee y las crea vía API.

## 4. Comportamiento clave

### 4.1 Citas y avisos
- Las citas se crean/leen en **Google Calendar** mediante su API, con el login de Google de Marc. **[Mi decisión]**
- Al crear una cita desde la app se fijan explícitamente dos avisos: **180 min y 60 min antes**. **[Marc]**
- Las citas creadas fuera de la app (directamente en Google Calendar) no heredan esos avisos salvo que Marc configure los avisos predeterminados de su calendario. La app debe **recordárselo en la configuración inicial** y puede mostrar un aviso si detecta eventos sin esos avisos. **[Mi decisión]**
- Zona horaria por defecto: Europe/Madrid. **[Mi decisión, suposición]**

### 4.2 Captura rápida (el corazón del sistema)
Tres vías de entrada, todas llegan al mismo punto: **web (campo de captura siempre visible)**, **atajo de Siri**, **extensión de Chrome**. **[Mi decisión]**

Flujo: texto libre → IA lo clasifica (tipo, área, persona, fecha/hora) → se guarda → aparece en una **Bandeja "Recién añadido"** donde Marc ve dónde ha ido y lo corrige con un toque.
- Si la confianza es baja, va a **"Sin clasificar"**, nunca se adivina en silencio. Anti-objetivo: que la IA archive algo mal y Marc no lo vuelva a ver. **[Mi decisión]**
- Si el texto contiene fecha y hora de cita ("el jueves a las 10 médico"), se crea como evento en Calendar con los avisos de 3 h y 1 h.
- Frases con una persona y un regalo ("regalo para mamá: pañuelo de seda") se enlazan a esa persona; si no existe, se crea.
- Si la IA falla o no hay conexión con ella, el texto se guarda igualmente como "Sin clasificar". **Nunca se pierde lo que Marc dicta.** **[Mi decisión]**

### 4.3 Resumen de inicio de día
Pantalla **"Hoy"** y notificación push a una hora configurable (por defecto 8:00). **[Mi decisión]** El contenido exacto no lo definió Marc; propuesta:
- Citas de hoy (con hora).
- Tareas de **Trabajo** y de **Personal** por separado: vencidas y de hoy.
- Cumpleaños en los próximos 14 días con las ideas de regalo guardadas para esa persona.
- Una frase de apertura corta generada por IA. Sin consejos de productividad, sin motivación genérica.
- Debe poder leerse en menos de 20 segundos.

Si la notificación falla, la pantalla "Hoy" se genera al abrir la app, así nada depende de la entrega del push.

### 4.4 Recordatorios de tareas con hora
Requisito de Marc: avisos 3 h y 1 h antes aplican a las citas **[Marc]**. Para tareas con hora límite, Marc propuso apoyarse en Google Calendar **[Marc]**, y se acepta un retraso de unos minutos si hiciera falta. Diseño **[Mi decisión]**:
- Una tarea con hora límite se refleja como un **evento en un calendario dedicado "Tareas"** de Google Calendar, con avisos a 180 y 60 min. Los entrega la app de Google Calendar en el iPhone (o el calendario de Apple con la cuenta de Google añadida). No hace falta planificador propio ni push para esto.
- La tarea sigue viviendo en la app; el evento es solo su recordatorio. Al completar, mover o borrar la tarea, el evento se actualiza o se elimina.
- **Configuración recomendada en el iPhone [Marc]:** añadir la cuenta de Google al calendario de Apple (Ajustes → Calendario → Cuentas), para ver citas y tareas en ambos sitios. Pasos de la guía de arranque: (1) comprobar que el calendario "Tareas" está marcado para sincronizar con iOS en la página de sincronización de calendarios de Google (verificar el procedimiento vigente); (2) dejar las notificaciones activas en **una sola** app (Apple Calendar o Google Calendar) para evitar avisos duplicados.
- El calendario "Tareas" puede ocultarse en Google Calendar sin perder los avisos.
- Los títulos de tareas de Trabajo viajan a Google Calendar (la cuenta de Marc), no a la IA.
- Descartados: escribir en el calendario de Apple (sin API web viable) y Google Tasks (su API solo admite fecha, sin hora).

### 4.5 Extensión de Chrome
- Manifest V3. Un clic en el icono abre un popup con: campo de captura rápida y vista "Hoy" resumida, más enlace a la app completa. **[Mi decisión]**
- Atajo de teclado para abrirla. **[Mi decisión]**
- Se autentica con un **token personal** revocable generado desde la app, no con el login de Google dentro de la extensión. **[Mi decisión]**
- Solo Chrome/Chromium; en iPhone no aplica.

## 5. Diseño visual **[Marc]**

Estética **100 % iPhone / iOS**: cristalina, minimalista, bonita y *aesthetic*. Debe parecer hecha por un diseñador, **no por una IA**. Marc excluye explícitamente los colores y diseños típicos de IA.

Dirección propuesta **[Mi decisión]**:
> **Cambio de dirección (2026-10-21) [Marc]:** Marc rechaza los dos primeros intentos: el de vidrio cálido con acento terracota ("no parece de iPhone") y el de "boceto conceptual" con tinta sobre papel ("realmente horrible"). La dirección visual es **vidrio esmerilado de Apple (glassmorphism / Liquid Glass)** con acento **azul glaciar**, el color de su próximo iPhone Pro, sobre la **estructura e interacción de iOS**, que se mantienen. Las imágenes de referencia están en `docs/design/` (`referencia-vidrio-1.png`, `referencia-vidrio-2.png`, `referencia-iphone-azul-glaciar.png`). Las viñetas de materiales, tipografía y color siguientes sustituyen a las anteriores.

- **Estructura de iOS (se mantiene):** vistas tipo "inset grouped list", barra de navegación con títulos grandes colapsables, barra de pestañas, hojas modales arrastrables, interruptores, zonas seguras y objetivos de 44 pt.
- **Materiales (vidrio):** capas translúcidas esmeriladas con desenfoque real del fondo, borde de luz fino de 0,5 px, sombras muy suaves y amplias y radios generosos (tarjetas de ~22 pt, píldoras redondas), sobre un fondo luminoso y sutil de cintas de luz plegadas en tonos glaciar, inspirado en el fondo de pantalla del iPhone. Con "Reducir transparencia" las superficies pasan a sólidas.
- **Tipografía:** solo la pila del sistema (`-apple-system`, SF Pro), con los tamaños, pesos y tracking de Apple: título grande de 34 pt en negrita, cuerpo de 17 pt y notas de 13 pt.
- **Color:** grises fríos, vidrio casi blanco en claro y grafito azulado en oscuro, más un único acento azul glaciar (más profundo en claro, más pálido en oscuro). Sin tonos cálidos ni segundo acento. Contraste AA para el texto y los controles sobre el vidrio.
- **Prohibido (anti-objetivos de diseño):** degradados morado-azul, brillos o resplandores de neón, iconos de destellos/estrellas de IA, tarjetas idénticas en cuadrícula con sombra grande, emojis como decoración, fondos con "blobs" borrosos de colores, texto de relleno motivacional.
- **Movimiento:** transiciones y gestos con física tipo iOS (hojas modales que se arrastran, deslizar para completar/archivar), sin animaciones llamativas.
- Detalles de PWA: pantalla completa sin barra del navegador, respeta las zonas seguras (notch, barra de inicio), icono y pantalla de arranque cuidados, objetivos táctiles ≥ 44 pt, teclado que no tapa el campo de captura.
- Sugerido validar con maquetas antes de construir (ver §9).

## 6. Objetivos, no objetivos, anti-objetivos

**Objetivos**
- Todo en un solo lugar, con las cinco áreas y tareas personal/trabajo siempre separadas.
- Captura en pocos segundos, con voz desde iPhone y con un clic desde el navegador.
- Avisos de citas 3 h y 1 h antes, siempre.
- Coste 0 € (hosting, base de datos, IA). **[Marc]**
- Aspecto de iOS nativo.

**No objetivos (v1)**
- Multiusuario, compartir listas, colaboración.
- App nativa de tienda (App Store).
- Funcionamiento offline completo (la lectura puede cachearse; capturar exige conexión salvo que el constructor lo resuelva barato).
- Sustituir a Google Calendar como calendario.
- Extensión para Safari/Firefox.

**Anti-objetivos (aunque "funcione", sería un fracaso)**
- Que Marc dicte algo y se pierda o acabe en un sitio donde no lo vuelva a ver.
- Que tareas de trabajo y personales se mezclen en una vista.
- Que se vea como un producto genérico de IA.
- Que genere más estrés (demasiadas notificaciones, resúmenes largos, configuración pesada).
- Que dependa de pagar algo sin avisar a Marc.

## 7. Restricciones y arquitectura

Marc quiere **todo gratis, hosting y base de datos incluidos**. **[Marc]** Pila elegida **[Mi decisión]**, todo reemplazable salvo lo que Marc diga:

| Pieza | Elección | Notas |
|-------|----------|-------|
| Front + API | **Next.js + TypeScript** en **Vercel (Hobby)** | Uso personal. El plan gratuito solo permite tareas programadas con baja frecuencia (una vez al día) y la hora exacta es aproximada. |
| Base de datos + login | **Supabase (plan gratuito)** | Pausa proyectos inactivos tras ~1 semana; la tarea diaria lo mantiene activo. Seguridad a nivel de fila activada. |
| Login | **Google OAuth** | Una sola cuenta permitida (allowlist del correo de Marc). Da acceso a Calendar. |
| Calendario | **Google Calendar API** | Gratuita. Las credenciales OAuth de la app en modo "testing" caducan los refresh tokens a los 7 días; hay que publicar la app OAuth (uso personal) o gestionarlo. **[Constructor]** |
| IA | **Proveedor intercambiable**, empezar con **Gemini API (nivel gratuito)** | Hay que aislar el proveedor tras una interfaz. **Riesgo de privacidad:** en los niveles gratuitos de Gemini, los datos pueden usarse para mejorar los productos de Google (verificar la política vigente). Marc debe aceptarlo o pasar a un proveedor de pago/otro. |
| Notificaciones | **Web Push** (PWA) | En iOS solo funciona con la PWA añadida a la pantalla de inicio y con iOS ≥ 16.4; requiere que Marc conceda el permiso. |
| Avisos de tareas con hora | **Eventos en un calendario "Tareas" de Google Calendar** (§4.4) | Sin planificador propio. El cron diario de Vercel basta para el resumen de la mañana. |
| Siri | **Atajo (Shortcuts)** → `POST` a un endpoint de la app con token | El atajo se entrega como instrucciones paso a paso o archivo `.shortcut`. |

Los límites de los planes gratuitos cambian: el constructor debe **verificar los límites vigentes** antes de fijarse en ellos y comunicar a Marc cualquier punto en que 0 € no sea posible.

### Seguridad y privacidad
- Usuario único: cualquier otra cuenta de Google es rechazada.
- Tokens para Siri y extensión: largos, aleatorios, revocables, con alcance limitado a "crear elementos y leer Hoy". No registrar su valor en logs.
- Contenido personal (regalos, ideas, trabajo): no enviar a servicios externos más que lo estrictamente necesario para clasificar/resumir.
- Marc debe poder **exportar todos sus datos** (JSON/CSV) en cualquier momento. **[Mi decisión]**

## 8. Fases sugeridas **[Mi decisión]** (el plan detallado es **[Constructor]**)

1. **Base:** proyecto, login Google, esquema de datos, las cinco áreas con CRUD manual, separación personal/trabajo, estilo visual iOS, PWA instalable en iPhone.
2. **Calendario:** lectura/creación de citas en Google Calendar con avisos 3 h y 1 h; recordatorios de tareas con hora.
3. **Captura inteligente:** endpoint de captura, clasificación con IA, Bandeja y "Sin clasificar", atajo de Siri.
4. **Hoy:** resumen de la mañana, personas con cumpleaños, notificación push.
5. **Extensión de Chrome.**
6. **Pulido:** modo oscuro afinado, exportación, rendimiento, accesibilidad.

La fase 1 ya debe ser usable por sí sola. Cada fase termina en algo que Marc puede usar a diario.

## 9. Criterios de éxito
- Marc dicta con Siri "apunta que tengo que llamar al gestor" y en menos de ~10 s aparece en **Tareas → Trabajo** (o en "Sin clasificar" si hay duda).
- Una cita creada desde la app llega al iPhone con avisos a 3 h y a 1 h.
- A las ~8:00 recibe una notificación y la pantalla "Hoy" se lee de un vistazo.
- Desde Chrome, un clic y puede escribir algo en menos de 3 segundos.
- La coste mensual es 0 €.
- Marc dice que **parece una app de Apple** y no una plantilla de IA.

## 10. Decisiones añadidas tras la revisión **[Mi decisión]**

- **Cita vs. tarea con hora:** si el texto es un compromiso con otras personas o un lugar ("médico", "reunión", "cena con…") y tiene fecha y hora, es **cita** (Calendar). Si es algo que Marc debe hacer él solo ("llamar al gestor mañana a las 5"), es **tarea con hora** y recibe los avisos push. Si hay duda, va a "Sin clasificar".
- **Entradas con varias cosas** ("comprar leche y llamar a mamá"): se dividen en varios elementos, cada uno visible en la Bandeja. Una fecha sin hora crea una tarea con fecha, sin aviso horario. Umbral de confianza bajo: ajustable por el constructor, empezando de forma conservadora (ante la duda, "Sin clasificar").
- **Calendario destino:** el calendario principal de Marc por defecto; configurable. Zona horaria Europe/Madrid, con opción de cambiarla en ajustes.
- **Siri sin conexión:** si el `POST` falla, el atajo guarda el texto en una nota o recordatorio de Apple como respaldo, para que nada se pierda. Marc lo pasa a la app cuando pueda.
- **Diseño:** el constructor elige una paleta propuesta, la enseña a Marc en una maqueta antes de cerrar la fase 1 y se itera. La fase 1 incluye un punto de revisión visual.
- **Borrado y correcciones:** hay deshacer inmediato y papelera de 30 días antes del borrado definitivo. Las correcciones de clasificación de Marc **no** realimentan la IA en la v1.
- **Google OAuth:** la app OAuth se publica en modo producción para uso personal (aparecerá una pantalla de aviso de "app no verificada" que Marc acepta una vez), para evitar el cierre de sesión cada 7 días. Si no tiene proyecto de Google Cloud, se crea uno.

## 10b. Privacidad de la IA **[Marc]**

Marc acepta el nivel gratuito de Gemini **con una salvedad: el contenido de Trabajo nunca se envía a la IA.** Consecuencias de diseño **[Mi decisión]**:

- Para que la IA no vea contenido de trabajo, el **área Trabajo se elige a mano al capturar**: interruptor "Trabajo" en la web y en la extensión, y un atajo de Siri separado ("Apunta en trabajo"). Lo capturado como Trabajo se guarda como tarea sin pasar por la IA.
- Lo capturado sin marcar Trabajo sí pasa por la IA, que clasifica entre tarea personal, idea, compra, regalo y cita. Riesgo asumido: si Marc dicta algo de trabajo sin usar la vía de Trabajo, esa frase se enviará a Gemini. La Bandeja permite moverlo después, pero no deshace el envío.
- El **resumen de la mañana** lista las tareas y citas de trabajo directamente desde la base de datos, sin enviarlas a la IA. La frase generada por la IA solo usa datos personales (cumpleaños, tareas personales) o ninguno.
- Los **títulos de las citas del calendario** pueden ser de trabajo: tampoco se envían a la IA.

## 11. Abierto

- **[Marc]** Contenido definitivo del resumen de la mañana: está propuesto en §4.3, falta su validación.
- **[Marc]** Aceptar o no el riesgo de privacidad del nivel gratuito de Gemini (§7).
- **[Marc]** Dirección visual concreta (paleta, acento): validar con maquetas antes de construir.
- **[Constructor]** Sincronización entre tareas y eventos del calendario "Tareas", estrategia de capturas sin conexión.
