'use client';

import type { ReactNode } from 'react';
import { CheckCircle } from '@/components/icons';
import { LinkPreviewCard } from '@/components/links/LinkPreviewCard';
import { LinkText } from '@/components/links/LinkText';
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

/**
 * A list row with a completion circle (44pt target) and a tappable body that opens the edit
 * sheet. URLs in the title and subtitle are links; the item's link shows as a preview card below.
 */
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
        <div className="ui-row__body app-item__body app-press">
          <button type="button" className="app-press__hit" aria-label={`Abrir «${item.title}»`} onClick={onOpen} />
          <span className="ui-row__text">
            <span className="ui-row__title" data-done={checked || undefined}>
              <LinkText text={item.title} />
            </span>
            {subtitle && (
              <span className="ui-row__subtitle">
                <LinkText text={subtitle} />
              </span>
            )}
          </span>
          {detail && <span className="ui-row__detail">{detail}</span>}
          {thumb && <RowThumb url={thumb} />}
        </div>
      </div>
      {item.link && <LinkPreviewCard item={item} inRow />}
      {notice}
    </>
  );
}

/** Small photo at the end of a list row (decorative: the title says what it is). */
export function RowThumb({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, no optimizer
  return <img className="app-item__thumb" src={url} alt="" loading="lazy" decoding="async" />;
}
