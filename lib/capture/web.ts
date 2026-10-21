/**
 * The CaptureBar's server action (app/actions/capture.ts), testable: the pipeline deps come in
 * through `WebCaptureDeps`. Same rules as POST /api/capture, but it answers with an
 * ActionResult so the bar keeps the typed text on any failure. Never logs the text.
 */
import { attempt, UserError, type ActionResult } from '@/lib/actions/result';
import { captureMessage, MAX_CAPTURE_LENGTH } from './handler';
import { captureText, EmptyCaptureError, type CaptureDeps, type CaptureInput } from './pipeline';

export interface WebCaptureDeps {
  /** The signed-in user's pipeline deps (redirects to /login without a session). */
  captureDeps: () => Promise<CaptureDeps>;
  /** Defaults to `captureText`; tests spy on it. */
  capture?: typeof captureText;
  /** Next's `unstable_rethrow`, so redirect() still works. */
  rethrow?: (e: unknown) => void;
}

export type WebCapture = { message: string };

const SAVE_FAILED = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const EMPTY = 'El texto está vacío';

/**
 * Reads `text` and `area` ('trabajo' when the bar's Trabajo switch is on; anything else is
 * ignored) and runs the capture pipeline with origin 'web'. Trabajo goes to the pipeline's
 * no-AI path. On success, `message` is the same "Guardado en …" Siri speaks.
 */
export async function captureFromWeb(fd: FormData, deps: WebCaptureDeps): Promise<ActionResult<WebCapture>> {
  const capture = deps.capture ?? captureText;
  return attempt(
    async () => {
      const captureDeps = await deps.captureDeps();
      const raw = fd.get('text');
      const text = typeof raw === 'string' ? raw : '';
      if (!text.trim()) throw new UserError(EMPTY);
      if (text.length > MAX_CAPTURE_LENGTH) throw new UserError(`El texto supera los ${MAX_CAPTURE_LENGTH} caracteres`);
      const input: CaptureInput = { text, origin: 'web' };
      if (fd.get('area') === 'trabajo') input.area = 'trabajo';
      try {
        return { message: captureMessage(await capture(input, captureDeps)) };
      } catch (err) {
        if (err instanceof EmptyCaptureError) throw new UserError(EMPTY);
        deps.rethrow?.(err);
        console.error('web capture failed:', err instanceof Error ? err.message : 'unknown error');
        throw err;
      }
    },
    SAVE_FAILED,
    deps.rethrow,
  );
}
