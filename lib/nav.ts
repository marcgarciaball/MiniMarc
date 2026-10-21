/** App sections, as used by the tab bar (iPhone) and the sidebar (desktop). */
export type Section = 'hoy' | 'agenda' | 'tareas' | 'ideas' | 'compras' | 'regalos' | 'sin-clasificar' | 'listas' | 'ajustes';

const SECTIONS: Section[] = ['hoy', 'agenda', 'tareas', 'ideas', 'compras', 'regalos', 'sin-clasificar', 'listas', 'ajustes'];

/** Section of a pathname ("/regalos/123" → "regalos"), or null outside the app. */
export function sectionFor(pathname: string): Section | null {
  const first = pathname.split('/')[1] ?? '';
  return (SECTIONS as string[]).includes(first) ? (first as Section) : null;
}

/** The tab bar has fewer slots: every list lives under "Listas". */
export function tabFor(section: Section | null): string {
  if (section === 'ideas' || section === 'compras' || section === 'regalos' || section === 'sin-clasificar') {
    return 'listas';
  }
  return section ?? '';
}

/** "Volver a entrar con Google" when Calendar refuses: forces Google's consent so a fresh refresh token comes back. */
export const RECONNECT_HREF = '/login?reconsent=1';
