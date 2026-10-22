/**
 * Server side of «Guardar» on /compartir (app/actions/share.ts), testable. Called only from the
 * confirm page, through same-origin server actions; never straight from a share POST (I-1).
 * Text and links go through the CaptureBar's quick capture in Auto mode (same rules: AI unless
 * it fails, never lost). Images make an idea with the shared text as its title ("Foto
 * compartida" without text), without the AI; the browser then uploads each photo straight to
 * Storage with the session (no request body limit). Never logs the text.
 */
import { attempt, UserError, type ActionResult } from '@/lib/actions/result';
import { MAX_CAPTURE_LENGTH } from '@/lib/capture/handler';
import { textFields } from '@/lib/capture/pipeline';
import type { QuickCapture } from '@/lib/capture/web';
import type { Item, NewItem } from '@/lib/db/types';
import { SHARE_PHOTO_TITLE } from './payload';

export interface ShareDeps {
  /** The CaptureBar's action core with the session's deps (`quickCapture` in lib/capture/web.ts). */
  quickCapture(fd: FormData): Promise<ActionResult<QuickCapture>>;
  createItem(input: NewItem): Promise<Item>;
}

/** Session deps; redirects to /login (throws) without an allowed session. */
export type ShareDepsFactory = () => Promise<ShareDeps>;

const SAVE_FAILED = 'No se ha podido guardar. Inténtalo de nuevo.';
const NOTHING = 'No había nada que guardar';

function readText(text: unknown, allowEmpty: boolean): string {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t && !allowEmpty) throw new UserError(NOTHING);
  if (t.length > MAX_CAPTURE_LENGTH) throw new UserError(`El texto supera los ${MAX_CAPTURE_LENGTH} caracteres`);
  return t;
}

/** Shared text or link → quick capture in Auto mode. */
export async function saveSharedText(
  text: unknown,
  deps: ShareDepsFactory,
  rethrow?: (e: unknown) => void,
): Promise<ActionResult<{ message: string }>> {
  return attempt(
    async () => {
      const value = readText(text, false);
      const d = await deps();
      const form = new FormData();
      form.set('text', value);
      form.set('kind', 'auto');
      const r = await d.quickCapture(form);
      if (!r.ok) throw new UserError(r.error);
      return { message: r.value.message };
    },
    SAVE_FAILED,
    rethrow,
  );
}

/** Shared images → an idea (no AI); the browser uploads the photos to it afterwards. */
export async function createSharedIdea(
  text: unknown,
  deps: ShareDepsFactory,
  rethrow?: (e: unknown) => void,
): Promise<ActionResult<{ itemId: string }>> {
  return attempt(
    async () => {
      const value = readText(text, true);
      const d = await deps();
      try {
        const item = await d.createItem({
          type: 'idea',
          ...(value ? textFields(value) : { title: SHARE_PHOTO_TITLE, notes: null }),
          origin: 'web',
          sourceText: value || null,
        });
        return { itemId: item.id };
      } catch (err) {
        rethrow?.(err);
        console.error('share: could not create the idea');
        throw new UserError(SAVE_FAILED);
      }
    },
    SAVE_FAILED,
    rethrow,
  );
}
