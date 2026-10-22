# Extensión de Chrome para Agente Personal

La extensión sirve para capturar rápido desde el navegador y ver el resumen de Hoy. Habla con https://mini-marc-personal.vercel.app mediante `POST /api/capture` y `GET /api/hoy`, con un token de acceso.

## 1. Compilar (solo si cambias el código)

El repositorio ya incluye `extension/dist/` compilado, así que para usarla basta con el paso 2. Si editas `extension/*.ts`:

```sh
npm run build:extension
```

Este comando compila `popup.ts`, `options.ts` y `lib/*.ts` con `tsc` y deja el resultado en `extension/dist/`.

## 2. Cargar la extensión descomprimida

1. En Chrome, abre `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige la carpeta `extension/` del repositorio (la que contiene `manifest.json`).
4. Fija el icono en la barra: menú del puzle → chincheta junto a «Agente Personal».

Si recompilas, pulsa el botón de recargar de la extensión en `chrome://extensions`.

## 3. Crear el token «Extensión»

1. En la app, ve a Ajustes → Tokens de acceso → Nuevo token. Ponle de nombre «Extensión».
2. Copia el token en ese momento, porque solo se muestra una vez.
3. En la extensión, haz clic derecho en el icono → **Opciones** (o usa el enlace «Opciones» del popup).
4. Pega el token y deja la URL por defecto (`https://mini-marc-personal.vercel.app`).
5. Pulsa **Guardar** y después **Probar**. Debe aparecer «OK: conectado».

El token se guarda en `chrome.storage.local`, solo en este ordenador; no se sincroniza con tu cuenta de Google. Para anularlo, revócalo en Ajustes.

## 4. Atajo de teclado

- Mac: **Cmd+Mayús+Y**. Windows/Linux: **Ctrl+Mayús+Y**.
- El atajo abre el popup con el campo de texto ya enfocado. Escribe y pulsa **Intro** para guardar (**Mayús+Intro** añade un salto de línea).
- Si otro programa ya usa ese atajo, cámbialo en `chrome://extensions/shortcuts`.

## 5. Uso

- **Auto** clasifica el texto con la IA, igual que Siri. **Tarea**, **Idea**, **Compra** y **Regalo** guardan directamente con ese tipo, sin pasar por la IA.
- El interruptor **Personal/Trabajo** solo se aplica a Auto y Tarea. Con Trabajo, el texto nunca se envía a la IA. La extensión recuerda la última posición del interruptor.
- Tras guardar, se muestra el mensaje de la app («Guardado en …»).
- Debajo aparece **Hoy**: el titular del día, las citas de hoy y las tareas pendientes de Personal y de Trabajo, con un enlace «Abrir la app». El titular es el que ya generó la app ese día; la extensión nunca provoca una llamada nueva a la IA. Si aún no hay titular, muestra «Buenos días».

## 6. Tokens de Trabajo

Si el nombre del token contiene «trabajo» (por ejemplo, «Extensión trabajo»), toda captura con el modo Auto o Tarea se guarda en Trabajo, aunque el interruptor esté en Personal, y nunca pasa por la IA. Úsalo en el ordenador del trabajo. Hoy sigue mostrando las dos áreas, porque son tus datos y la regla de Trabajo solo afecta a la IA.
