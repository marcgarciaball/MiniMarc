'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { BUSCAR_HREF, SEARCH_INPUT_ID } from '@/lib/nav';

/** Typing in a field (or an editable element): `/` is just a character there. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Desktop keyboard shortcuts for the search: `/` (outside a field) and ⌘K / Ctrl+K (anywhere).
 * On /buscar they focus the field; elsewhere they open /buscar. Renders nothing.
 */
export function SearchShortcut() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const commandK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target);
      if (!commandK && !slash) return;
      e.preventDefault();
      const input = document.getElementById(SEARCH_INPUT_ID);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      } else {
        router.push(BUSCAR_HREF);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return null;
}
