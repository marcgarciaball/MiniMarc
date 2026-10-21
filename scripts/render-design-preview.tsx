/**
 * Renders the /dev/design showcase into a self-contained static file:
 *   npx tsx scripts/render-design-preview.tsx
 *   (if the tsx CLI cannot open its IPC pipe: node --import tsx scripts/render-design-preview.tsx)
 * Output: docs/design/preview.html (all CSS inlined, no JavaScript).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignShowcase } from '@/app/dev/design/Showcase';

const root = path.resolve(__dirname, '..');
const CSS_FILES = ['styles/tokens.css', 'app/globals.css', 'components/ui/ui.css', 'components/app/app.css', 'app/dev/design/design.css'];

const css = CSS_FILES.map((file) => `/* ${file} */\n${readFileSync(path.join(root, file), 'utf8')}`).join('\n');
const body = renderToStaticMarkup(<DesignShowcase today={new Date()} />);

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#eef2f7">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121a24">
<title>Sistema visual · Agente Personal</title>
<style>
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;

const out = path.join(root, 'docs/design/preview.html');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Escrito ${path.relative(root, out)}`);
