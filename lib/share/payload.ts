/**
 * Android share target (manifest `share_target`, POST /compartir), the parts shared by the
 * service worker flow, the /compartir confirm page and the proxy. Pure: safe in client code.
 *
 * Flow (I-1, CSRF): the service worker keeps the shared title/text/url and the shrunk images in
 * IndexedDB (lib/share/stash.ts) and redirects to GET /compartir?id=…; nothing reaches the
 * server until Marc taps «Guardar» there (same-origin server actions, Origin-checked by Next).
 * A POST that reaches the server anyway (no service worker yet, or a cross-site form) gets a
 * 303 to /compartir from the proxy, with no side effects.
 */
import { MAX_PHOTO_BYTES } from '@/lib/photos/resize';

/** Field name of the shared files in the manifest's `share_target.params.files`. */
export const SHARE_FILES_FIELD = 'photos';
export const SHARE_PHOTO_TITLE = 'Foto compartida';
/** More than this many images in one share are ignored. */
export const MAX_SHARED_PHOTOS = 10;
export const SHARE_PATH = '/compartir';

/** Title, text and URL, one per line, leaving out whatever the text already contains. */
export function shareText(f: { title?: string; text?: string; url?: string }): string {
  const title = (f.title ?? '').trim();
  const text = (f.text ?? '').trim();
  const url = (f.url ?? '').trim();
  const parts = [title && !text.includes(title) ? title : '', text, url && !text.includes(url) ? url : ''];
  return parts.filter(Boolean).join('\n');
}

/** Images worth uploading: non-empty, within the bucket's size limit, at most MAX_SHARED_PHOTOS. */
export function pickSharedImages<T extends { type: string; size: number }>(files: T[]): T[] {
  return files.filter((f) => f.size > 0 && f.size <= MAX_PHOTO_BYTES && f.type.startsWith('image/')).slice(0, MAX_SHARED_PHOTOS);
}

/** The toast after saving a shared image idea, given how many photos made it. */
export function sharedPhotosMessage(saved: number, total: number): string {
  if (saved === total) return saved === 1 ? 'Guardado en Ideas con la foto' : `Guardado en Ideas con ${saved} fotos`;
  if (saved === 0) return `Guardado en Ideas, pero no se ha podido subir ${total === 1 ? 'la foto' : 'ninguna foto'}`;
  return `Guardado en Ideas con ${saved} de ${total} fotos`;
}

/**
 * True for a POST to /compartir that is not one of the confirm page's server actions (those
 * carry `Next-Action`, a header a cross-site form cannot send). The proxy answers it with 303.
 */
export function isDirectSharePost(method: string, pathname: string, headers: Headers): boolean {
  return method === 'POST' && pathname === SHARE_PATH && !headers.has('next-action');
}
