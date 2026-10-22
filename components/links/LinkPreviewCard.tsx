'use client';

import { useState } from 'react';
import type { Item } from '@/lib/db/types';
import { linkHref } from '@/lib/libros';
import { shortUrl } from '@/lib/links/linkify';
import { linkDomain } from '@/lib/links/preview';

export type LinkPreviewCardProps = {
  item: Pick<Item, 'link' | 'linkTitle' | 'linkImage' | 'linkSite'>;
  /** Under a list row: smaller, indented to the text. */
  inRow?: boolean;
};

/**
 * The item's link as a compact card: thumbnail, page title and site. Until the preview is
 * fetched (or when the page gives none) it shows the shortened URL and the domain. The image is
 * loaded straight from the site (no proxy), lazily and without a Referer; if it fails, the
 * domain's initial takes its place.
 */
export function LinkPreviewCard({ item, inRow }: LinkPreviewCardProps) {
  const href = linkHref(item.link);
  const [imageFailed, setImageFailed] = useState(false);
  if (!href) return null;
  const domain = linkDomain(href) ?? '';
  const title = item.linkTitle || shortUrl(href);
  const site = item.linkSite && item.linkSite !== domain ? `${item.linkSite} · ${domain}` : domain;
  const image = item.linkImage && /^https?:\/\//i.test(item.linkImage) && !imageFailed ? item.linkImage : null;

  return (
    <a
      className={inRow ? 'app-link-card app-link-card--row' : 'app-link-card'}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- third-party preview image, never proxied
        <img
          className="app-link-card__image"
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="app-link-card__image app-link-card__image--empty" aria-hidden>
          {domain.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="app-link-card__text">
        <span className="app-link-card__title">{title}</span>
        <span className="app-link-card__site">{site}</span>
      </span>
    </a>
  );
}
