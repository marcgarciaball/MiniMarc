# Agente Personal

PWA personal (Next.js + Supabase + Google Calendar + Gemini) para capturar tareas, ideas, compras y regalos, de un solo usuario.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # rellenar valores
npm run dev                  # http://localhost:3000
npm test                     # vitest run
```

## Diseño

Estilo "boceto conceptual" sobre estructura iOS: tinta casi negra sobre papel crema (`#f3eee3`; en oscuro, tiza `#ede6d8` sobre carbón `#1e1d1a`) con trazos dibujados a mano y una sola tinta plana verde (`#137538` claro, `#4fbf78` oscuro): el verde de imprenta del cartel de referencia, que contrasta AA sobre el papel y se lee como "hecho" o "activo" sin parecer una app de IA.

Fuentes (OFL, autoalojadas en `public/fonts`): Amatic SC (títulos), Caveat (anotaciones) e Instrument Serif (acentos); el texto usa la fuente del sistema. Tokens en `styles/tokens.css`, componentes en `components/ui`, catálogo en `/dev/design`. Vista estática sin servidor: `npx tsx scripts/render-design-preview.tsx` → `docs/design/preview.html`.
