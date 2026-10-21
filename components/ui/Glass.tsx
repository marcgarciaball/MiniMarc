import type { HTMLAttributes, ReactNode, Ref } from 'react';

export type GlassProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'header' | 'nav' | 'footer' | 'section';
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
};

/** Translucent iOS material: blurs and tints whatever scrolls behind it. */
export function Glass({ as: Tag = 'div', ref, className, children, ...rest }: GlassProps) {
  return (
    // HTMLDivElement is the narrowest of the allowed tags, so this ref fits all of them.
    <Tag ref={ref as Ref<HTMLDivElement>} className={className ? `ui-glass ${className}` : 'ui-glass'} {...rest}>
      {children}
    </Tag>
  );
}
