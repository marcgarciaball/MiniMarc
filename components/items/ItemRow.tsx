'use client';

import type { ReactNode } from 'react';
import { CheckCircle } from '@/components/icons';
import type { Item } from '@/lib/db/types';

export type ItemRowProps = {
  item: Item;
  subtitle?: string;
  detail?: string;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** Shown under the row (e.g. a Calendar sync problem). */
  notice?: ReactNode;
  /** Signed URL of the item's first photo, shown small at the end of the row. */
  thumb?: string;
};

/** A list row with a completion circle (44pt target) and a tappable body that opens the edit sheet. */
export function ItemRow({ item, subtitle, detail, checked, onToggle, onOpen, notice, thumb }: ItemRowProps) {
  return (
    <>
      <div className="ui-row app-item">
        <button
          type="button"
          className="app-item__check"
          role="checkbox"
          aria-checked={checked}
          aria-label={`Completar «${item.title}»`}
          onClick={onToggle}
        >
          <CheckCircle checked={checked} />
        </button>
        <button type="button" className="ui-row__body app-item__body" onClick={onOpen}>
          <span className="ui-row__text">
            <span className="ui-row__title" data-done={checked || undefined}>
              {item.title}
            </span>
            {subtitle && <span className="ui-row__subtitle">{subtitle}</span>}
          </span>
          {detail && <span className="ui-row__detail">{detail}</span>}
          {thumb && <RowThumb url={thumb} />}
        </button>
      </div>
      {notice}
    </>
  );
}

/** Small photo at the end of a list row (decorative: the title says what it is). */
export function RowThumb({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, no optimizer
  return <img className="app-item__thumb" src={url} alt="" loading="lazy" decoding="async" />;
}
