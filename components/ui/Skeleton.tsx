import type { CSSProperties, ReactNode } from 'react';

/*
 * Glass skeletons: the shape of a screen while its data streams in. A quiet sheen sweeps over
 * the bars (none with prefers-reduced-motion); never a spinner. Server-safe (no hooks).
 */

/** Varied, stable widths so the rows read as text, not as a grid. */
const TITLE_WIDTHS = ['62%', '48%', '74%', '55%', '68%', '42%', '58%'];
const SUBTITLE_WIDTHS = ['38%', '30%', '44%', '26%', '34%', '40%', '28%'];

export function SkeletonBar({
  width = '60%',
  height = 14,
  radius,
  style,
}: {
  width?: number | string;
  height?: number;
  /** Defaults to a soft pill for text; pass a number for tiles or 999 for circles. */
  radius?: number;
  style?: CSSProperties;
}) {
  return <span className="ui-skeleton" style={{ width, height, borderRadius: radius ?? Math.min(7, height / 2), ...style }} />;
}

export type SkeletonRowShape = {
  /** A completion circle on the left (task lists). */
  check?: boolean;
  /** A square tile on the left (book covers, icon tiles). */
  tile?: boolean;
  subtitle?: boolean;
  /** A short value on the right (a time). */
  detail?: boolean;
  /** A 44 pt icon button on the right (Bandeja's "Mover"). */
  trailing?: boolean;
};

export function SkeletonRow({ index = 0, check, tile, subtitle = true, detail, trailing }: SkeletonRowShape & { index?: number }) {
  return (
    <div className={check ? 'ui-row app-item ui-skeleton-row' : 'ui-row ui-skeleton-row'}>
      {check && (
        <span className="app-item__check" aria-hidden>
          <SkeletonBar width={22} height={22} radius={999} />
        </span>
      )}
      <span className="ui-row__body">
        {tile && <SkeletonBar width={34} height={34} radius={8} />}
        <span className="ui-row__text">
          <SkeletonBar width={TITLE_WIDTHS[index % TITLE_WIDTHS.length]} height={15} style={{ margin: '3px 0' }} />
          {subtitle && <SkeletonBar width={SUBTITLE_WIDTHS[index % SUBTITLE_WIDTHS.length]} height={12} style={{ margin: '4px 0 2px' }} />}
        </span>
        {detail && <SkeletonBar width={40} height={13} />}
        {trailing && (
          <span className="ui-skeleton-row__trailing" aria-hidden>
            <SkeletonBar width={22} height={22} radius={7} />
          </span>
        )}
      </span>
    </div>
  );
}

/** An inset grouped section of skeleton rows; `header` is real text (it is known up front). */
export function SkeletonList({ rows = 5, header, ...shape }: SkeletonRowShape & { rows?: number; header?: string }) {
  return (
    <section className="ui-inset-list">
      {header ? <h2 className="ui-inset-list__header">{header}</h2> : null}
      <ul className="ui-inset-list__group">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i}>
            <SkeletonRow index={i} {...shape} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Marks a loading region for assistive tech; the bars themselves are hidden from it. */
export function SkeletonRegion({ label = 'Cargando…', children }: { label?: string; children: ReactNode }) {
  return (
    <div className="ui-skeleton-region" aria-busy="true">
      <span className="ui-visually-hidden" role="status">
        {label}
      </span>
      <div aria-hidden>{children}</div>
    </div>
  );
}
