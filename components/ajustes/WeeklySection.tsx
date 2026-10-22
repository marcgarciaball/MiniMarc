'use client';

import { useState, useTransition } from 'react';
import { setWeeklyDigest } from '@/app/actions/settings';
import { InsetList, Row } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import { WEEKLY_OPTIONS, type WeeklyDigest } from '@/lib/db/settings';

export type WeeklySectionProps = {
  /** Null while loading. */
  value: WeeklyDigest | null;
};

const LABELS: Record<WeeklyDigest, string> = {
  lunes: 'Lunes 08:00',
  domingo: 'Domingo 20:00',
  off: 'Desactivado',
};

const FOOTERS: Record<WeeklyDigest, string> = {
  lunes: 'El lunes por la mañana, la semana que empieza. Se abre en Semana.',
  domingo: 'El domingo por la noche, la semana siguiente. Se abre en Semana.',
  off: 'Sin aviso semanal. La semana sigue en Hoy → Ver la semana.',
};

/** Ajustes → "Resumen semanal": when the weekly push goes out (or never). */
export function WeeklySection({ value }: WeeklySectionProps) {
  const [chosen, setChosen] = useState<WeeklyDigest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = chosen ?? value;

  function change(next: WeeklyDigest) {
    const previous = current;
    setChosen(next);
    setError(null);
    startTransition(async () => {
      const r = await settle(() => setWeeklyDigest(next), 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.');
      if (!r.ok) {
        setChosen(previous);
        setError(r.error);
      }
    });
  }

  return (
    <InsetList header="Resumen semanal" footer={error ?? (current ? FOOTERS[current] : undefined)}>
      <Row
        title="Aviso"
        trailing={
          <select
            className="app-select"
            aria-label="Cuándo llega el resumen semanal"
            value={current ?? ''}
            disabled={current === null || pending}
            onChange={(e) => change(e.target.value as WeeklyDigest)}
          >
            {current === null && <option value="">—</option>}
            {WEEKLY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {LABELS[o]}
              </option>
            ))}
          </select>
        }
      />
    </InsetList>
  );
}
