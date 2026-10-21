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
};

/** A list row with a completion circle (44pt target) and a tappable body that opens the edit sheet. */
export function ItemRow({ item, subtitle, detail, checked, onToggle, onOpen, notice }: ItemRowProps) {
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
        </button>
      </div>
      {notice}
    </>
  );
}
