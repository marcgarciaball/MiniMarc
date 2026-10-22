/**
 * POST /compartir: the PWA's Android share target (manifest `share_target`), testable.
 * Text and links go through the CaptureBar's quick capture in Auto mode (same rules: AI unless
 * it fails, never lost). Images make an idea with the images attached and the shared text as its
 * title ("Foto compartida" without text), without the AI. Then back to /bandeja with a toast
 * saying where it went (`?guardado=`). Without a session → /login. Never logs the text.
 */
import type { ActionResult } from '@/lib/actions/result';
import { textFields } from '@/lib/capture/pipeline';
import type { QuickCapture } from '@/lib/capture/web';
import type { Item, NewItem } from '@/lib/db/types';
import { MAX_PHOTO_BYTES } from '@/lib/photos/resize';

export interface ShareDeps {
  /** The signed-in, allowed user's id, or null. */
  userId(): Promise<string | null>;
  /** The CaptureBar's action core with the session's deps (`quickCapture` in lib/capture/web.ts). */
  quickCapture(fd: FormData): Promise<ActionResult<QuickCapture>>;
  createItem(input: NewItem): Promise<Item>;
  /** Uploads one image to the user's folder and records it on the item. */
  savePhoto(userId: string, itemId: string, file: File): Promise<void>;
}

/** Field name of the shared files in the manifest's `share_target.params.files`. */
export const SHARE_FILES_FIELD = 'photos';
export const SHARE_PHOTO_TITLE = 'Foto compartida';
/** More than this many images in one share are ignored. */
export const MAX_SHARED_PHOTOS = 10;

const SAVE_FAILED = 'No se ha podido guardar. Inténtalo de nuevo.';
const NOTHING = 'No había nada que guardar';

/** Title, text and URL, one per line, leaving out whatever the text already contains. */
export function shareText(f: { title?: string; text?: string; url?: string }): string {
  const title = (f.title ?? '').trim();
  const text = (f.text ?? '').trim();
  const url = (f.url ?? '').trim();
  const parts = [title && !text.includes(title) ? title : '', text, url && !text.includes(url) ? url : ''];
  return parts.filter(Boolean).join('\n');
}

function redirectTo(req: Request, path: string, message?: string): Response {
  const url = new URL(path, req.url);
  if (message) url.searchParams.set('guardado', message);
  // 303: the browser follows with a GET (the share is a POST).
  return new Response(null, { status: 303, headers: { Location: url.pathname + url.search } });
}

function sharedImages(fd: FormData): File[] {
  return fd
    .getAll(SHARE_FILES_FIELD)
    .filter((v): v is File => typeof v !== 'string' && v.size > 0 && v.size <= MAX_PHOTO_BYTES && v.type.startsWith('image/'))
    .slice(0, MAX_SHARED_PHOTOS);
}

const str = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};

export async function handleShare(req: Request, deps: ShareDeps): Promise<Response> {
  const userId = await deps.userId();
  if (!userId) return redirectTo(req, '/login');

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return redirectTo(req, '/bandeja', NOTHING);
  }
  const text = shareText({ title: str(fd, 'title'), text: str(fd, 'text'), url: str(fd, 'url') });
  const images = sharedImages(fd);

  if (images.length > 0) return redirectTo(req, '/bandeja', await saveImages(userId, text, images, deps));
  if (!text) return redirectTo(req, '/bandeja', NOTHING);

  const form = new FormData();
  form.set('text', text);
  form.set('kind', 'auto');
  const r = await deps.quickCapture(form);
  return redirectTo(req, '/bandeja', r.ok ? r.value.message : r.error);
}

async function saveImages(userId: string, text: string, images: File[], deps: ShareDeps): Promise<string> {
  let item: Item;
  try {
    item = await deps.createItem({
      type: 'idea',
      ...(text ? textFields(text) : { title: SHARE_PHOTO_TITLE, notes: null }),
      origin: 'web',
      sourceText: text || null,
    });
  } catch {
    console.error('share: could not create the idea');
    return SAVE_FAILED;
  }
  let saved = 0;
  for (const file of images) {
    try {
      await deps.savePhoto(userId, item.id, file);
      saved++;
    } catch (err) {
      console.error('share: photo upload failed:', err instanceof Error ? err.message : 'unknown error');
    }
  }
  if (saved === images.length) return saved === 1 ? 'Guardado en Ideas con la foto' : `Guardado en Ideas con ${saved} fotos`;
  if (saved === 0) return `Guardado en Ideas, pero no se ha podido subir ${images.length === 1 ? 'la foto' : 'ninguna foto'}`;
  return `Guardado en Ideas con ${saved} de ${images.length} fotos`;
}
