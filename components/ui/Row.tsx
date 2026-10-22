import Link from 'next/link';
import type { ReactNode } from 'react';
import { LinkPending } from './LinkPending';

export type RowProps = {
  title: string;
  subtitle?: string;
  /** Secondary value on the right, e.g. "10:00". */
  detail?: string;
  /** Icon tile (`.ui-icon-tile`), checkbox… */
  leading?: ReactNode;
  /** Control on the right, e.g. a `<Switch>`. */
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Disclosure chevron. Defaults to `true` when `href` is set. */
  chevron?: boolean;
};

function Chevron() {
  return (
    <svg className="ui-row__chevron" viewBox="0 0 8 14" aria-hidden>
      <path d="M1.5 1.5L6.5 7L1.5 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One line of an InsetList. Renders a link, a button or static content. */
export function Row({ title, subtitle, detail, leading, trailing, href, onClick, chevron }: RowProps) {
  const content = (
    <>
      {leading && <span className="ui-row__leading">{leading}</span>}
      <span className="ui-row__body">
        <span className="ui-row__text">
          <span className="ui-row__title">{title}</span>
          {subtitle && <span className="ui-row__subtitle">{subtitle}</span>}
        </span>
        {detail && <span className="ui-row__detail">{detail}</span>}
        {trailing && <span className="ui-row__trailing">{trailing}</span>}
        {(chevron ?? Boolean(href)) && <Chevron />}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="ui-row">
        {content}
        <LinkPending />
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="ui-row" onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="ui-row">{content}</div>;
}
