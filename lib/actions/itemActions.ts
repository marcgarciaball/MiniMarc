/**
 * The item and person write actions, over an injected runner (lib/actions/run.ts), so tests can
 * check that each one invalidates the right cached data. app/actions/{items,people}.ts expose
 * them as Server Actions.
 */
import { WRITES } from '@/lib/cache/tags';
import * as items from './items';
import type { ActionDeps, MovePatch } from './items';
import * as people from './people';
import type { ActionRunner } from './run';

export const SAVE_FAILED = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
export const ADD_FAILED = 'No se ha podido añadir. Revisa la conexión e inténtalo de nuevo.';

export function createItemActions(run: ActionRunner<ActionDeps>) {
  return {
    addItem: (fd: FormData) => run(WRITES.item, (d) => items.addItem(d, fd), ADD_FAILED),
    toggleDone: (id: string) => run(WRITES.item, (d) => items.toggleDone(d, id), SAVE_FAILED),
    moveItem: (id: string, patch: MovePatch) => run(WRITES.item, (d) => items.moveItem(d, id, patch), SAVE_FAILED),
    deleteItem: (id: string) => run(WRITES.item, (d) => items.deleteItem(d, id), SAVE_FAILED),
    undoDelete: (id: string) => run(WRITES.item, (d) => items.undoDelete(d, id), SAVE_FAILED),
    retrySync: (id: string) => run(WRITES.item, (d) => items.retrySync(d, id), SAVE_FAILED),
    addPerson: (fd: FormData) => run(WRITES.person, (d) => items.addPerson(d, fd), ADD_FAILED),
    updatePerson: (id: string, fd: FormData) => run(WRITES.person, (d) => items.updatePerson(d, id, fd), SAVE_FAILED),
    addPersonDate: (personId: string, fd: FormData) =>
      run(WRITES.personDate, (d) => people.addPersonDate(d, personId, fd), SAVE_FAILED),
    updatePersonDate: (id: string, fd: FormData) =>
      run(WRITES.personDate, (d) => people.updatePersonDate(d, id, fd), SAVE_FAILED),
    deletePersonDate: (id: string) => run(WRITES.personDate, (d) => people.deletePersonDate(d, id), SAVE_FAILED),
  };
}
