import { describe, expect, it, vi } from 'vitest';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { withServerPreviews, type ServerPreviewDeps } from '@/lib/links/server';

vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('next/cache', () => ({ cacheTag: () => {}, revalidateTag: () => {}, updateTag: () => {} }));

describe('after() link preview invalidates the user cache', () => {
  function setup(store: ServerPreviewDeps['store']) {
    const tasks: (() => Promise<void>)[] = [];
    const invalidated: { userId: string; scopes: readonly string[] }[] = [];
    const deps: ServerPreviewDeps = {
      after: (task) => void tasks.push(task),
      store,
      invalidate: (userId, scopes) => void invalidated.push({ userId, scopes }),
    };
    const repo = withServerPreviews(createItemsRepo(createMemoryBackend()), 'u1', deps);
    return { repo, tasks, invalidated };
  }

  it('stores the preview after the response, then invalidates the lists', async () => {
    const store = vi.fn(async () => {});
    const { repo, tasks, invalidated } = setup(store);
    await repo.createItem({ type: 'idea', title: 'Mira https://example.com', link: 'https://example.com' });
    expect(tasks).toHaveLength(1);
    expect(invalidated).toEqual([]);
    await tasks[0]();
    expect(store).toHaveBeenCalledOnce();
    expect(invalidated).toEqual([{ userId: 'u1', scopes: ['items'] }]);
  });

  it('a failed preview invalidates nothing and never throws', async () => {
    const { repo, tasks, invalidated } = setup(async () => Promise.reject(new Error('down')));
    await repo.createItem({ type: 'idea', title: 'x', link: 'https://example.com' });
    await expect(tasks[0]()).resolves.toBeUndefined();
    expect(invalidated).toEqual([]);
  });
});
