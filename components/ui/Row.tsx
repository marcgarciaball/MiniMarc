import Link from 'next/link';
import type { ReactNode } from 'react';

export type RowProps = {
  title: string;
  subtitle?: string;
  /** Secondary value on the right, e.g. "10:00". */
  detail?: string;
  /** Ink icon (`.ui-icon-tile`), checkbox… */
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
    <svg className="ui-row__chevron" viewBox="0 0 9 15" aria-hidden>
      <path d="M1.5 1.2C3.6 3.4 5.6 5.4 7.4 7.6C5.4 9.6 3.4 11.6 1.2 13.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
