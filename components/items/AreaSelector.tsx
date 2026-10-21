'use client';

import { useRouter } from 'next/navigation';
import { Segmented } from '@/components/ui';
import type { Area } from '@/lib/db/types';

const OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'trabajo', label: 'Trabajo' },
] as const;

/** Personal / Trabajo on /tareas. The area lives in the URL (?area=trabajo), so each view has its own address. */
export function AreaSelector({ area }: { area: Area }) {
  const router = useRouter();
  return (
    <div className="app-segmented">
      <Segmented
        label="Área"
        options={[...OPTIONS]}
        value={area}
        onChange={(next) => router.replace(next === 'trabajo' ? '/tareas?area=trabajo' : '/tareas', { scroll: false })}
      />
    </div>
  );
}
