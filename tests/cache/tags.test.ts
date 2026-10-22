import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createItemActions } from '@/lib/actions/itemActions';
import type { ActionDeps } from '@/lib/actions/items';
import { createActionRunner } from '@/lib/actions/run';
import { invalidateUser, tagFor, tagsFor, WRITES, type DataScope } from '@/lib/cache/tags';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';

describe('cache tags', () => {
  it('are "<scope>:<userId>"', () => {
    expect(tagFor('items', 'u1')).toBe('items:u1');
    expect(tagFor('people', 'u1')).toBe('people:u1');
    expect(tagFor('calendar', 'u1')).toBe('calendar:u1');
    expect(tagFor('settings', 'u1')).toBe('settings:u1');
    expect(tagsFor('u1', ['items', 'people', 'items'])).toEqual(['items:u1', 'people:u1']);
  });

  it('refuse an empty user id (a tag shared by everyone)', () => {
    expect(() => tagFor('items', '')).toThrow();
  });

  it('invalidateUser expires each tag of the scopes', () => {
    const update = vi.fn();
    invalidateUser('u1', ['items', 'calendar'], update);
    expect(update.mock.calls).toEqual([['items:u1'], ['calendar:u1']]);
  });

  it('item writes reach the calendar (task sync); captures reach everything they create', () => {
    expect(WRITES.item).toEqual(expect.arrayContaining(['items', 'calendar']));
    expect(WRITES.capture).toEqual(expect.arrayContaining(['items', 'people', 'calendar']));
    expect(WRITES.event).toEqual(['calendar']);
  });
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe('write actions invalidate through the shared runner', () => {
  let deps: ActionDeps;
  let invalidated: { userId: string; scopes: readonly DataScope[] }[];
  let actions: ReturnType<typeof createItemActions>;

  beforeEach(() => {
    const clock = () => new Date('2026-10-22T08:00:00Z');
    const backend = createMemoryBackend({ now: clock });
    deps = { items: createItemsRepo(backend, { now: clock }), people: createPeopleRepo(backend) };
    invalidated = [];
    const run = createActionRunner({
      session: async () => ({ userId: 'u1', deps }),
      invalidate: (userId, scopes) => void invalidated.push({ userId, scopes }),
    });
    actions = createItemActions(run);
  });

  it('every item and person action invalidates its scopes for the user', async () => {
    const added = await actions.addItem(form({ type: 'tarea', title: 'Llamar' }));
    if (!added.ok) throw new Error(added.error);
    const id = added.value.id;
    const person = await actions.addPerson(form({ name: 'Ana' }));
    if (!person.ok) throw new Error(person.error);
    const date = await actions.addPersonDate(person.value.id, form({ label: 'Santo', date: '2020-07-26', yearly: 'true' }));
    if (!date.ok) throw new Error(date.error);

    const calls: [keyof typeof actions, () => Promise<{ ok: boolean }>, readonly DataScope[]][] = [
      ['toggleDone', () => actions.toggleDone(id), WRITES.item],
      ['moveItem', () => actions.moveItem(id, { status: 'pendiente' }), WRITES.item],
      ['deleteItem', () => actions.deleteItem(id), WRITES.item],
      ['undoDelete', () => actions.undoDelete(id), WRITES.item],
      ['retrySync', () => actions.retrySync(id), WRITES.item],
      ['updatePerson', () => actions.updatePerson(person.value.id, form({ name: 'Ana B.' })), WRITES.person],
      ['updatePersonDate', () => actions.updatePersonDate(date.value.id, form({ label: 'Santo', date: '2020-07-27', yearly: 'true' })), WRITES.personDate],
      ['deletePersonDate', () => actions.deletePersonDate(date.value.id), WRITES.personDate],
    ];
    expect(invalidated).toEqual([
      { userId: 'u1', scopes: WRITES.item },
      { userId: 'u1', scopes: WRITES.person },
      { userId: 'u1', scopes: WRITES.personDate },
    ]);
    for (const [name, call, scopes] of calls) {
      invalidated = [];
      const result = await call();
      expect(result, name).toMatchObject({ ok: true });
      expect(invalidated, name).toEqual([{ userId: 'u1', scopes }]);
    }
    // Every action of the factory is covered above.
    expect(new Set(['addItem', 'addPerson', 'addPersonDate', ...calls.map((c) => c[0])])).toEqual(new Set(Object.keys(actions)));
  });

  it('a failed write still invalidates (it may have written half-way) and reports the error', async () => {
    const result = await actions.toggleDone('no-such-id');
    expect(result.ok).toBe(false);
    expect(invalidated).toEqual([{ userId: 'u1', scopes: WRITES.item }]);
  });

  it('without a session nothing is invalidated', async () => {
    const run = createActionRunner<ActionDeps>({
      session: async () => {
        throw new Error('NEXT_REDIRECT');
      },
      invalidate: () => void invalidated.push({ userId: '?', scopes: [] }),
    });
    const result = await createItemActions(run).addItem(form({ type: 'tarea', title: 'X' }));
    expect(result.ok).toBe(false);
    expect(invalidated).toEqual([]);
  });
});

describe('every Server Action that writes invalidates', () => {
  const dir = path.resolve(__dirname, '../../app/actions');
  /** Read-only actions (search, the Regalo picker) and sign-out, which ends the session. */
  const READS = new Set(['search', 'listCapturePeople', 'signOut']);

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(path.join(dir, file), 'utf8');
    const names = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    for (const name of names.filter((n) => !READS.has(n))) {
      it(`${file} → ${name}`, () => {
        const body = src.slice(src.indexOf(`export async function ${name}`)).split(/\nexport /)[0];
        // Through the shared runner (actions.*/run), invalidate(), or revalidatePath (tokens: not cached).
        expect(body).toMatch(/\bactions\.\w+\(|\brun\(|\binvalidate\(|revalidatePath\(/);
      });
    }
  }
});
