import { Children, type ReactNode } from 'react';

export type InsetListProps = {
  header?: string;
  footer?: string;
  /** Usually `<Row>` elements; each child becomes a list item. */
  children: ReactNode;
};

/** iOS "inset grouped" section: rounded group on the grouped background. */
export function InsetList({ header, footer, children }: InsetListProps) {
  return (
    <section className="ui-inset-list">
      {header && <h2 className="ui-inset-list__header">{header}</h2>}
      <ul className="ui-inset-list__group">
        {Children.map(children, (child) => (child == null || child === false ? null : <li>{child}</li>))}
      </ul>
      {footer && <p className="ui-inset-list__footer">{footer}</p>}
    </section>
  );
}
