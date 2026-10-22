/**
 * The CaptureBar's types (its type menu), the type each screen starts with, and the bar's pure
 * rules (placeholder, extra fields, Trabajo, Alt+number). No server imports: used by the bar
 * (client) and by quickCapture (lib/capture/web.ts).
 */
import type { Area } from '@/lib/db/types';

/** Auto runs the AI pipeline; the others save that type straight away, without the AI. */
export const QUICK_KINDS = ['auto', 'tarea', 'idea', 'compra', 'regalo', 'libro', 'cita'] as const;
export type QuickKind = (typeof QUICK_KINDS)[number];

export const QUICK_KIND_LABELS: Record<QuickKind, string> = {
  auto: 'Auto',
  tarea: 'Tarea',
  idea: 'Idea',
  compra: 'Compra',
  regalo: 'Regalo',
  libro: 'Libro',
  cita: 'Cita',
};

/** Only Auto (Trabajo = no-AI work task) and Tarea use the Trabajo briefcase; the rest have no area. */
export function usesArea(kind: QuickKind): boolean {
  return kind === 'auto' || kind === 'tarea';
}

/** The field's placeholder: it hints at the type the text will be saved as. */
const PLACEHOLDERS: Record<QuickKind, string> = {
  auto: 'Apunta algo…',
  tarea: 'Apunta una tarea…',
  idea: 'Apunta una idea…',
  compra: 'Apunta una compra…',
  regalo: 'Apunta un regalo…',
  libro: 'Apunta un libro…',
  cita: 'Apunta una cita…',
};

export function capturePlaceholder(kind: QuickKind): string {
  return PLACEHOLDERS[kind];
}

/** The small fields under the text, per type (none for Auto, Idea and Compra). */
export type CaptureExtra = 'fecha' | 'hora' | 'fin' | 'persona' | 'autor';

const EXTRAS: Record<QuickKind, readonly CaptureExtra[]> = {
  auto: [],
  tarea: ['fecha', 'hora'],
  idea: [],
  compra: [],
  regalo: ['persona'],
  libro: ['autor'],
  cita: ['fecha', 'hora', 'fin'],
};

export function captureExtras(kind: QuickKind): readonly CaptureExtra[] {
  return EXTRAS[kind];
}

/** Alt/Option + 1…7 picks the type in QUICK_KINDS order. By `code`: on a Mac, Option+1 types "¡". */
export function kindForShortcut(e: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
  code: string;
}): QuickKind | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (!m) return null;
  return QUICK_KINDS[Number(m[1]) - 1] ?? null;
}

/** The hint shown in the type tooltips: "⌥1" on Apple keyboards, "Alt+1" elsewhere. */
export function shortcutHint(kind: QuickKind, apple: boolean): string {
  const n = QUICK_KINDS.indexOf(kind) + 1;
  return apple ? `⌥${n}` : `Alt+${n}`;
}

export type CaptureDefaults = {
  kind: QuickKind;
  /** Regalo's person, under /personas/[id]. */
  personId: string | null;
  /** The switch follows the Tareas screen (`?area`); null leaves it as Marc set it. */
  area: Area | null;
};

/** The chip a screen starts with: /compras → Compra, /tareas → Tarea (with its area)… everything else Auto. */
export function captureDefaults(pathname: string, areaParam: string | null): CaptureDefaults {
  const [, section = '', sub] = pathname.split('/');
  switch (section) {
    case 'compras':
      return { kind: 'compra', personId: null, area: null };
    case 'ideas':
      return { kind: 'idea', personId: null, area: null };
    case 'regalos':
      return { kind: 'regalo', personId: null, area: null };
    case 'libros':
      return { kind: 'libro', personId: null, area: null };
    case 'personas':
      // A person's page: gift ideas for them. The list itself: Auto ("el 14 de febrero es…").
      return sub ? { kind: 'regalo', personId: decodeURIComponent(sub), area: null } : { kind: 'auto', personId: null, area: null };
    case 'agenda':
      return { kind: 'cita', personId: null, area: null };
    case 'tareas':
      return { kind: 'tarea', personId: null, area: areaParam === 'trabajo' ? 'trabajo' : 'personal' };
    default:
      return { kind: 'auto', personId: null, area: null };
  }
}
