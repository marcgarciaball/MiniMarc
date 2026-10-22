'use client';

import { useLinkStatus } from 'next/link';

/**
 * Put inside a `<Link>`: a fixed-size hint that lights up while that navigation is pending
 * (not yet prefetched), so a tap is never met with nothing. CSS dims the link and runs a thin
 * glacier progress line; no layout shift.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span className="ui-link-pending" data-pending={pending || undefined} aria-hidden />;
}
