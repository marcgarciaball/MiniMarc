'use client';

import { useRouter } from 'next/navigation';
import { Segmented } from '@/components/ui';
import type { Area } from '@/lib/db/types';

const OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'trabajo', label: 'Trabajo' },
] as const;

/**
 * Personal / Trabajo on /tareas and /sin-clasificar. The area lives in the URL (?area=trabajo),
 * so each view has its own address.
 */
export function AreaSelector({ area, basePath = '/tareas' }: { area: Area; basePath?: string }) {
  const router = useRouter();
  return (
    <div className="app-segmented">
      <Segmented
        label="Área"
        options={[...OPTIONS]}
        value={area}
        onChange={(next) => router.replace(next === 'trabajo' ? `${basePath}?area=trabajo` : basePath, { scroll: false })}
      />
    </div>
  );
}
