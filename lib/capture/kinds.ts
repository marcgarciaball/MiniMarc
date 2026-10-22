/**
 * The CaptureBar's type chips and the chip each screen starts with. No server imports:
 * used by the bar (client) and by quickCapture (lib/capture/web.ts).
 */
import type { Area } from '@/lib/db/types';

/** Auto runs the AI pipeline; the others save that type straight away, without the AI. */
export const QUICK_KINDS = ['auto', 'tarea', 'idea', 'compra', 'regalo', 'cita'] as const;
export type QuickKind = (typeof QUICK_KINDS)[number];

export const QUICK_KIND_LABELS: Record<QuickKind, string> = {
  auto: 'Auto',
  tarea: 'Tarea',
  idea: 'Idea',
  compra: 'Compra',
  regalo: 'Regalo',
  cita: 'Cita',
};

/** Only Auto (Trabajo = no-AI work task) and Tarea use the Personal/Trabajo switch. */
export function usesArea(kind: QuickKind): boolean {
  return kind === 'auto' || kind === 'tarea';
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
