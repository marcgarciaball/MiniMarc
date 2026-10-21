import type { HTMLAttributes, ReactNode, Ref } from 'react';

export type GlassProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'header' | 'nav' | 'footer' | 'section';
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
};

/** Frosted glass surface: translucent fill, backdrop blur, 0.5px light rim and a soft shadow. */
export function Glass({ as: Tag = 'div', ref, className, children, ...rest }: GlassProps) {
  return (
    // HTMLDivElement is the narrowest of the allowed tags, so this ref fits all of them.
    <Tag ref={ref as Ref<HTMLDivElement>} className={className ? `ui-glass ${className}` : 'ui-glass'} {...rest}>
      {children}
    </Tag>
  );
}
