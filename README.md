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

Paleta de neutros cálidos tipo papel (`#f2eee8` / `#0f0e0c`) con un único acento arcilla (`#b04e26` claro, `#e07a4c` oscuro): un tono natural y terroso que se lee como iOS sin caer en los morados y azules típicos de las apps de IA.

Tokens en `styles/tokens.css`, componentes en `components/ui`, catálogo en `/dev/design`. Vista estática sin servidor: `npx tsx scripts/render-design-preview.tsx` → `docs/design/preview.html`.
