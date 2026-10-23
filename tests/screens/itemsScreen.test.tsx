// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import type { Item } from '@/lib/db/types';
import { itemsActions, makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('@/app/actions/photos', () => ({ addPhoto: vi.fn(), deletePhoto: vi.fn() }));
vi.mock('@/lib/supabase/browser', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const item = makeItem();
const screenUi = (items = [item], emptyText?: string) => (
  <ItemsScreen title="Tareas" today="2026-10-22" sections={[{ key: 'a', items }]} emptyText={emptyText} />
);

test('marcar una tarea la quita de la lista y ofrece deshacer', async () => {
  // The row leaves at once and stays out while the action runs; in the app the refreshed
  // server list then takes over, here nothing refreshes, so we look before the action ends.
  let finish: (r: ActionResult<Item>) => void = () => {};
  itemsActions.toggleDone.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  const { user } = renderScreen(screenUi());
  await user.click(screen.getByRole('checkbox', { name: /Llamar al dentista/ }));

  await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Llamar al dentista/ })).toBeNull());
  expect(itemsActions.toggleDone).toHaveBeenCalledWith('item-1');
  finish(ok(makeItem()));
  expect(await screen.findByRole('button', { name: 'Deshacer' })).toBeTruthy();
  expect(screen.getByText('Marcado como hecho')).toBeTruthy();
});

test('«Deshacer» vuelve a llamar a la acción', async () => {
  const { user } = renderScreen(screenUi());
  await user.click(screen.getByRole('checkbox', { name: /Llamar al dentista/ }));
  await user.click(await screen.findByRole('button', { name: 'Deshacer' }));

  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledTimes(2));
  expect(itemsActions.toggleDone.mock.calls).toEqual([['item-1'], ['item-1']]);
});

test('si la acción falla, el toast lo dice y la fila vuelve', async () => {
  let finish: (r: ActionResult<Item>) => void = () => {};
  itemsActions.toggleDone.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  const { user } = renderScreen(screenUi());
  await user.click(screen.getByRole('checkbox', { name: /Llamar al dentista/ }));

  // The row leaves at once, while the action is still running.
  await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Llamar al dentista/ })).toBeNull());
  finish(fail('No se pudo marcar.'));

  expect(await screen.findByText('No se pudo marcar.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
  expect(await screen.findByRole('checkbox', { name: /Llamar al dentista/ })).toBeTruthy();
});

test('una lista vacía muestra su texto tranquilo', () => {
  renderScreen(screenUi([], 'Nada pendiente.'));
  expect(screen.getByText('Nada pendiente.')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

test('cada fila tiene un objetivo táctil accesible', () => {
  renderScreen(screenUi([item, makeItem({ id: 'item-2', title: 'Comprar pan' })]));
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  expect(screen.getByRole('checkbox', { name: 'Completar «Llamar al dentista»' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Abrir «Comprar pan»' })).toBeTruthy();
});
