'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavBar } from './NavBar';

export type LargeTitleProps = {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
};

/** Nearest scrollable ancestor, or null for the window. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/**
 * iOS large title: a 34pt heading that scrolls under the NavBar; once it is
 * hidden the bar gets its paper and rule and shows the inline title.
 */
export function LargeTitle({ title, leading, trailing, children }: LargeTitleProps) {
  const navRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const heading = titleRef.current;
    const nav = navRef.current;
    if (!heading || !nav) return;
    const target: HTMLElement | Window = scrollParent(heading) ?? window;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const titleBottom = heading.getBoundingClientRect().bottom;
      const navBottom = nav.getBoundingClientRect().bottom;
      setCollapsed(titleBottom <= navBottom + 4);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    onScroll();
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <NavBar ref={navRef} title={title} leading={leading} trailing={trailing} collapsed={collapsed} />
      <h1 ref={titleRef} className="ui-large-title">
        {title}
      </h1>
      {children}
    </>
  );
}
