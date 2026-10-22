# Agente Personal — Mejoras (documento de diseño)

Fecha: 2026-10-22 · Usuario: Marc (un solo usuario) · Amplía `2026-10-21-agente-personal-design.md`

Leyenda: **[Marc]** = lo dijo o decidió Marc. **[Mi decisión]** = decisión mía que Marc debe revisar.

## 1. Intención y por qué

La v1 está entregada: las seis fases del plan original más personas, libros, fotos, enlaces, buscador, agenda semanal y exportación. Lo que queda son los huecos que todavía obligan a Marc a acordarse de las cosas por su cuenta, que es justo lo que la app venía a evitar.

Marc revisó la lista de huecos y aprobó los diez, mayores y menores. **[Marc]**

## 2. Qué se construye

**Confianza (lo que ataca el anti-objetivo «se pierde o no vuelve a aparecer»)**

1. **Tareas que se repiten.** Cada día, semana, mes o año. Al completar una, la siguiente aparece sola con su fecha y su aviso en Calendar. Hoy sacar la basura los martes no cabe en el sistema y vive en la cabeza de Marc.
2. **Posponer.** Una tarea con fecha se empuja a esta tarde, mañana o la semana que viene, desde la hoja de edición y desde Hoy.
3. **Repaso de lo olvidado.** Lo guardado sin fecha (ideas, compras, regalos) que lleva más de 30 días sin tocarse vuelve a aparecer en Hoy, como mucho tres a la vez, con dos respuestas: «Sí» (sigue en pie, vuelve a esconderse 30 días) o «Ya no» (a la papelera).
4. **Capturar sin cobertura.** Si la captura falla por falta de red, el texto queda en el dispositivo y se envía solo al recuperar la conexión, sin que Marc tenga que hacer nada.

**Robustez**

5. **Estado del sistema** en Ajustes: cuándo corrió la tarea horaria por última vez, cuándo salió el último resumen, si Google Calendar responde y cuántos elementos están sin sincronizar, si hay avisos activos. Si algo se rompe en silencio, Marc lo ve.
6. **Tests de las pantallas**, que hoy no tienen ninguno.
7. **Restaurar** desde un export JSON, y **copia automática semanal** guardada en Supabase Storage (las últimas cuatro).

**Menores**

8. **Etiquetas** en los elementos, con la pantalla de Compras agrupada por la primera etiqueta (la tienda).
9. **Marcar varias a la vez** en cualquier lista.
10. **Subtareas** dentro de un elemento.
11. **Siri que lee el día**: un atajo que pregunta «¿Qué tengo hoy?» y Siri lo cuenta en voz alta.

## 3. Objetivos, no objetivos, anti-objetivos

**Objetivos**
- Que nada que Marc guarde dependa de que él se acuerde de volver a mirarlo.
- Que un fallo de infraestructura (cron parado, sesión de Google caducada) sea visible, no silencioso.
- Seguir costando 0 €.

**No objetivos**
- Reglas de repetición complejas (cada segundo martes, días de la semana sueltos): cuatro periodos y ya.
- Edición sin conexión: solo la **captura** se encola. Marcar, editar o borrar sin red siguen fallando con su aviso.
- Multiusuario, compartir, colaboración.
- Un planificador propio: los avisos siguen llegando por Google Calendar y push.

**Anti-objetivos**
- Que el repaso se vuelva una lista de deberes: tres elementos como mucho, y «Ya no» siempre a un toque.
- Que la cola de capturas duplique elementos al reintentar.
- Que restaurar una copia machaque datos buenos.
- Más notificaciones de las que ya hay. Ninguna de estas mejoras añade un push nuevo.

## 4. Restricciones

- **Trabajo nunca pasa por la IA**, igual que en la v1. El repaso y el texto hablado de Siri salen de la base de datos, no de un prompt.
- Las migraciones se aplican a mano en Supabase: toda columna nueva es opcional y la app debe funcionar antes de aplicarla, como ya hacen `lib/db/items.ts` y `lib/db/settings.ts`.
- El diseño no cambia: vidrio esmerilado, acento azul glaciar único, estructura de iOS.
- Nada de servicios nuevos. Las copias caben en el 1 GB gratuito de Storage.

## 5. Decisiones de quien construye **[Mi decisión]**

- **Al completar una tarea repetida se crea una fila nueva** para la ocurrencia siguiente y la actual queda como hecha, igual que Recordatorios de Apple: se conserva el histórico y el evento de Calendar de cada una es independiente.
- **Una repetición vencida salta al futuro:** se avanzan tantos periodos como haga falta, no uno solo. Una tarea semanal olvidada seis semanas no reaparece seis veces vencida.
- **La hora local manda:** una tarea a las 09:00 de Madrid sigue a las 09:00 cruzando el cambio de hora. Mensual desde el 31 y anual desde el 29 de febrero recortan al último día del mes.
- **La «tienda» de la compra es una etiqueta**, no una columna propia: una idea menos que aprender y sirve igual en Ideas o Regalos.
- **Las subtareas son de un solo nivel** y no aparecen en las listas de su tipo: viven dentro de su elemento.
- **Las pantallas se prueban con Testing Library sobre jsdom**, no con Playwright: cubre la lógica de las pantallas sin levantar servidor ni base de datos y encaja con la suite de vitest. Queda fuera a propósito lo que jsdom no ve: gestos reales, física de las hojas y aspecto visual.
- **Restaurar nunca sobrescribe:** lo que ya existe se salta y se cuenta.

## 6. Lo que queda abierto

- **[Marc]** Si 30 días es el plazo correcto para el repaso, o prefiere más o menos.
- **[Marc]** Si las copias semanales deberían poder descargarse desde Ajustes además de vivir en Storage.
