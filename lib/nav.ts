/** App sections, as used by the tab bar (iPhone) and the sidebar (desktop). */
export type Section =
  | 'hoy'
  | 'semana'
  | 'agenda'
  | 'tareas'
  | 'ideas'
  | 'compras'
  | 'regalos'
  | 'libros'
  | 'personas'
  | 'sin-clasificar'
  | 'bandeja'
  | 'listas'
  | 'ajustes';

const SECTIONS: Section[] = [
  'hoy',
  'semana',
  'agenda',
  'tareas',
  'ideas',
  'compras',
  'regalos',
  'libros',
  'personas',
  'sin-clasificar',
  'bandeja',
  'listas',
  'ajustes',
];

/** Section of a pathname ("/regalos/123" → "regalos"), or null outside the app. */
export function sectionFor(pathname: string): Section | null {
  const first = pathname.split('/')[1] ?? '';
  return (SECTIONS as string[]).includes(first) ? (first as Section) : null;
}

/** The tab bar has fewer slots: every list lives under "Listas"; the week under "Hoy". */
export function tabFor(section: Section | null): string {
  if (section === 'semana') return 'hoy';
  if (
    section === 'ideas' ||
    section === 'compras' ||
    section === 'regalos' ||
    section === 'libros' ||
    section === 'personas' ||
    section === 'sin-clasificar' ||
    section === 'bandeja'
  ) {
    return 'listas';
  }
  return section ?? '';
}

/** "Volver a entrar con Google" when Calendar refuses: forces Google's consent so a fresh refresh token comes back. */
export const RECONNECT_HREF = '/login?reconsent=1';

/** The Bandeja ("Recién añadido"): what was captured in the last 24 h. */
export const BANDEJA_HREF = '/bandeja';

/** id of the CaptureBar's field. "Capturar" focuses it; without it (no JS yet) it opens the Bandeja. */
export const CAPTURE_INPUT_ID = 'capturar';
