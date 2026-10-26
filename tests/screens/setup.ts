/**
 * Screen-test helpers (Testing Library over jsdom).
 *
 * Each screen test file starts with `// @vitest-environment jsdom` (the rest of the suite stays
 * on node) and mocks the modules the screens import from here:
 *
 *   vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
 *   vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));
 *
 * Then drive the doubles per test, e.g. `itemsActions.toggleDone.mockResolvedValue(fail('x'))`.
 * Every double resets to a successful default before each test, and the DOM is cleaned after it.
 * Queries after a transition or an optimistic update must be async (`findBy*`, `waitFor`).
 * Out of scope for jsdom: real swipe gestures, sheet physics, glass blur and visual appearance.
 */
import { cleanup, render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import type * as itemsModule from '@/app/actions/items';
import { ok } from '@/lib/actions/result';
import type { Item } from '@/lib/db/types';

/** Doubles for `app/actions/items.ts`; each resolves `ok` until a test says otherwise. */
export const itemsActions = {
  addItem: vi.fn<typeof itemsModule.addItem>(),
  deleteItem: vi.fn<typeof itemsModule.deleteItem>(),
  moveItem: vi.fn<typeof itemsModule.moveItem>(),
  retrySync: vi.fn<typeof itemsModule.retrySync>(),
  toggleDone: vi.fn<typeof itemsModule.toggleDone>(),
  undoDelete: vi.fn<typeof itemsModule.undoDelete>(),
};

/** Doubles for `app/actions/capture.ts`. */
export const captureActions = {
  quickCapture: vi.fn(),
  listCapturePeople: vi.fn(),
};

export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };

export const itemsActionsModule = { ...itemsActions };
export const captureActionsModule = { ...captureActions };
/** Current route seen by `next/navigation`; set per test (reset to these defaults before each one). */
export const navigation = { pathname: '/tareas', search: '' };

export const navigationModule = {
  useRouter: () => router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
};

function resetDoubles() {
  for (const fn of [...Object.values(itemsActions), ...Object.values(captureActions), ...Object.values(router)]) {
    fn.mockReset();
  }
  navigation.pathname = '/tareas';
  navigation.search = '';
  // Same value shapes as the real actions: they hand back the saved Item (deleteItem: void).
  for (const [name, fn] of Object.entries(itemsActions)) {
    if (name === 'deleteItem') itemsActions.deleteItem.mockResolvedValue(ok(undefined));
    else (fn as typeof itemsActions.toggleDone).mockImplementation(async () => ok(makeItem()));
  }
  captureActions.quickCapture.mockResolvedValue(ok({ message: 'Guardado', href: null }));
  captureActions.listCapturePeople.mockResolvedValue(ok([]));
}

beforeEach(() => {
  resetDoubles();
  // jsdom has no ResizeObserver (CaptureBar measures itself with one).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

/** Renders a screen and returns Testing Library's queries plus a `user` (user-event) to drive it. */
export function renderScreen(ui: ReactElement): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  return { user: userEvent.setup(), ...render(ui) };
}

/** A complete pendiente tarea; override what the test cares about. */
export function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    type: 'tarea',
    title: 'Llamar al dentista',
    notes: null,
    area: 'personal',
    dueAt: null,
    hasTime: false,
    status: 'pendiente',
    personId: null,
    origin: 'web',
    needsReview: false,
    confidence: null,
    calendarEventId: null,
    syncError: null,
    sourceText: null,
    author: null,
    readingState: null,
    link: null,
    linkTitle: null,
    linkImage: null,
    linkSite: null,
    location: null,
    aiState: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}
