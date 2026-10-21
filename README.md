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

Vidrio esmerilado al estilo Apple (glassmorphism / Liquid Glass) sobre la estructura de iOS, con el azul glaciar del iPhone Pro de Marc como único acento: `#335a80` en claro y `#a8c2dc` en oscuro. Es el azul acero grisáceo del teléfono, oscurecido o aclarado lo justo para pasar AA sobre el vidrio (6,05:1 y 7,86:1 en tarjetas; 4,63:1 y 7,08:1 sobre el fondo desnudo más desfavorable), sin tonos cálidos ni segundo acento.

Superficies translúcidas (`backdrop-filter: blur() saturate()`, borde de luz de 0,5 px y sombra amplia y suave) sobre un fondo fijo de cintas de luz plegadas en tonos glaciar (`#eef2f7` → `#c3d1df`; en oscuro grafito azulado `#0c131b`). Con "Reducir transparencia" las superficies pasan a sólidas. Tipografía solo del sistema (SF Pro). Tokens en `styles/tokens.css`, componentes en `components/ui`, catálogo en `/dev/design`. Vista estática sin servidor: `npx tsx scripts/render-design-preview.tsx` → `docs/design/preview.html`. Referencias de Marc en `docs/design/referencia-*.png`.
