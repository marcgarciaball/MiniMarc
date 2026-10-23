# Agente Personal

PWA personal (Next.js + Supabase + Google Calendar + Gemini) para capturar tareas, ideas, compras, regalos y libros, de un solo usuario.

## Qué hace

- **Captura** desde la app, Siri, la extensión de Chrome o "Compartir" en Android; Gemini la clasifica (nunca lo de Trabajo) y, si falla, queda en "Sin clasificar".
- **Hoy, Agenda y Semana:** citas y tareas con hora sincronizadas con Google Calendar (avisos de 3 h y 1 h); resumen de la mañana y semanal por notificación.
- **Listas:** tareas, ideas, compras, regalos y libros (por leer, leyendo, leídos), con fotos, enlaces con vista previa, papelera de 30 días y buscador sin acentos.
- **Personas:** cumpleaños y fechas especiales con aviso el mismo día.
- **Tus datos:** exportación completa en JSON o de los elementos en CSV desde Ajustes.

Despliegue paso a paso en `docs/despliegue.md`.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # rellenar valores
npm run dev                  # http://localhost:3000
npm test                     # vitest run: toda la suite
npm run test:screens         # solo las pantallas (Testing Library sobre jsdom)
```

Los tests de pantalla (`tests/screens`) montan los componentes con Testing Library y sustituyen las Server Actions por dobles (`tests/screens/setup.ts`); no necesitan servidor ni base de datos. Quedan fuera lo que jsdom no puede comprobar: los gestos de deslizar reales, la física de las hojas, el desenfoque del vidrio y el aspecto visual.

## Diseño

Vidrio esmerilado al estilo Apple (glassmorphism / Liquid Glass) sobre la estructura de iOS, con el azul glaciar del iPhone Pro de Marc como único acento: `#335a80` en claro y `#a8c2dc` en oscuro. Es el azul acero grisáceo del teléfono, oscurecido o aclarado lo justo para pasar AA sobre el vidrio (6,05:1 y 7,86:1 en tarjetas; 4,63:1 y 7,08:1 sobre el fondo desnudo más desfavorable), sin tonos cálidos ni segundo acento.

Superficies translúcidas (`backdrop-filter: blur() saturate()`, borde de luz de 0,5 px y sombra amplia y suave) sobre un fondo fijo de cintas de luz plegadas en tonos glaciar (`#eef2f7` → `#c3d1df`; en oscuro grafito azulado `#0c131b`). Con "Reducir transparencia" las superficies pasan a sólidas. Tipografía solo del sistema (SF Pro). Tokens en `styles/tokens.css`, componentes en `components/ui`, catálogo en `/dev/design`. Vista estática sin servidor: `npx tsx scripts/render-design-preview.tsx` → `docs/design/preview.html`. Referencias de Marc en `docs/design/referencia-*.png`.
